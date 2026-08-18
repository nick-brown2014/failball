"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  memberships: Array<{ id: string; role: string; league: { id: string; name: string; season: number } }>;
  teams: Array<{ id: string; name: string; league: { id: string; name: string } }>;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const fetchUserData = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/me");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load your account");
      setUserData(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your account");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (status === "authenticated") fetchUserData(); else if (status === "unauthenticated") setLoading(false); }, [status]);

  const saveName = async () => {
    if (!editedName.trim()) { setError("Name cannot be empty"); return; }
    setIsSavingName(true); setError("");
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editedName.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update name");
      if (userData) setUserData({ ...userData, name: data.user.name });
      setIsEditingName(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update name"); }
    finally { setIsSavingName(false); }
  };

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (status === "unauthenticated") return <div className="min-h-screen flex items-center justify-center text-center"><div><h1 className="text-2xl font-bold mb-4">Access Denied</h1><p className="mb-4">You must be signed in to view this page.</p><Link href="/auth/signin" className="text-orange-600">Sign in</Link></div></div>;
  if (!userData) return <div className="min-h-screen flex items-center justify-center text-center"><div><h1 className="text-2xl font-bold mb-4">Unable to Load Dashboard</h1><p className="text-red-600 mb-4">{error}</p><button onClick={fetchUserData} className="rounded-md bg-orange-600 px-4 py-2 text-white">Retry</button></div></div>;

  const displayName = userData.name || session?.user?.email || "there";
  return <div className="font-sans min-h-screen w-full"><Navigation /><main className="container mx-auto px-4 py-8 max-w-6xl">
    <div className="flex justify-between items-center mb-8"><h1 className="text-3xl font-bold">Dashboard</h1><button onClick={() => signOut({ callbackUrl: "/" })} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Sign Out</button></div>
    {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}<button onClick={fetchUserData} className="ml-3 underline">Retry</button></div>}
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6"><div className="mb-4">{isEditingName ? <div className="flex items-center gap-3"><span className="text-xl font-semibold">Welcome,</span><input value={editedName} onChange={(event) => setEditedName(event.target.value)} className="px-3 py-1 text-xl font-semibold border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700" autoFocus /><button onClick={saveName} disabled={isSavingName} className="px-3 py-1 text-sm text-white bg-orange-600 rounded-md disabled:opacity-50">{isSavingName ? "Saving..." : "Save"}</button><button onClick={() => setIsEditingName(false)} className="px-3 py-1 text-sm border rounded-md">Cancel</button></div> : <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Welcome, {displayName}!</h2><button onClick={() => { setEditedName(userData.name || ""); setIsEditingName(true); }} className="text-gray-400 hover:text-orange-600" title="Edit name">✎</button></div>}</div>
      <div className="space-y-2 text-gray-600 dark:text-gray-300"><p><span className="font-medium">Email:</span> {userData.email}</p><p><span className="font-medium">Member since:</span> {new Date(userData.createdAt).toLocaleDateString()}</p></div><div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"><Link href="/auth/forgot-password" className="text-sm font-medium text-orange-600">Reset password</Link></div>
    </div>
    <div className="grid md:grid-cols-2 gap-6"><div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"><h2 className="text-xl font-semibold mb-4">Your Leagues</h2>{userData.memberships.length ? <ul className="space-y-2">{userData.memberships.map((membership) => <li key={membership.id}><Link href={`/leagues/${membership.league.id}`} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"><span className="font-medium">{membership.league.name} <span className="text-sm text-gray-500">({membership.league.season})</span></span><span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800">{membership.role}</span></Link></li>)}</ul> : <p className="text-gray-500">You haven&apos;t joined any leagues yet.</p>}<Link href="/leagues/join" className="mt-4 block w-full py-2 px-4 text-center border border-orange-600 text-orange-600 rounded-md hover:bg-orange-50">Join or Create a League</Link></div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"><h2 className="text-xl font-semibold mb-4">Your Teams</h2>{userData.teams.length ? <ul className="space-y-2">{userData.teams.map((team) => <li key={team.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"><span className="font-medium">{team.name}</span><span className="text-sm text-gray-500">{team.league.name}</span></li>)}</ul> : <p className="text-gray-500">You don&apos;t have any teams yet.</p>}</div></div>
  </main></div>;
}
