export type Sport = "running" | "cycling" | "swimming";

export const SPORTS: Sport[] = ["swimming", "cycling", "running"];

export const SPORT_COLOR: Record<Sport, string> = {
  swimming: "var(--swim)",
  cycling: "var(--bike)",
  running: "var(--run)",
};

/** Hex values for libraries (Recharts, Leaflet) that can't read CSS variables. */
export const SPORT_HEX: Record<Sport, string> = {
  swimming: "#0a84ff",
  cycling: "#ff8a00",
  running: "#00b37e",
};

export const SPORT_NAME: Record<Sport, string> = {
  swimming: "Swim",
  cycling: "Ride",
  running: "Run",
};

export function asSport(value: string | null | undefined): Sport | null {
  return value === "running" || value === "cycling" || value === "swimming" ? value : null;
}

export function sportColor(value: string | null | undefined): string {
  const sport = asSport(value);
  return sport ? SPORT_COLOR[sport] : "var(--slate)";
}

export function sportName(value: string | null | undefined): string {
  const sport = asSport(value);
  if (sport) return SPORT_NAME[sport];
  if (!value) return "Activity";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatDistance(meters: number | null | undefined, digits = 1): string | null {
  if (meters == null) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(digits)} km`;
  return `${Math.round(meters)} m`;
}

/** Pace for runs (/km), swims (/100m); speed for rides. */
export function formatPace(
  sport: string | null | undefined,
  meters: number | null | undefined,
  seconds: number | null | undefined
): string | null {
  if (!meters || !seconds || meters < 1) return null;
  const s = asSport(sport);
  if (s === "cycling") return `${((meters / seconds) * 3.6).toFixed(1)} km/h`;
  const per = s === "swimming" ? seconds / (meters / 100) : seconds / (meters / 1000);
  const mins = Math.floor(per / 60);
  const secs = Math.round(per % 60);
  return `${mins}:${String(secs).padStart(2, "0")} ${s === "swimming" ? "/100m" : "/km"}`;
}

export function startOfWeek(d = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}
