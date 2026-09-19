export type DashboardSeason =
  | "default"
  | "halloween"
  | "christmas"
  | "new-year";

/**
 * Development preview only.
 *
 * Use:
 *   "halloween"
 *   "christmas"
 *   "new-year"
 *
 * Set back to null before production.
 */
export const DASHBOARD_SEASON_PREVIEW: DashboardSeason | null = null;

export function getDashboardSeason(today: string): DashboardSeason {
  if (DASHBOARD_SEASON_PREVIEW) {
    return DASHBOARD_SEASON_PREVIEW;
  }

  const monthDay = today.slice(5, 10);

  // New Year: Dec 26 – Jan 5
  if (monthDay >= "12-26" || monthDay <= "01-05") {
    return "new-year";
  }

  // Christmas: Dec 15 – Dec 25
  if (monthDay >= "12-15" && monthDay <= "12-25") {
    return "christmas";
  }

  // Halloween: Oct 15 – Oct 31
  if (monthDay >= "10-15" && monthDay <= "10-31") {
    return "halloween";
  }

  return "default";
}

export function isChristmasSeason(today: string) {
  return getDashboardSeason(today) === "christmas";
}