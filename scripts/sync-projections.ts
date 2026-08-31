import { syncProjections } from "../src/lib/nfl/syncProjections";

const season = Number(process.argv[2] ?? process.env.SEASON);
const weekArg = process.argv[3] ?? process.env.WEEK;
const week = weekArg == null ? undefined : Number(weekArg);

if (!Number.isInteger(season) || (week !== undefined && (!Number.isInteger(week) || week < 0))) {
  throw new Error("Usage: npm run projections -- <season> [week]");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be explicitly exported for projections");
}

async function main() {
  const result = await syncProjections({ season, week });
  console.log(JSON.stringify(result, null, 2));
}

void main();
