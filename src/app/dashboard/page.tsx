"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import { getMockUserData, getLeagueStandings, getTeamOwnerName, type MockUserData, type MockTeam } from "@/lib/mockData";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  memberships: Array<{
    id: string;
    role: string;
    league: {
      id: string;
      name: string;
      season: number;
    };
  }>;
  teams: Array<{
    id: string;
    name: string;
    league: {
      id: string;
      name: string;
    };
  }>;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [useMockData, setUseMockData] = useState(false);
  const [mockUserData, setMockUserData] = useState<MockUserData | null>(null);
  const [leagueStandings, setLeagueStandings] = useState<MockTeam[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUserData(data.user);
        } else {
          // Fall back to mock data if API fails
          setUseMockData(true);
          setMockUserData(getMockUserData("user_1"));
          setLeagueStandings(getLeagueStandings());
        }
      } catch {
        // Fall back to mock data on error
        setUseMockData(true);
        setMockUserData(getMockUserData("user_1"));
        setLeagueStandings(getLeagueStandings());
      } finally {
        setLoading(false);
      }
    };

    if (status === "authenticated") {
      fetchUserData();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  const handleStartEditing = () => {
    const currentName = useMockData 
      ? mockUserData?.name || "" 
      : userData?.name || session?.user?.name || "";
    setEditedName(currentName);
    setIsEditingName(true);
    setError("");
  };

  const handleCancelEditing = () => {
    setIsEditingName(false);
    setEditedName("");
    setError("");
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) {
      setError("Name cannot be empty");
      return;
    }

    setIsSavingName(true);
    setError("");

    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: editedName.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        if (userData) {
          setUserData({ ...userData, name: data.user.name });
        }
        setIsEditingName(false);
        setEditedName("");
      } else {
        const errorData = await res.json();
        setError(errorData.error || "Failed to update name");
      }
    } catch {
      setError("An error occurred while updating your name");
    } finally {
      setIsSavingName(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="mb-4">You must be signed in to view this page.</p>
          <Link
            href="/auth/signin"
            className="text-orange-600 hover:text-orange-500"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // Determine which data source to use
  const displayData = useMockData ? mockUserData : userData;
  const displayName = useMockData 
    ? mockUserData?.name 
    : (session?.user?.name || session?.user?.email);

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            {useMockData && (
              <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                Demo Mode
              </span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              Sign Out
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="mb-4">
            {isEditingName ? (
              <div className="flex items-center gap-3">
                <span className="text-xl font-semibold">Welcome,</span>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="px-3 py-1 text-xl font-semibold border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-gray-700"
                  disabled={isSavingName}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") handleCancelEditing();
                  }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="px-3 py-1 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {isSavingName ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancelEditing}
                  disabled={isSavingName}
                  className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Welcome, {displayName}!</h2>
                {!useMockData && (
                  <button
                    onClick={handleStartEditing}
                    className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
                    title="Edit name"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
          
          {displayData && (
            <div className="space-y-2 text-gray-600 dark:text-gray-300">
              <p><span className="font-medium">Email:</span> {displayData.email}</p>
              <p><span className="font-medium">Member since:</span> {new Date(displayData.createdAt).toLocaleDateString()}</p>
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-orange-600 hover:text-orange-500"
            >
              Reset password
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Your Leagues</h2>
            {displayData?.memberships && displayData.memberships.length > 0 ? (
              <ul className="space-y-2">
                {displayData.memberships.map((membership) => (
                  <a href={`/leagues/${membership.league.id}`} key={membership.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <div>
                      <span className="font-medium">{membership.league.name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                        ({membership.league.season})
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      membership.role === "COMMISSIONER" 
                        ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" 
                        : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                    }`}>
                      {membership.role}
                    </span>
                  </a>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">
                You haven&apos;t joined any leagues yet.
              </p>
            )}
            <button className="mt-4 w-full py-2 px-4 border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50 dark:hover:bg-gray-700">
              Join or Create a League
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Your Teams</h2>
            {displayData?.teams && displayData.teams.length > 0 ? (
              <ul className="space-y-2">
                {displayData.teams.map((team) => (
                  <li key={team.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="font-medium">{team.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {team.league.name}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">
                You don&apos;t have any teams yet.
              </p>
            )}
          </div>
        </div>

        {useMockData && leagueStandings.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">League Standings - Fumble Factory League</h2>
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
                  {leagueStandings.map((team, index) => (
                    <tr 
                      key={team.id} 
                      className={`border-b dark:border-gray-700 ${
                        team.userId === "user_1" ? "bg-orange-50 dark:bg-orange-900/20" : ""
                      }`}
                    >
                      <td className="py-3 px-2 font-medium">{index + 1}</td>
                      <td className="py-3 px-2">
                        <span className="font-medium">{team.name}</span>
                        {team.userId === "user_1" && (
                          <span className="ml-2 text-xs text-orange-600">(You)</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-600 dark:text-gray-400">
                        {getTeamOwnerName(team.id)}
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
                        {team.pointsFor.toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-500">
                        {team.pointsAgainst.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
