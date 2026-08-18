/**
 * Sportradar -- documented ALTERNATE paid live PBP provider.
 *
 * Implements the same `NflPbpProvider` interface as SportsData.io so switching
 * is a matter of `NFL_PBP_PROVIDER=sportradar`. Sportradar's NFL package uses:
 * - `games/{season}/{type}/schedule.json`   season schedule
 * - `games/{game_id}/pbp.json`              full play-by-play for one game
 * - a push feed for lower latency than polling (not modeled here; the polling
 *   endpoint is enough for the ~30-60s cadence the live sync job runs at)
 *
 * The mapping below is intentionally thin: Sportradar nests plays inside
 * periods -> drives -> plays (`events`), and its `statistics` array is the
 * per-play stat attribution we normalize from, mirroring what
 * `sportsdataio.ts` does with `PlayStats`.
 */

import type {
  GameStatusValue,
  NflPbpProvider,
  NormalizedPlay,
  PlayType,
  ScheduledGame,
} from "../types";

const BASE_URL =
  process.env.SPORTRADAR_BASE_URL ?? "https://api.sportradar.com/nfl/official/trial/v7/en";

interface SportradarStatistic {
  stat_type?: string;
  player?: { id?: string };
  team?: { alias?: string };
  yards?: number;
  attempt?: number;
  complete?: number;
  touchdown?: boolean;
  lost?: number;
  made?: boolean;
  blocked?: boolean;
  category?: string;
}

interface SportradarEvent {
  id?: string;
  type?: string;
  play_type?: string;
  description?: string;
  clock?: string;
  scoring_play?: boolean;
  start_situation?: {
    down?: number;
    yfd?: number;
    possession?: { alias?: string };
    location?: { alias?: string };
    yardline?: number;
  };
  statistics?: SportradarStatistic[];
}

interface SportradarDrive {
  plays?: SportradarEvent[];
}

interface SportradarPeriod {
  number?: number;
  pbp?: SportradarDrive[];
}

interface SportradarGamePbp {
  id?: string;
  season?: { year?: number };
  week?: { sequence?: number };
  status?: string;
  home?: { alias?: string };
  away?: { alias?: string };
  periods?: SportradarPeriod[];
}

interface SportradarScheduleGame {
  id: string;
  scheduled: string;
  status?: string;
  home?: { alias?: string };
  away?: { alias?: string };
}

interface SportradarSchedule {
  year?: number;
  weeks?: Array<{ sequence?: number; games?: SportradarScheduleGame[] }>;
}

