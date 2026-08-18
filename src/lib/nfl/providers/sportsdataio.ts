/**
 * SportsData.io -- the PAID LIVE play-by-play provider and the production
 * default for `NFL_PBP_PROVIDER`.
 *
 * Endpoints used (NFL v3):
 * - `scores/json/Schedules/{season}`                     season schedule
 * - `pbp/json/PlayByPlay/{scoreid}`                       one game, live
 * - `pbp/json/PlayByPlayDelta/{season}/{week}/{minutes}`  changed games, live
 * - `pbp/json/PlayByPlay/{season}/{week}/{hometeam}`      one game, post-game
 *
 * Requires `SPORTSDATAIO_API_KEY`. The paid live tier is what makes in-game
 * scoring possible; `providers/nflverse.ts` implements the same interface for
 * free post-game backfill and reconciliation.
 */

import type {
  GameStatusValue,
  KickResult,
  NflPbpProvider,
  NormalizedPlay,
  PlayType,
  ScheduledGame,
} from "../types";

const BASE_URL = "https://api.sportsdata.io/v3/nfl";

interface SportsDataSchedule {
  GameKey?: string;
  GlobalGameID?: number;
  ScoreID?: number;
  Season: number;
  Week: number;
  HomeTeam: string;
  AwayTeam: string;
  Date?: string | null;
  DateTimeUTC?: string | null;
  Status?: string;
}

interface SportsDataPlayStat {
  PlayerID?: number;
  Team?: string;
  PassingAttempts?: number;
  PassingCompletions?: number;
  PassingInterceptions?: number;
  PassingSacks?: number;
  RushingAttempts?: number;
  ReceivingTargets?: number;
  Receptions?: number;
  Fumbles?: number;
  FumblesLost?: number;
  FumblesRecovered?: number;
  Sacks?: number;
  Interceptions?: number;
  FieldGoalsAttempted?: number;
  FieldGoalsMade?: number;
  FieldGoalsYards?: number;
  FieldGoalsHadBlocked?: number;
  ExtraPointsAttempted?: number;
  ExtraPointsMade?: number;
  PuntsHadBlocked?: number;
  PuntTouchbacks?: number;
  KickoffTouchbacks?: number;
  PuntReturns?: number;
  KickReturns?: number;
  PassingYards?: number;
  RushingYards?: number;
  ReceivingYards?: number;
  KickoffYards?: number;
  PuntYards?: number;
  PuntReturnYards?: number;
  KickReturnYards?: number;
  PassingSackYards?: number;
  SackYards?: number;
  InterceptionReturnYards?: number;
  FumbleReturnYards?: number;
  PassingTouchdowns?: number;
  RushingTouchdowns?: number;
  ReceivingTouchdowns?: number;
  InterceptionReturnTouchdowns?: number;
  FumbleReturnTouchdowns?: number;
  PuntReturnTouchdowns?: number;
  KickReturnTouchdowns?: number;
  BlockedKickReturnTouchdowns?: number;
  FieldGoalReturnTouchdowns?: number;
}

interface SportsDataPlay {
  PlayID: number;
  QuarterName?: string | null;
  Sequence?: number | null;
  TimeRemaining?: string | null;
  Team?: string | null;
  Opponent?: string | null;
  Down?: number | null;
  Distance?: number | null;
  YardLine?: number | null;
  YardLineTerritory?: string | null;
  YardsToEndZone?: number | null;
  YardsGained?: number | null;
  Type?: string | null;
  Description?: string | null;
  IsScoringPlay?: boolean | null;
  ScoringPlay?: unknown;
  PlayStats?: SportsDataPlayStat[] | null;
}

interface SportsDataPlayByPlay {
  Score?: {
    ScoreID?: number;
    GlobalGameID?: number;
    Season?: number;
    Week?: number;
    HomeTeam?: string;
    AwayTeam?: string;
    Status?: string;
  } | null;
  Plays?: SportsDataPlay[] | null;
}

