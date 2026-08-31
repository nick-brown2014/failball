import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  computeScore,
  SCORING_FIELDS,
  YARDS_ALLOWED_FIELDS,
  type ScorableStats,
} from "@/lib/scoring/computeScore";
import { MIN_PRIOR_GAMES } from "@/lib/projections/blend";

/** NFL regular seasons end after week 18; postseason rows remain available separately. */
export const REGULAR_SEASON_LAST_WEEK = 18;

const COUNT_COLUMNS = [
  ...new Set(SCORING_FIELDS.map(([, countField]) => countField)),
];

export type DraftRankingSort = "total" | "avg";

export interface DraftRanking {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  weeksPlayed: number;
  totalPoints: number;
  avgPoints: number;
  bestWeek: number;
  worstWeek: number;
  weeklyPoints: Array<{ week: number; points: number }>;
}

export interface DraftRankingsResult {
  season: number;
  page: number;
  limit: number;
  total: number;
  sort: DraftRankingSort;
  players: DraftRanking[];
}

function scoreExpression(settings: Record<string, unknown>): Prisma.Sql {
  const countTerms = SCORING_FIELDS.map(([setting, countField]) => {
    const rate = Number(String(settings[setting] ?? 0));
    return Prisma.sql`COALESCE(${Prisma.raw(`"s"."${countField}"`)}, 0) * ${rate}`;
  });
  const bucketTerms = Object.entries(YARDS_ALLOWED_FIELDS).map(([bucket, field]) => {
    const rate = Number(String(settings[field] ?? 0));
    return Prisma.sql`CASE WHEN "s"."defYardsAllowedBucket" = ${bucket} THEN ${rate} ELSE 0 END`;
  });
  return Prisma.sql`(${Prisma.join([...countTerms, ...bucketTerms], " + ")})`;
}

function rankingWhere(
  season: number,
  position?: string | null,
  q?: string | null,
  includePostseason = false,
) {
  const terms: Prisma.Sql[] = [
    Prisma.sql`"s"."season" = ${season}`,
    ...(includePostseason
      ? []
      : [Prisma.sql`"s"."week" <= ${REGULAR_SEASON_LAST_WEEK}`]),
    Prisma.sql`(
      "p"."externalPlayerId" IS NOT NULL
      OR "s"."externalPlayerId" LIKE 'DEF:%'
      OR "s"."externalPlayerId" LIKE 'ST:%'
    )`,
  ];
  if (position) {
    terms.push(
      Prisma.sql`COALESCE("p"."position", "s"."position") = ${position}::"Position"`,
    );
  }
  if (q) {
    terms.push(
      Prisma.sql`COALESCE("p"."fullName", "s"."externalPlayerId") ILIKE '%' || ${q} || '%'`,
    );
  }
  return Prisma.join(terms, " AND ");
}

const weeklySelect = Prisma.join(
  COUNT_COLUMNS.map((field) => Prisma.raw(`"s"."${field}"`)),
  ", ",
);

export async function getDraftRankings(options: {
  leagueId: string;
  season: number;
  position?: string | null;
  q?: string | null;
  page?: number;
  limit?: number;
  sort?: DraftRankingSort;
  includePostseason?: boolean;
  prismaClient?: PrismaClient;
}): Promise<DraftRankingsResult> {
  const {
    leagueId,
    season,
    position = null,
    q = null,
    page = 1,
    limit = 50,
    sort = "total",
    includePostseason = false,
    prismaClient = prisma,
  } = options;
  const settings = await prismaClient.leagueSettings.findUnique({
    where: { leagueId },
  });
  if (!settings) throw new Error("League settings not found");

  const score = scoreExpression(settings as unknown as Record<string, unknown>);
  const where = rankingWhere(season, position, q, includePostseason);
  const order = sort === "avg" ? `"avgPoints"` : `"totalPoints"`;
  const offset = (page - 1) * limit;
  const rows = await prismaClient.$queryRaw<
    Array<{
      externalPlayerId: string;
      fullName: string;
      position: string | null;
      nflTeam: string | null;
      weeksPlayed: number;
      totalPoints: number;
      avgPoints: number;
    }>
  >(Prisma.sql`
    SELECT
      "s"."externalPlayerId",
      COALESCE("p"."fullName", "s"."externalPlayerId") AS "fullName",
      COALESCE("p"."position", "s"."position") AS "position",
      COALESCE("p"."nflTeam", MAX("s"."nflTeam")) AS "nflTeam",
      COUNT(*)::int AS "weeksPlayed",
      ROUND(SUM(${score})::numeric, 2)::float8 AS "totalPoints",
      ROUND((SUM(${score}) / COUNT(*))::numeric, 2)::float8 AS "avgPoints"
    FROM "public"."player_week_stats" "s"
    LEFT JOIN "public"."players" "p"
      ON "p"."externalPlayerId" = "s"."externalPlayerId"
    WHERE ${where}
    GROUP BY "s"."externalPlayerId", "p"."fullName", "p"."position", "p"."nflTeam", "s"."position"
    ORDER BY ${Prisma.raw(order)} DESC, "fullName" ASC, "s"."externalPlayerId" ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const countRows = await prismaClient.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT "s"."externalPlayerId"
      FROM "public"."player_week_stats" "s"
      LEFT JOIN "public"."players" "p"
        ON "p"."externalPlayerId" = "s"."externalPlayerId"
      WHERE ${where}
      GROUP BY "s"."externalPlayerId"
    ) ranked
  `);

  const ids = rows.map((row) => row.externalPlayerId);
  const weeklyRows = ids.length
    ? await prismaClient.$queryRaw<
        Array<
          {
            externalPlayerId: string;
            week: number;
            position: string | null;
            nflTeam: string | null;
            defYardsAllowedBucket: string | null;
          } & Record<string, number | null>
        >
      >(Prisma.sql`
        SELECT "s"."externalPlayerId", "s"."week", "s"."position", "s"."nflTeam",
          "s"."defYardsAllowedBucket", ${weeklySelect}
        FROM "public"."player_week_stats" "s"
        WHERE "s"."season" = ${season}
          ${includePostseason ? Prisma.empty : Prisma.sql`AND "s"."week" <= ${REGULAR_SEASON_LAST_WEEK}`}
          AND "s"."externalPlayerId" IN (${Prisma.join(ids)})
        ORDER BY "s"."externalPlayerId" ASC, "s"."week" ASC
      `)
    : [];
  const byId = new Map<string, typeof weeklyRows>();
  for (const row of weeklyRows) {
    const existing = byId.get(row.externalPlayerId) ?? [];
    existing.push(row);
    byId.set(row.externalPlayerId, existing);
  }
  const players = rows.map((row) => {
    const weeklyPoints = (byId.get(row.externalPlayerId) ?? []).map((weekly) => ({
      week: weekly.week,
      points: computeScore(
        weekly as unknown as ScorableStats,
        settings as unknown as Record<string, number | string>,
      ),
    }));
    const values = weeklyPoints.map((entry) => entry.points);
    return {
      ...row,
      bestWeek: values.length ? Math.max(...values) : 0,
      worstWeek: values.length ? Math.min(...values) : 0,
      weeklyPoints,
    };
  });

  return {
    season,
    page,
    limit,
    total: countRows[0]?.count ?? 0,
    sort,
    players,
  };
}

