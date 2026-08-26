import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, emailNotificationsEnabled } = body;
    const data: {
      name?: string;
      emailNotificationsEnabled?: boolean;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json(
          { error: "Name must be a string" },
          { status: 400 }
        );
      }

      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        );
      }

      if (trimmedName.length > 100) {
        return NextResponse.json(
          { error: "Name cannot exceed 100 characters" },
          { status: 400 }
        );
      }
      data.name = trimmedName;
    }

    if (
      emailNotificationsEnabled !== undefined &&
      typeof emailNotificationsEnabled !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Email notification preference must be a boolean" },
        { status: 400 }
      );
    }
    if (typeof emailNotificationsEnabled === "boolean") {
      data.emailNotificationsEnabled = emailNotificationsEnabled;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No supported user fields were provided" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailNotificationsEnabled: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "An error occurred while updating user data" },
      { status: 500 }
    );
  }
}
