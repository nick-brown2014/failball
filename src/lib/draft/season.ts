/** Historical draft views use the season immediately before the league season. */
export function getLastSeason(leagueSeason: number): number {
  return leagueSeason - 1;
}
