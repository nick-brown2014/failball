import {
  computeScoreWithBreakdown,
  roundPoints,
  type ScorableStats,
  type ScoreBreakdownEntry,
  type ScoringSettings,
} from "@/lib/scoring/computeScore";
import { lineupSlotOrder } from "@/lib/lineup/logic";

export interface MatchupDetailMatchup {
  id: string;
  season: number;
  week: number;
  isComplete: boolean;
  isPlayoff: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
}

export interface MatchupDetailSnapshot {
  externalPlayerId: string;
  position: string;
  slot: string;
}

export interface MatchupDetailPlayerMetadata {
  fullName: string;
  position: string;
  nflTeam: string | null;
}

export interface MatchupDetailInput {
  matchup: MatchupDetailMatchup;
  homeLineup: MatchupDetailSnapshot[];
  awayLineup: MatchupDetailSnapshot[];
  statsByPlayerId: Map<string, ScorableStats>;
  playerMap: Map<string, MatchupDetailPlayerMetadata>;
  settings: Partial<ScoringSettings>;
}

export interface MatchupDetailPlayer {
  externalPlayerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  lineupSlot: string;
  isStarter: boolean;
  stats: ScorableStats;
  points: number;
  breakdown: ScoreBreakdownEntry[];
}

export interface MatchupDetailSide {
  teamId: string;
  teamName: string;
  players: MatchupDetailPlayer[];
  starterTotal: number;
}

export interface MatchupDetailPayload {
  matchup: MatchupDetailMatchup;
  home: MatchupDetailSide;
  away: MatchupDetailSide;
}

function isStartingSlot(slot: string): boolean {
  return slot !== "BENCH" && slot !== "IR";
}

function unitMetadata(externalPlayerId: string): { name: string; nflTeam: string | null } | null {
  const separator = externalPlayerId.indexOf(":");
  if (separator < 1) return null;
  const unit = externalPlayerId.slice(0, separator);
  const nflTeam = externalPlayerId.slice(separator + 1) || null;
  if (unit === "DEF") return { name: `${nflTeam ?? "Team"} Defense`, nflTeam };
  if (unit === "ST") return { name: `${nflTeam ?? "Team"} Special Teams`, nflTeam };
  return null;
}

function sortSnapshots(a: MatchupDetailSnapshot, b: MatchupDetailSnapshot): number {
  const aOrder = lineupSlotOrder.findIndex((slot) => slot === a.slot);
  const bOrder = lineupSlotOrder.findIndex((slot) => slot === b.slot);
  return (aOrder < 0 ? lineupSlotOrder.length : aOrder) -
    (bOrder < 0 ? lineupSlotOrder.length : bOrder) ||
    a.externalPlayerId.localeCompare(b.externalPlayerId);
}

function buildSide(
  team: { id: string; name: string },
  snapshots: MatchupDetailSnapshot[],
  input: MatchupDetailInput,
): MatchupDetailSide {
  const players = [...snapshots].sort(sortSnapshots).map((snapshot) => {
    const metadata = input.playerMap.get(snapshot.externalPlayerId);
    const unit = unitMetadata(snapshot.externalPlayerId);
    const stats = input.statsByPlayerId.get(snapshot.externalPlayerId) ?? {};
    const score = computeScoreWithBreakdown(stats, input.settings);
    const isStarter = isStartingSlot(snapshot.slot);

    return {
      externalPlayerId: snapshot.externalPlayerId,
      name: metadata?.fullName ?? unit?.name ?? snapshot.externalPlayerId,
      position: metadata?.position ?? snapshot.position,
      nflTeam: metadata?.nflTeam ?? unit?.nflTeam ?? null,
      lineupSlot: snapshot.slot,
      isStarter,
      stats,
      points: score.points,
      breakdown: score.breakdown,
    };
  });

  return {
    teamId: team.id,
    teamName: team.name,
    players,
    starterTotal: roundPoints(
      players
        .filter((player) => player.isStarter)
        .reduce((total, player) => total + player.points, 0),
    ),
  };
}

export function buildMatchupDetail(input: MatchupDetailInput): MatchupDetailPayload {
  return {
    matchup: input.matchup,
    home: buildSide(input.matchup.homeTeam, input.homeLineup, input),
    away: buildSide(input.matchup.awayTeam, input.awayLineup, input),
  };
}
