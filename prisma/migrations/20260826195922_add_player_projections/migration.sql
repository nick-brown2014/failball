-- CreateTable
CREATE TABLE "player_projections" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "position" TEXT,
    "nflTeam" TEXT,
    "gamesProjected" DOUBLE PRECISION,
    "yearsExp" INTEGER,
    "stats" JSONB NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_projections_season_week_idx" ON "player_projections"("season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "player_projections_source_season_week_externalPlayerId_key" ON "player_projections"("source", "season", "week", "externalPlayerId");
