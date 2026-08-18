import { DraftStatus, DraftType, type Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { publishDraftPick, publishDraftState } from "@/lib/draft/events";
import { getDraftMember, getDraftState } from "@/lib/draft/state";
import {
  DraftServiceError,
  settleExpiredDraftPicks,
} from "@/lib/draft/service";
import { shuffleDraftOrder } from "@/lib/draft/order";

async function requireMember(leagueId: string, email: string) {
  const member = await getDraftMember(leagueId, email);
  if (!member) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true },
    });
    return { member: null, missingLeague: !league };
  }
  return { member, missingLeague: false };
}

function errorResponse(error: unknown, fallback = "An error occurred") {
  if (error instanceof DraftServiceError) {
    const status = DRAFT_ERROR_STATUS[error.code] ?? 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json(
    { error: fallback, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

const DRAFT_ERROR_STATUS: Record<string, number> = {
  DRAFT_NOT_IN_PROGRESS: 400,
  INVALID_DRAFT_ORDER: 400,
  PLAYER_NOT_DRAFTABLE: 400,
  PLAYER_ALREADY_DRAFTED: 409,
  ROSTER_FULL: 400,
  STALE_PICK: 409,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view the draft", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const { id } = await params;
    const { member, missingLeague } = await requireMember(id, session.user.email);
    if (missingLeague) {
      return NextResponse.json({ error: "League not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const draft = await prisma.draft.findFirst({ where: { leagueId: id } });
    if (draft) {
      const expired = await settleExpiredDraftPicks(draft.id);
      expired.forEach(publishDraftPick);
    }
    const state = await getDraftState(id, session.user.email);
    return NextResponse.json(state);
  } catch (error) {
    console.error("Get draft error:", error);
    return errorResponse(error, "An error occurred while fetching the draft");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to create a draft", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const { id } = await params;
    const { member, missingLeague } = await requireMember(id, session.user.email);
    if (missingLeague) {
      return NextResponse.json({ error: "League not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (!member || member.membership.role !== "COMMISSIONER") {
      return NextResponse.json(
        { error: "Only the commissioner can create a draft", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body.draftType !== undefined && body.draftType !== "SNAKE" && body.draftType !== "LINEAR") {
      return NextResponse.json(
        { error: "draftType must be SNAKE or LINEAR", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const draftType = body.draftType === "LINEAR" ? DraftType.LINEAR : DraftType.SNAKE;
    const secondsPerPick = Number(body.secondsPerPick ?? 90);
    const totalRounds = Number(body.totalRounds ?? 15);
    if (
      !Number.isInteger(secondsPerPick) ||
      secondsPerPick < 5 ||
      secondsPerPick > 3600 ||
      !Number.isInteger(totalRounds) ||
      totalRounds < 1 ||
      totalRounds > 50
    ) {
      return NextResponse.json(
        { error: "Invalid draft settings", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const teams = await prisma.team.findMany({
      where: { leagueId: id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (teams.length === 0) {
      return NextResponse.json(
        { error: "A league needs teams before creating a draft", code: "NO_TEAMS" },
        { status: 400 },
      );
    }
    const league = await prisma.league.findUnique({
      where: { id },
      select: { settings: { select: { rosterSize: true } } },
    });
    if (!league?.settings) {
      return NextResponse.json(
        { error: "League settings are required before creating a draft", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    if (totalRounds > league.settings.rosterSize) {
      return NextResponse.json(
        { error: `totalRounds cannot exceed rosterSize (${league.settings.rosterSize})`, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const existing = await prisma.draft.findFirst({ where: { leagueId: id } });
    if (existing) {
      return NextResponse.json(
        { error: "This league already has a draft", code: "DRAFT_EXISTS" },
        { status: 409 },
      );
    }

    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: "scheduledAt must be a valid date", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const shuffled = shuffleDraftOrder(teams);
    const draft = await prisma.$transaction(async (tx) => {
      const created = await tx.draft.create({
        data: {
          leagueId: id,
          draftType,
          secondsPerPick,
          totalRounds,
          scheduledAt,
        },
      });
      await tx.draftOrder.createMany({
        data: shuffled.map((team, index) => ({
          draftId: created.id,
          teamId: team.id,
          position: index + 1,
        })),
      });
      return created;
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    console.error("Create draft error:", error);
    return errorResponse(error, "An error occurred while creating the draft");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to update the draft", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const { id } = await params;
    const { member, missingLeague } = await requireMember(id, session.user.email);
    if (missingLeague) {
      return NextResponse.json({ error: "League not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (!member || member.membership.role !== "COMMISSIONER") {
      return NextResponse.json(
        { error: "Only the commissioner can update the draft", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const draft = await prisma.draft.findFirst({
      where: { leagueId: id },
      include: { draftOrder: true, league: { select: { teams: { select: { id: true } } } } },
    });
    if (!draft) {
      return NextResponse.json({ error: "Draft not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (action === "randomize-order" || action === "set-order") {
      if (draft.status !== DraftStatus.SCHEDULED) {
        return NextResponse.json(
          { error: "Draft order can only change before the draft starts", code: "INVALID_STATUS" },
          { status: 400 },
        );
      }
      const teamIds =
        action === "set-order"
          ? body.teamIds
          : shuffleDraftOrder(draft.league.teams.map((team) => team.id));
      if (
        !Array.isArray(teamIds) ||
        teamIds.length !== draft.league.teams.length ||
        new Set(teamIds).size !== teamIds.length ||
        teamIds.some((teamId) => !draft.league.teams.some((team) => team.id === teamId))
      ) {
        return NextResponse.json(
          { error: "Order must contain every league team exactly once", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      await prisma.$transaction([
        prisma.draftOrder.deleteMany({ where: { draftId: draft.id } }),
        prisma.draftOrder.createMany({
          data: teamIds.map((teamId: string, index: number) => ({
            draftId: draft.id,
            teamId,
            position: index + 1,
          })),
        }),
      ]);
    } else if (action === "update-settings") {
      if (draft.status !== DraftStatus.SCHEDULED) {
        return NextResponse.json(
          { error: "Settings can only change while the draft is scheduled", code: "INVALID_STATUS" },
          { status: 400 },
        );
      }
      const data: Prisma.DraftUpdateInput = {};
      if ("draftType" in body) {
        if (body.draftType !== "SNAKE" && body.draftType !== "LINEAR") {
          return NextResponse.json(
            { error: "draftType must be SNAKE or LINEAR", code: "VALIDATION_ERROR" },
            { status: 400 },
          );
        }
        data.draftType = body.draftType;
      }
      if ("secondsPerPick" in body) {
        if (!Number.isInteger(body.secondsPerPick) || body.secondsPerPick < 5 || body.secondsPerPick > 3600) {
          return NextResponse.json(
            { error: "secondsPerPick must be an integer from 5 to 3600", code: "VALIDATION_ERROR" },
            { status: 400 },
          );
        }
        data.secondsPerPick = body.secondsPerPick;
      }
      if ("totalRounds" in body) {
        if (!Number.isInteger(body.totalRounds) || body.totalRounds < 1 || body.totalRounds > 50) {
          return NextResponse.json(
            { error: "totalRounds must be an integer from 1 to 50", code: "VALIDATION_ERROR" },
            { status: 400 },
          );
        }
        const settings = await prisma.leagueSettings.findUnique({
          where: { leagueId: id },
          select: { rosterSize: true },
        });
        if (!settings || body.totalRounds > settings.rosterSize) {
          return NextResponse.json(
            { error: `totalRounds cannot exceed rosterSize (${settings?.rosterSize ?? "unknown"})`, code: "VALIDATION_ERROR" },
            { status: 400 },
          );
        }
        data.totalRounds = body.totalRounds;
      }
      if ("scheduledAt" in body) {
        if (body.scheduledAt === null || body.scheduledAt === "") {
          data.scheduledAt = null;
        } else {
          const scheduledAt = new Date(String(body.scheduledAt));
          if (Number.isNaN(scheduledAt.getTime())) {
            return NextResponse.json(
              { error: "scheduledAt must be a valid date", code: "VALIDATION_ERROR" },
              { status: 400 },
            );
          }
          data.scheduledAt = scheduledAt;
        }
      }
      await prisma.draft.update({ where: { id: draft.id }, data });
    } else if (action === "start") {
      if (draft.status !== DraftStatus.SCHEDULED) {
        return NextResponse.json({ error: "Draft cannot be started twice", code: "INVALID_STATUS" }, { status: 400 });
      }
      if (draft.draftOrder.length !== draft.league.teams.length) {
        return NextResponse.json({ error: "Draft needs a full draft order", code: "INCOMPLETE_ORDER" }, { status: 400 });
      }
      const now = new Date();
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: DraftStatus.IN_PROGRESS,
          startedAt: now,
          currentRound: 1,
          currentPick: 1,
          pickDeadline: new Date(now.getTime() + draft.secondsPerPick * 1000),
        },
      });
    } else if (action === "pause") {
      if (draft.status !== DraftStatus.IN_PROGRESS) {
        return NextResponse.json({ error: "Only an in-progress draft can be paused", code: "INVALID_STATUS" }, { status: 400 });
      }
      await prisma.draft.update({
        where: { id: draft.id },
        data: { status: DraftStatus.PAUSED, pickDeadline: null },
      });
    } else if (action === "resume") {
      if (draft.status !== DraftStatus.PAUSED) {
        return NextResponse.json({ error: "Only a paused draft can be resumed", code: "INVALID_STATUS" }, { status: 400 });
      }
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: DraftStatus.IN_PROGRESS,
          pickDeadline: new Date(Date.now() + draft.secondsPerPick * 1000),
        },
      });
    } else {
      return NextResponse.json({ error: "Unknown draft action", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const updated = await prisma.draft.findUnique({ where: { id: draft.id } });
    if (!updated) {
      return NextResponse.json({ error: "Draft not found", code: "NOT_FOUND" }, { status: 404 });
    }
    publishDraftState({
      leagueId: id,
      draftId: updated.id,
      status: updated.status,
      currentRound: updated.currentRound,
      currentPick: updated.currentPick,
      pickDeadline: updated.pickDeadline,
    });
    return NextResponse.json({ draft: updated });
  } catch (error) {
    console.error("Update draft error:", error);
    return errorResponse(error, "An error occurred while updating the draft");
  }
}
