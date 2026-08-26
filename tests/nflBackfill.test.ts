import { Position } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { backfillSeason, remapPlayIds } from "@/lib/nfl/backfill";
import type { NflPbpProvider, NormalizedPlay } from "@/lib/nfl/types";

const basePlay: NormalizedPlay = {
  externalPlayId: "play-1",
  externalGameId: "2025_01_TEST",
  season: 2025,
  week: 1,
  playType: "PASS",
  offenseTeam: "KC",
  defenseTeam: "BUF",
  passerId: "gsis-qb",
  receiverId: "unknown-receiver",
  isCompletion: false,
  isTarget: true,
  yardsGained: 0,
};

describe("nflverse id crosswalk", () => {
  it("remaps every player-bearing id and reports unresolved ids", () => {
    const result = remapPlayIds(
      [{ ...basePlay, defenderId: "gsis-def", kickerId: "unknown-kicker" }],
      new Map([
        ["gsis-qb", "sleeper-qb"],
        ["gsis-def", "sleeper-def"],
      ]),
    );
    expect(result.plays[0]).toMatchObject({
      passerId: "sleeper-qb",
      defenderId: "sleeper-def",
      receiverId: "unknown-receiver",
      kickerId: "unknown-kicker",
    });
    expect(result.unresolvedIds).toEqual(new Set(["unknown-receiver", "unknown-kicker"]));
  });
});

describe("season backfill", () => {
  it("is idempotent with in-memory derivation and a fake prisma client", async () => {
    const games = new Map<string, { id: string }>();
    const stats = new Map<string, Record<string, unknown>>();
    const fakePrisma = {
      player: {
        findMany: async () => [{ gsisId: "gsis-qb", externalPlayerId: "sleeper-qb", position: Position.QB }],
      },
      game: {
        upsert: async ({ where }: { where: { externalGameId: string } }) => {
          const existing = games.get(where.externalGameId);
          if (existing) return existing;
          const created = { id: "game-1" };
          games.set(where.externalGameId, created);
          return created;
        },
      },
      playerWeekStats: {
        upsert: async ({ where, create, update }: { where: { externalPlayerId_season_week: { externalPlayerId: string; season: number; week: number } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const key = `${where.externalPlayerId_season_week.externalPlayerId}:${where.externalPlayerId_season_week.season}:${where.externalPlayerId_season_week.week}`;
          stats.set(key, { ...(stats.get(key) ?? create), ...update });
          return stats.get(key);
        },
      },
    };
    const provider: NflPbpProvider = {
      name: "fake-nflverse",
      getSchedule: async () => [{
        externalGameId: "2025_01_TEST",
        season: 2025,
        week: 1,
        homeTeam: "KC",
        awayTeam: "BUF",
        kickoff: new Date("2025-09-01"),
        status: "FINAL",
      }],
      getLivePlays: async () => [],
      getPlays: async () => [basePlay],
      getSeasonPlays: async () => [basePlay],
    };

    const first = await backfillSeason({ season: 2025, provider, prismaClient: fakePrisma as never });
    const snapshot = JSON.stringify([...stats]);
    const second = await backfillSeason({ season: 2025, provider, prismaClient: fakePrisma as never });
    expect(first.statLines).toBe(3);
    expect(second.statLines).toBe(3);
    expect(stats.size).toBe(3);
    expect(JSON.stringify([...stats])).toBe(snapshot);
  });
});
