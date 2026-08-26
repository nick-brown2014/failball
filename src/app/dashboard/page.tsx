"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailNotificationsEnabled: boolean;
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const fetchUserData = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to load your account");
      }

      setUserData(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your account");
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationPreference = async (enabled: boolean) => {
    setIsSavingNotifications(true);
    setError("");

    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emailNotificationsEnabled: enabled }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update email notifications");
      }
      setUserData((current) =>
        current
          ? {
              ...current,
              emailNotificationsEnabled: data.user.emailNotificationsEnabled,
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while updating email notifications",
      );
    } finally {
      setIsSavingNotifications(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchUserData();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  const handleStartEditing = () => {
    setEditedName(userData?.name || session?.user?.name || "");
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

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Unable to Load Dashboard</h1>
          <p className="text-red-600 dark:text-red-400 mb-4">
            {error || "Unable to load your account"}
          </p>
          <button
            onClick={fetchUserData}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const displayData = userData;
  const displayName = session?.user?.name || session?.user?.email;

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
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
                <button
                  onClick={handleStartEditing}
                  className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
                  title="Edit name"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {displayData && (
            <div className="space-y-2 text-gray-600 dark:text-gray-300">
              <p>
                <span className="font-medium">Email:</span> {displayData.email}
              </p>
              <p>
                <span className="font-medium">Member since:</span>{" "}
                {new Date(displayData.createdAt).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium">League event emails</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">
                  Trade updates and waiver claim results
                </span>
              </span>
              <input
                type="checkbox"
                checked={displayData.emailNotificationsEnabled}
                disabled={isSavingNotifications}
                onChange={(event) =>
                  handleNotificationPreference(event.target.checked)
                }
                className="h-5 w-5 accent-orange-600"
              />
            </label>
            <Link
              href="/auth/forgot-password"
              className="mt-4 inline-block text-sm font-medium text-orange-600 hover:text-orange-500"
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
                  <a
                    href={`/leagues/${membership.league.id}`}
                    key={membership.id}
                    className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"
                  >
                    <div>
                      <span className="font-medium">
                        {membership.league.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                        ({membership.league.season})
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        membership.role === "COMMISSIONER"
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                      }`}
                    >
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
            <a
              href="/leagues/join"
              className="mt-4 block w-full py-2 px-4 text-center border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50 dark:hover:bg-gray-700"
            >
              Join or Create a League
            </a>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Your Teams</h2>
            {displayData?.teams && displayData.teams.length > 0 ? (
              <ul className="space-y-2">
                {displayData.teams.map((team) => (
                  <li
                    key={team.id}
                    className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"
                  >
                    <span className="font-medium">{team.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {team.league.name}
                      </span>
                      <Link
                        href={`/leagues/${team.league.id}/teams/${team.id}`}
                        className="text-sm text-orange-600 hover:text-orange-500"
                      >
                        Roster
                      </Link>
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
      </main>
    </div>
  );
}
