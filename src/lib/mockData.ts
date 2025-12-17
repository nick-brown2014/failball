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
export const mockUsers: MockUser[] = [
  {
    id: "user_1",
    email: "mike.johnson@email.com",
    name: "Mike Johnson",
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
    name: "The Interception Kings",
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
