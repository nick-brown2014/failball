/**
 * Active provider selection.
 *
 * Env vars:
 * - `NFL_PBP_PROVIDER`      `sportsdataio` (DEFAULT, paid live) | `sportradar` (paid live alt) | `nflverse` (free, post-game)
 * - `NFL_CHARTING_PROVIDER` `charting` (paid, drops + routes-not-targeted only) | `none` (DEFAULT)
 * - `NFL_PLAYER_PROVIDER`   `sleeper` (DEFAULT, free)
 *
 * API keys: `SPORTSDATAIO_API_KEY`, `SPORTRADAR_API_KEY`, `CHARTING_API_KEY`
 * (+ `CHARTING_BASE_URL`).
 *
 * The paid live PBP feed is the production default because live in-game scoring
 * is a launch requirement. Set `NFL_PBP_PROVIDER=nflverse` for backfill,
 * reconciliation, or local work that should not consume paid quota.
 */

import { nflverseProvider } from "./providers/nflverse";
import { sportsDataIoProvider } from "./providers/sportsdataio";
import { sportradarProvider } from "./providers/sportradar";
import { chartingProvider, nullChartingProvider } from "./providers/charting";
import { sleeperProvider } from "./providers/sleeper";
import type {
  NflChartingProvider,
  NflPbpProvider,
  NflPlayerProvider,
} from "./types";

const PBP_PROVIDERS: Record<string, NflPbpProvider> = {
  sportsdataio: sportsDataIoProvider,
  sportradar: sportradarProvider,
  nflverse: nflverseProvider,
};

const CHARTING_PROVIDERS: Record<string, NflChartingProvider> = {
  charting: chartingProvider,
  none: nullChartingProvider,
};

const PLAYER_PROVIDERS: Record<string, NflPlayerProvider> = {
  sleeper: sleeperProvider,
};

export const DEFAULT_PBP_PROVIDER = "sportsdataio";

export function getPbpProvider(name = process.env.NFL_PBP_PROVIDER): NflPbpProvider {
  const key = (name ?? DEFAULT_PBP_PROVIDER).toLowerCase();
  const provider = PBP_PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Unknown NFL_PBP_PROVIDER "${key}". Expected one of: ${Object.keys(PBP_PROVIDERS).join(", ")}`,
    );
  }
  return provider;
}

/** Free post-game source, used explicitly for backfill and reconciliation. */
export function getBackfillPbpProvider(): NflPbpProvider {
  return nflverseProvider;
}

export function getChartingProvider(
  name = process.env.NFL_CHARTING_PROVIDER,
): NflChartingProvider {
  const key = (name ?? "none").toLowerCase();
  const provider = CHARTING_PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Unknown NFL_CHARTING_PROVIDER "${key}". Expected one of: ${Object.keys(CHARTING_PROVIDERS).join(", ")}`,
    );
  }
  return provider;
}

export function getPlayerProvider(
  name = process.env.NFL_PLAYER_PROVIDER,
): NflPlayerProvider {
  const key = (name ?? "sleeper").toLowerCase();
  const provider = PLAYER_PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Unknown NFL_PLAYER_PROVIDER "${key}". Expected one of: ${Object.keys(PLAYER_PROVIDERS).join(", ")}`,
    );
  }
  return provider;
}

export * from "./types";
export { backfillSeason, buildGsisCrosswalk, remapPlayIds } from "./backfill";
export {
  DEFAULT_DERIVATION_CONFIG,
  classifyCatch,
  classifyGain,
  classifyRun,
  defenseUnitId,
  deriveStats,
  emptyDerivedStats,
  specialTeamsUnitId,
  yardsAllowedBucket,
} from "./derive";
