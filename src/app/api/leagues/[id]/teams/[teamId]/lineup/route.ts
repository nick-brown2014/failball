import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { LineupSlot } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getPlayerMap } from "@/lib/players";
import { lockedAssignmentChanges, lockedPlayerIds } from "@/lib/lineup/locking";
import {
  parseWeekParam,
  validateLineup,
  type LineupAssignment,
  type LineupError,
  type LineupRosterRow,
} from "@/lib/lineup/logic";
import { replaceTeamLineup, syncTeamLineup } from "@/lib/lineup/service";

const slots = Object.values(LineupSlot);

function errorResponse(error: string, code: string, status: number, errors?: LineupError[]) {
  return NextResponse.json({ error, code, ...(errors ? { errors } : {}) }, { status });
}

async function getContext(id: string, teamId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { response: errorResponse("User not found", "USER_NOT_FOUND", 404) };
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId: id } },
    select: { role: true },
  });
  if (!membership) return { response: errorResponse("You are not a member of this league", "FORBIDDEN", 403) };
  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: id },
    select: {
      id: true,
      name: true,
      userId: true,
      league: { select: { id: true, name: true, season: true, settings: true } },
      roster: { select: { externalPlayerId: true, position: true, slotType: true, acquiredAt: true } },
    },
  });
  if (!team) return { response: errorResponse("Team not found in this league", "NOT_FOUND", 404) };
  return { user, membership, team };
}

