-- AlterEnum
ALTER TYPE "PlayoffRound" ADD VALUE 'CONSOLATION';

-- AlterTable
ALTER TABLE "league_settings" ADD COLUMN     "championshipWeeks" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "playoffConsolation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "playoffReseed" BOOLEAN NOT NULL DEFAULT true;
