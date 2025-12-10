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

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUserData(data.user);
        } else {
          setError("Failed to load user data");
        }
      } catch {
        setError("An error occurred");
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

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {session?.user?.name || session?.user?.email}!</h2>
          
          {userData && (
            <div className="space-y-2 text-gray-600 dark:text-gray-300">
              <p><span className="font-medium">Email:</span> {userData.email}</p>
              <p><span className="font-medium">Member since:</span> {new Date(userData.createdAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Your Leagues</h2>
            {userData?.memberships && userData.memberships.length > 0 ? (
              <ul className="space-y-2">
                {userData.memberships.map((membership) => (
                  <li key={membership.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span>{membership.league.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {membership.role}
                    </span>
                  </li>
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
            {userData?.teams && userData.teams.length > 0 ? (
              <ul className="space-y-2">
                {userData.teams.map((team) => (
                  <li key={team.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span>{team.name}</span>
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
      </main>
    </div>
  );
}
