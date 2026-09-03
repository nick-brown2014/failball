import { describe, expect, it } from "vitest";
import { resolveActiveSeason } from "@/lib/season/activeSeason";

describe("resolveActiveSeason", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");

  it("uses the current season when there is no final game", () => {
    expect(
      resolveActiveSeason({ leagueSeason: 2024, finalPlayoffGameAt: null, now }),
    ).toEqual({
      season: 2024,
      leagueSeason: 2024,
      isUpcoming: false,
      rolloverAt: null,
    });
  });

  it("rolls over exactly thirty days after the final game", () => {
    const finalPlayoffGameAt = new Date("2024-01-01T00:00:00.000Z");
    expect(
      resolveActiveSeason({
        leagueSeason: 2024,
        finalPlayoffGameAt,
        now: new Date("2024-01-31T00:00:00.000Z"),
      }),
    ).toEqual({
      season: 2025,
      leagueSeason: 2024,
      isUpcoming: true,
      rolloverAt: "2024-01-31T00:00:00.000Z",
    });
  });

  it("does not roll over before the thirty-day boundary", () => {
    const finalPlayoffGameAt = new Date("2024-01-01T00:00:00.000Z");
    expect(
      resolveActiveSeason({
        leagueSeason: 2024,
        finalPlayoffGameAt,
        now: new Date("2024-01-30T23:00:00.000Z"),
      }).isUpcoming,
    ).toBe(false);
  });

  it("keeps the rollover timestamp when well past the boundary", () => {
    const finalPlayoffGameAt = new Date("2024-01-01T00:00:00.000Z");
    expect(
      resolveActiveSeason({
        leagueSeason: 2024,
        finalPlayoffGameAt,
        now: new Date("2024-03-01T00:00:00.000Z"),
      }),
    ).toMatchObject({
      season: 2025,
      isUpcoming: true,
      rolloverAt: "2024-01-31T00:00:00.000Z",
    });
  });
});
