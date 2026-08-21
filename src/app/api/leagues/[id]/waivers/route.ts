import {
  MemberRole,
  Prisma,
  WaiverStatus,
  WaiverType,
  type WaiverClaim,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getPlayerMap, type FailballPlayer } from "@/lib/players";
import prisma from "@/lib/prisma";
import { isPlayerRosteredInLeague } from "@/lib/roster/mutate";
import { currentWeek } from "@/lib/schedule/currentWeek";

interface WaiverContext {
  userId: string;
  role: MemberRole;
  isCommissioner: boolean;
  leagueId: string;
  season: number;
  waiverType: WaiverType;
  ownTeam: {
    id: string;
    name: string;
    waiverPriority: number;
    faabBudget: Prisma.Decimal;
  } | null;
}

type ContextResult =
  | { ok: true; context: WaiverContext }
  | { ok: false; response: NextResponse };

async function loadContext(leagueId: string): Promise<ContextResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You must be logged in to manage waivers", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      season: true,
      settings: { select: { waiverType: true } },
    },
  });

  if (!league) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  const ownTeam = await prisma.team.findFirst({
    where: { leagueId, userId: user.id },
    select: { id: true, name: true, waiverPriority: true, faabBudget: true },
  });

  return {
    ok: true,
    context: {
      userId: user.id,
      role: membership.role,
      isCommissioner: membership.role === MemberRole.COMMISSIONER,
      leagueId,
      season: league.season,
      waiverType: league.settings?.waiverType ?? WaiverType.ROLLING,
      ownTeam,
    },
  };
}

