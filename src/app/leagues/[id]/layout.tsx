"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LeagueHeader from "@/components/league/LeagueHeader";
import {
  LeagueNavProvider,
  type LeagueNavValue,
} from "@/components/league/LeagueContext";

interface LeaguePayload {
  league: {
    id: string;
    name: string;
    season: number;
    memberships: Array<{ role: string; user: { id: string } }>;
    teams: Array<{ id: string; name: string; user: { id: string } }>;
  };
  role: string;
  userId: string;
  activeSeason?: LeagueNavValue["activeSeason"];
}

export default function LeagueLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<LeaguePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leagues/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as LeaguePayload & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load league");
        if (!cancelled) setPayload(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const value: LeagueNavValue = {
    leagueId: id,
    leagueName: payload?.league.name ?? "",
    leagueSeason: payload?.league.season ?? 0,
    activeSeason: payload?.activeSeason,
    role: payload?.role ?? "",
    userId: payload?.userId ?? "",
    myTeamId:
      payload?.league.teams.find((team) => team.user.id === payload.userId)?.id ??
      null,
    myTeamName:
      payload?.league.teams.find((team) => team.user.id === payload.userId)?.name ??
      null,
    loading,
    error,
  };

  if (loading && !payload) {
    return <div className="flex min-h-screen items-center justify-center">Loading league...</div>;
  }

  return (
    <LeagueNavProvider value={value}>
      {payload && <LeagueHeader />}
      {children}
    </LeagueNavProvider>
  );
}
