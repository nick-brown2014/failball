// Mock data for development and demo purposes
// This provides realistic data to populate the dashboard UI

export interface MockUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  createdAt: string;
}

export interface MockLeague {
  id: string;
  name: string;
  season: number;
  maxTeams: number;
  isActive: boolean;
}

export interface MockTeam {
  id: string;
  name: string;
  userId: string;
  leagueId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface MockMembership {
  id: string;
  userId: string;
  leagueId: string;
  role: "COMMISSIONER" | "MEMBER";
  league: {
    id: string;
    name: string;
    season: number;
  };
}

export interface MockUserData {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  memberships: Array<{
    id: string;
    role: string;
    league: {
      id: string;
      name: string;
      season: number;
    };
  }>;
  teams: Array<{
    id: string;
    name: string;
    league: {
      id: string;
      name: string;
    };
  }>;
}

// 12 mock users to fill a league
// Note: user_1 is Nick Brown (the app owner) who can log in with nick.brown2014@gmail.com
export const mockUsers: MockUser[] = [
  {
    id: "user_1",
    email: "nick.brown2014@gmail.com",
    name: "Nick Brown",
    image: null,
    createdAt: "2024-08-15T10:30:00Z",
  },
  {
    id: "user_2",
    email: "sarah.williams@email.com",
    name: "Sarah Williams",
    image: null,
    createdAt: "2024-08-16T14:22:00Z",
  },
  {
    id: "user_3",
    email: "david.chen@email.com",
    name: "David Chen",
    image: null,
    createdAt: "2024-08-17T09:15:00Z",
  },
  {
    id: "user_4",
    email: "emily.rodriguez@email.com",
    name: "Emily Rodriguez",
    image: null,
    createdAt: "2024-08-18T16:45:00Z",
  },
  {
    id: "user_5",
    email: "james.thompson@email.com",
    name: "James Thompson",
    image: null,
    createdAt: "2024-08-19T11:00:00Z",
  },
  {
    id: "user_6",
    email: "lisa.martinez@email.com",
    name: "Lisa Martinez",
    image: null,
    createdAt: "2024-08-20T08:30:00Z",
  },
  {
    id: "user_7",
    email: "robert.anderson@email.com",
    name: "Robert Anderson",
    image: null,
    createdAt: "2024-08-21T13:20:00Z",
  },
  {
    id: "user_8",
    email: "jennifer.taylor@email.com",
    name: "Jennifer Taylor",
    image: null,
    createdAt: "2024-08-22T15:10:00Z",
  },
  {
    id: "user_9",
    email: "michael.brown@email.com",
    name: "Michael Brown",
    image: null,
    createdAt: "2024-08-23T10:45:00Z",
  },
  {
    id: "user_10",
    email: "amanda.davis@email.com",
    name: "Amanda Davis",
    image: null,
    createdAt: "2024-08-24T12:00:00Z",
  },
  {
    id: "user_11",
    email: "chris.wilson@email.com",
    name: "Chris Wilson",
    image: null,
    createdAt: "2024-08-25T09:30:00Z",
  },
  {
    id: "user_12",
    email: "stephanie.moore@email.com",
    name: "Stephanie Moore",
    image: null,
    createdAt: "2024-08-26T14:15:00Z",
  },
];

// The league that all users belong to
export const mockLeague: MockLeague = {
  id: "league_1",
  name: "Fumble Factory League",
  season: 2024,
  maxTeams: 12,
  isActive: true,
};

// Team names with a "Failball" theme - celebrating failure
export const mockTeams: MockTeam[] = [
  {
    id: "team_1",
    name: "Brown's Blunders",
    userId: "user_1",
    leagueId: "league_1",
    wins: 8,
    losses: 4,
    ties: 0,
    pointsFor: 1245.5,
    pointsAgainst: 1102.3,
  },
  {
    id: "team_2",
    name: "Fumble Bumblers",
    userId: "user_2",
    leagueId: "league_1",
    wins: 7,
    losses: 5,
    ties: 0,
    pointsFor: 1189.2,
    pointsAgainst: 1156.8,
  },
  {
    id: "team_3",
    name: "Sack Attack Victims",
    userId: "user_3",
    leagueId: "league_1",
    wins: 7,
    losses: 5,
    ties: 0,
    pointsFor: 1178.4,
    pointsAgainst: 1134.1,
  },
  {
    id: "team_4",
    name: "The Drop Squad",
    userId: "user_4",
    leagueId: "league_1",
    wins: 6,
    losses: 6,
    ties: 0,
    pointsFor: 1156.7,
    pointsAgainst: 1162.4,
  },
  {
    id: "team_5",
    name: "Missed Field Goal FC",
    userId: "user_5",
    leagueId: "league_1",
    wins: 6,
    losses: 6,
    ties: 0,
    pointsFor: 1143.9,
    pointsAgainst: 1148.2,
  },
  {
    id: "team_6",
    name: "Penalty Flag Wavers",
    userId: "user_6",
    leagueId: "league_1",
    wins: 6,
    losses: 6,
    ties: 0,
    pointsFor: 1138.6,
    pointsAgainst: 1141.0,
  },
  {
    id: "team_7",
    name: "The Incompletions",
    userId: "user_7",
    leagueId: "league_1",
    wins: 5,
    losses: 7,
    ties: 0,
    pointsFor: 1121.3,
    pointsAgainst: 1167.5,
  },
  {
    id: "team_8",
    name: "Blown Coverage Crew",
    userId: "user_8",
    leagueId: "league_1",
    wins: 5,
    losses: 7,
    ties: 0,
    pointsFor: 1098.4,
    pointsAgainst: 1145.9,
  },
  {
    id: "team_9",
    name: "False Start Fanatics",
    userId: "user_9",
    leagueId: "league_1",
    wins: 5,
    losses: 7,
    ties: 0,
    pointsFor: 1087.2,
    pointsAgainst: 1123.6,
  },
  {
    id: "team_10",
    name: "The Turnover Machine",
    userId: "user_10",
    leagueId: "league_1",
    wins: 4,
    losses: 8,
    ties: 0,
    pointsFor: 1056.8,
    pointsAgainst: 1189.4,
  },
  {
    id: "team_11",
    name: "Offsides All Day",
    userId: "user_11",
    leagueId: "league_1",
    wins: 4,
    losses: 8,
    ties: 0,
    pointsFor: 1034.5,
    pointsAgainst: 1201.7,
  },
  {
    id: "team_12",
    name: "The Busted Plays",
    userId: "user_12",
    leagueId: "league_1",
    wins: 3,
    losses: 9,
    ties: 0,
    pointsFor: 998.3,
    pointsAgainst: 1245.8,
  },
];

// Memberships linking users to the league
export const mockMemberships: MockMembership[] = mockUsers.map((user, index) => ({
  id: `membership_${index + 1}`,
  userId: user.id,
  leagueId: mockLeague.id,
  role: index === 0 ? "COMMISSIONER" : "MEMBER",
  league: {
    id: mockLeague.id,
    name: mockLeague.name,
    season: mockLeague.season,
  },
}));

// Helper function to get mock user data in the format expected by the dashboard
export function getMockUserData(userId: string = "user_1"): MockUserData {
  const user = mockUsers.find((u) => u.id === userId) || mockUsers[0];
  const userMemberships = mockMemberships.filter((m) => m.userId === user.id);
  const userTeams = mockTeams.filter((t) => t.userId === user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
    memberships: userMemberships.map((m) => ({
      id: m.id,
      role: m.role,
      league: m.league,
    })),
    teams: userTeams.map((t) => ({
      id: t.id,
      name: t.name,
      league: {
        id: mockLeague.id,
        name: mockLeague.name,
      },
    })),
  };
}

// Get all teams sorted by standings (wins desc, then points for desc)
export function getLeagueStandings(): MockTeam[] {
  return [...mockTeams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
}

// Get a specific team by ID
export function getTeamById(teamId: string): MockTeam | undefined {
  return mockTeams.find((t) => t.id === teamId);
}

// Get a specific user by ID
export function getUserById(userId: string): MockUser | undefined {
  return mockUsers.find((u) => u.id === userId);
}

// Get team owner name
export function getTeamOwnerName(teamId: string): string {
  const team = getTeamById(teamId);
  if (!team) return "Unknown";
  const user = getUserById(team.userId);
  return user?.name || "Unknown";
}

// Mock matchup data for the season
export interface MockMatchup {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isComplete: boolean;
}

// Generate matchups for a 12-team league (each team plays each other once = 11 weeks)
// We'll generate 12 weeks of matchups (6 games per week)
export const mockMatchups: MockMatchup[] = [
  // Week 1
  { id: "matchup_1_1", week: 1, homeTeamId: "team_1", awayTeamId: "team_12", homeScore: 112.5, awayScore: 89.3, isComplete: true },
  { id: "matchup_1_2", week: 1, homeTeamId: "team_2", awayTeamId: "team_11", homeScore: 98.7, awayScore: 102.4, isComplete: true },
  { id: "matchup_1_3", week: 1, homeTeamId: "team_3", awayTeamId: "team_10", homeScore: 105.2, awayScore: 95.8, isComplete: true },
  { id: "matchup_1_4", week: 1, homeTeamId: "team_4", awayTeamId: "team_9", homeScore: 88.9, awayScore: 91.2, isComplete: true },
  { id: "matchup_1_5", week: 1, homeTeamId: "team_5", awayTeamId: "team_8", homeScore: 110.3, awayScore: 87.6, isComplete: true },
  { id: "matchup_1_6", week: 1, homeTeamId: "team_6", awayTeamId: "team_7", homeScore: 94.1, awayScore: 99.8, isComplete: true },
  // Week 2
  { id: "matchup_2_1", week: 2, homeTeamId: "team_1", awayTeamId: "team_2", homeScore: 108.4, awayScore: 101.2, isComplete: true },
  { id: "matchup_2_2", week: 2, homeTeamId: "team_3", awayTeamId: "team_12", homeScore: 115.6, awayScore: 78.9, isComplete: true },
  { id: "matchup_2_3", week: 2, homeTeamId: "team_4", awayTeamId: "team_11", homeScore: 92.3, awayScore: 88.7, isComplete: true },
  { id: "matchup_2_4", week: 2, homeTeamId: "team_5", awayTeamId: "team_10", homeScore: 99.8, awayScore: 103.2, isComplete: true },
  { id: "matchup_2_5", week: 2, homeTeamId: "team_6", awayTeamId: "team_9", homeScore: 107.5, awayScore: 95.4, isComplete: true },
  { id: "matchup_2_6", week: 2, homeTeamId: "team_7", awayTeamId: "team_8", homeScore: 89.2, awayScore: 94.6, isComplete: true },
  // Week 3
  { id: "matchup_3_1", week: 3, homeTeamId: "team_1", awayTeamId: "team_3", homeScore: 118.7, awayScore: 105.3, isComplete: true },
  { id: "matchup_3_2", week: 3, homeTeamId: "team_2", awayTeamId: "team_4", homeScore: 111.2, awayScore: 98.6, isComplete: true },
  { id: "matchup_3_3", week: 3, homeTeamId: "team_5", awayTeamId: "team_12", homeScore: 95.4, awayScore: 82.1, isComplete: true },
  { id: "matchup_3_4", week: 3, homeTeamId: "team_6", awayTeamId: "team_11", homeScore: 88.9, awayScore: 91.7, isComplete: true },
  { id: "matchup_3_5", week: 3, homeTeamId: "team_7", awayTeamId: "team_10", homeScore: 102.3, awayScore: 97.8, isComplete: true },
  { id: "matchup_3_6", week: 3, homeTeamId: "team_8", awayTeamId: "team_9", homeScore: 86.5, awayScore: 92.4, isComplete: true },
  // Week 4
  { id: "matchup_4_1", week: 4, homeTeamId: "team_1", awayTeamId: "team_4", homeScore: 105.8, awayScore: 112.3, isComplete: true },
  { id: "matchup_4_2", week: 4, homeTeamId: "team_2", awayTeamId: "team_5", homeScore: 98.4, awayScore: 95.7, isComplete: true },
  { id: "matchup_4_3", week: 4, homeTeamId: "team_3", awayTeamId: "team_6", homeScore: 109.2, awayScore: 101.8, isComplete: true },
  { id: "matchup_4_4", week: 4, homeTeamId: "team_7", awayTeamId: "team_12", homeScore: 94.6, awayScore: 87.2, isComplete: true },
  { id: "matchup_4_5", week: 4, homeTeamId: "team_8", awayTeamId: "team_11", homeScore: 91.3, awayScore: 89.5, isComplete: true },
  { id: "matchup_4_6", week: 4, homeTeamId: "team_9", awayTeamId: "team_10", homeScore: 88.7, awayScore: 96.4, isComplete: true },
  // Week 5
  { id: "matchup_5_1", week: 5, homeTeamId: "team_1", awayTeamId: "team_5", homeScore: 115.2, awayScore: 98.6, isComplete: true },
  { id: "matchup_5_2", week: 5, homeTeamId: "team_2", awayTeamId: "team_6", homeScore: 103.8, awayScore: 99.4, isComplete: true },
  { id: "matchup_5_3", week: 5, homeTeamId: "team_3", awayTeamId: "team_7", homeScore: 97.5, awayScore: 102.1, isComplete: true },
  { id: "matchup_5_4", week: 5, homeTeamId: "team_4", awayTeamId: "team_8", homeScore: 108.9, awayScore: 95.3, isComplete: true },
  { id: "matchup_5_5", week: 5, homeTeamId: "team_9", awayTeamId: "team_12", homeScore: 91.2, awayScore: 84.7, isComplete: true },
  { id: "matchup_5_6", week: 5, homeTeamId: "team_10", awayTeamId: "team_11", homeScore: 87.6, awayScore: 93.8, isComplete: true },
  // Week 6
  { id: "matchup_6_1", week: 6, homeTeamId: "team_1", awayTeamId: "team_6", homeScore: 99.4, awayScore: 104.7, isComplete: true },
  { id: "matchup_6_2", week: 6, homeTeamId: "team_2", awayTeamId: "team_7", homeScore: 112.6, awayScore: 89.3, isComplete: true },
  { id: "matchup_6_3", week: 6, homeTeamId: "team_3", awayTeamId: "team_8", homeScore: 106.8, awayScore: 98.2, isComplete: true },
  { id: "matchup_6_4", week: 6, homeTeamId: "team_4", awayTeamId: "team_10", homeScore: 95.7, awayScore: 91.4, isComplete: true },
  { id: "matchup_6_5", week: 6, homeTeamId: "team_5", awayTeamId: "team_11", homeScore: 88.3, awayScore: 94.6, isComplete: true },
  { id: "matchup_6_6", week: 6, homeTeamId: "team_6", awayTeamId: "team_12", homeScore: 101.2, awayScore: 79.8, isComplete: true },
  // Week 7
  { id: "matchup_7_1", week: 7, homeTeamId: "team_1", awayTeamId: "team_7", homeScore: 107.3, awayScore: 95.8, isComplete: true },
  { id: "matchup_7_2", week: 7, homeTeamId: "team_2", awayTeamId: "team_8", homeScore: 94.5, awayScore: 99.7, isComplete: true },
  { id: "matchup_7_3", week: 7, homeTeamId: "team_3", awayTeamId: "team_9", homeScore: 102.4, awayScore: 88.6, isComplete: true },
  { id: "matchup_7_4", week: 7, homeTeamId: "team_4", awayTeamId: "team_12", homeScore: 110.8, awayScore: 76.3, isComplete: true },
  { id: "matchup_7_5", week: 7, homeTeamId: "team_5", awayTeamId: "team_6", homeScore: 96.2, awayScore: 93.5, isComplete: true },
  { id: "matchup_7_6", week: 7, homeTeamId: "team_10", awayTeamId: "team_11", homeScore: 85.4, awayScore: 82.1, isComplete: true },
  // Week 8
  { id: "matchup_8_1", week: 8, homeTeamId: "team_1", awayTeamId: "team_8", homeScore: 113.6, awayScore: 97.2, isComplete: true },
  { id: "matchup_8_2", week: 8, homeTeamId: "team_2", awayTeamId: "team_9", homeScore: 105.3, awayScore: 91.8, isComplete: true },
  { id: "matchup_8_3", week: 8, homeTeamId: "team_3", awayTeamId: "team_11", homeScore: 98.7, awayScore: 102.4, isComplete: true },
  { id: "matchup_8_4", week: 8, homeTeamId: "team_4", awayTeamId: "team_6", homeScore: 89.4, awayScore: 95.6, isComplete: true },
  { id: "matchup_8_5", week: 8, homeTeamId: "team_5", awayTeamId: "team_7", homeScore: 104.2, awayScore: 99.8, isComplete: true },
  { id: "matchup_8_6", week: 8, homeTeamId: "team_10", awayTeamId: "team_12", homeScore: 92.5, awayScore: 88.3, isComplete: true },
  // Week 9
  { id: "matchup_9_1", week: 9, homeTeamId: "team_1", awayTeamId: "team_9", homeScore: 98.7, awayScore: 103.4, isComplete: true },
  { id: "matchup_9_2", week: 9, homeTeamId: "team_2", awayTeamId: "team_10", homeScore: 109.2, awayScore: 87.6, isComplete: true },
  { id: "matchup_9_3", week: 9, homeTeamId: "team_3", awayTeamId: "team_4", homeScore: 95.8, awayScore: 101.3, isComplete: true },
  { id: "matchup_9_4", week: 9, homeTeamId: "team_5", awayTeamId: "team_9", homeScore: 107.4, awayScore: 94.2, isComplete: true },
  { id: "matchup_9_5", week: 9, homeTeamId: "team_6", awayTeamId: "team_8", homeScore: 93.6, awayScore: 89.1, isComplete: true },
  { id: "matchup_9_6", week: 9, homeTeamId: "team_7", awayTeamId: "team_11", homeScore: 96.3, awayScore: 91.7, isComplete: true },
  // Week 10
  { id: "matchup_10_1", week: 10, homeTeamId: "team_1", awayTeamId: "team_10", homeScore: 116.4, awayScore: 92.8, isComplete: true },
  { id: "matchup_10_2", week: 10, homeTeamId: "team_2", awayTeamId: "team_3", homeScore: 97.5, awayScore: 104.6, isComplete: true },
  { id: "matchup_10_3", week: 10, homeTeamId: "team_4", awayTeamId: "team_5", homeScore: 102.8, awayScore: 98.3, isComplete: true },
  { id: "matchup_10_4", week: 10, homeTeamId: "team_6", awayTeamId: "team_10", homeScore: 91.2, awayScore: 88.5, isComplete: true },
  { id: "matchup_10_5", week: 10, homeTeamId: "team_7", awayTeamId: "team_9", homeScore: 85.7, awayScore: 97.4, isComplete: true },
  { id: "matchup_10_6", week: 10, homeTeamId: "team_8", awayTeamId: "team_12", homeScore: 103.2, awayScore: 81.6, isComplete: true },
  // Week 11
  { id: "matchup_11_1", week: 11, homeTeamId: "team_1", awayTeamId: "team_11", homeScore: 109.8, awayScore: 94.3, isComplete: true },
  { id: "matchup_11_2", week: 11, homeTeamId: "team_2", awayTeamId: "team_12", homeScore: 118.4, awayScore: 82.7, isComplete: true },
  { id: "matchup_11_3", week: 11, homeTeamId: "team_3", awayTeamId: "team_5", homeScore: 101.6, awayScore: 95.2, isComplete: true },
  { id: "matchup_11_4", week: 11, homeTeamId: "team_4", awayTeamId: "team_7", homeScore: 96.4, awayScore: 93.8, isComplete: true },
  { id: "matchup_11_5", week: 11, homeTeamId: "team_6", awayTeamId: "team_11", homeScore: 88.9, awayScore: 85.2, isComplete: true },
  { id: "matchup_11_6", week: 11, homeTeamId: "team_8", awayTeamId: "team_10", homeScore: 97.6, awayScore: 102.9, isComplete: true },
  // Week 12 (current week - some games not complete)
  { id: "matchup_12_1", week: 12, homeTeamId: "team_1", awayTeamId: "team_6", homeScore: 95.2, awayScore: 87.4, isComplete: true },
  { id: "matchup_12_2", week: 12, homeTeamId: "team_2", awayTeamId: "team_5", homeScore: 0, awayScore: 0, isComplete: false },
  { id: "matchup_12_3", week: 12, homeTeamId: "team_3", awayTeamId: "team_4", homeScore: 0, awayScore: 0, isComplete: false },
  { id: "matchup_12_4", week: 12, homeTeamId: "team_7", awayTeamId: "team_12", homeScore: 0, awayScore: 0, isComplete: false },
  { id: "matchup_12_5", week: 12, homeTeamId: "team_8", awayTeamId: "team_11", homeScore: 0, awayScore: 0, isComplete: false },
  { id: "matchup_12_6", week: 12, homeTeamId: "team_9", awayTeamId: "team_10", homeScore: 0, awayScore: 0, isComplete: false },
];

// Get matchups for a specific week
export function getMatchupsByWeek(week: number): MockMatchup[] {
  return mockMatchups.filter((m) => m.week === week);
}

// Get all matchups for a specific team
export function getTeamMatchups(teamId: string): MockMatchup[] {
  return mockMatchups.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
  );
}

// Get head-to-head record between two teams
export function getHeadToHeadRecord(
  teamId: string,
  opponentId: string
): { wins: number; losses: number; ties: number } {
  const matchups = mockMatchups.filter(
    (m) =>
      m.isComplete &&
      ((m.homeTeamId === teamId && m.awayTeamId === opponentId) ||
        (m.homeTeamId === opponentId && m.awayTeamId === teamId))
  );

  let wins = 0;
  let losses = 0;
  let ties = 0;

  matchups.forEach((m) => {
    const isHome = m.homeTeamId === teamId;
    const teamScore = isHome ? m.homeScore : m.awayScore;
    const opponentScore = isHome ? m.awayScore : m.homeScore;

    if (teamScore > opponentScore) wins++;
    else if (teamScore < opponentScore) losses++;
    else ties++;
  });

  return { wins, losses, ties };
}

// Get current week number
export function getCurrentWeek(): number {
  return 12;
}

// Get league details with all teams and their records
export function getLeagueDetails() {
  return {
    ...mockLeague,
    teams: getLeagueStandings(),
    currentWeek: getCurrentWeek(),
    totalWeeks: 12,
  };
}
