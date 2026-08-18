import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface ValidationError {
  field: string;
  message: string;
}

const integerFields = [
  "rosterSize", "benchSize", "qbSlots", "rbSlots", "wrSlots", "teSlots",
  "flexSlots", "stSlots", "defSlots", "irSlots", "regularSeasonWeeks",
  "playoffTeams", "playoffStartWeek", "tradeDeadlineWeek", "waiverProcessDay",
] as const;

const decimalFields = [
  "qbIncompletion", "qbInterception", "qbSack", "qbScramble", "qbFumble", "qbTouchdown",
  "rbNegativeRun", "rbNeutralRun", "rbSuccessfulRun", "rbExplosiveRun", "rbFumble", "rbTouchdown",
  "pcIncompleteTarget", "pcDrop", "pcRouteNotTargeted", "pcNegativeCatch", "pcNeutralCatch",
  "pcSuccessfulCatch", "pcExplosiveCatch", "pcFumble", "pcTouchdown",
  "defTouchdownAllowed", "defFieldGoalAllowed", "defYardsAllowed0to100", "defYardsAllowed100to200",
  "defYardsAllowed200to300", "defYardsAllowed300to400", "defYardsAllowed400to500",
  "defYardsAllowed500plus", "defSack", "defSafety", "defInterception", "defFumbleRecovery",
  "defPickSix", "defFumbleReturnTd", "stMissedExtraPoint", "stMissedFieldGoal",
  "stMadeFieldGoalUnder50", "stMadeFieldGoalOver50", "stKickoffReturnTd", "stKickoffMuffed",
  "stKickoffStuffed", "stPuntReturnTd", "stPuntMuffed", "stPuntStuffed", "stPuntTouchback",
  "stPuntBlocked", "stOnsideKickFail", "stPenaltyExtendDrive",
] as const;

const acceptedFields = new Set<string>([
  ...integerFields,
  ...decimalFields,
  "waiverType",
]);

function validateSettings(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  const data: Record<string, unknown> = {};

  for (const key of Object.keys(body)) {
    if (!acceptedFields.has(key)) {
      errors.push({ field: key, message: "This setting is not supported" });
    }
  }

  for (const field of integerFields) {
    if (!(field in body)) continue;
    const value = body[field];
    const max = field === "waiverProcessDay" ? 6 : field === "playoffTeams" ? 20 : field === "regularSeasonWeeks" || field === "playoffStartWeek" || field === "tradeDeadlineWeek" ? 40 : field === "rosterSize" ? 100 : 50;
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max || (field === "regularSeasonWeeks" && value === 0) || (field === "playoffTeams" && (value as number) < 2)) {
      errors.push({ field, message: `Must be an integer between ${field === "playoffTeams" ? 2 : field === "regularSeasonWeeks" ? 1 : 0} and ${max}` });
    } else {
      data[field] = value;
    }
  }

  if ("waiverType" in body) {
    if (!["ROLLING", "FAAB", "RESET_WEEKLY"].includes(String(body.waiverType))) {
      errors.push({ field: "waiverType", message: "Waiver type must be ROLLING, FAAB, or RESET_WEEKLY" });
    } else {
      data.waiverType = body.waiverType;
    }
  }

  for (const field of decimalFields) {
    if (!(field in body)) continue;
    const value = body[field];
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (!Number.isFinite(number) || Math.abs(number) > 99.99 || Math.round(number * 100) !== number * 100) {
      errors.push({ field, message: "Must be a finite number between -99.99 and 99.99 with at most two decimal places" });
    } else {
      data[field] = number;
    }
  }

  return { errors, data };
}

async function getUserAndMembership(leagueId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { user: null, membership: null };
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  return { user, membership };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "You must be logged in to view settings", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;
    const league = await prisma.league.findUnique({ where: { id }, select: { id: true } });
    if (!league) {
      return NextResponse.json({ error: "League not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const { membership } = await getUserAndMembership(id, session.user.email);
    if (!membership) {
      return NextResponse.json({ error: "You are not a member of this league", code: "FORBIDDEN" }, { status: 403 });
    }
    const settings = await prisma.leagueSettings.findUnique({ where: { leagueId: id } });
    return NextResponse.json({ settings, role: membership.role });
  } catch (error) {
    console.error("Get league settings error:", error);
    return NextResponse.json({ error: "An error occurred while fetching settings", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "You must be logged in to update settings", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;
    const league = await prisma.league.findUnique({ where: { id }, select: { id: true } });
    if (!league) {
      return NextResponse.json({ error: "League not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const { membership } = await getUserAndMembership(id, session.user.email);
    if (membership?.role !== "COMMISSIONER") {
      return NextResponse.json({ error: "Only the commissioner can update settings", code: "FORBIDDEN" }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: [{ field: "body", message: "A JSON object is required" }] }, { status: 400 });
    }
    const { errors, data } = validateSettings(body as Record<string, unknown>);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: errors }, { status: 400 });
    }
    const settings = await prisma.leagueSettings.update({ where: { leagueId: id }, data });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Update league settings error:", error);
    return NextResponse.json({ error: "An error occurred while updating settings", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
