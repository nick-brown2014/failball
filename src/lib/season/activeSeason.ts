export const SEASON_ROLLOVER_DAYS = 30;

export interface ActiveSeason {
  season: number;
  leagueSeason: number;
  isUpcoming: boolean;
  rolloverAt: string | null;
}

export function resolveActiveSeason(input: {
  leagueSeason: number;
  finalPlayoffGameAt: Date | null;
  now: Date;
}): ActiveSeason {
  const rolloverAt = input.finalPlayoffGameAt
    ? new Date(
        input.finalPlayoffGameAt.getTime() +
          SEASON_ROLLOVER_DAYS * 24 * 60 * 60 * 1000,
      )
    : null;
  const isUpcoming = rolloverAt !== null && input.now >= rolloverAt;

  return {
    season: isUpcoming ? input.leagueSeason + 1 : input.leagueSeason,
    leagueSeason: input.leagueSeason,
    isUpcoming,
    rolloverAt: rolloverAt?.toISOString() ?? null,
  };
}
