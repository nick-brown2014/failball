/**
 * Shared helpers that turn raw `Transaction` rows (as returned by
 * `GET /api/leagues/[id]/transactions`) into grouped, human-readable activity
 * entries. Pure functions only so both server and client components can use them.
 */

export type ActivityType = "DRAFT" | "TRADE" | "WAIVER" | "FREE_AGENT" | "DROP";
export type ActivityStatus = "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";

export interface ActivityPlayer {
  externalPlayerId: string;
  fullName: string;
  position: string;
  nflTeam: string | null;
}

export interface ActivityTransaction {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  action: string;
  notes: string | null;
  week: number;
  season: number;
  processedAt: string;
  externalPlayerId: string;
  player: ActivityPlayer | null;
  relatedTradeId: string | null;
  relatedWaiverId: string | null;
  team: {
    id: string;
    name: string;
    owner: { id: string; name: string | null; email: string };
  };
}

export interface ActivityGroup {
  key: string;
  type: ActivityType;
  status: ActivityStatus;
  processedAt: string;
  week: number;
  season: number;
  teamIds: string[];
  description: string;
  transactions: ActivityTransaction[];
}

export const ACTIVITY_TYPES: ActivityType[] = [
  "DRAFT",
  "TRADE",
  "WAIVER",
  "FREE_AGENT",
  "DROP",
];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  DRAFT: "Draft",
  TRADE: "Trade",
  WAIVER: "Waiver",
  FREE_AGENT: "Free agent",
  DROP: "Drop",
};

/** Free-agent adds and their matching drop land in the same DB transaction. */
const PAIR_WINDOW_MS = 10_000;

export function playerLabel(entry: ActivityTransaction): string {
  if (!entry.player) return entry.externalPlayerId;
  const team = entry.player.nflTeam ? ` - ${entry.player.nflTeam}` : "";
  return `${entry.player.fullName} (${entry.player.position}${team})`;
}

function playerNames(entries: ActivityTransaction[]): string {
  return entries.map(playerLabel).join(", ");
}

function groupKey(entry: ActivityTransaction): string {
  if (entry.relatedTradeId) {
    return `trade:${entry.relatedTradeId}:${entry.status}`;
  }
  if (entry.relatedWaiverId) {
    return `waiver:${entry.relatedWaiverId}:${entry.status}`;
  }
  return `single:${entry.id}`;
}

function canMerge(group: ActivityTransaction[], entry: ActivityTransaction): boolean {
  const last = group[group.length - 1];
  if (last.team.id !== entry.team.id || last.status !== entry.status) return false;
  if (last.relatedTradeId || last.relatedWaiverId) return false;
  if (entry.relatedTradeId || entry.relatedWaiverId) return false;

  const pairable: ActivityType[] = ["FREE_AGENT", "DROP"];
  if (!pairable.includes(last.type) || !pairable.includes(entry.type)) return false;
  if (group.some((existing) => existing.type === entry.type)) return false;

  const delta = Math.abs(
    new Date(last.processedAt).getTime() - new Date(entry.processedAt).getTime()
  );
  return delta <= PAIR_WINDOW_MS;
}

function tradeDescription(entries: ActivityTransaction[]): string {
  const byTeam = new Map<string, ActivityTransaction[]>();
  for (const entry of entries) {
    const bucket = byTeam.get(entry.team.id);
    if (bucket) bucket.push(entry);
    else byTeam.set(entry.team.id, [entry]);
  }

  const legs = [...byTeam.values()].map(
    (received) => `${received[0].team.name} gets ${playerNames(received)}`
  );

  if (entries[0].status === "REVERSED") {
    return `Trade reversed: ${legs.join("; ")}`;
  }
  return `Trade: ${legs.join("; ")}`;
}

function faabAmount(action: string): string | null {
  const match = /\$([\d.]+)/.exec(action);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function describe(entries: ActivityTransaction[]): string {
  const first = entries[0];
  const teamName = first.team.name;

  if (first.type === "TRADE") {
    return tradeDescription(entries);
  }

  const adds = entries.filter(
    (entry) => entry.type === "FREE_AGENT" || entry.type === "WAIVER"
  );
  const drops = entries.filter((entry) => entry.type === "DROP");
  const drafted = entries.filter((entry) => entry.type === "DRAFT");

  const parts: string[] = [];

  for (const entry of drafted) {
    const autopick = entry.action.toLowerCase().startsWith("auto");
    parts.push(
      `${teamName} ${autopick ? "auto-drafted" : "drafted"} ${playerLabel(entry)}`
    );
  }

  for (const entry of adds) {
    if (entry.type === "WAIVER") {
      const bid = faabAmount(entry.action);
      parts.push(
        `${teamName} won waiver claim on ${playerLabel(entry)}${bid ? ` for ${bid}` : ""}`
      );
    } else {
      parts.push(`${teamName} added ${playerLabel(entry)} (free agent)`);
    }
  }

  if (drops.length > 0) {
    const dropped = `dropped ${playerNames(drops)}`;
    if (parts.length > 0) parts.push(dropped);
    else parts.push(`${teamName} ${dropped}`);
  }

  const description = parts.join(", ") || `${teamName} ${first.action}`;
  return first.status === "REVERSED" ? `Reversed: ${description}` : description;
}

/** Collapses trade legs and add/drop pairs into single feed entries. */
export function groupActivity(
  transactions: ActivityTransaction[]
): ActivityGroup[] {
  const groups: ActivityTransaction[][] = [];
  const byKey = new Map<string, ActivityTransaction[]>();

  for (const entry of transactions) {
    const key = groupKey(entry);
    if (!key.startsWith("single:")) {
      const existing = byKey.get(key);
      if (existing) {
        existing.push(entry);
        continue;
      }
      const created = [entry];
      byKey.set(key, created);
      groups.push(created);
      continue;
    }

    const last = groups[groups.length - 1];
    if (last && canMerge(last, entry)) {
      last.push(entry);
      continue;
    }
    groups.push([entry]);
  }

  return groups.map((entries) => {
    const primary =
      entries.find((entry) => entry.type !== "DROP") ?? entries[0];
    return {
      key: groupKey(primary).startsWith("single:")
        ? entries.map((entry) => entry.id).join("+")
        : groupKey(primary),
      type: primary.type,
      status: primary.status,
      processedAt: entries[0].processedAt,
      week: primary.week,
      season: primary.season,
      teamIds: [...new Set(entries.map((entry) => entry.team.id))],
      description: describe(entries),
      transactions: entries,
    };
  });
}
