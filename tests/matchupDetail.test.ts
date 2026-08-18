import { LineupSlot, Position } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildMatchupDetail } from "@/lib/matchup/detail";

const settings = {
  qbIncompletion: 0.5,
  qbInterception: 6,
  rbSuccessfulRun: 1.25,
  pcDrop: 2,
  defYardsAllowed300to400: 3,
  stPuntTouchback: -0.5,
};

const matchup = {
  id: "matchup-1",
  season: 2025,
  week: 3,
  isComplete: false,
  isPlayoff: false,
  homeScore: 4.5,
  awayScore: null,
  homeTeam: { id: "home", name: "Home Team" },
  awayTeam: { id: "away", name: "Away Team" },
};

describe("buildMatchupDetail", () => {
  it("computes per-player breakdowns and starter-only totals", () => {
    const payload = buildMatchupDetail({
      matchup,
      homeLineup: [
        { externalPlayerId: "wr-1", position: Position.WR, slot: LineupSlot.BENCH },
        { externalPlayerId: "qb-1", position: Position.QB, slot: LineupSlot.QB },
      ],
      awayLineup: [],
      statsByPlayerId: new Map([
        ["qb-1", { qbIncompletions: 3, qbInterceptions: 1 }],
        ["wr-1", { pcDrop: 2 }],
      ]),
      playerMap: new Map([
        ["qb-1", { fullName: "Quarter Back", position: Position.QB, nflTeam: "KC" }],
        ["wr-1", { fullName: "Wide Receiver", position: Position.WR, nflTeam: "BUF" }],
      ]),
      settings,
    });

    expect(payload.home.players[0]).toMatchObject({
      externalPlayerId: "qb-1",
      points: 7.5,
      isStarter: true,
      lineupSlot: LineupSlot.QB,
      stats: { qbIncompletions: 3, qbInterceptions: 1 },
      breakdown: [
        { field: "qbIncompletion", count: 3, pointsPer: 0.5, points: 1.5 },
        { field: "qbInterception", count: 1, pointsPer: 6, points: 6 },
      ],
    });
    expect(payload.home.players[1]).toMatchObject({
      externalPlayerId: "wr-1",
      points: 4,
      isStarter: false,
    });
    expect(payload.home.starterTotal).toBe(7.5);
  });

  it("keeps players without stats, orders slots, and supports team units", () => {
    const payload = buildMatchupDetail({
      matchup,
      homeLineup: [
        { externalPlayerId: "ST:KC", position: Position.ST, slot: LineupSlot.ST },
        { externalPlayerId: "bench", position: Position.RB, slot: LineupSlot.BENCH },
        { externalPlayerId: "DEF:KC", position: Position.DEF, slot: LineupSlot.DEF },
        { externalPlayerId: "missing", position: Position.TE, slot: LineupSlot.TE },
      ],
      awayLineup: [],
      statsByPlayerId: new Map([
        ["ST:KC", { stPuntTouchbacks: 1 }],
        ["DEF:KC", { defYardsAllowedBucket: "300_400" }],
      ]),
      playerMap: new Map([
        ["missing", { fullName: "No Stats", position: Position.TE, nflTeam: "NYJ" }],
      ]),
      settings,
    });

    expect(payload.home.players.map((player) => player.externalPlayerId)).toEqual([
      "missing",
      "ST:KC",
      "DEF:KC",
      "bench",
    ]);
    expect(payload.home.players[0]).toMatchObject({
      points: 0,
      breakdown: [],
      stats: {},
    });
    expect(payload.home.players[1]).toMatchObject({
      name: "KC Special Teams",
      nflTeam: "KC",
      points: -0.5,
    });
    expect(payload.home.players[2]).toMatchObject({
      name: "KC Defense",
      nflTeam: "KC",
      points: 3,
    });
    expect(payload.home.starterTotal).toBe(2.5);
  });
});
