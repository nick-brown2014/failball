-- CreateEnum
CREATE TYPE "LineupSlot" AS ENUM ('QB', 'RB', 'WR', 'TE', 'FLEX', 'ST', 'DEF', 'BENCH', 'IR');

-- CreateTable
CREATE TABLE "lineup_snapshots" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "externalPlayerId" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "slot" "LineupSlot" NOT NULL,

    CONSTRAINT "lineup_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lineup_snapshots_teamId_season_week_idx" ON "lineup_snapshots"("teamId", "season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "lineup_snapshots_teamId_season_week_externalPlayerId_key" ON "lineup_snapshots"("teamId", "season", "week", "externalPlayerId");

-- AddForeignKey
ALTER TABLE "lineup_snapshots" ADD CONSTRAINT "lineup_snapshots_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
