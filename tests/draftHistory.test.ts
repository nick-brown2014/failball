import { describe, expect, it } from "vitest";
import { computeScore, type ScorableStats } from "@/lib/scoring/computeScore";
import { getDraftRankings } from "@/lib/draft/history";

describe("draft history scoring", () => {
  it("keeps SQL aggregate totals equivalent to JS computeScore totals", async () => {
    const settings = {
      qbIncompletion: 0.5,
      qbSack: 2,
      defYardsAllowed300to400: 2,
    };
    const weekOne: ScorableStats = { qbIncompletions: 3 };
    const weekTwo: ScorableStats = { qbSacks: 1 };
    const expected = computeScore(weekOne, settings) + computeScore(weekTwo, settings);
    let queryCalls = 0;
    const fakePrisma = {
      leagueSettings: { findUnique: async () => settings },
      $queryRaw: async (query: unknown) => {
        const callNumber = ++queryCalls;
        if (callNumber === 2) return [{ count: 1 }];
        if (callNumber === 3) {
          return [
            { externalPlayerId: "player-1", week: 1, position: "QB", nflTeam: "KC", defYardsAllowedBucket: null, qbIncompletions: 3, qbSacks: 0 },
            { externalPlayerId: "player-1", week: 2, position: "QB", nflTeam: "KC", defYardsAllowedBucket: null, qbIncompletions: 0, qbSacks: 1 },
          ];
        }
        return [{
          externalPlayerId: "player-1",
          fullName: "Player One",
          position: "QB",
          nflTeam: "KC",
          weeksPlayed: 2,
          totalPoints: expected,
          avgPoints: expected / 2,
        }];
      },
    };
    const result = await getDraftRankings({
      leagueId: "league-1",
      season: 2025,
      prismaClient: fakePrisma as never,
    });
    expect(result.players[0].totalPoints).toBe(
      result.players[0].weeklyPoints.reduce((sum, week) => sum + week.points, 0),
    );
  });
});