function requireApiKey(): string {
  const key = process.env.SPORTRADAR_API_KEY;
  if (!key) throw new Error("SPORTRADAR_API_KEY is not set");
  return key;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/${path}?api_key=${requireApiKey()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Sportradar ${path} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function mapStatus(status?: string): GameStatusValue {
  switch ((status ?? "").toLowerCase()) {
    case "inprogress":
    case "halftime":
      return "IN_PROGRESS";
    case "closed":
    case "complete":
      return "FINAL";
    default:
      return "SCHEDULED";
  }
}

function mapPlayType(playType?: string): PlayType {
  switch ((playType ?? "").toLowerCase()) {
    case "pass":
      return "PASS";
    case "rush":
      return "RUSH";
    case "punt":
      return "PUNT";
    case "kickoff":
      return "KICKOFF";
    case "field_goal":
      return "FIELD_GOAL";
    case "extra_point":
      return "EXTRA_POINT";
    case "penalty":
      return "PENALTY";
    default:
      return "OTHER";
  }
}

function playerWithStat(
  statistics: SportradarStatistic[],
  statType: string,
): string | null {
  const match = statistics.find((stat) => stat.stat_type === statType);
  return match?.player?.id ?? null;
}

export function normalizeEvent(
  event: SportradarEvent,
  context: {
    externalGameId: string;
    season: number;
    week: number;
    quarter: number | null;
    homeTeam: string | null;
    awayTeam: string | null;
  },
): NormalizedPlay {
  const statistics = event.statistics ?? [];
  const description = event.description ?? "";
  const text = description.toLowerCase();
  const sackStat = statistics.find((s) => s.stat_type === "sack");
  const playType: PlayType = sackStat ? "SACK" : mapPlayType(event.play_type);
  const passStat = statistics.find((s) => s.stat_type === "pass");
  const rushStat = statistics.find((s) => s.stat_type === "rush");
  const receiveStat = statistics.find((s) => s.stat_type === "receive");
  const offenseTeam = event.start_situation?.possession?.alias ?? null;
  const defenseTeam =
    offenseTeam && context.homeTeam && context.awayTeam
      ? offenseTeam === context.homeTeam
        ? context.awayTeam
        : context.homeTeam
      : null;

  return {
    externalPlayId: event.id ?? `${context.externalGameId}:${description.slice(0, 32)}`,
    externalGameId: context.externalGameId,
    season: context.season,
    week: context.week,
    quarter: context.quarter,
    clock: event.clock ?? null,
    offenseTeam,
    defenseTeam,
    down: event.start_situation?.down ?? null,
    distance: event.start_situation?.yfd ?? null,
    yardLine: event.start_situation?.yardline ?? null,
    playType,
    result: description || null,
    yardsGained: passStat?.yards ?? rushStat?.yards ?? 0,
    isTouchdown: statistics.some((s) => s.touchdown === true) || text.includes("touchdown"),
    isTurnover: statistics.some((s) => s.stat_type === "interception") || text.includes("fumble"),
    isSack: playType === "SACK",
    isInterception: statistics.some((s) => s.stat_type === "interception"),
    isFumble: statistics.some((s) => s.stat_type === "fumble"),
    isFumbleLost: statistics.some((s) => s.stat_type === "fumble" && (s.lost ?? 0) > 0),
    isSafety: text.includes("safety"),
    isPenalty: playType === "PENALTY",
    penaltyFirstDown: text.includes("penalty") && text.includes("first down"),
    isNoPlay: text.includes("no play"),
    isCompletion: (passStat?.complete ?? 0) > 0,
    isTarget: receiveStat != null,
    isScramble: undefined,
    isKneel: text.includes("kneel"),
    isSpike: text.includes("spike"),
    kickDistance: statistics.find((s) => s.stat_type === "field_goal")?.yards ?? null,
    kickResult: null,
    returnYards: statistics.find((s) => s.stat_type === "return")?.yards ?? null,
    passerId: passStat?.player?.id ?? null,
    rusherId: rushStat?.player?.id ?? null,
    receiverId: receiveStat?.player?.id ?? null,
    defenderId: playerWithStat(statistics, "defense"),
    kickerId: playerWithStat(statistics, "field_goal") ?? playerWithStat(statistics, "extra_point"),
    returnerId: playerWithStat(statistics, "return"),
    raw: event,
  };
}

function playsFromGame(game: SportradarGamePbp): NormalizedPlay[] {
  const context = {
    externalGameId: game.id ?? "",
    season: game.season?.year ?? 0,
    week: game.week?.sequence ?? 0,
    homeTeam: game.home?.alias ?? null,
    awayTeam: game.away?.alias ?? null,
  };
  return (game.periods ?? []).flatMap((period) =>
    (period.pbp ?? []).flatMap((drive) =>
      (drive.plays ?? []).map((event) =>
        normalizeEvent(event, { ...context, quarter: period.number ?? null }),
      ),
    ),
  );
}

export class SportradarProvider implements NflPbpProvider {
  readonly name = "sportradar";

  async getSchedule(season: number): Promise<ScheduledGame[]> {
    const schedule = await get<SportradarSchedule>(`games/${season}/REG/schedule.json`);
    return (schedule.weeks ?? []).flatMap((week) =>
      (week.games ?? []).map((game) => ({
        externalGameId: game.id,
        season: schedule.year ?? season,
        week: week.sequence ?? 0,
        homeTeam: game.home?.alias ?? "",
        awayTeam: game.away?.alias ?? "",
        kickoff: new Date(game.scheduled),
        status: mapStatus(game.status),
      })),
    );
  }

  async getLivePlays(externalGameId: string): Promise<NormalizedPlay[]> {
    const game = await get<SportradarGamePbp>(`games/${externalGameId}/pbp.json`);
    return playsFromGame(game);
  }

  async getPlays(season: number, week: number): Promise<NormalizedPlay[]> {
    const schedule = await this.getSchedule(season);
    const games = schedule.filter((game) => game.week === week);
    const perGame = await Promise.all(
      games.map((game) => this.getLivePlays(game.externalGameId)),
    );
    return perGame.flat();
  }
}

export const sportradarProvider = new SportradarProvider();
