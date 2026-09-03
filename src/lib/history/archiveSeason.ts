import { Prisma, type PlayoffResult } from "@prisma/client";
import prisma from "@/lib/prisma";
import { derivePlayoffResults } from "@/lib/history/seasonRecords";
import {
  getPlayoffBracket,
  type PlayoffBracket,
} from "@/lib/schedule/playoffs";
import {
  sortStandings,
  type StandingsMatchup,
} from "@/lib/schedule/standings";

export interface SeasonRecordRow {
  teamId: string;
  leagueId: string;
  season: number;
  finalRank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult: PlayoffResult;
}

export interface SeasonArchiveTeam {
  id: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: Prisma.Decimal | number;
  pointsAgainst: Prisma.Decimal | number;
}

export async function buildSeasonRecordRows(options: {
  leagueId: string;
  season: number;
  teams: SeasonArchiveTeam[];
  bracket?: PlayoffBracket | null;
}): Promise<SeasonRecordRow[]> {
  const bracket =
    options.bracket ??
    (await getPlayoffBracket({
      leagueId: options.leagueId,
      season: options.season,
    }));
  const matchups = await prisma.matchup.findMany({
    where: { leagueId: options.leagueId, season: options.season },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
  });
  const standingsMatchups: StandingsMatchup[] = matchups.map((matchup) => ({
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
    awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
    isComplete: matchup.isComplete,
  }));
  const standings = sortStandings(
    options.teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: Number(team.pointsFor),
      pointsAgainst: Number(team.pointsAgainst),
    })),
    standingsMatchups,
  );
  const playoffResults = derivePlayoffResults({
    teamIds: options.teams.map((team) => team.id),
    bracket,
  });

  return standings.map((team, index) => ({
    teamId: team.teamId,
    leagueId: options.leagueId,
    season: options.season,
    finalRank: index + 1,
    wins: team.wins,
    losses: team.losses,
    ties: team.ties,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    playoffResult: playoffResults.get(team.teamId)!,
  }));
}

export async function upsertSeasonRecords(
  tx: Prisma.TransactionClient,
  rows: SeasonRecordRow[],
): Promise<void> {
  for (const row of rows) {
    const { teamId, season, leagueId, ...record } = row;
    await tx.seasonRecord.upsert({
      where: { teamId_season: { teamId, season } },
      create: { teamId, season, leagueId, ...record },
      update: { leagueId, ...record },
    });
  }
}
