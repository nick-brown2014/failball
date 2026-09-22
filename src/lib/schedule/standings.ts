/**
 * Pure standings math: win/loss/tie records derived from completed matchups and
 * the ordering (with tiebreakers) used by the league standings table.
 */

export interface StandingsMatchup {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
}

export interface TeamRecord {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface StandingsTeam extends TeamRecord {
  name: string;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Recompute records from scratch for every team, counting only complete
 * matchups. Never increments, so it is safe to run repeatedly.
 */
export function computeTeamRecords(
  teamIds: string[],
  matchups: StandingsMatchup[],
): TeamRecord[] {
  const records = new Map<string, TeamRecord>(
    teamIds.map((teamId) => [teamId, { teamId, wins: 0, losses: 0, ties: 0 }]),
  );

  for (const matchup of matchups) {
    if (!matchup.isComplete) continue;
    const home = records.get(matchup.homeTeamId);
    const away = records.get(matchup.awayTeamId);
    if (!home || !away) continue;

    const homeScore = matchup.homeScore ?? 0;
    const awayScore = matchup.awayScore ?? 0;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  return teamIds.map((teamId) => records.get(teamId)!);
}

export function winPercentage(record: TeamRecord): number {
  const games = record.wins + record.losses + record.ties;
  if (games === 0) return 0;
  return (record.wins + record.ties / 2) / games;
}

/**
 * Standings order: win percentage, then points for, then head-to-head record
 * among the tied teams, then team name for a stable result.
 */
export function sortStandings<T extends StandingsTeam>(
  teams: T[],
  matchups: StandingsMatchup[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const team of teams) {
    const key = `${winPercentage(team).toFixed(6)}|${team.pointsFor.toFixed(2)}`;
    const group = groups.get(key);
    if (group) group.push(team);
    else groups.set(key, [team]);
  }

  const headToHead = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const tiedIds = new Set(group.map((team) => team.teamId));
    for (const team of group) headToHead.set(team.teamId, 0);

    for (const matchup of matchups) {
      if (!matchup.isComplete) continue;
      if (!tiedIds.has(matchup.homeTeamId) || !tiedIds.has(matchup.awayTeamId)) {
        continue;
      }
      const homeScore = matchup.homeScore ?? 0;
      const awayScore = matchup.awayScore ?? 0;
      if (homeScore === awayScore) continue;
      const winner = homeScore > awayScore ? matchup.homeTeamId : matchup.awayTeamId;
      const loser = homeScore > awayScore ? matchup.awayTeamId : matchup.homeTeamId;
      headToHead.set(winner, (headToHead.get(winner) ?? 0) + 1);
      headToHead.set(loser, (headToHead.get(loser) ?? 0) - 1);
    }
  }

  return [...teams].sort((a, b) => {
    const pct = winPercentage(b) - winPercentage(a);
    if (Math.abs(pct) > 1e-9) return pct;

    const pointsFor = b.pointsFor - a.pointsFor;
    if (Math.abs(pointsFor) > 1e-9) return pointsFor;

    const h2h = (headToHead.get(b.teamId) ?? 0) - (headToHead.get(a.teamId) ?? 0);
    if (h2h !== 0) return h2h;

    return a.name.localeCompare(b.name);
  });
}

export interface DivisionStandingsTeam extends StandingsTeam {
  divisionId: string | null;
}

export interface DivisionGroup<T> {
  divisionId: string | null;
  teams: T[];
}

/**
 * Split an already-sorted standings list into per-division groups, preserving
 * order within each group. Groups follow `divisionOrder`; unassigned teams
 * (null division) come last. Divisions with no teams are omitted.
 */
export function groupStandingsByDivision<T extends DivisionStandingsTeam>(
  sortedTeams: T[],
  divisionOrder: string[],
): DivisionGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const id of divisionOrder) groups.set(id, []);
  for (const team of sortedTeams) {
    const key = team.divisionId ?? null;
    const group = groups.get(key);
    if (group) group.push(team);
    else groups.set(key, [team]);
  }
  const result: DivisionGroup<T>[] = [];
  for (const [divisionId, teams] of groups) {
    if (divisionId !== null && teams.length > 0) result.push({ divisionId, teams });
  }
  const unassigned = groups.get(null);
  if (unassigned && unassigned.length > 0) {
    result.push({ divisionId: null, teams: unassigned });
  }
  return result;
}

/** The top team of each non-null division in the sorted standings. */
export function divisionWinnerIds<T extends DivisionStandingsTeam>(
  sortedTeams: T[],
): Set<string> {
  const seen = new Set<string>();
  const winners = new Set<string>();
  for (const team of sortedTeams) {
    if (team.divisionId == null || seen.has(team.divisionId)) continue;
    seen.add(team.divisionId);
    winners.add(team.teamId);
  }
  return winners;
}

/**
 * Standings order for playoff seeding: division winners first (ordered among
 * themselves by the regular tiebreakers), then everyone else.
 */
export function sortStandingsWithDivisionWinners<T extends DivisionStandingsTeam>(
  teams: T[],
  matchups: StandingsMatchup[],
): T[] {
  const sorted = sortStandings(teams, matchups);
  const winners = divisionWinnerIds(sorted);
  return [
    ...sorted.filter((team) => winners.has(team.teamId)),
    ...sorted.filter((team) => !winners.has(team.teamId)),
  ];
}
