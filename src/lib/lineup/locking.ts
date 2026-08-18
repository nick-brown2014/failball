import { GameStatus, LineupSlot } from "@prisma/client";
import type { FailballPlayer } from "@/lib/players";

export interface LockGame {
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  status: GameStatus;
}

export function nflTeamForPlayer(
  externalPlayerId: string,
  playerMap: Map<string, Pick<FailballPlayer, "nflTeam">>,
): string | null {
  const unitMatch = /^(?:ST|DEF):(.+)$/i.exec(externalPlayerId);
  return unitMatch?.[1]?.toUpperCase() ?? playerMap.get(externalPlayerId)?.nflTeam?.toUpperCase() ?? null;
}

export function lockedPlayerIds(
  playerIds: string[],
  playerMap: Map<string, Pick<FailballPlayer, "nflTeam">>,
  games: LockGame[],
  now = new Date(),
): Set<string> {
  return new Set(
    playerIds.filter((id) => {
      const nflTeam = nflTeamForPlayer(id, playerMap);
      if (!nflTeam) return false;
      return games.some(
        (game) =>
          (game.homeTeam.toUpperCase() === nflTeam || game.awayTeam.toUpperCase() === nflTeam) &&
          (game.kickoff <= now || game.status !== GameStatus.SCHEDULED),
      );
    }),
  );
}

export function lockedAssignmentChanges(
  current: Map<string, LineupSlot>,
  desired: Map<string, LineupSlot>,
  lockedIds: Set<string>,
): string[] {
  return [...lockedIds].filter((id) => current.get(id) !== desired.get(id));
}
