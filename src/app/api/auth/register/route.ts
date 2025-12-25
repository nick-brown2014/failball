import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    // SECURITY FIX: Always hash the password to prevent timing attacks
    // This ensures the response time is consistent whether the user exists or not
    const hashedPassword = await bcrypt.hash(password, 12);

    if (existingUser) {
      // SECURITY FIX: Return a generic success message to prevent account enumeration
      // An attacker cannot determine if an email is registered based on the response
      return NextResponse.json(
        {
          message: "If this email is not already registered, your account has been created. Please check your email to verify your account.",
        },
        { status: 200 }
      );
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
      },
    });

    // Return the same generic message for new registrations
    // This prevents attackers from distinguishing between new and existing accounts
    return NextResponse.json(
      {
        message: "If this email is not already registered, your account has been created. Please check your email to verify your account.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "An error occurred during registration" },
      { status: 500 }
    );
  }
}
