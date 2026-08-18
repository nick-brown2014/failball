/**
 * Provider-agnostic NFL data contracts.
 *
 * Failball derives its entire scoring model from play-by-play (PBP) data, so
 * the only hard dependency on a vendor is the shape below. The production PBP
 * source is a PAID LIVE feed (SportsData.io by default, Sportradar as a
 * documented alternate) because in-game scoring is a launch requirement. The
 * free nflverse/nflfastR source implements the same interface and is used for
 * backfill, local testing without burning paid quota, and post-game
 * reconciliation.
 *
 * Two scoring fields cannot be inferred from a play result -- `pcDrop` and
 * `pcRouteNotTargeted` -- so they come from a separate, deliberately narrow
 * charting provider.
 */

export type GameStatusValue = "SCHEDULED" | "IN_PROGRESS" | "FINAL";

export interface ScheduledGame {
  externalGameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  status: GameStatusValue;
}

export type KickResult =
  | "MADE"
  | "MISSED"
  | "BLOCKED"
  | "TOUCHBACK"
  | "MUFFED"
  | "RECOVERED"
  | "ONSIDE_FAIL"
  | "ONSIDE_RECOVERED";

/**
 * A single normalized play. Adapters translate their vendor payload into this
 * shape; `derive.ts` never sees vendor-specific fields.
 *
 * `externalPlayId` must be stable across polls of the same game: live feeds
 * re-issue plays with corrected yardage/statistics, and ingestion upserts on
 * (gameId, externalPlayId) so corrections replace rather than duplicate.
 */
export interface NormalizedPlay {
  externalPlayId: string;
  externalGameId: string;
  season: number;
  week: number;

  quarter?: number | null;
  clock?: string | null;
  offenseTeam?: string | null;
  defenseTeam?: string | null;
  down?: number | null;
  distance?: number | null;
  /** Yards from the offense's own goal line (1-99). */
  yardLine?: number | null;

  /** Normalized play type. */
  playType: PlayType;
  result?: string | null;
  yardsGained?: number | null;

  isTouchdown?: boolean;
  isTurnover?: boolean;
  isSack?: boolean;
  isInterception?: boolean;
  isFumble?: boolean;
  /** Fumble that changed possession (a recovered-by-offense fumble does not). */
  isFumbleLost?: boolean;
  isSafety?: boolean;
  isPenalty?: boolean;
  penaltyFirstDown?: boolean;
  /** Penalty negated the play, aborted snap, or otherwise no official result. */
  isNoPlay?: boolean;
  isCompletion?: boolean;
  isTarget?: boolean;
  /** QB run that was not a designed run (feeds `qbScramble`). */
  isScramble?: boolean;
  isKneel?: boolean;
  isSpike?: boolean;

  kickDistance?: number | null;
  kickResult?: KickResult | null;
  returnYards?: number | null;

  passerId?: string | null;
  rusherId?: string | null;
  receiverId?: string | null;
  defenderId?: string | null;
  kickerId?: string | null;
  returnerId?: string | null;

  raw?: unknown;
}

export type PlayType =
  | "PASS"
  | "RUSH"
  | "SACK"
  | "PUNT"
  | "KICKOFF"
  | "FIELD_GOAL"
  | "EXTRA_POINT"
  | "PENALTY"
  | "TIMEOUT"
  | "OTHER";

export interface NflPbpProvider {
  readonly name: string;
  getSchedule(season: number): Promise<ScheduledGame[]>;
  /**
   * Latest plays for one in-progress game. Implementations should return the
   * full known play list (cheap upsert, idempotent) rather than a delta, so a
   * missed poll never loses plays.
   */
  getLivePlays(externalGameId: string): Promise<NormalizedPlay[]>;
  /** Whole-week plays, used for backfill / reconciliation. */
  getPlays(season: number, week: number): Promise<NormalizedPlay[]>;
}

/** The only two values we license charting for. */
export interface ChartingRow {
  externalPlayerId: string;
  drops: number;
  routesNotTargeted: number;
}

export interface NflChartingProvider {
  readonly name: string;
  getCharting(season: number, week: number): Promise<ChartingRow[]>;
}

export interface PlayerRecord {
  externalPlayerId: string;
  fullName: string;
  position?: string | null;
  nflTeam?: string | null;
  injuryStatus?: string | null;
  active?: boolean;
  gsisId?: string | null;
  sleeperId?: string | null;
  sportsDataId?: string | null;
  chartingId?: string | null;
}

export interface InjuryRecord {
  externalPlayerId: string;
  injuryStatus: string | null;
}

export interface NflPlayerProvider {
  readonly name: string;
  getPlayers(): Promise<PlayerRecord[]>;
  getInjuries(): Promise<InjuryRecord[]>;
}
