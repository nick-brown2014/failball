/**
 * Shared auth for scheduled-job routes.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; we also accept
 * `x-cron-secret` so the jobs can be triggered by any scheduler or by hand.
 */

import { NextResponse, type NextRequest } from "next/server";

export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
}

/** Returns a 401 response when the request is not an authorized cron call. */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  if (isAuthorizedCronRequest(request)) return null;
  return NextResponse.json(
    { error: "Unauthorized: missing or invalid cron secret" },
    { status: 401 },
  );
}
