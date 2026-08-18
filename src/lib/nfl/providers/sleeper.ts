/**
 * Sleeper -- FREE player metadata, injury status, and ADP. No API key.
 *
 * Sleeper is not used for stats (Failball derives those itself from PBP); it is
 * the cheapest source of the player directory and injury designations, and it
 * carries the id crosswalk (`gsis_id`, `sportradar_id`, `espn_id`) that lets a
 * paid PBP feed, nflverse, and the charting vendor resolve to one `Player` row.
 */

import type {
  InjuryRecord,
  NflPlayerProvider,
  PlayerRecord,
} from "../types";

const BASE_URL = process.env.SLEEPER_BASE_URL ?? "https://api.sleeper.app/v1";

interface SleeperPlayer {
  player_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  team?: string | null;
  injury_status?: string | null;
  status?: string | null;
  active?: boolean | null;
  gsis_id?: string | null;
  sportradar_id?: string | null;
}

/**
 * Failball's `Position` enum. Sleeper also returns K, DL, LB, DB, etc.; Failball
 * rosters a Special Teams unit instead of an individual kicker, and everything
 * else (individual defenders) has no roster slot, so it maps to null.
 */
const FAILBALL_POSITIONS = new Set(["QB", "RB", "WR", "TE", "DEF", "ST"]);

function mapPosition(position?: string | null): string | null {
  if (!position) return null;
  const upper = position.toUpperCase() === "K" ? "ST" : position.toUpperCase();
  return FAILBALL_POSITIONS.has(upper) ? upper : null;
}

export class SleeperProvider implements NflPlayerProvider {
  readonly name = "sleeper";

  private async fetchPlayers(): Promise<SleeperPlayer[]> {
    const response = await fetch(`${BASE_URL}/players/nfl`, {
      // ~5MB payload that changes daily at most.
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!response.ok) {
      throw new Error(`Sleeper players failed: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as Record<string, SleeperPlayer>;
    return Object.values(payload);
  }

  async getPlayers(): Promise<PlayerRecord[]> {
    const players = await this.fetchPlayers();
    return players
      .filter((player) => player.position != null)
      .map((player) => ({
        externalPlayerId: player.player_id,
        fullName:
          player.full_name ??
          [player.first_name, player.last_name].filter(Boolean).join(" ") ??
          player.player_id,
        position: mapPosition(player.position),
        nflTeam: player.team ?? null,
        injuryStatus: player.injury_status ?? null,
        active: player.active ?? player.status === "Active",
        gsisId: player.gsis_id ?? null,
        sleeperId: player.player_id,
      }));
  }

  async getInjuries(): Promise<InjuryRecord[]> {
    const players = await this.fetchPlayers();
    return players
      .filter((player) => player.injury_status != null)
      .map((player) => ({
        externalPlayerId: player.player_id,
        injuryStatus: player.injury_status ?? null,
      }));
  }
}

export const sleeperProvider = new SleeperProvider();
