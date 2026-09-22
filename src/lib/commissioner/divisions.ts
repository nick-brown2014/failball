export const MAX_DIVISION_NAME_LENGTH = 40;

/** Trimmed, non-empty division name within the length limit, else null. */
export function parseDivisionName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_DIVISION_NAME_LENGTH) return null;
  return name;
}
