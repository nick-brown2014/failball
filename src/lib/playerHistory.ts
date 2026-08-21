import {
  roundPoints,
  SCORING_FIELDS,
  type ScorableStats,
} from "@/lib/scoring/computeScore";

type ScoringCountField = (typeof SCORING_FIELDS)[number][1];

const COUNT_FIELDS = [
  ...new Set(SCORING_FIELDS.map(([, countField]) => countField)),
] as ScoringCountField[];

const EXTRA_FIELDS = ["defYardsAllowed", "defYardsAllowedBucket"] as const;
type ExtraField = (typeof EXTRA_FIELDS)[number];
type StatField = ScoringCountField | ExtraField;

export interface PlayerWeekStatsRow extends ScorableStats {
  externalPlayerId: string;
  season: number;
  week: number;
  position: string | null;
  nflTeam: string | null;
  isFinal: boolean;
  defYardsAllowed?: number;
}

export interface PlayerHistoryWeek {
  week: number;
  isFinal: boolean;
  nflTeam: string | null;
  position: string | null;
  [field: string]: number | string | boolean | null;
}

export interface PlayerHistorySeason {
  season: number;
  weeks: PlayerHistoryWeek[];
  games: number;
  fields: string[];
  totals: Record<string, number>;
  averages: Record<string, number>;
}

export interface PlayerHistory {
  seasons: PlayerHistorySeason[];
  games: number;
  fields: string[];
  totals: Record<string, number>;
  averages: Record<string, number>;
}

function isTeamDefenseRow(row: PlayerWeekStatsRow): boolean {
  return row.position === "DEF" || row.externalPlayerId.startsWith("DEF:");
}

function numericValue(row: PlayerWeekStatsRow, field: ScoringCountField | "defYardsAllowed"): number {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function statFieldsForRows(rows: PlayerWeekStatsRow[]): StatField[] {
  const fields: StatField[] = [...COUNT_FIELDS];
  if (rows.some(isTeamDefenseRow)) {
    fields.push(...EXTRA_FIELDS);
  }
  return fields;
}

function buildSeason(season: number, rows: PlayerWeekStatsRow[]): PlayerHistorySeason {
  const statFields = statFieldsForRows(rows);
  const totals: Record<string, number> = {};

  for (const field of statFields) {
    if (field === "defYardsAllowedBucket") continue;
    totals[field] = roundPoints(
      rows.reduce((sum, row) => sum + numericValue(row, field), 0),
    );
  }

  const fields = statFields.filter((field) => {
    if (field === "defYardsAllowedBucket") {
      return rows.some((row) => isTeamDefenseRow(row) && row.defYardsAllowedBucket != null);
    }
    return totals[field] !== 0;
  });

  const averages = Object.fromEntries(
    Object.entries(totals).map(([field, total]) => [
      field,
      roundPoints(total / rows.length),
    ]),
  );

  const weeks = rows
    .slice()
    .sort((a, b) => a.week - b.week)
    .map((row) => {
      const week: PlayerHistoryWeek = {
        week: row.week,
        isFinal: row.isFinal,
        nflTeam: row.nflTeam,
        position: row.position,
      };

      for (const field of COUNT_FIELDS) {
        week[field] = numericValue(row, field);
      }
      if (isTeamDefenseRow(row)) {
        week.defYardsAllowed = numericValue(row, "defYardsAllowed");
        week.defYardsAllowedBucket = row.defYardsAllowedBucket ?? null;
      }
      return week;
    });

  return {
    season,
    weeks,
    games: rows.length,
    fields,
    totals,
    averages,
  };
}

export function buildPlayerHistory(rows: PlayerWeekStatsRow[]): PlayerHistory {
  const grouped = new Map<number, PlayerWeekStatsRow[]>();
  for (const row of rows) {
    const seasonRows = grouped.get(row.season) ?? [];
    seasonRows.push(row);
    grouped.set(row.season, seasonRows);
  }

  const seasons = [...grouped.entries()]
    .sort(([a], [b]) => b - a)
    .map(([season, seasonRows]) => buildSeason(season, seasonRows));

  const totals: Record<string, number> = {};
  for (const row of rows) {
    for (const field of COUNT_FIELDS) {
      totals[field] = (totals[field] ?? 0) + numericValue(row, field);
    }
    if (isTeamDefenseRow(row)) {
      totals.defYardsAllowed =
        (totals.defYardsAllowed ?? 0) + numericValue(row, "defYardsAllowed");
    }
  }

  const fields = Object.keys(totals).filter((field) => totals[field] !== 0);
  const averages = Object.fromEntries(
    Object.entries(totals).map(([field, total]) => [
      field,
      roundPoints(total / rows.length),
    ]),
  );

  return {
    seasons,
    games: rows.length,
    fields,
    totals: Object.fromEntries(
      Object.entries(totals).map(([field, total]) => [field, roundPoints(total)]),
    ),
    averages,
  };
}
