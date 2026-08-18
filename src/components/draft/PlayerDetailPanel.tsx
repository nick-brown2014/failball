"use client";

interface PlayerDetail {
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  injuryStatus: string | null;
}

export default function PlayerDetailPanel({
  player,
}: {
  player: PlayerDetail | null;
}) {
  if (!player) {
    return (
      <aside className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <h2 className="text-lg font-semibold">Player details</h2>
        <p className="mt-4 text-sm text-gray-500">
          Select a player to see their profile.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{player.fullName}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {player.position ?? "Position TBD"} · {player.nflTeam || "Free agent"}
          </p>
        </div>
        <span className="rounded bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
          {player.injuryStatus || "Healthy"}
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
          <dt className="text-gray-500">Position</dt>
          <dd className="mt-1 font-semibold">{player.position || "—"}</dd>
        </div>
        <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
          <dt className="text-gray-500">NFL team</dt>
          <dd className="mt-1 font-semibold">{player.nflTeam || "—"}</dd>
        </div>
      </dl>
      {/* Stats and projections are Phase 5 stubs; keep them here for a one-file fill-in later. */}
      <div className="mt-5 space-y-3">
        <div className="rounded border border-dashed border-gray-300 p-3 dark:border-gray-600">
          <h3 className="text-sm font-semibold">Season stats</h3>
          <p className="mt-1 text-xs text-gray-500">Stats will populate in Phase 5.</p>
        </div>
        <div className="rounded border border-dashed border-gray-300 p-3 dark:border-gray-600">
          <h3 className="text-sm font-semibold">Projections and ADP</h3>
          <p className="mt-1 text-xs text-gray-500">Projections will populate in Phase 5.</p>
        </div>
      </div>
    </aside>
  );
}
