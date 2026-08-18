import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlayers = vi.fn();

vi.mock("@/lib/nfl", () => ({
  getPlayerProvider: () => ({ name: "sleeper", getPlayers }),
}));

import {
  clearPlayerCache,
  getPlayerMap,
  searchPlayers,
} from "@/lib/players";

const records = [
  {
    externalPlayerId: "1",
    fullName: "Zach Wilson",
    position: "QB",
    nflTeam: "NYJ",
    injuryStatus: "Questionable",
    active: true,
  },
  {
    externalPlayerId: "2",
    fullName: "Aaron Rodgers",
    position: "QB",
    nflTeam: "NYJ",
    injuryStatus: null,
    active: true,
  },
  {
    externalPlayerId: "3",
    fullName: "Retired Guy",
    position: "RB",
    nflTeam: null,
    injuryStatus: null,
    active: false,
  },
  {
    externalPlayerId: "4",
    fullName: "Some Linebacker",
    position: "LB",
    nflTeam: "DAL",
    injuryStatus: null,
    active: true,
  },
];

describe("players service", () => {
  beforeEach(() => {
    clearPlayerCache();
    getPlayers.mockReset();
    getPlayers.mockResolvedValue(records);
  });

  it("keeps only active, rosterable positions and sorts by name", async () => {
    const result = await searchPlayers({});

    expect(result.players.map((player) => player.fullName)).toEqual([
      "Aaron Rodgers",
      "Zach Wilson",
    ]);
    expect(result.total).toBe(2);
  });

  it("filters by name and position", async () => {
    expect((await searchPlayers({ q: "wil" })).players).toHaveLength(1);
    expect((await searchPlayers({ position: "RB" })).players).toHaveLength(0);
    expect((await searchPlayers({ position: "bogus" })).players).toHaveLength(2);
  });

  it("paginates", async () => {
    const page1 = await searchPlayers({ limit: 1 });
    const page2 = await searchPlayers({ limit: 1, page: 2 });

    expect(page1.players[0].fullName).toBe("Aaron Rodgers");
    expect(page1.hasMore).toBe(true);
    expect(page2.players[0].fullName).toBe("Zach Wilson");
    expect(page2.hasMore).toBe(false);
  });

  it("fetches the directory once and serves later reads from cache", async () => {
    await Promise.all([searchPlayers({}), searchPlayers({}), getPlayerMap()]);
    await searchPlayers({});

    expect(getPlayers).toHaveBeenCalledTimes(1);
  });

  it("exposes an id lookup for roster enrichment", async () => {
    const map = await getPlayerMap();

    expect(map.get("1")?.injuryStatus).toBe("Questionable");
    expect(map.get("3")).toBeUndefined();
  });
});
