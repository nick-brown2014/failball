-- AlterTable
ALTER TABLE "league_settings" ADD COLUMN     "divisionWinnersTopSeeds" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "divisionId" TEXT;

-- CreateTable
CREATE TABLE "divisions" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "divisions_leagueId_name_key" ON "divisions"("leagueId", "name");

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
