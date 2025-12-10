-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('COMMISSIONER', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."WaiverType" AS ENUM ('ROLLING', 'FAAB', 'RESET_WEEKLY');

-- CreateEnum
CREATE TYPE "public"."Position" AS ENUM ('QB', 'RB', 'WR', 'TE', 'ST', 'DEF', 'FLEX');

-- CreateEnum
CREATE TYPE "public"."SlotType" AS ENUM ('STARTER', 'BENCH', 'IR');

-- CreateEnum
CREATE TYPE "public"."AcquisitionType" AS ENUM ('DRAFT', 'TRADE', 'WAIVER', 'FREE_AGENT');

-- CreateEnum
CREATE TYPE "public"."DraftStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."DraftType" AS ENUM ('SNAKE', 'LINEAR');

-- CreateEnum
CREATE TYPE "public"."PlayoffRound" AS ENUM ('WILDCARD', 'SEMIFINAL', 'CHAMPIONSHIP', 'THIRD_PLACE');

-- CreateEnum
CREATE TYPE "public"."TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'VETOED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."WaiverStatus" AS ENUM ('PENDING', 'APPROVED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('DRAFT', 'TRADE', 'WAIVER', 'FREE_AGENT', 'DROP');

-- CreateEnum
CREATE TYPE "public"."TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "public"."PlayoffResult" AS ENUM ('CHAMPION', 'RUNNER_UP', 'THIRD_PLACE', 'SEMIFINAL', 'QUARTERFINAL', 'MISSED_PLAYOFFS');

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "maxTeams" INTEGER NOT NULL DEFAULT 12,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_invites" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_settings" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "rosterSize" INTEGER NOT NULL DEFAULT 15,
    "benchSize" INTEGER NOT NULL DEFAULT 6,
    "qbSlots" INTEGER NOT NULL DEFAULT 1,
    "rbSlots" INTEGER NOT NULL DEFAULT 2,
    "wrSlots" INTEGER NOT NULL DEFAULT 2,
    "teSlots" INTEGER NOT NULL DEFAULT 1,
    "flexSlots" INTEGER NOT NULL DEFAULT 1,
    "stSlots" INTEGER NOT NULL DEFAULT 1,
    "defSlots" INTEGER NOT NULL DEFAULT 1,
    "irSlots" INTEGER NOT NULL DEFAULT 1,
    "regularSeasonWeeks" INTEGER NOT NULL DEFAULT 14,
    "playoffTeams" INTEGER NOT NULL DEFAULT 6,
    "playoffStartWeek" INTEGER NOT NULL DEFAULT 15,
    "tradeDeadlineWeek" INTEGER NOT NULL DEFAULT 11,
    "waiverProcessDay" INTEGER NOT NULL DEFAULT 3,
    "waiverType" "public"."WaiverType" NOT NULL DEFAULT 'ROLLING',
    "qbIncompletion" DECIMAL(4,2) NOT NULL DEFAULT 0.5,
    "qbInterception" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "qbSack" DECIMAL(4,2) NOT NULL DEFAULT 2,
    "qbScramble" DECIMAL(4,2) NOT NULL DEFAULT -1,
    "qbFumble" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "qbTouchdown" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "rbNegativeRun" DECIMAL(4,2) NOT NULL DEFAULT 2,
    "rbNeutralRun" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "rbSuccessfulRun" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "rbExplosiveRun" DECIMAL(4,2) NOT NULL DEFAULT -1,
    "rbFumble" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "rbTouchdown" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "pcIncompleteTarget" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "pcDrop" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "pcRouteNotTargeted" DECIMAL(4,2) NOT NULL DEFAULT 0.25,
    "pcNegativeCatch" DECIMAL(4,2) NOT NULL DEFAULT 2,
    "pcNeutralCatch" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "pcSuccessfulCatch" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "pcExplosiveCatch" DECIMAL(4,2) NOT NULL DEFAULT -1,
    "pcFumble" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "pcTouchdown" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "defTouchdownAllowed" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "defFieldGoalAllowed" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "defYardsAllowed0to100" DECIMAL(4,2) NOT NULL DEFAULT -4,
    "defYardsAllowed100to200" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "defYardsAllowed200to300" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "defYardsAllowed300to400" DECIMAL(4,2) NOT NULL DEFAULT 2,
    "defYardsAllowed400to500" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "defYardsAllowed500plus" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "defSack" DECIMAL(4,2) NOT NULL DEFAULT -1,
    "defSafety" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "defInterception" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "defFumbleRecovery" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "defPickSix" DECIMAL(4,2) NOT NULL DEFAULT -4,
    "defFumbleReturnTd" DECIMAL(4,2) NOT NULL DEFAULT -4,
    "stMissedExtraPoint" DECIMAL(4,2) NOT NULL DEFAULT 5,
    "stMissedFieldGoal" DECIMAL(4,2) NOT NULL DEFAULT 3,
    "stMadeFieldGoalUnder50" DECIMAL(4,2) NOT NULL DEFAULT -1,
    "stMadeFieldGoalOver50" DECIMAL(4,2) NOT NULL DEFAULT -2,
    "stKickoffReturnTd" DECIMAL(4,2) NOT NULL DEFAULT -4,
    "stKickoffMuffed" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "stKickoffStuffed" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "stPuntReturnTd" DECIMAL(4,2) NOT NULL DEFAULT -4,
    "stPuntMuffed" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "stPuntStuffed" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "stPuntTouchback" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "stPuntBlocked" DECIMAL(4,2) NOT NULL DEFAULT 4,
    "stOnsideKickFail" DECIMAL(4,2) NOT NULL DEFAULT 6,
    "stPenaltyExtendDrive" DECIMAL(4,2) NOT NULL DEFAULT 3,

    CONSTRAINT "league_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "pointsFor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pointsAgainst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waiverPriority" INTEGER NOT NULL DEFAULT 1,
    "faabBudget" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roster_slots" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "position" "public"."Position" NOT NULL,
    "slotType" "public"."SlotType" NOT NULL DEFAULT 'STARTER',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquiredVia" "public"."AcquisitionType" NOT NULL,

    CONSTRAINT "roster_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."drafts" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "status" "public"."DraftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "draftType" "public"."DraftType" NOT NULL DEFAULT 'SNAKE',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "secondsPerPick" INTEGER NOT NULL DEFAULT 90,
    "totalRounds" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."draft_orders" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "draft_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."draft_picks" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."matchups" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" DECIMAL(10,2),
    "awayScore" DECIMAL(10,2),
    "isPlayoff" BOOLEAN NOT NULL DEFAULT false,
    "playoffRound" "public"."PlayoffRound",
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matchups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trades" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "proposingTeamId" TEXT NOT NULL,
    "receivingTeamId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "public"."TradeStatus" NOT NULL DEFAULT 'PENDING',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "vetoCount" INTEGER NOT NULL DEFAULT 0,
    "vetoThreshold" INTEGER NOT NULL DEFAULT 4,
    "notes" TEXT,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trade_players" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "externalPlayerId" TEXT NOT NULL,

    CONSTRAINT "trade_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."waiver_claims" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "dropPlayerId" TEXT,
    "priority" INTEGER NOT NULL,
    "faabBid" DECIMAL(10,2),
    "status" "public"."WaiverStatus" NOT NULL DEFAULT 'PENDING',
    "week" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "waiver_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "public"."TransactionType" NOT NULL,
    "status" "public"."TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "externalPlayerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "relatedTradeId" TEXT,
    "relatedWaiverId" TEXT,
    "week" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."season_records" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "finalRank" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "pointsFor" DECIMAL(10,2) NOT NULL,
    "pointsAgainst" DECIMAL(10,2) NOT NULL,
    "playoffResult" "public"."PlayoffResult" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "public"."accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "public"."sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "public"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "public"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "league_memberships_userId_leagueId_key" ON "public"."league_memberships"("userId", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "league_invites_code_key" ON "public"."league_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "league_settings_leagueId_key" ON "public"."league_settings"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_userId_leagueId_key" ON "public"."teams"("userId", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_slots_teamId_externalPlayerId_key" ON "public"."roster_slots"("teamId", "externalPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_orders_draftId_position_key" ON "public"."draft_orders"("draftId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "draft_orders_draftId_teamId_key" ON "public"."draft_orders"("draftId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_draftId_pickNumber_key" ON "public"."draft_picks"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_draftId_externalPlayerId_key" ON "public"."draft_picks"("draftId", "externalPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "matchups_leagueId_week_homeTeamId_key" ON "public"."matchups"("leagueId", "week", "homeTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "matchups_leagueId_week_awayTeamId_key" ON "public"."matchups"("leagueId", "week", "awayTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "season_records_teamId_season_key" ON "public"."season_records"("teamId", "season");

-- AddForeignKey
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leagues" ADD CONSTRAINT "leagues_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_memberships" ADD CONSTRAINT "league_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_memberships" ADD CONSTRAINT "league_memberships_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_invites" ADD CONSTRAINT "league_invites_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_invites" ADD CONSTRAINT "league_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_settings" ADD CONSTRAINT "league_settings_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."roster_slots" ADD CONSTRAINT "roster_slots_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drafts" ADD CONSTRAINT "drafts_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."draft_orders" ADD CONSTRAINT "draft_orders_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "public"."drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."draft_orders" ADD CONSTRAINT "draft_orders_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."draft_picks" ADD CONSTRAINT "draft_picks_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "public"."drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."draft_picks" ADD CONSTRAINT "draft_picks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matchups" ADD CONSTRAINT "matchups_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matchups" ADD CONSTRAINT "matchups_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matchups" ADD CONSTRAINT "matchups_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trades" ADD CONSTRAINT "trades_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trades" ADD CONSTRAINT "trades_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trades" ADD CONSTRAINT "trades_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trades" ADD CONSTRAINT "trades_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trade_players" ADD CONSTRAINT "trade_players_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "public"."trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trade_players" ADD CONSTRAINT "trade_players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."waiver_claims" ADD CONSTRAINT "waiver_claims_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."waiver_claims" ADD CONSTRAINT "waiver_claims_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."season_records" ADD CONSTRAINT "season_records_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."season_records" ADD CONSTRAINT "season_records_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
