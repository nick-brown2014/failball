const BASE_URL =
  process.env.SLEEPER_PROJECTIONS_URL ?? "https://api.sleeper.app/projections/nfl";

const DEFAULT_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

interface SleeperProjectionRecord {
  player_id?: string | null;
  stats?: Record<string, unknown> | null;
  player?: {
    position?: string | null;
    team?: string | null;
    years_exp?: number | null;
  } | null;
  company?: string | null;
  season?: number | null;
  season_type?: string | null;
  week?: number | null;
  date?: string | null;
  team?: string | null;
}

export interface NormalizedProjection {
  externalPlayerId: string;
  season: number;
  week: number;
  position: string | null;
  nflTeam: string | null;
  gamesProjected: number | null;
  yearsExp: number | null;
  stats: Record<string, number>;
  source: string;
  sourceUpdatedAt: Date | null;
}

function projectionUrl(season: number, week: number | null, positions: string[]): string {
  const path = week == null ? `${BASE_URL}/${season}` : `${BASE_URL}/${season}/${week}`;
  const params = new URLSearchParams({
    season_type: "regular",
    order_by: "pts_half_ppr",
  });
  for (const position of positions) params.append("position[]", position);
  return `${path}?${params.toString()}`;
}

async function fetchRecords(
  season: number,
  week: number | null,
  positions: string[],
): Promise<SleeperProjectionRecord[]> {
  const response = await fetch(projectionUrl(season, week, positions));
  if (!response.ok) {
    throw new Error(
      `Sleeper projections failed: ${response.status} ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as SleeperProjectionRecord[]) : [];
}

function returnedPositions(records: SleeperProjectionRecord[]): Set<string> {
  return new Set(
    records
      .map((record) => record.player?.position?.trim().toUpperCase())
      .filter((position): position is string => Boolean(position)),
  );
}

async function fetchProjectionRecords(
  season: number,
  week: number | null,
  positions: string[],
): Promise<SleeperProjectionRecord[]> {
  const records = await fetchRecords(season, week, positions);
  const requested = new Set(positions.map((position) => position.toUpperCase()));
  const returned = returnedPositions(records);
  const missingPosition = [...requested].some((position) => !returned.has(position));

  // Sleeper normally honors repeated position[] parameters. If a deployment
  // only honors one value, retry one position at a time and deduplicate below.
  if (positions.length > 1 && missingPosition) {
    const sequential = await Promise.all(
      positions.map((position) => fetchRecords(season, week, [position])),
    );
    return sequential.flat();
  }
  return records;
}

function normalizeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRecord(
  record: SleeperProjectionRecord,
  season: number,
  week: number | null,
): NormalizedProjection | null {
  const externalPlayerId = record.player_id?.trim();
  if (!externalPlayerId) return null;

  const stats = Object.fromEntries(
    Object.entries(record.stats ?? {}).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
  const gamesProjected =
    typeof stats.gp === "number" && Number.isFinite(stats.gp) ? stats.gp : null;
  const yearsExp =
    typeof record.player?.years_exp === "number" &&
    Number.isFinite(record.player.years_exp)
      ? Math.trunc(record.player.years_exp)
      : null;

  return {
    externalPlayerId,
    season,
    week: week ?? 0,
    position: record.player?.position?.trim() || null,
    nflTeam: record.team?.trim() || record.player?.team?.trim() || null,
    gamesProjected,
    yearsExp,
    stats,
    source: record.company?.trim() || "rotowire",
    sourceUpdatedAt: normalizeDate(record.date),
  };
}

async function getProjections(
  season: number,
  week: number | null,
  positions = DEFAULT_POSITIONS,
): Promise<NormalizedProjection[]> {
  const normalizedPositions = [...new Set(positions.map((position) => position.trim()).filter(Boolean))];
  const records = await fetchProjectionRecords(season, week, normalizedPositions);
  const deduped = new Map<string, NormalizedProjection>();
  for (const record of records) {
    const projection = normalizeRecord(record, season, week);
    if (projection) deduped.set(projection.externalPlayerId, projection);
  }
  return [...deduped.values()];
}

export function getSeasonProjections(
  season: number,
  positions?: string[],
): Promise<NormalizedProjection[]> {
  return getProjections(season, null, positions);
}

export function getWeekProjections(
  season: number,
  week: number,
  positions?: string[],
): Promise<NormalizedProjection[]> {
  return getProjections(season, week, positions);
}
