/**
 * League history.
 *
 * `GET /api/leagues/[id]/history` returns archived season results
 * (`SeasonRecord`), all-time team records aggregated from them, all-time
 * head-to-head records derived from completed `Matchup` rows, and a per-season
 * transaction summary built from the same `Transaction` rows the activity feed
 * reads.
 */

import { NextResponse } from "next/server";
import { TransactionStatus, TransactionType, type PlayoffResult } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  aggregateAllTimeRecords,
  computeHeadToHead,
  type AllTimeTeamRecord,
  type HeadToHeadRecord,
} from "@/lib/history/seasonRecords";
import { VETO_VOTE_PLAYER_ID } from "@/lib/trades/logic";

export interface HistoryTeamRef {
  id: string;
  name: string;
  owner: { id: string; name: string | null; email: string };
}

export interface HistorySeasonRecord {
  teamId: string;
  finalRank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult: PlayoffResult;
}

export interface HistorySeason {
  season: number;
  records: HistorySeasonRecord[];
  transactionCounts: Record<string, number>;
  transactionTotal: number;
}

export interface LeagueHistoryPayload {
  leagueName: string;
  currentSeason: number;
  teams: HistoryTeamRef[];
  seasons: HistorySeason[];
  allTime: AllTimeTeamRecord[];
  headToHead: HeadToHeadRecord[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view league history", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        name: true,
        season: true,
        teams: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const [seasonRecords, matchups, transactions] = await Promise.all([
      prisma.seasonRecord.findMany({
        where: { leagueId: id },
        orderBy: [{ season: "desc" }, { finalRank: "asc" }],
        select: {
          teamId: true,
          season: true,
          finalRank: true,
          wins: true,
          losses: true,
          ties: true,
          pointsFor: true,
          pointsAgainst: true,
          playoffResult: true,
        },
      }),
      prisma.matchup.findMany({
        where: { leagueId: id, isComplete: true },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          isComplete: true,
        },
      }),
      prisma.transaction.groupBy({
        by: ["season", "type"],
        where: {
          leagueId: id,
          status: TransactionStatus.COMPLETED,
          NOT: { action: "VETO_VOTE", externalPlayerId: VETO_VOTE_PLAYER_ID },
        },
        _count: { _all: true },
      }),
    ]);

    const records = seasonRecords.map((record) => ({
      ...record,
      pointsFor: Number(record.pointsFor),
      pointsAgainst: Number(record.pointsAgainst),
    }));

    const countsBySeason = new Map<number, Record<string, number>>();
    for (const group of transactions) {
      const counts = countsBySeason.get(group.season) ?? {};
      counts[group.type] = (counts[group.type] ?? 0) + group._count._all;
      countsBySeason.set(group.season, counts);
    }

    const seasonNumbers = [
      ...new Set([...records.map((record) => record.season), ...countsBySeason.keys()]),
    ].sort((a, b) => b - a);

    const seasons: HistorySeason[] = seasonNumbers.map((season) => {
      const counts = countsBySeason.get(season) ?? {};
      const transactionCounts = Object.fromEntries(
        Object.values(TransactionType)
          .filter((type) => counts[type])
          .map((type) => [type, counts[type]]),
      );
      return {
        season,
        records: records
          .filter((record) => record.season === season)
          .map(({ season: _season, ...rest }) => rest),
        transactionCounts,
        transactionTotal: Object.values(transactionCounts).reduce(
          (total, count) => total + count,
          0,
        ),
      };
    });

    const payload: LeagueHistoryPayload = {
      leagueName: league.name,
      currentSeason: league.season,
      teams: league.teams.map((team) => ({
        id: team.id,
        name: team.name,
        owner: team.user,
      })),
      seasons,
      allTime: aggregateAllTimeRecords(records),
      headToHead: computeHeadToHead(
        matchups.map((matchup) => ({
          homeTeamId: matchup.homeTeamId,
          awayTeamId: matchup.awayTeamId,
          homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
          awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
          isComplete: matchup.isComplete,
        })),
      ),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Get league history error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching league history", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
