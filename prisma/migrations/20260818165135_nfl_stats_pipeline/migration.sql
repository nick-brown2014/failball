-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINAL');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" "Position",
    "nflTeam" TEXT,
    "injuryStatus" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "gsisId" TEXT,
    "sleeperId" TEXT,
    "sportsDataId" TEXT,
    "chartingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "externalGameId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_events" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "externalPlayId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "quarter" INTEGER,
    "clock" TEXT,
    "offenseTeam" TEXT,
    "defenseTeam" TEXT,
    "down" INTEGER,
    "distance" INTEGER,
    "yardLine" INTEGER,
    "playType" TEXT NOT NULL,
    "result" TEXT,
    "yardsGained" INTEGER,
    "isTouchdown" BOOLEAN NOT NULL DEFAULT false,
    "isTurnover" BOOLEAN NOT NULL DEFAULT false,
    "isSack" BOOLEAN NOT NULL DEFAULT false,
    "isInterception" BOOLEAN NOT NULL DEFAULT false,
    "isFumble" BOOLEAN NOT NULL DEFAULT false,
    "isFumbleLost" BOOLEAN NOT NULL DEFAULT false,
    "isSafety" BOOLEAN NOT NULL DEFAULT false,
    "isPenalty" BOOLEAN NOT NULL DEFAULT false,
    "penaltyFirstDown" BOOLEAN NOT NULL DEFAULT false,
    "isNoPlay" BOOLEAN NOT NULL DEFAULT false,
    "isCompletion" BOOLEAN NOT NULL DEFAULT false,
    "isTarget" BOOLEAN,
    "isScramble" BOOLEAN,
    "isKneel" BOOLEAN NOT NULL DEFAULT false,
    "isSpike" BOOLEAN NOT NULL DEFAULT false,
    "kickDistance" INTEGER,
    "kickResult" TEXT,
    "returnYards" INTEGER,
    "passerId" TEXT,
    "rusherId" TEXT,
    "receiverId" TEXT,
    "defenderId" TEXT,
    "kickerId" TEXT,
    "returnerId" TEXT,
    "raw" JSONB,
    "source" TEXT NOT NULL DEFAULT 'sportsdataio',
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "play_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_week_stats" (
    "id" TEXT NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "position" "Position",
    "nflTeam" TEXT,
    "qbIncompletions" INTEGER NOT NULL DEFAULT 0,
    "qbInterceptions" INTEGER NOT NULL DEFAULT 0,
    "qbSacks" INTEGER NOT NULL DEFAULT 0,
    "qbScrambles" INTEGER NOT NULL DEFAULT 0,
    "qbFumbles" INTEGER NOT NULL DEFAULT 0,
    "qbTouchdowns" INTEGER NOT NULL DEFAULT 0,
    "rbNegativeRuns" INTEGER NOT NULL DEFAULT 0,
    "rbNeutralRuns" INTEGER NOT NULL DEFAULT 0,
    "rbSuccessfulRuns" INTEGER NOT NULL DEFAULT 0,
    "rbExplosiveRuns" INTEGER NOT NULL DEFAULT 0,
    "rbFumbles" INTEGER NOT NULL DEFAULT 0,
    "rbTouchdowns" INTEGER NOT NULL DEFAULT 0,
    "pcIncompleteTargets" INTEGER NOT NULL DEFAULT 0,
    "pcNegativeCatches" INTEGER NOT NULL DEFAULT 0,
    "pcNeutralCatches" INTEGER NOT NULL DEFAULT 0,
    "pcSuccessfulCatches" INTEGER NOT NULL DEFAULT 0,
    "pcExplosiveCatches" INTEGER NOT NULL DEFAULT 0,
    "pcFumbles" INTEGER NOT NULL DEFAULT 0,
    "pcTouchdowns" INTEGER NOT NULL DEFAULT 0,
    "pcDrop" INTEGER NOT NULL DEFAULT 0,
    "pcRouteNotTargeted" INTEGER NOT NULL DEFAULT 0,
    "defTouchdownsAllowed" INTEGER NOT NULL DEFAULT 0,
    "defFieldGoalsAllowed" INTEGER NOT NULL DEFAULT 0,
    "defYardsAllowed" INTEGER NOT NULL DEFAULT 0,
    "defYardsAllowedBucket" TEXT,
    "defSacks" INTEGER NOT NULL DEFAULT 0,
    "defSafeties" INTEGER NOT NULL DEFAULT 0,
    "defInterceptions" INTEGER NOT NULL DEFAULT 0,
    "defFumbleRecoveries" INTEGER NOT NULL DEFAULT 0,
    "defPickSixes" INTEGER NOT NULL DEFAULT 0,
    "defFumbleReturnTds" INTEGER NOT NULL DEFAULT 0,
    "stMissedExtraPoints" INTEGER NOT NULL DEFAULT 0,
    "stMissedFieldGoals" INTEGER NOT NULL DEFAULT 0,
    "stMadeFieldGoalsUnder50" INTEGER NOT NULL DEFAULT 0,
    "stMadeFieldGoalsOver50" INTEGER NOT NULL DEFAULT 0,
    "stKickoffReturnTds" INTEGER NOT NULL DEFAULT 0,
    "stKickoffMuffed" INTEGER NOT NULL DEFAULT 0,
    "stKickoffStuffed" INTEGER NOT NULL DEFAULT 0,
    "stPuntReturnTds" INTEGER NOT NULL DEFAULT 0,
    "stPuntMuffed" INTEGER NOT NULL DEFAULT 0,
    "stPuntStuffed" INTEGER NOT NULL DEFAULT 0,
    "stPuntTouchbacks" INTEGER NOT NULL DEFAULT 0,
    "stPuntsBlocked" INTEGER NOT NULL DEFAULT 0,
    "stOnsideKickFails" INTEGER NOT NULL DEFAULT 0,
    "stPenaltiesExtendDrive" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'sportsdataio',
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_week_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_externalPlayerId_key" ON "players"("externalPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "players_gsisId_key" ON "players"("gsisId");

-- CreateIndex
CREATE UNIQUE INDEX "players_sleeperId_key" ON "players"("sleeperId");

-- CreateIndex
CREATE UNIQUE INDEX "players_sportsDataId_key" ON "players"("sportsDataId");

-- CreateIndex
CREATE UNIQUE INDEX "players_chartingId_key" ON "players"("chartingId");

-- CreateIndex
CREATE INDEX "players_nflTeam_idx" ON "players"("nflTeam");

-- CreateIndex
CREATE UNIQUE INDEX "games_externalGameId_key" ON "games"("externalGameId");

-- CreateIndex
CREATE INDEX "games_season_week_idx" ON "games"("season", "week");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "play_events_season_week_idx" ON "play_events"("season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "play_events_gameId_externalPlayId_key" ON "play_events"("gameId", "externalPlayId");

-- CreateIndex
CREATE INDEX "player_week_stats_season_week_idx" ON "player_week_stats"("season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "player_week_stats_externalPlayerId_season_week_key" ON "player_week_stats"("externalPlayerId", "season", "week");

-- AddForeignKey
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
