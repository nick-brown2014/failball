import { backfillSeason } from "../src/lib/nfl/backfill";

const season = Number(process.argv[2] ?? process.env.SEASON ?? new Date().getUTCFullYear() - 1);
const weekArg = process.argv[3] ?? process.env.WEEK;
const persistPlays = process.argv.includes("--persist-plays");
const week = weekArg == null ? undefined : Number(weekArg);

if (!Number.isInteger(season) || (week !== undefined && !Number.isInteger(week))) {
  throw new Error("Usage: npm run backfill -- <season> [week] [--persist-plays]");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be explicitly exported for backfill");
}

async function main() {
  const result = await backfillSeason({
    season,
    weeks: week === undefined ? undefined : [week],
    persistPlays,
  });
  console.log(JSON.stringify(result, null, 2));
}

void main();
