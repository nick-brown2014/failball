"use client";

import { createContext, useContext } from "react";
import type { ActiveSeason } from "@/lib/season/activeSeason";

export interface LeagueNavValue {
  leagueId: string;
  leagueName: string;
  leagueSeason: number;
  activeSeason?: ActiveSeason;
  role: string;
  userId: string;
  myTeamId: string | null;
  myTeamName: string | null;
  loading: boolean;
  error: string;
  errorCode: string;
}

export const LeagueNavContext = createContext<LeagueNavValue | null>(null);

export function LeagueNavProvider({
  value,
  children,
}: {
  value: LeagueNavValue;
  children: React.ReactNode;
}) {
  return (
    <LeagueNavContext.Provider value={value}>
      {children}
    </LeagueNavContext.Provider>
  );
}

export function useLeagueNav(): LeagueNavValue {
  const context = useContext(LeagueNavContext);
  if (!context) {
    throw new Error("useLeagueNav must be used inside LeagueNavProvider");
  }
  return context;
}
