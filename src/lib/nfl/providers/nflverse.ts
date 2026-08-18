/**
 * nflverse / nflfastR -- FREE post-game play-by-play.
 *
 * Implements the same `NflPbpProvider` interface as the paid live providers, but
 * nflverse publishes CSV releases only AFTER games finish (typically within
 * minutes-to-hours), so it is NOT usable for live scoring. It is used for:
 * - backfilling historical weeks/seasons,
 * - local development and tests without burning paid API quota,
 * - post-game reconciliation of numbers derived from the live feed.
 *
 * Source: https://github.com/nflverse/nflverse-data releases, e.g.
 * `pbp/play_by_play_{season}.csv`. Player ids are GSIS ids, which map onto
 * `Player.gsisId`.
 */

import type {
  NflPbpProvider,
  NormalizedPlay,
  PlayType,
  ScheduledGame,
} from "../types";

const DATA_BASE_URL =
  process.env.NFLVERSE_BASE_URL ??
  "https://github.com/nflverse/nflverse-data/releases/download";

const PBP_URL = (season: number) => `${DATA_BASE_URL}/pbp/play_by_play_${season}.csv`;
const SCHEDULE_URL = () =>
  process.env.NFLVERSE_SCHEDULE_URL ??
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

/** Minimal CSV parser: handles quoted fields and embedded commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((cells) => cells.length === header.length)
    .map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i]])));
}

const num = (value: string | undefined): number | null => {
  if (value == null || value === "" || value === "NA") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const flag = (value: string | undefined): boolean => value === "1" || value === "TRUE" || value === "true";

const str = (value: string | undefined): string | null =>
  value == null || value === "" || value === "NA" ? null : value;

function mapPlayType(row: Record<string, string>): PlayType {
  if (flag(row.sack)) return "SACK";
  switch (row.play_type) {
    case "pass":
      return "PASS";
    case "run":
      return "RUSH";
    case "punt":
      return "PUNT";
    case "kickoff":
      return "KICKOFF";
    case "field_goal":
      return "FIELD_GOAL";
    case "extra_point":
      return "EXTRA_POINT";
    case "no_play":
      return "PENALTY";
    default:
      return "OTHER";
  }
}

/** nflfastR row -> normalized play. Column names follow the nflfastR schema. */
export function normalizeRow(row: Record<string, string>): NormalizedPlay {
  const playType = mapPlayType(row);
  const fieldGoalResult = str(row.field_goal_result);
  const extraPointResult = str(row.extra_point_result);
  const kickResult =
    playType === "FIELD_GOAL"
      ? fieldGoalResult === "made"
        ? "MADE"
        : fieldGoalResult === "blocked"
          ? "BLOCKED"
          : "MISSED"
      : playType === "EXTRA_POINT"
        ? extraPointResult === "good"
          ? "MADE"
          : extraPointResult === "blocked"
            ? "BLOCKED"
            : "MISSED"
        : flag(row.touchback)
          ? "TOUCHBACK"
          : str(row.fumbled_1_player_id) && (playType === "PUNT" || playType === "KICKOFF")
            ? "MUFFED"
            : null;

  return {
    externalPlayId: `${row.game_id}-${row.play_id}`,
    externalGameId: row.game_id ?? "",
    season: num(row.season) ?? 0,
    week: num(row.week) ?? 0,
    quarter: num(row.qtr),
    clock: str(row.time),
    offenseTeam: str(row.posteam),
    defenseTeam: str(row.defteam),
    down: num(row.down),
    distance: num(row.ydstogo),
    yardLine: num(row.yardline_100) == null ? null : 100 - (num(row.yardline_100) as number),
    playType,
    result: str(row.desc),
    yardsGained: num(row.yards_gained) ?? 0,
    isTouchdown: flag(row.touchdown),
    isTurnover: flag(row.interception) || flag(row.fumble_lost),
    isSack: flag(row.sack),
    isInterception: flag(row.interception),
    isFumble: flag(row.fumble),
    isFumbleLost: flag(row.fumble_lost),
    isSafety: flag(row.safety),
    isPenalty: flag(row.penalty),
    penaltyFirstDown: flag(row.penalty) && flag(row.first_down_penalty),
    isNoPlay: row.play_type === "no_play",
    isCompletion: flag(row.complete_pass),
    isTarget: str(row.receiver_player_id) != null,
    // nflfastR explicitly labels scrambles.
    isScramble: flag(row.qb_scramble),
    isKneel: row.play_type === "qb_kneel" || flag(row.qb_kneel),
    isSpike: row.play_type === "qb_spike" || flag(row.qb_spike),
    kickDistance: num(row.kick_distance),
    kickResult,
    returnYards: num(row.return_yards),
    passerId: str(row.passer_player_id),
    rusherId: str(row.rusher_player_id),
    receiverId: str(row.receiver_player_id),
    defenderId: str(row.interception_player_id) ?? str(row.sack_player_id),
    kickerId: str(row.kicker_player_id),
    returnerId: str(row.punt_returner_player_id) ?? str(row.kickoff_returner_player_id),
    raw: row,
  };
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`nflverse ${url} failed: ${response.status} ${response.statusText}`);
  }
  return parseCsv(await response.text());
}

export class NflverseProvider implements NflPbpProvider {
  readonly name = "nflverse";

  async getSchedule(season: number): Promise<ScheduledGame[]> {
    const rows = await fetchCsv(SCHEDULE_URL());
    return rows
      .filter((row) => num(row.season) === season)
      .map((row) => ({
        externalGameId: row.game_id,
        season,
        week: num(row.week) ?? 0,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        kickoff: new Date(`${row.gameday}T${row.gametime || "00:00"}:00Z`),
        status: str(row.result) != null ? ("FINAL" as const) : ("SCHEDULED" as const),
      }));
  }

  /**
   * nflverse has no live feed: a game's plays only appear once the release is
   * rebuilt post-game. Returning the finished play list keeps the interface
   * honest (idempotent upsert of whatever exists), but production live scoring
   * must use a paid provider.
   */
  async getLivePlays(externalGameId: string): Promise<NormalizedPlay[]> {
    const season = Number(externalGameId.slice(0, 4));
    if (!Number.isFinite(season)) {
      throw new Error(`Cannot infer season from nflverse game id "${externalGameId}"`);
    }
    const rows = await fetchCsv(PBP_URL(season));
    return rows.filter((row) => row.game_id === externalGameId).map(normalizeRow);
  }

  async getPlays(season: number, week: number): Promise<NormalizedPlay[]> {
    const rows = await fetchCsv(PBP_URL(season));
    return rows.filter((row) => num(row.week) === week).map(normalizeRow);
  }
}

export const nflverseProvider = new NflverseProvider();
