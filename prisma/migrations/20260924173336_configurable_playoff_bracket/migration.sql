-- CreateEnum
CREATE TYPE "MatchupBracket" AS ENUM ('MAIN', 'CONSOLATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlayoffRound" ADD VALUE 'CONSOLATION_SEMIFINAL';
ALTER TYPE "PlayoffRound" ADD VALUE 'FIFTH_PLACE';
ALTER TYPE "PlayoffRound" ADD VALUE 'SEVENTH_PLACE';
ALTER TYPE "PlayoffRound" ADD VALUE 'NINTH_PLACE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlayoffResult" ADD VALUE 'FIFTH_PLACE';
ALTER TYPE "PlayoffResult" ADD VALUE 'SEVENTH_PLACE';
ALTER TYPE "PlayoffResult" ADD VALUE 'NINTH_PLACE';

-- AlterTable
ALTER TABLE "league_settings" ADD COLUMN     "championshipWeeks" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "consolationBracket" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "playoffByeTeams" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playoffReseed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "matchups" ADD COLUMN     "playoffBracket" "MatchupBracket" NOT NULL DEFAULT 'MAIN',
ADD COLUMN     "playoffLeg" INTEGER NOT NULL DEFAULT 1;

