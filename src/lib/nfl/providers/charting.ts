/**
 * Charting adapter -- the ONLY paid data we buy beyond play-by-play, and it
 * returns exactly two values per player:
 *
 * - `drops`             -> PlayerWeekStats.pcDrop
 * - `routesNotTargeted` -> PlayerWeekStats.pcRouteNotTargeted
 *
 * Neither can be inferred from a play result: a "drop" is a judgment about
 * whether a pass was catchable, and routes run is a snap-level count that no
 * play-by-play feed exposes. Everything else in the Failball model is derived
 * from PBP in `derive.ts`.
 *
 * LATENCY: charting is compiled after games (typically same-night to next-day),
 * so these two fields are 0 during live scoring and are reconciled by
 * `POST /api/sync/charting`, which then flips `PlayerWeekStats.isFinal`.
 *
 * The concrete vendor is behind `CHARTING_BASE_URL` + `CHARTING_API_KEY`
 * (targeting Sports Info Solutions or PFF, whose weekly receiving endpoints both
 * expose drops and routes run). Keep this file the only place that knows about
 * the charting vendor.
 */

import type { ChartingRow, NflChartingProvider } from "../types";

interface ChartingApiRow {
  playerId?: string;
  player_id?: string;
  gsisId?: string;
  drops?: number;
  Drops?: number;
  routes?: number;
  routesRun?: number;
  targets?: number;
  routesNotTargeted?: number;
}

function toRow(row: ChartingApiRow): ChartingRow | null {
  const externalPlayerId = row.playerId ?? row.player_id ?? row.gsisId;
  if (!externalPlayerId) return null;

  const drops = row.drops ?? row.Drops ?? 0;
  // Vendors report routes run and targets; Failball wants the difference.
  const routesNotTargeted =
    row.routesNotTargeted ??
    Math.max(0, (row.routesRun ?? row.routes ?? 0) - (row.targets ?? 0));

  return { externalPlayerId, drops, routesNotTargeted };
}

export class ChartingProvider implements NflChartingProvider {
  readonly name = "charting";

  async getCharting(season: number, week: number): Promise<ChartingRow[]> {
    const baseUrl = process.env.CHARTING_BASE_URL;
    const apiKey = process.env.CHARTING_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error(
        "CHARTING_BASE_URL and CHARTING_API_KEY must be set to reconcile pcDrop / pcRouteNotTargeted",
      );
    }

    const response = await fetch(
      `${baseUrl}/receiving?season=${season}&week=${week}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        `Charting provider failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as ChartingApiRow[] | { data?: ChartingApiRow[] };
    const rows = Array.isArray(payload) ? payload : payload.data ?? [];
    return rows.map(toRow).filter((row): row is ChartingRow => row !== null);
  }
}

/**
 * No-op charting provider. Used in development and tests: the model must work
 * (with 0 drops / 0 untargeted routes) when no charting license is configured.
 */
export class NullChartingProvider implements NflChartingProvider {
  readonly name = "none";

  async getCharting(): Promise<ChartingRow[]> {
    return [];
  }
}

export const chartingProvider = new ChartingProvider();
export const nullChartingProvider = new NullChartingProvider();