function requireApiKey(): string {
  // SPORTS_DATA_IO_KEY is accepted as an alias for existing deployments.
  const key = process.env.SPORTSDATAIO_API_KEY ?? process.env.SPORTS_DATA_IO_KEY;
  if (!key) {
    throw new Error(
      "SPORTSDATAIO_API_KEY is not set. Set it, or point NFL_PBP_PROVIDER at 'nflverse' for free post-game data.",
    );
  }
  return key;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/${path}`, {
    headers: { "Ocp-Apim-Subscription-Key": requireApiKey() },
    // Live data: never serve a cached response.
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`SportsData.io ${path} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function mapStatus(status?: string | null): GameStatusValue {
  switch ((status ?? "").toLowerCase()) {
    case "inprogress":
    case "in progress":
    case "halftime":
    case "suspended":
      return "IN_PROGRESS";
    case "final":
    case "f/ot":
    case "final/ot":
      return "FINAL";
    default:
      return "SCHEDULED";
  }
}

export function mapPlayType(type?: string | null): PlayType {
  // Observed values include Rush, PassCompleted, PassIncomplete,
  // PassIntercepted, Sack, FieldGoal, ExtraPoint, Punt, Kickoff, Penalty,
  // Fumble, Timeout, TwoPointConversion, EndOfQuarter.
  const value = (type ?? "").toLowerCase();
  if (value.includes("sack")) return "SACK";
  if (value.includes("pass")) return "PASS";
  if (value.includes("rush") || value.includes("run")) return "RUSH";
  if (value.includes("punt")) return "PUNT";
  if (value.includes("kickoff")) return "KICKOFF";
  if (value.includes("fieldgoal") || value.includes("field goal")) return "FIELD_GOAL";
  if (value.includes("extrapoint") || value.includes("extra point")) return "EXTRA_POINT";
  if (value.includes("penalty")) return "PENALTY";
  if (value.includes("timeout")) return "TIMEOUT";
  return "OTHER";
}

function quarterNumber(quarterName?: string | null): number | null {
  if (!quarterName) return null;
  if (/^\d+$/.test(quarterName)) return Number(quarterName);
  if (quarterName.toUpperCase() === "OT") return 5;
  return null;
}

function statOwner(
  stats: SportsDataPlayStat[],
  predicate: (stat: SportsDataPlayStat) => boolean,
): string | null {
  const match = stats.find(predicate);
  return match?.PlayerID != null ? String(match.PlayerID) : null;
}

/**
 * Kick outcome. PlayStats are preferred over the description: the stat columns
 * are structured and always present, while `Description` is free text (and is
 * withheld entirely on trial keys).
 */
function kickResultFrom(
  playType: PlayType,
  description: string,
  stats: SportsDataPlayStat[],
): KickResult | null {
  const text = description.toLowerCase();
  const sum = (pick: (stat: SportsDataPlayStat) => number | undefined) =>
    stats.reduce((total, stat) => total + (pick(stat) ?? 0), 0);

  if (sum((s) => s.FieldGoalsHadBlocked) > 0 || sum((s) => s.PuntsHadBlocked) > 0) {
    return "BLOCKED";
  }
  if (playType === "FIELD_GOAL" && sum((s) => s.FieldGoalsAttempted) > 0) {
    return sum((s) => s.FieldGoalsMade) > 0 ? "MADE" : "MISSED";
  }
  if (playType === "EXTRA_POINT" && sum((s) => s.ExtraPointsAttempted) > 0) {
    return sum((s) => s.ExtraPointsMade) > 0 ? "MADE" : "MISSED";
  }
  if (playType === "PUNT" && sum((s) => s.PuntTouchbacks) > 0) return "TOUCHBACK";
  if (playType === "KICKOFF" && sum((s) => s.KickoffTouchbacks) > 0) return "TOUCHBACK";

  if (text.includes("blocked")) return "BLOCKED";
  if (text.includes("muff")) return "MUFFED";
  if (text.includes("touchback")) return "TOUCHBACK";
  if (playType === "FIELD_GOAL" || playType === "EXTRA_POINT") {
    if (text.includes("no good") || text.includes("missed")) return "MISSED";
    if (text.includes("is good") || text.includes("good")) return "MADE";
  }
  if (playType === "KICKOFF" && text.includes("onside")) {
    return text.includes("recovered by kicking") ? "ONSIDE_RECOVERED" : "ONSIDE_FAIL";
  }
  return null;
}

function kickDistanceFrom(
  play: SportsDataPlay,
  description: string,
  stats: SportsDataPlayStat[],
): number | null {
  const attempted = stats.find((stat) => (stat.FieldGoalsAttempted ?? 0) > 0);
  if (attempted?.FieldGoalsYards != null && attempted.FieldGoalsYards > 0) {
    return attempted.FieldGoalsYards;
  }
  const match = /(\d{1,2})\s*yard(?:s)?\s*field goal/i.exec(description);
  if (match) return Number(match[1]);
  // Snap distance: line of scrimmage + 10 (end zone) + 7 (snap depth).
  return play.YardsToEndZone != null ? play.YardsToEndZone + 17 : null;
}

function parseReturnYards(description: string): number | null {
  const match = /for\s+(-?\d{1,3})\s*yard/i.exec(description);
  if (match) return Number(match[1]);
  if (/no gain/i.test(description)) return 0;
  return null;
}

/** Translate one SportsData.io play into the provider-agnostic shape. */
export function normalizePlay(
  play: SportsDataPlay,
  context: { externalGameId: string; season: number; week: number },
): NormalizedPlay {
  const stats = play.PlayStats ?? [];
  const description = play.Description ?? "";
  const playType = mapPlayType(play.Type);
  const text = description.toLowerCase();

  // Attribution accepts either the attempt counters or a non-zero yardage
  // column for the same role: trial/limited subscriptions populate yardage but
  // zero out every attempt counter, which would otherwise leave each play
  // without a passer/rusher/receiver and derive only team-unit rows.
  const passerId = statOwner(
    stats,
    (s) =>
      (s.PassingAttempts ?? 0) > 0 ||
      (s.PassingSacks ?? 0) > 0 ||
      (s.PassingInterceptions ?? 0) > 0 ||
      (s.PassingYards ?? 0) !== 0 ||
      (s.PassingSackYards ?? 0) !== 0,
  );
  const rusherId = statOwner(
    stats,
    (s) => (s.RushingAttempts ?? 0) > 0 || (s.RushingYards ?? 0) !== 0,
  );
  const receiverId = statOwner(
    stats,
    (s) =>
      (s.ReceivingTargets ?? 0) > 0 ||
      (s.Receptions ?? 0) > 0 ||
      (s.ReceivingYards ?? 0) !== 0,
  );
  const defenderId = statOwner(
    stats,
    (s) =>
      (s.Sacks ?? 0) > 0 ||
      (s.Interceptions ?? 0) > 0 ||
      (s.FumblesRecovered ?? 0) > 0 ||
      (s.SackYards ?? 0) !== 0 ||
      (s.InterceptionReturnYards ?? 0) !== 0 ||
      (s.FumbleReturnYards ?? 0) !== 0,
  );
  const kickerId = statOwner(
    stats,
    (s) =>
      (s.FieldGoalsAttempted ?? 0) > 0 ||
      (s.ExtraPointsAttempted ?? 0) > 0 ||
      (s.FieldGoalsYards ?? 0) > 0 ||
      (s.KickoffYards ?? 0) !== 0 ||
      (s.PuntYards ?? 0) !== 0,
  );
  const returnerId = statOwner(
    stats,
    (s) =>
      (s.KickReturns ?? 0) > 0 ||
      (s.PuntReturns ?? 0) > 0 ||
      (s.KickReturnYards ?? 0) !== 0 ||
      (s.PuntReturnYards ?? 0) !== 0,
  );

  const isInterception =
    stats.some((s) => (s.PassingInterceptions ?? 0) > 0) ||
    (play.Type ?? "").toLowerCase().includes("interception") ||
    text.includes("intercepted");
  const isFumble =
    stats.some((s) => (s.Fumbles ?? 0) > 0) ||
    (play.Type ?? "").toLowerCase().includes("fumble") ||
    text.includes("fumble");
  const isFumbleLost = stats.some((s) => (s.FumblesLost ?? 0) > 0);
  // `Type` is the authoritative outcome label; PlayStats corroborate it and
  // Description is only a last resort (trial keys scramble it).
  const rawType = (play.Type ?? "").toLowerCase();
  const isCompletion =
    playType === "PASS" &&
    (rawType.includes("passcompleted") ||
      stats.some((s) => (s.PassingCompletions ?? 0) > 0) ||
      text.includes("complete to"));
  const isTouchdown =
    stats.some(
      (s) =>
        (s.PassingTouchdowns ?? 0) > 0 ||
        (s.RushingTouchdowns ?? 0) > 0 ||
        (s.ReceivingTouchdowns ?? 0) > 0 ||
        (s.InterceptionReturnTouchdowns ?? 0) > 0 ||
        (s.FumbleReturnTouchdowns ?? 0) > 0 ||
        (s.PuntReturnTouchdowns ?? 0) > 0 ||
        (s.KickReturnTouchdowns ?? 0) > 0 ||
        (s.BlockedKickReturnTouchdowns ?? 0) > 0 ||
        (s.FieldGoalReturnTouchdowns ?? 0) > 0,
    ) || text.includes("touchdown");

  return {
    externalPlayId: String(play.PlayID),
    externalGameId: context.externalGameId,
    season: context.season,
    week: context.week,
    quarter: quarterNumber(play.QuarterName),
    clock: play.TimeRemaining ?? null,
    offenseTeam: play.Team ?? null,
    defenseTeam: play.Opponent ?? null,
    down: play.Down ?? null,
    distance: play.Distance ?? null,
    yardLine: play.YardLine ?? null,
    playType,
    result: description || null,
    yardsGained: play.YardsGained ?? 0,
    isTouchdown,
    isTurnover: isInterception || isFumbleLost,
    isSack: playType === "SACK",
    isInterception,
    isFumble,
    isFumbleLost,
    isSafety: text.includes("safety"),
    isPenalty: playType === "PENALTY" || text.includes("penalty"),
    penaltyFirstDown: text.includes("penalty") && text.includes("first down"),
    isNoPlay: text.includes("no play") || text.includes("aborted"),
    isCompletion,
    isTarget: playType === "PASS" && receiverId != null,
    // SportsData.io does not flag scrambles; derive.ts infers them from the
    // fact that the ball carrier is the game's passer.
    isScramble: undefined,
    isKneel: text.includes("kneel"),
    isSpike: text.includes("spike") || text.includes("throws the ball away to stop the clock"),
    kickDistance: playType === "FIELD_GOAL" ? kickDistanceFrom(play, description, stats) : null,
    kickResult: kickResultFrom(playType, description, stats),
    returnYards: playType === "PUNT" || playType === "KICKOFF" ? parseReturnYards(description) : null,
    passerId,
    rusherId,
    receiverId,
    defenderId,
    kickerId,
    returnerId,
    raw: play,
  };
}

function playsFromPayload(payload: SportsDataPlayByPlay, fallbackGameId: string): NormalizedPlay[] {
  const score = payload.Score ?? {};
  const externalGameId = score.ScoreID != null ? String(score.ScoreID) : fallbackGameId;
  const season = score.Season ?? 0;
  const week = score.Week ?? 0;
  return (payload.Plays ?? []).map((play) =>
    normalizePlay(play, { externalGameId, season, week }),
  );
}

export class SportsDataIoProvider implements NflPbpProvider {
  readonly name = "sportsdataio";

  async getSchedule(season: number): Promise<ScheduledGame[]> {
    const games = await get<SportsDataSchedule[]>(`scores/json/Schedules/${season}`);
    return games
      .filter((game) => game.HomeTeam && game.AwayTeam)
      .map((game) => ({
        externalGameId: String(game.ScoreID ?? game.GlobalGameID ?? game.GameKey),
        season: game.Season,
        week: game.Week,
        homeTeam: game.HomeTeam,
        awayTeam: game.AwayTeam,
        kickoff: new Date(game.DateTimeUTC ?? game.Date ?? 0),
        status: mapStatus(game.Status),
      }));
  }

  /** Full current play list for one in-progress game (idempotent upsert). */
  async getLivePlays(externalGameId: string): Promise<NormalizedPlay[]> {
    const payload = await get<SportsDataPlayByPlay>(`pbp/json/PlayByPlay/${externalGameId}`);
    return playsFromPayload(payload, externalGameId);
  }

  /**
   * Every play of a week. Uses the delta endpoint with a wide window so a
   * single call covers the whole slate.
   */
  async getPlays(season: number, week: number): Promise<NormalizedPlay[]> {
    const payloads = await get<SportsDataPlayByPlay[]>(
      `pbp/json/PlayByPlayDelta/${season}/${week}/all`,
    );
    return payloads.flatMap((payload) => playsFromPayload(payload, ""));
  }
}

export const sportsDataIoProvider = new SportsDataIoProvider();
