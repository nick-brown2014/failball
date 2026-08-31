-- DropIndex
DROP INDEX "public"."matchups_leagueId_week_homeTeamId_key";

-- DropIndex
DROP INDEX "public"."matchups_leagueId_week_awayTeamId_key";

-- CreateIndex
CREATE UNIQUE INDEX "matchups_leagueId_season_week_homeTeamId_key" ON "public"."matchups"("leagueId", "season", "week", "homeTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "matchups_leagueId_season_week_awayTeamId_key" ON "public"."matchups"("leagueId", "season", "week", "awayTeamId");
