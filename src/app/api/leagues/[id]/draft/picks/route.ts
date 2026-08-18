import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { publishDraftPick } from "@/lib/draft/events";
import { resolveDraftOrder } from "@/lib/draft/order";
import {
  DraftServiceError,
  makeDraftPick,
  settleExpiredDraftPicks,
} from "@/lib/draft/service";
import { getDraftMember } from "@/lib/draft/state";
import prisma from "@/lib/prisma";

function responseForError(error: unknown) {
  const code =
    error instanceof DraftServiceError
      ? error.code
      : error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "INTERNAL_ERROR";
  const status =
    code === "INTERNAL_ERROR" ? 500 : code === "STALE_PICK" ? 409 : 400;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to make pick", code },
    { status },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to make a pick", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const { id } = await params;
    const member = await getDraftMember(id, session.user.email);
    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const draft = await prisma.draft.findFirst({
      where: { leagueId: id },
      include: { draftOrder: true },
    });
    if (!draft) {
      return NextResponse.json({ error: "Draft not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const expired = await settleExpiredDraftPicks(draft.id);
    expired.forEach(publishDraftPick);

    const current = await prisma.draft.findUnique({
      where: { id: draft.id },
      include: { draftOrder: true },
    });
    if (!current || current.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Draft is not in progress", code: "DRAFT_NOT_IN_PROGRESS" },
        { status: 400 },
      );
    }
    const orderPosition = resolveDraftOrder(
      current.currentPick,
      current.draftOrder.length,
      current.draftType,
    ).orderPosition;
    const onClock = current.draftOrder.find((entry) => entry.position === orderPosition);
    if (!onClock || onClock.teamId !== member.team?.id) {
      return NextResponse.json(
        { error: "It is not your turn", code: "NOT_ON_CLOCK" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.externalPlayerId !== "string" || !body.externalPlayerId) {
      return NextResponse.json(
        { error: "externalPlayerId is required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const result = await makeDraftPick({
      draftId: current.id,
      externalPlayerId: body.externalPlayerId,
      expectedPick: current.currentPick,
    });
    publishDraftPick(result);
    return NextResponse.json({ pick: result.pick, draft: result });
  } catch (error) {
    console.error("Make draft pick error:", error);
    return responseForError(error);
  }
}
