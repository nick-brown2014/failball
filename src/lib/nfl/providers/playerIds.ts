import { parseCsv } from "./nflverse";

const PLAYER_IDS_URL =
  process.env.PLAYER_IDS_URL ??
  "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv";

export interface PlayerIdCrosswalkRow {
  gsisId: string;
  sleeperId: string;
}

export async function getPlayerIdCrosswalk(): Promise<PlayerIdCrosswalkRow[]> {
  const response = await fetch(PLAYER_IDS_URL);
  if (!response.ok) {
    throw new Error(
      `player id crosswalk ${PLAYER_IDS_URL} failed: ${response.status} ${response.statusText}`,
    );
  }
  return parseCsv(await response.text())
    .map((row) => ({
      gsisId: row.gsis_id?.trim() ?? "",
      sleeperId: row.sleeper_id?.trim() ?? "",
    }))
    .filter((row) => row.gsisId.length > 0 && row.sleeperId.length > 0);
}
