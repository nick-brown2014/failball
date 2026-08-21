import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { GameStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { getPlayerMap } from "@/lib/players";
import prisma from "@/lib/prisma";
import { syncTeamLineup } from "@/lib/lineup/service";
import {
  buildMatchupDetail,
  type MatchupDetailSnapshot,
} from "@/lib/matchup/detail";
import type { ScorableStats } from "@/lib/scoring/computeScore";

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; matchupId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return errorResponse(
        "You must be logged in to view this matchup",
        "UNAUTHORIZED",
        401,
      );
    }

    const { id, matchupId } = await params;
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return errorResponse("User not found", "USER_NOT_FOUND", 404);

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });
    if (!membership) {
      return errorResponse(
        "You are not a member of this league",
        "FORBIDDEN",
        403,
      );
    }

    const matchup = await prisma.matchup.findFirst({
      where: { id: matchupId, leagueId: id },
      select: {
        id: true,
        season: true,
        week: true,
        isComplete: true,
        isPlayoff: true,
        homeScore: true,
        awayScore: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        league: { select: { settings: true } },
      },
    });
    if (!matchup) {
      return errorResponse("Matchup not found in this league", "NOT_FOUND", 404);
    }

    await Promise.all([
      syncTeamLineup(matchup.homeTeamId, matchup.season, matchup.week),
      syncTeamLineup(matchup.awayTeamId, matchup.season, matchup.week),
    ]);

    const [lineups, games, playerMap] = await Promise.all([
      prisma.lineupSnapshot.findMany({
        where: {
          teamId: { in: [matchup.homeTeamId, matchup.awayTeamId] },
          season: matchup.season,
          week: matchup.week,
        },
      }),
      prisma.game.findMany({
        where: { season: matchup.season, week: matchup.week },
        select: { status: true },
      }),
      getPlayerMap(),
    ]);

    const externalPlayerIds = [...new Set(lineups.map((row) => row.externalPlayerId))];
    const statRows = externalPlayerIds.length === 0
      ? []
      : await prisma.playerWeekStats.findMany({
          where: {
            season: matchup.season,
            week: matchup.week,
            externalPlayerId: { in: externalPlayerIds },
          },
        });
    const statsByPlayerId = new Map<string, ScorableStats>(
      statRows.map((row) => [row.externalPlayerId, row as ScorableStats]),
    );
    const detail = buildMatchupDetail({
      matchup: {
        id: matchup.id,
        season: matchup.season,
        week: matchup.week,
        isComplete: matchup.isComplete,
        isPlayoff: matchup.isPlayoff,
        homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
        awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
        homeTeam: matchup.homeTeam,
        awayTeam: matchup.awayTeam,
      },
      homeLineup: lineups
        .filter((row) => row.teamId === matchup.homeTeamId)
        .map((row): MatchupDetailSnapshot => ({
          externalPlayerId: row.externalPlayerId,
          position: row.position,
          slot: row.slot,
        })),
      awayLineup: lineups
        .filter((row) => row.teamId === matchup.awayTeamId)
        .map((row): MatchupDetailSnapshot => ({
          externalPlayerId: row.externalPlayerId,
          position: row.position,
          slot: row.slot,
        })),
      statsByPlayerId,
      playerMap,
      settings: matchup.league.settings ?? {},
    });

    return NextResponse.json({
      ...detail,
      status: matchup.isComplete
        ? "complete"
        : games.some((game) => game.status !== GameStatus.SCHEDULED)
          ? "live"
          : "upcoming",
    });
  } catch (error) {
    console.error("Get matchup detail error:", error);
    return errorResponse(
      "An error occurred while fetching the matchup",
      "INTERNAL_ERROR",
      500,
    );
  }
}