function weekFrom(request: Request, maxWeek: number): number | NextResponse {
  const parsed = parseWeekParam(new URL(request.url).searchParams.get("week"), maxWeek);
  return "week" in parsed
    ? parsed.week
    : errorResponse(parsed.message, parsed.code, 400);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return errorResponse("You must be logged in to view this lineup", "UNAUTHORIZED", 401);
    const { id, teamId } = await params;
    const context = await getContext(id, teamId, session.user.email);
    if ("response" in context) return context.response;
    const settings = context.team.league.settings;
    const week = weekFrom(request, settings?.regularSeasonWeeks ?? 14);
    if (typeof week !== "number") return week;
    await syncTeamLineup(teamId, context.team.league.season, week);
    const [snapshots, matchup, games, playerMap] = await Promise.all([
      prisma.lineupSnapshot.findMany({
        where: { teamId, season: context.team.league.season, week },
        orderBy: [{ slot: "asc" }, { externalPlayerId: "asc" }],
      }),
      prisma.matchup.findFirst({
        where: { leagueId: id, season: context.team.league.season, week, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
        select: { isComplete: true },
      }),
      prisma.game.findMany({ where: { season: context.team.league.season, week } }),
      getPlayerMap(),
    ]);
    const lockedIds = lockedPlayerIds(snapshots.map((row) => row.externalPlayerId), playerMap, games);
    const enriched = snapshots.map((row) => ({
      ...row,
      player: playerMap.get(row.externalPlayerId) ?? null,
      locked: lockedIds.has(row.externalPlayerId),
    }));
    const bySlot = Object.fromEntries(slots.map((slot) => [slot, enriched.filter((row) => row.slot === slot)]));
    return NextResponse.json({
      team: { id: context.team.id, name: context.team.name, league: context.team.league },
      season: context.team.league.season,
      week,
      isOwner: context.team.userId === context.user.id,
      role: context.membership.role,
      canEdit: context.team.userId === context.user.id || context.membership.role === "COMMISSIONER",
      weekLocked: matchup?.isComplete ?? false,
      settings: settings
        ? {
            qbSlots: settings.qbSlots, rbSlots: settings.rbSlots, wrSlots: settings.wrSlots,
            teSlots: settings.teSlots, flexSlots: settings.flexSlots, stSlots: settings.stSlots,
            defSlots: settings.defSlots, benchSize: settings.benchSize, irSlots: settings.irSlots,
            regularSeasonWeeks: settings.regularSeasonWeeks,
          }
        : null,
      slots: enriched,
      bySlot,
    });
  } catch (error) {
    console.error("Get lineup error:", error);
    return errorResponse("An error occurred while fetching the lineup", "INTERNAL_ERROR", 500);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return errorResponse("You must be logged in to edit this lineup", "UNAUTHORIZED", 401);
    const { id, teamId } = await params;
    const context = await getContext(id, teamId, session.user.email);
    if ("response" in context) return context.response;
    const canEdit = context.team.userId === context.user.id || context.membership.role === "COMMISSIONER";
    if (!canEdit) return errorResponse("Only the team owner or commissioner can edit this lineup", "FORBIDDEN", 403);
    const body = (await request.json()) as { assignments?: unknown; lineup?: unknown };
    const raw = body.assignments ?? body.lineup;
    const assignments: LineupAssignment[] = Array.isArray(raw)
      ? raw.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as { externalPlayerId?: unknown; playerId?: unknown; slot?: unknown };
          const externalPlayerId = row.externalPlayerId ?? row.playerId;
          return typeof externalPlayerId === "string" && typeof row.slot === "string" && slots.includes(row.slot as LineupSlot)
            ? [{ externalPlayerId, slot: row.slot as LineupSlot }]
            : [];
        })
      : raw && typeof raw === "object"
        ? Object.entries(raw as Record<string, unknown>).flatMap(([externalPlayerId, slot]) =>
            typeof slot === "string" && slots.includes(slot as LineupSlot)
              ? [{ externalPlayerId, slot: slot as LineupSlot }]
              : [],
          )
        : [];
    const season = context.team.league.season;
    const week = weekFrom(request, context.team.league.settings?.regularSeasonWeeks ?? 14);
    if (typeof week !== "number") return week;
    const playerMap = await getPlayerMap();
    const result = await prisma.$transaction(async (tx) => {
      await syncTeamLineup(teamId, season, week, tx);
      const [snapshots, games, matchup] = await Promise.all([
        tx.lineupSnapshot.findMany({ where: { teamId, season, week } }),
        tx.game.findMany({ where: { season, week } }),
        tx.matchup.findFirst({
          where: { leagueId: id, season, week, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
          select: { isComplete: true },
        }),
      ]);
      const settings = context.team.league.settings;
      if (!settings) return { errors: [{ code: "SETTINGS_MISSING", message: "League settings are missing", playerIds: [] }] };
      const roster: LineupRosterRow[] = context.team.roster;
      const errors = validateLineup(assignments, roster, settings);
      const current = new Map(snapshots.map((row) => [row.externalPlayerId, row.slot]));
      const desired = new Map(assignments.map((row) => [row.externalPlayerId, row.slot]));
      if (matchup?.isComplete) {
        errors.push({
          code: "WEEK_LOCKED",
          message: "This week's matchup is complete",
          playerIds: snapshots.map((row) => row.externalPlayerId),
        });
      } else {
        const lockedIds = lockedPlayerIds(
          [...new Set([...snapshots.map((row) => row.externalPlayerId), ...assignments.map((row) => row.externalPlayerId)])],
          playerMap,
          games,
        );
        const changed = lockedAssignmentChanges(current, desired, lockedIds);
        if (changed.length > 0) {
          errors.push({ code: "PLAYER_LOCKED", message: "A kicked-off player's lineup slot cannot change", playerIds: changed });
        }
      }
      if (errors.length > 0) return { errors };
      await replaceTeamLineup(teamId, season, week, assignments, roster, tx);
      return { errors: [] };
    });
    if (result.errors.length > 0) return errorResponse("Lineup could not be saved", "VALIDATION_ERROR", 400, result.errors);
    return NextResponse.json({ ok: true, season, week });
  } catch (error) {
    console.error("Put lineup error:", error);
    return errorResponse("An error occurred while saving the lineup", "INTERNAL_ERROR", 500);
  }
}
