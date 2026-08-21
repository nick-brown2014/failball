/**
 * Recompute matchup / team scores from the current PlayerWeekStats and push the
 * result to live subscribers.
 *
 * Called by the live sync job after every incremental derivation and again after
 * charting reconciliation. Fully idempotent: scores are recomputed from stats,
 * never incremented.
 *
 * Roster convention: DEF and ST slots store the team-unit ids produced by
 * `derive.ts` (`DEF:<team>` / `ST:<team>`).
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isStartingSlot, seedLineupsForTeams } from "@/lib/lineup/service";
import {
  publishMatchupScores,
  type MatchupScoreUpdate,
} from "@/lib/realtime/events";
import { computeScore, roundPoints, type ScorableStats } from "./computeScore";

export async function recomputeWeekScores(options: {
  season: number;
  week: number;
  leagueIds?: string[];
  publish?: boolean;
}): Promise<MatchupScoreUpdate[]> {
  const { season, week, leagueIds, publish = true } = options;

  const matchups = await prisma.matchup.findMany({
    where: {
      season,
      week,
      ...(leagueIds && leagueIds.length > 0 ? { leagueId: { in: leagueIds } } : {}),
    },
    include: {
      league: { include: { settings: true } },
      homeTeam: { select: { id: true } },
      awayTeam: { select: { id: true } },
    },
  });
  if (matchups.length === 0) return [];

  const teamIds = [
    ...new Set(matchups.flatMap((matchup) => [matchup.homeTeam.id, matchup.awayTeam.id])),
  ];
  await seedLineupsForTeams(teamIds, season, week);
  const snapshots = await prisma.lineupSnapshot.findMany({
    where: { teamId: { in: teamIds }, season, week },
  });
  const rosterPlayerIds = [
    ...new Set(
      snapshots
        .filter((slot) => isStartingSlot(slot.slot))
        .map((slot) => slot.externalPlayerId),
    ),
  ];

  const statRows = await prisma.playerWeekStats.findMany({
    where: { season, week, externalPlayerId: { in: rosterPlayerIds } },
  });
  const statsByPlayerId = new Map<string, ScorableStats>(
    statRows.map((row) => [row.externalPlayerId, row as ScorableStats]),
  );

  const updates: MatchupScoreUpdate[] = [];

  for (const matchup of matchups) {
    const settings = matchup.league.settings;
    if (!settings) continue;

    const scoreFor = (teamId: string) =>
      roundPoints(
        snapshots
          .filter((slot) => slot.teamId === teamId && isStartingSlot(slot.slot))
          .reduce((sum, slot) => {
            const stats = statsByPlayerId.get(slot.externalPlayerId);
            return stats ? sum + computeScore(stats, settings) : sum;
          }, 0),
      );

    const homeScore = scoreFor(matchup.homeTeam.id);
    const awayScore = scoreFor(matchup.awayTeam.id);

    await prisma.matchup.update({
      where: { id: matchup.id },
      data: {
        homeScore: new Prisma.Decimal(homeScore),
        awayScore: new Prisma.Decimal(awayScore),
      },
    });

    updates.push({
      matchupId: matchup.id,
      leagueId: matchup.leagueId,
      season,
      week,
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      homeScore,
      awayScore,
    });
  }

  const affectedTeamIds = [
    ...new Set(updates.flatMap((update) => [update.homeTeamId, update.awayTeamId])),
  ];
  await recomputeTeamTotals(season, affectedTeamIds);

  if (publish && updates.length > 0) {
    await publishMatchupScores(season, week, updates);
  }

  return updates;
}

/** Season points for / against, summed from matchup scores (idempotent). */
export async function recomputeTeamTotals(
  season: number,
  teamIds: string[],
): Promise<void> {
  for (const teamId of teamIds) {
    const matchups = await prisma.matchup.findMany({
      where: {
        season,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      select: {
        homeTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });

    let pointsFor = 0;
    let pointsAgainst = 0;
    for (const matchup of matchups) {
      const isHome = matchup.homeTeamId === teamId;
      pointsFor += Number(isHome ? matchup.homeScore ?? 0 : matchup.awayScore ?? 0);
      pointsAgainst += Number(isHome ? matchup.awayScore ?? 0 : matchup.homeScore ?? 0);
    }

    await prisma.team.update({
      where: { id: teamId },
      data: {
        pointsFor: new Prisma.Decimal(roundPoints(pointsFor)),
        pointsAgainst: new Prisma.Decimal(roundPoints(pointsAgainst)),
      },
    });
  }
}
