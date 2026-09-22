import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import {
  MAX_DIVISION_NAME_LENGTH,
  parseDivisionName,
} from "@/lib/commissioner/divisions";
import prisma from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const count = await prisma.division.count({ where: { leagueId: id } });
    const division = await prisma.division.create({
      data: { leagueId: id, name, order: count },
      select: { id: true, name: true, order: true },
    });
    return NextResponse.json({ division }, { status: 201 });
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
    console.error("Commissioner division create error:", error);
    return commissionerError(
      "An error occurred while creating the division",
      "INTERNAL_ERROR",
      500,
    );
  }
}
