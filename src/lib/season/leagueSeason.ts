import { PlayoffRound } from "@prisma/client";
import prisma from "@/lib/prisma";

export async function getFinalPlayoffGameAt(
  leagueId: string,
  season: number,
): Promise<Date | null> {
  const where = { leagueId, season, playoffRound: PlayoffRound.CHAMPIONSHIP };
  const [matchup, incomplete] = await Promise.all([
    prisma.matchup.findFirst({
      where: { ...where, isComplete: true },
      orderBy: { week: "desc" },
    }),
    prisma.matchup.count({ where: { ...where, isComplete: false } }),
  ]);

  if (!matchup || incomplete > 0) {
    return null;
  }

  const game = await prisma.game.findFirst({
    where: { season, week: matchup.week },
    orderBy: { kickoff: "desc" },
    select: { kickoff: true },
  });

  return game?.kickoff ?? matchup.updatedAt;
}
