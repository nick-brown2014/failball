import { Prisma, PrismaClient } from "@prisma/client";

type ScheduleDb = PrismaClient | Prisma.TransactionClient;

export async function currentWeek(
  db: ScheduleDb,
  leagueId: string,
  season: number,
): Promise<number> {
  const incomplete = await db.matchup.findFirst({
    where: { leagueId, season, isComplete: false },
    orderBy: { week: "asc" },
    select: { week: true },
  });
  if (incomplete) return incomplete.week;

  const latest = await db.matchup.aggregate({
    where: { leagueId, season },
    _max: { week: true },
  });
  return latest._max.week ?? 1;
}
