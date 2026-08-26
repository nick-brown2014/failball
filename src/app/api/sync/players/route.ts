/**
 * Player + injury sync (free Sleeper metadata).
 *
 * Cadence: daily, plus a few times per day on game days for injury churn.
 * `POST /api/sync/players` with the cron secret.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Position } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireCronAuth } from "@/lib/cron";
import { getPlayerProvider } from "@/lib/nfl";
import { getPlayerIdCrosswalk } from "@/lib/nfl/providers/playerIds";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POSITIONS = new Set<string>(Object.values(Position));

function toPosition(value?: string | null): Position | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return POSITIONS.has(upper) ? (upper as Position) : null;
}

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const provider = getPlayerProvider();

  try {
    const players = await provider.getPlayers();
    const existingPlayers = await prisma.player.findMany({
      select: { externalPlayerId: true, gsisId: true },
    });
    const existingByExternalId = new Map(
      existingPlayers.map((player) => [player.externalPlayerId, player]),
    );
    const gsisOwners = new Map(
      existingPlayers
        .filter((player): player is { externalPlayerId: string; gsisId: string } => player.gsisId != null)
        .map((player) => [player.gsisId, player.externalPlayerId]),
    );
    let upserted = 0;

    for (const player of players) {
      const existing = existingByExternalId.get(player.externalPlayerId);
      const requestedGsisId = player.gsisId ?? existing?.gsisId ?? null;
      const currentOwner = requestedGsisId ? gsisOwners.get(requestedGsisId) : undefined;
      const gsisId =
        currentOwner && currentOwner !== player.externalPlayerId
          ? existing?.gsisId ?? null
          : requestedGsisId;
      const data = {
        fullName: player.fullName,
        position: toPosition(player.position),
        nflTeam: player.nflTeam ?? null,
        injuryStatus: player.injuryStatus ?? null,
        active: player.active ?? true,
        gsisId,
        sleeperId: player.sleeperId ?? null,
        sportsDataId: player.sportsDataId ?? null,
        chartingId: player.chartingId ?? null,
      };
      await prisma.player.upsert({
        where: { externalPlayerId: player.externalPlayerId },
        create: { externalPlayerId: player.externalPlayerId, ...data },
        update: data,
      });
      if (existing?.gsisId && existing.gsisId !== gsisId) {
        gsisOwners.delete(existing.gsisId);
      }
      if (gsisId) gsisOwners.set(gsisId, player.externalPlayerId);
      existingByExternalId.set(player.externalPlayerId, {
        externalPlayerId: player.externalPlayerId,
        gsisId,
      });
      upserted += 1;
    }

    const crosswalkRows = await getPlayerIdCrosswalk();
    const crosswalkBySleeperId = new Map(
      crosswalkRows.map((row) => [row.sleeperId, row.gsisId]),
    );
    const syncedPlayers = await prisma.player.findMany({
      select: {
        externalPlayerId: true,
        gsisId: true,
        active: true,
        nflTeam: true,
      },
    });
    const syncedByExternalId = new Map(
      syncedPlayers.map((player) => [player.externalPlayerId, player]),
    );
    const syncedGsisOwners = new Map<
      string,
      (typeof syncedPlayers)[number]
    >();
    for (const player of syncedPlayers) {
      if (player.gsisId) syncedGsisOwners.set(player.gsisId, player);
    }
    let conflicts = 0;

    for (const [sleeperId, gsisId] of crosswalkBySleeperId) {
      const target = syncedByExternalId.get(sleeperId);
      if (!target || target.gsisId === gsisId) continue;
      const owner = syncedGsisOwners.get(gsisId);
      if (owner && owner.externalPlayerId !== target.externalPlayerId) {
        conflicts += 1;
        const targetPreferred = target.active && target.nflTeam != null;
        const ownerPreferred = owner.active && owner.nflTeam != null;
        if (!targetPreferred || ownerPreferred) continue;
        await prisma.player.update({
          where: { externalPlayerId: owner.externalPlayerId },
          data: { gsisId: null },
        });
        syncedGsisOwners.delete(gsisId);
      }
      if (target.gsisId && target.gsisId !== gsisId) {
        syncedGsisOwners.delete(target.gsisId);
      }
      await prisma.player.update({
        where: { externalPlayerId: target.externalPlayerId },
        data: { gsisId },
      });
      target.gsisId = gsisId;
      syncedGsisOwners.set(gsisId, target);
    }

    const gsisIdsFilled = [...crosswalkBySleeperId].filter(
      ([sleeperId, gsisId]) => syncedByExternalId.get(sleeperId)?.gsisId === gsisId,
    ).length;

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      players: upserted,
      crosswalk: {
        rows: crosswalkRows.length,
        gsisIdsFilled,
        conflicts,
      },
    });
  } catch (error) {
    console.error("sync/players failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
