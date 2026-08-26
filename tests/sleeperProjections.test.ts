import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSeasonProjections,
  getWeekProjections,
} from "@/lib/nfl/providers/sleeperProjections";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Sleeper projections provider", () => {
  it("normalizes season projections and preserves empty rookie rows", async () => {
    const payload = [
      {
        player_id: "qb-veteran",
        stats: {
          gp: 17,
          pass_td: 30,
          pass_yd: 4200,
          ignored: null,
          invalid: "not numeric",
        },
        player: {
          position: "QB",
          team: "KC",
          years_exp: 8,
        },
        company: "rotowire",
        week: 18,
        date: "2026-08-01T12:00:00Z",
      },
      {
        player_id: "qb-rookie",
        stats: {},
        player: {
          position: "QB",
          team: "LV",
          years_exp: 0,
        },
        week: 18,
        date: "not a date",
      },
      { player_id: null, stats: { gp: 17 }, player: { position: "QB" } },
      { player_id: "rb-player", stats: {}, player: { position: "RB" } },
      { player_id: "wr-player", stats: {}, player: { position: "WR" } },
      { player_id: "te-player", stats: {}, player: { position: "TE" } },
      { player_id: "k-player", stats: {}, player: { position: "K" } },
      { player_id: "def-player", stats: {}, player: { position: "DEF" } },
    ];
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    global.fetch = fetchMock as typeof fetch;

    const projections = await getSeasonProjections(2026);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string];
    const url = new URL(firstCall[0]);
    expect(url.searchParams.getAll("position[]")).toEqual([
      "QB",
      "RB",
      "WR",
      "TE",
      "K",
      "DEF",
    ]);
    expect(url.searchParams.get("season_type")).toBe("regular");
    expect(projections).toHaveLength(7);
    expect(projections[0]).toMatchObject({
      externalPlayerId: "qb-veteran",
      season: 2026,
      week: 0,
      position: "QB",
      nflTeam: "KC",
      gamesProjected: 17,
      yearsExp: 8,
      stats: { gp: 17, pass_td: 30, pass_yd: 4200 },
      source: "rotowire",
    });
    expect(projections[0].sourceUpdatedAt).toEqual(new Date("2026-08-01T12:00:00Z"));
    expect(projections.find((projection) => projection.externalPlayerId === "qb-rookie")).toMatchObject({
      yearsExp: 0,
      stats: {},
      sourceUpdatedAt: null,
    });
    expect(projections.some((projection) => projection.externalPlayerId === "")).toBe(false);
  });

  it("uses the requested week for weekly projections", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            player_id: "qb-player",
            stats: { gp: 1, pass_inc: 2, pass_sack: 1 },
            player: { position: "QB", years_exp: 1 },
            week: 99,
          },
        ]),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const [projection] = await getWeekProjections(2026, 4, ["QB"]);

    expect(projection.week).toBe(4);
    expect(projection.stats).toEqual({ gp: 1, pass_inc: 2, pass_sack: 1 });
    const firstCall = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(firstCall[0]).pathname).toBe(
      "/projections/nfl/2026/4",
    );
  });

  it("falls back to sequential position requests when repeated filters are ignored", async () => {
    const qb = {
      player_id: "same-player",
      stats: { gp: 17 },
      player: { position: "QB", years_exp: 1 },
    };
    const responses = [
      [qb],
      [qb],
      [{ player_id: "rb-player", stats: {}, player: { position: "RB", years_exp: 0 } }],
    ];
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responses.shift() ?? []), { status: 200 }),
    );
    global.fetch = fetchMock as typeof fetch;

    const projections = await getSeasonProjections(2026, ["QB", "RB"]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(projections.map((projection) => projection.externalPlayerId)).toEqual([
      "same-player",
      "rb-player",
    ]);
  });
});