export async function getLastSeasonSummaries(
  externalPlayerIds: string[],
  season: number,
  settings: Record<string, unknown>,
  includePostseason = false,
  prismaClient: PrismaClient = prisma,
) {
  if (externalPlayerIds.length === 0) return new Map<string, { totalPoints: number; avgPoints: number; weeksPlayed: number }>();
  const score = scoreExpression(settings);
  const rows = await prismaClient.$queryRaw<
    Array<{ externalPlayerId: string; totalPoints: number; avgPoints: number; weeksPlayed: number }>
  >(Prisma.sql`
    SELECT "s"."externalPlayerId",
      ROUND(SUM(${score})::numeric, 2)::float8 AS "totalPoints",
      ROUND((SUM(${score}) / COUNT(*))::numeric, 2)::float8 AS "avgPoints",
      COUNT(*)::int AS "weeksPlayed"
    FROM "public"."player_week_stats" "s"
    LEFT JOIN "public"."players" "p"
      ON "p"."externalPlayerId" = "s"."externalPlayerId"
    WHERE "s"."season" = ${season}
      ${includePostseason ? Prisma.empty : Prisma.sql`AND "s"."week" <= ${REGULAR_SEASON_LAST_WEEK}`}
      AND "s"."externalPlayerId" IN (${Prisma.join(externalPlayerIds)})
      AND (
        "p"."externalPlayerId" IS NOT NULL
        OR "s"."externalPlayerId" LIKE 'DEF:%'
        OR "s"."externalPlayerId" LIKE 'ST:%'
      )
    GROUP BY "s"."externalPlayerId"
  `);
  return new Map(rows.map((row) => [row.externalPlayerId, row]));
}

export async function getPositionMeanPerGame(
  season: number,
  settings: Record<string, unknown>,
  prismaClient: PrismaClient = prisma,
): Promise<Map<string, number>> {
  const score = scoreExpression(settings);
  const rows = await prismaClient.$queryRaw<
    Array<{ position: string | null; perGame: number | null }>
  >(Prisma.sql`
    WITH player_rates AS (
      SELECT
        CASE
          WHEN "s"."externalPlayerId" LIKE 'DEF:%' THEN 'DEF'
          ELSE COALESCE("p"."position"::text, "s"."position"::text)
        END AS "position",
        "s"."externalPlayerId",
        SUM(${score}) / COUNT(*) AS "perGame"
      FROM "public"."player_week_stats" "s"
      LEFT JOIN "public"."players" "p"
        ON "p"."externalPlayerId" = "s"."externalPlayerId"
      WHERE "s"."season" = ${season}
        AND "s"."week" <= ${REGULAR_SEASON_LAST_WEEK}
        AND "s"."externalPlayerId" NOT LIKE 'ST:%'
        AND (
          "p"."externalPlayerId" IS NOT NULL
          OR "s"."externalPlayerId" LIKE 'DEF:%'
        )
      GROUP BY
        CASE
          WHEN "s"."externalPlayerId" LIKE 'DEF:%' THEN 'DEF'
          ELSE COALESCE("p"."position"::text, "s"."position"::text)
        END,
        "s"."externalPlayerId"
      HAVING COUNT(*) >= ${MIN_PRIOR_GAMES}
    )
    SELECT "position", AVG("perGame")::float8 AS "perGame"
    FROM player_rates
    GROUP BY "position"
  `);
  return new Map(
    rows
      .filter((row): row is { position: string; perGame: number } =>
        row.position != null && row.perGame != null,
      )
      .map((row) => [
        row.position.toUpperCase() === "K" ? "ST" : row.position.toUpperCase(),
        row.perGame,
      ]),
  );
}
