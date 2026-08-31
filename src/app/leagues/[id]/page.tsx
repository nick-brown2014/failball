"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface LeagueRedirectPayload {
  league: {
    teams: Array<{ id: string; user: { id: string } }>;
  };
  userId: string;
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leagues/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as LeagueRedirectPayload & {
          error?: string;
          code?: string;
        };
        if (!response.ok) {
          if (!cancelled) {
            setErrorCode(data.code || "INTERNAL_ERROR");
            setError(data.error || "Unable to load league");
          }
          return;
        }
        if (cancelled) return;
        const myTeam = data.league.teams.find((team) => team.user.id === data.userId);
        router.replace(myTeam ? `/leagues/${id}/teams/${myTeam.id}` : `/leagues/${id}/overview`);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorCode("INTERNAL_ERROR");
          setError("Unable to load league");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (!error) {
    return <div className="flex min-h-screen items-center justify-center">Loading league...</div>;
  }

  const notFound = errorCode === "NOT_FOUND";
  const forbidden = errorCode === "FORBIDDEN";
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="mb-4 text-2xl font-bold">
          {notFound ? "League Not Found" : forbidden ? "Access Denied" : "Unable to Load League"}
        </h1>
        <p className="mb-4 text-gray-600 dark:text-gray-400">{error}</p>
        <Link href="/dashboard" className="text-orange-600 hover:text-orange-500">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
