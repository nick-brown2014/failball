import { PlayoffRound } from "@prisma/client";
import prisma from "@/lib/prisma";

export async function getFinalPlayoffGameAt(
  leagueId: string,
  season: number,
): Promise<Date | null> {
  const matchup = await prisma.matchup.findFirst({
    where: {
      leagueId,
      season,
      playoffRound: PlayoffRound.CHAMPIONSHIP,
      isComplete: true,
    },
    orderBy: { week: "desc" },
  });

  if (!matchup) {
    return null;
  }

  const game = await prisma.game.findFirst({
    where: { season, week: matchup.week },
    orderBy: { kickoff: "desc" },
    select: { kickoff: true },
  });

  return game?.kickoff ?? matchup.updatedAt;
}
