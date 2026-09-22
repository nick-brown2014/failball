import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import {
  MAX_DIVISION_NAME_LENGTH,
  parseDivisionName,
} from "@/lib/commissioner/divisions";
import prisma from "@/lib/prisma";

type Params = { params: Promise<{ id: string; divisionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, divisionId } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;

    const body = await request.json().catch(() => null);
    const name = parseDivisionName(body?.name);
    if (!name) {
      return commissionerError(
        `A division name between 1 and ${MAX_DIVISION_NAME_LENGTH} characters is required`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const existing = await prisma.division.findFirst({
      where: { id: divisionId, leagueId: id },
      select: { id: true },
    });
    if (!existing) {
      return commissionerError("Division not found", "NOT_FOUND", 404);
    }

    const division = await prisma.division.update({
      where: { id: divisionId },
      data: { name },
      select: { id: true, name: true, order: true },
    });
    return NextResponse.json({ division });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return commissionerError(
        "A division with that name already exists",
        "DUPLICATE_NAME",
        409,
      );
    }
    console.error("Commissioner division update error:", error);
    return commissionerError(
      "An error occurred while updating the division",
      "INTERNAL_ERROR",
      500,
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, divisionId } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;

    const deleted = await prisma.division.deleteMany({
      where: { id: divisionId, leagueId: id },
    });
    if (deleted.count === 0) {
      return commissionerError("Division not found", "NOT_FOUND", 404);
    }
    return NextResponse.json({ deletedDivisionId: divisionId });
  } catch (error) {
    console.error("Commissioner division delete error:", error);
    return commissionerError(
      "An error occurred while deleting the division",
      "INTERNAL_ERROR",
      500,
    );
  }
}