function serializeClaim(
  claim: WaiverClaim & { team: { id: string; name: string } },
  players: Map<string, FailballPlayer>,
) {
  return {
    id: claim.id,
    teamId: claim.teamId,
    teamName: claim.team.name,
    externalPlayerId: claim.externalPlayerId,
    player: players.get(claim.externalPlayerId) ?? null,
    dropPlayerId: claim.dropPlayerId,
    dropPlayer: claim.dropPlayerId
      ? players.get(claim.dropPlayerId) ?? null
      : null,
    priority: claim.priority,
    faabBid: claim.faabBid === null ? null : Number(claim.faabBid),
    status: claim.status,
    week: claim.week,
    createdAt: claim.createdAt,
    processedAt: claim.processedAt,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await loadContext(id);
    if (!result.ok) return result.response;
    const { context } = result;

    const week = await currentWeek(prisma, id, context.season);

    const pending = await prisma.waiverClaim.findMany({
      where: {
        leagueId: id,
        status: WaiverStatus.PENDING,
        ...(context.isCommissioner
          ? {}
          : { teamId: context.ownTeam?.id ?? "__none__" }),
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: [{ teamId: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    });

    const processed = await prisma.waiverClaim.findMany({
      where: {
        leagueId: id,
        status: { in: [WaiverStatus.APPROVED, WaiverStatus.FAILED] },
      },
      include: { team: { select: { id: true, name: true } } },
      orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    const players = await getPlayerMap();

    return NextResponse.json({
      week,
      season: context.season,
      waiverType: context.waiverType,
      role: context.role,
      team: context.ownTeam
        ? {
            id: context.ownTeam.id,
            name: context.ownTeam.name,
            waiverPriority: context.ownTeam.waiverPriority,
            faabBudget: Number(context.ownTeam.faabBudget),
          }
        : null,
      pendingClaims: pending.map((claim) => serializeClaim(claim, players)),
      processedClaims: processed.map((claim) => serializeClaim(claim, players)),
    });
  } catch (error) {
    console.error("Get waiver claims error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching waiver claims", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

interface WaiverRequestBody {
  action?: string;
  claimId?: string;
  teamId?: string;
  externalPlayerId?: string;
  dropPlayerId?: string;
  faabBid?: number | string;
  priority?: number | string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await loadContext(id);
    if (!result.ok) return result.response;
    const { context } = result;

    let body: WaiverRequestBody;
    try {
      body = (await request.json()) as WaiverRequestBody;
    } catch {
      return NextResponse.json(
        { error: "A valid JSON body is required", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    if (body.action === "cancel") {
      return cancelClaim(context, body.claimId);
    }

    const teamId = body.teamId?.trim() || context.ownTeam?.id;
    if (!teamId) {
      return NextResponse.json(
        { error: "You do not have a team in this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, leagueId: id },
      select: { id: true, userId: true, faabBudget: true, waiverPriority: true },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team not found in this league", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (team.userId !== context.userId && !context.isCommissioner) {
      return NextResponse.json(
        { error: "You do not have permission to submit claims for this team", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const externalPlayerId =
      typeof body.externalPlayerId === "string" ? body.externalPlayerId.trim() : "";
    if (!externalPlayerId) {
      return NextResponse.json(
        { error: "externalPlayerId is required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const players = await getPlayerMap();
    if (!players.has(externalPlayerId)) {
      return NextResponse.json(
        { error: "Unknown player", code: "UNKNOWN_PLAYER" },
        { status: 404 },
      );
    }

    const rosteredBy = await isPlayerRosteredInLeague({
      tx: prisma,
      leagueId: id,
      externalPlayerId,
    });
    if (rosteredBy) {
      return NextResponse.json(
        { error: "Player is already rostered in this league", code: "PLAYER_ALREADY_ROSTERED" },
        { status: 409 },
      );
    }

    const dropPlayerId =
      typeof body.dropPlayerId === "string" && body.dropPlayerId.trim()
        ? body.dropPlayerId.trim()
        : null;
    if (dropPlayerId) {
      const owned = await prisma.rosterSlot.findUnique({
        where: {
          teamId_externalPlayerId: { teamId: team.id, externalPlayerId: dropPlayerId },
        },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json(
          { error: "The drop player is not on this team's roster", code: "PLAYER_NOT_ON_ROSTER" },
          { status: 404 },
        );
      }
    }

    const week = await currentWeek(prisma, id, context.season);

    const existing = await prisma.waiverClaim.findFirst({
      where: {
        leagueId: id,
        teamId: team.id,
        externalPlayerId,
        status: WaiverStatus.PENDING,
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This team already has a pending claim for that player", code: "DUPLICATE_CLAIM" },
        { status: 409 },
      );
    }

    let faabBid: Prisma.Decimal | null = null;
    if (context.waiverType === WaiverType.FAAB) {
      const bid = Number(body.faabBid);
      if (body.faabBid === undefined || body.faabBid === null || Number.isNaN(bid)) {
        return NextResponse.json(
          { error: "A FAAB bid is required in this league", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      const budget = Number(team.faabBudget);
      if (bid < 0 || bid > budget) {
        return NextResponse.json(
          {
            error: `FAAB bid must be between 0 and ${budget}`,
            code: "VALIDATION_ERROR",
          },
          { status: 400 },
        );
      }
      faabBid = new Prisma.Decimal(bid.toFixed(2));
    }

    const requestedPriority = Number(body.priority);
    let priority: number;
    if (body.priority !== undefined && body.priority !== null && !Number.isNaN(requestedPriority)) {
      if (!Number.isInteger(requestedPriority) || requestedPriority < 1) {
        return NextResponse.json(
          { error: "priority must be a positive integer", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      priority = requestedPriority;
    } else {
      const pendingCount = await prisma.waiverClaim.count({
        where: { leagueId: id, teamId: team.id, status: WaiverStatus.PENDING },
      });
      priority = pendingCount + 1;
    }

    const claim = await prisma.waiverClaim.create({
      data: {
        leagueId: id,
        teamId: team.id,
        externalPlayerId,
        dropPlayerId,
        priority,
        faabBid,
        status: WaiverStatus.PENDING,
        week,
      },
      include: { team: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ claim: serializeClaim(claim, players) }, { status: 201 });
  } catch (error) {
    console.error("Submit waiver claim error:", error);
    return NextResponse.json(
      { error: "An error occurred while submitting the waiver claim", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await loadContext(id);
    if (!result.ok) return result.response;

    return cancelClaim(
      result.context,
      request.nextUrl.searchParams.get("claimId") ?? undefined,
    );
  } catch (error) {
    console.error("Cancel waiver claim error:", error);
    return NextResponse.json(
      { error: "An error occurred while cancelling the waiver claim", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

async function cancelClaim(
  context: WaiverContext,
  claimId?: string,
): Promise<NextResponse> {
  if (!claimId?.trim()) {
    return NextResponse.json(
      { error: "claimId is required", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const claim = await prisma.waiverClaim.findFirst({
    where: { id: claimId.trim(), leagueId: context.leagueId },
    select: { id: true, status: true, team: { select: { id: true, userId: true } } },
  });

  if (!claim) {
    return NextResponse.json(
      { error: "Waiver claim not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (claim.team.userId !== context.userId && !context.isCommissioner) {
    return NextResponse.json(
      { error: "You do not have permission to cancel this claim", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (claim.status !== WaiverStatus.PENDING) {
    return NextResponse.json(
      { error: "Only pending claims can be cancelled", code: "INVALID_STATE" },
      { status: 409 },
    );
  }

  const cancelled = await prisma.waiverClaim.update({
    where: { id: claim.id },
    data: { status: WaiverStatus.CANCELLED, processedAt: new Date() },
    include: { team: { select: { id: true, name: true } } },
  });

  const players = await getPlayerMap();
  return NextResponse.json({ claim: serializeClaim(cancelled, players) });
}
