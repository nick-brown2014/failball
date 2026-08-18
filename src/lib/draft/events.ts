import { publishDraftUpdate } from "@/lib/realtime/events";
import type { DraftPickResult } from "./service";

export function publishDraftPick(result: DraftPickResult) {
  return publishDraftUpdate({
    leagueId: result.leagueId,
    draftId: result.draftId,
    status: result.status,
    currentRound: result.currentRound,
    currentPick: result.currentPick,
    pickDeadline: result.pickDeadline?.toISOString() ?? null,
    pick: {
      pickNumber: result.pick.pickNumber,
      round: result.pick.round,
      teamId: result.pick.teamId,
      externalPlayerId: result.pick.externalPlayerId,
      autopick: result.autopick,
    },
  });
}

export function publishDraftState(state: {
  leagueId: string;
  draftId: string;
  status: string;
  currentRound: number;
  currentPick: number;
  pickDeadline: Date | null;
}) {
  return publishDraftUpdate({
    ...state,
    pickDeadline: state.pickDeadline?.toISOString() ?? null,
  });
}
