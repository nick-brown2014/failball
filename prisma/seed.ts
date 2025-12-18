import { PrismaClient, MemberRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mock data - same as src/lib/mockData.ts but with password for seeding
const mockUsers = [
  {
    id: "user_1",
    email: "nick.brown2014@gmail.com",
    name: "Nick Brown",
    password: "Test1234!",
  },
  {
    id: "user_2",
    email: "sarah.williams@email.com",
    name: "Sarah Williams",
    password: "password123",
  },
  {
    id: "user_3",
    email: "david.chen@email.com",
    name: "David Chen",
    password: "password123",
  },
  {
    id: "user_4",
    email: "emily.rodriguez@email.com",
    name: "Emily Rodriguez",
    password: "password123",
  },
  {
    id: "user_5",
    email: "james.thompson@email.com",
    name: "James Thompson",
    password: "password123",
  },
  {
    id: "user_6",
    email: "lisa.martinez@email.com",
    name: "Lisa Martinez",
    password: "password123",
  },
  {
    id: "user_7",
    email: "robert.anderson@email.com",
    name: "Robert Anderson",
    password: "password123",
  },
  {
    id: "user_8",
    email: "jennifer.taylor@email.com",
    name: "Jennifer Taylor",
    password: "password123",
  },
  {
    id: "user_9",
    email: "michael.brown@email.com",
    name: "Michael Brown",
    password: "password123",
  },
  {
    id: "user_10",
    email: "amanda.davis@email.com",
    name: "Amanda Davis",
    password: "password123",
  },
  {
    id: "user_11",
    email: "chris.wilson@email.com",
    name: "Chris Wilson",
    password: "password123",
  },
  {
    id: "user_12",
    email: "stephanie.moore@email.com",
    name: "Stephanie Moore",
    password: "password123",
  },
];

const mockLeague = {
  id: "league_1",
  name: "Fumble Factory League",
  season: 2024,
  maxTeams: 12,
  isActive: true,
  isPublic: false,
};

const mockTeams = [
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

async function main() {
  console.log("Starting database seed...");

  // Clear existing data (in reverse order of dependencies)
  console.log("Clearing existing data...");
  await prisma.team.deleteMany({});
  await prisma.leagueMembership.deleteMany({});
  await prisma.leagueSettings.deleteMany({});
  await prisma.league.deleteMany({});
  await prisma.user.deleteMany({});

  // Create users with hashed passwords
  console.log("Creating users...");
  for (const userData of mockUsers) {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    await prisma.user.create({
      data: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        password: hashedPassword,
      },
    });
    console.log(`  Created user: ${userData.name} (${userData.email})`);
  }

  // Create the league (created by user_1 - Nick Brown)
  console.log("Creating league...");
  await prisma.league.create({
    data: {
      id: mockLeague.id,
      name: mockLeague.name,
      season: mockLeague.season,
      maxTeams: mockLeague.maxTeams,
      isActive: mockLeague.isActive,
      isPublic: mockLeague.isPublic,
      createdById: "user_1",
    },
  });
  console.log(`  Created league: ${mockLeague.name}`);

  // Create league settings with default Failball scoring
  console.log("Creating league settings...");
  await prisma.leagueSettings.create({
    data: {
      leagueId: mockLeague.id,
    },
  });
  console.log("  Created default league settings");

  // Create league memberships (user_1 is commissioner, others are members)
  console.log("Creating league memberships...");
  for (let i = 0; i < mockUsers.length; i++) {
    const user = mockUsers[i];
    await prisma.leagueMembership.create({
      data: {
        userId: user.id,
        leagueId: mockLeague.id,
        role: i === 0 ? MemberRole.COMMISSIONER : MemberRole.MEMBER,
      },
    });
    console.log(`  Added ${user.name} to league as ${i === 0 ? "COMMISSIONER" : "MEMBER"}`);
  }

  // Create teams
  console.log("Creating teams...");
  for (const teamData of mockTeams) {
    await prisma.team.create({
      data: {
        id: teamData.id,
        name: teamData.name,
        userId: teamData.userId,
        leagueId: teamData.leagueId,
        wins: teamData.wins,
        losses: teamData.losses,
        ties: teamData.ties,
        pointsFor: teamData.pointsFor,
        pointsAgainst: teamData.pointsAgainst,
      },
    });
    const owner = mockUsers.find((u) => u.id === teamData.userId);
    console.log(`  Created team: ${teamData.name} (Owner: ${owner?.name})`);
  }

  console.log("\nSeed completed successfully!");
  console.log("\nYou can now log in with:");
  console.log("  Email: nick.brown2014@gmail.com");
  console.log("  Password: Test1234!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
