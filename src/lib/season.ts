// Season detection, used for the animated scenes and the seasonal colour theme.

export type Season = "spring" | "summer" | "fall" | "winter";

/** Meteorological seasons for the northern hemisphere (Canada). */
export function seasonFor(date: string | Date): Season {
  const m = (typeof date === "string" ? new Date(`${date.slice(0, 10)}T12:00`) : date).getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}

export const SEASON_LABEL: Record<Season, string> = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" };
