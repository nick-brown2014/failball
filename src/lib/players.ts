/**
 * Fantasy-relevant NFL player directory.
 *
 * Source is Sleeper's free player list (`https://api.sleeper.app/v1/players/nfl`,
 * no API key) via the existing `sleeper` player provider. The payload is ~5MB and
 * changes at most daily, so it is normalized once and cached in the server
 * process; the full player universe is deliberately NOT persisted -- rosters
 * reference players by `externalPlayerId` only.
 */

import { Position } from "@prisma/client";
import { getPlayerProvider } from "@/lib/nfl";

export interface FailballPlayer {
  externalPlayerId: string;
  fullName: string;
  position: Position;
  nflTeam: string | null;
  injuryStatus: string | null;
}

export interface PlayerSearchParams {
  q?: string | null;
  position?: string | null;
  page?: number;
  limit?: number;
}

export interface PlayerSearchResult {
  players: FailballPlayer[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Positions a Failball team can roster. `FLEX` is a slot, never a player. */
const ROSTERABLE_POSITIONS = new Set<string>([
  Position.QB,
  Position.RB,
  Position.WR,
  Position.TE,
  Position.ST,
  Position.DEF,
]);

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface PlayerCache {
  players: FailballPlayer[];
  byId: Map<string, FailballPlayer>;
  fetchedAt: number;
}

let cache: PlayerCache | null = null;
let inFlight: Promise<PlayerCache> | null = null;

export function toRosterablePosition(value?: string | null): Position | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return ROSTERABLE_POSITIONS.has(upper) ? (upper as Position) : null;
}

async function loadPlayers(): Promise<PlayerCache> {
  const records = await getPlayerProvider().getPlayers();

  const players: FailballPlayer[] = [];
  for (const record of records) {
    const position = toRosterablePosition(record.position);
    if (!position) continue;
    if (record.active === false) continue;

    players.push({
      externalPlayerId: record.externalPlayerId,
      fullName: record.fullName,
      position,
      nflTeam: record.nflTeam ?? null,
      injuryStatus: record.injuryStatus ?? null,
    });
  }

  players.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    players,
    byId: new Map(players.map((player) => [player.externalPlayerId, player])),
    fetchedAt: Date.now(),
  };
}

function isFresh(entry: PlayerCache | null): entry is PlayerCache {
  return entry !== null && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function getCache(): Promise<PlayerCache> {
  if (isFresh(cache)) return cache;
  if (!inFlight) {
    inFlight = loadPlayers()
      .then((loaded) => {
        cache = loaded;
        return loaded;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Every fantasy-relevant player, name-sorted. */
export async function getPlayers(): Promise<FailballPlayer[]> {
  return (await getCache()).players;
}

/** Lookup table keyed by `externalPlayerId`, for enriching roster rows. */
export async function getPlayerMap(): Promise<Map<string, FailballPlayer>> {
  return (await getCache()).byId;
}

export async function getPlayer(
  externalPlayerId: string,
): Promise<FailballPlayer | null> {
  return (await getPlayerMap()).get(externalPlayerId) ?? null;
}

export async function searchPlayers({
  q,
  position,
  page = 1,
  limit = 25,
}: PlayerSearchParams): Promise<PlayerSearchResult> {
  const all = await getPlayers();
  const needle = q?.trim().toLowerCase();
  const filterPosition = toRosterablePosition(position);

  const matches = all.filter((player) => {
    if (filterPosition && player.position !== filterPosition) return false;
    if (needle && !player.fullName.toLowerCase().includes(needle)) return false;
    return true;
  });

  const start = (page - 1) * limit;

  return {
    players: matches.slice(start, start + limit),
    total: matches.length,
    page,
    limit,
    hasMore: start + limit < matches.length,
  };
}

/** Test/ops escape hatch: drop the cached directory so the next read refetches. */
export function clearPlayerCache(): void {
  cache = null;
}
