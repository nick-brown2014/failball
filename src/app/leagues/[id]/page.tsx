"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLeagueNav } from "@/components/league/LeagueContext";

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loading, error, errorCode, myTeamId } = useLeagueNav();

  useEffect(() => {
    if (loading || error) return;
    router.replace(myTeamId ? `/leagues/${id}/teams/${myTeamId}` : `/leagues/${id}/overview`);
  }, [error, id, loading, myTeamId, router]);

  if (loading || !error) {
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
