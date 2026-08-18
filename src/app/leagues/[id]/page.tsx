"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface LeagueData {
  id: string;
  name: string;
  season: number;
  maxTeams: number;
  isActive: boolean;
  isPublic: boolean;
  memberships: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
  teams: Array<{
    id: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: string | number;
    pointsAgainst: string | number;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
}

interface Invite {
  code: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
}

export default function LeaguePage() {
  const params = useParams<{ id: string }>();
  const { status } = useSession();
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetch(`/api/leagues/${params.id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setErrorCode(data.code || "INTERNAL_ERROR");
          throw new Error(data.error || "Unable to load league");
        }
        setLeague(data.league);
        setRole(data.role);
        setUserId(data.userId);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id, status]);

  const createInvite = async () => {
    setInviteError("");

    try {
      const response = await fetch(`/api/leagues/${params.id}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        setInviteError(data.error || "Unable to create invite");
        return;
      }

      setInvite(data.invite);
    } catch {
      setInviteError("Unable to create invite");
    }
  };

  const copyInvite = async () => {
    if (!invite) {
      return;
    }

    await navigator.clipboard.writeText(invite.code);
    setCopyMessage("Copied");
    setTimeout(() => setCopyMessage(""), 1500);
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <Link href="/auth/signin" className="text-orange-600">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (error || !league) {
    const notFound = errorCode === "NOT_FOUND";
    const forbidden = errorCode === "FORBIDDEN";

    return (
      <div className="font-sans min-h-screen w-full">
        <Navigation />
        <main className="container mx-auto max-w-6xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">
            {notFound
              ? "League Not Found"
              : forbidden
                ? "Access Denied"
                : "Unable to Load League"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || "The league could not be found."}
          </p>
          <Link
            href="/dashboard"
            className="text-orange-600 hover:text-orange-500"
          >
            Return to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-orange-600 hover:text-orange-500 mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">{league.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Season {league.season} &bull; {league.maxTeams} Teams
            </p>
          </div>
          {role === "COMMISSIONER" && (
            <div className="flex gap-2">
              <Link
                href={`/leagues/${league.id}/draft`}
                className="px-4 py-2 border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50 dark:hover:bg-gray-700"
              >
                Draft Room
              </Link>
              <Link
                href={`/leagues/${league.id}/settings`}
                className="px-4 py-2 border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50 dark:hover:bg-gray-700"
              >
                Settings
              </Link>
              <button
                onClick={createInvite}
                className="px-4 py-2 text-white bg-orange-600 rounded-md hover:bg-orange-700"
              >
                Invite
              </button>
            </div>
          )}
          {role !== "COMMISSIONER" && (
            <Link
              href={`/leagues/${league.id}/draft`}
              className="px-4 py-2 border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50 dark:hover:bg-gray-700"
            >
              Draft Room
            </Link>
          )}
        </div>

        {inviteError && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {inviteError}
          </div>
        )}
        {invite && (
          <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  Share this invite code
                </p>
                <p className="text-2xl font-bold tracking-widest">
                  {invite.code}
                </p>
              </div>
              <button
                onClick={copyInvite}
                className="rounded-md border border-orange-600 px-3 py-2 text-sm text-orange-700 hover:bg-orange-100 dark:text-orange-300"
              >
                {copyMessage || "Copy code"}
              </button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">League Standings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-3 px-2">Rank</th>
                    <th className="text-left py-3 px-2">Team</th>
                    <th className="text-left py-3 px-2">Owner</th>
                    <th className="text-center py-3 px-2">W</th>
                    <th className="text-center py-3 px-2">L</th>
                    <th className="text-center py-3 px-2">T</th>
                    <th className="text-right py-3 px-2">PF</th>
                    <th className="text-right py-3 px-2">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {league.teams.map((team, index) => (
                    <tr
                      key={team.id}
                      className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        team.user.id === userId
                          ? "bg-orange-50 dark:bg-orange-900/20"
                          : ""
                      }`}
                    >
                      <td className="py-3 px-2 font-medium">{index + 1}</td>
                      <td className="py-3 px-2 font-medium">
                        {team.name}
                        {team.user.id === userId && (
                          <span className="ml-2 text-xs text-orange-600">
                            (You)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-600 dark:text-gray-400">
                        {team.user.name || team.user.email}
                      </td>
                      <td className="py-3 px-2 text-center text-green-600 dark:text-green-400 font-medium">
                        {team.wins}
                      </td>
                      <td className="py-3 px-2 text-center text-red-600 dark:text-red-400 font-medium">
                        {team.losses}
                      </td>
                      <td className="py-3 px-2 text-center text-gray-500">
                        {team.ties}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {parseFloat(String(team.pointsFor)).toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-500">
                        {parseFloat(String(team.pointsAgainst)).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Matchups</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Matchups and weekly scores are coming soon.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">League Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Season
                  </span>
                  <span className="font-medium">{league.season}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Teams
                  </span>
                  <span className="font-medium">
                    {league.teams.length} / {league.maxTeams}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Status
                  </span>
                  <span className="font-medium">
                    {league.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Members</h2>
              <ul className="space-y-2">
                {league.memberships.map((membership) => (
                  <li
                    key={membership.id}
                    className="flex justify-between items-center text-sm"
                  >
                    <span>{membership.user.name || membership.user.email}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {membership.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
