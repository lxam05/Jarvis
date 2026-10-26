const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ActivitySummary = {
  id: string;
  name: string | null;
  sport: string | null;
  start_at: string;
  calories: number | null;
  duration_seconds: number | null;
  distance_m?: number | null;
};

export type ActivityDetail = {
  id: string;
  strava_activity_id: number;
  strava_url: string;
  name: string | null;
  sport: string | null;
  sport_type: string | null;
  start_at: string;
  elapsed_seconds: number | null;
  moving_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_watts: number | null;
  training_load: number | null;
  ascent_m: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  route: [number, number][];
};

export type RaceReadiness = {
  overall: number;
  status: string;
  weeks_to_race: number | null;
  phase: string;
  race_name: string | null;
  race_date: string | null;
  readiness: { score: number; label: string; detail: string };
  training: { score: number; label: string; detail: string };
  summary: string;
};

export type DashboardToday = {
  date: string;
  recovery: {
    sleep_score: number | null;
    sleep_hours: number | null;
    hrv_ms: number | null;
    hrv_status: string | null;
    body_battery_min: number | null;
    body_battery_max: number | null;
    stress_avg: number | null;
    recovery_score: number;
  };
  training: {
    activities_today: ActivitySummary[];
    weekly_load: number;
    weekly_activities: number;
  };
  streaks: { training_streak_days: number };
  recent_activities: ActivitySummary[];
  insights: Array<{ title: string; body: string; category: string; severity: string }>;
  last_garmin_sync: string | null;
  last_strava_sync: string | null;
  garmin_metrics_as_of: string | null;
  readiness: RaceReadiness | null;
};

export type StravaStatus = {
  configured: boolean;
  connected: boolean;
  athlete_name: string | null;
  last_synced_at: string | null;
  activity_count: number;
};

export type CoachMessage = { role: "user" | "assistant"; content: string };

export type UserSettings = { race_name: string | null; race_date: string | null };

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("jarvis_token");
}

export function setToken(token: string) {
  localStorage.setItem("jarvis_token", token);
}

export function clearToken() {
  localStorage.removeItem("jarvis_token");
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  dashboardToday: () => apiFetch<DashboardToday>("/v1/dashboard/today"),

  getActivity: (id: string) => apiFetch<ActivityDetail>(`/v1/strava/activities/${id}`),

  listActivities: (limit = 60) =>
    apiFetch<ActivitySummary[]>(`/v1/strava/activities?limit=${limit}`),

  weeklySportDistance: (weeks = 8) =>
    apiFetch<{
      weeks: Array<{
        week_start: string;
        label: string;
        running_km: number;
        cycling_km: number;
        swimming_km: number;
      }>;
    }>(`/v1/dashboard/training/weekly-distance?weeks=${weeks}`),

  syncStatus: () =>
    apiFetch<{
      last_sync_at: string | null;
      last_status: string | null;
      records_upserted: Record<string, number> | null;
    }>("/v1/garmin/sync/status"),

  insights: () =>
    apiFetch<Array<{ title: string; body: string; category: string; severity: string }>>(
      "/v1/coaching/insights"
    ),

  coachingSession: () =>
    apiFetch<{
      race_name: string | null;
      race_date: string | null;
      weeks_to_race: number | null;
      phase: string;
      recovery_score: number;
      sleep_score: number | null;
      hrv_status: string | null;
      recommended_sport: "running" | "cycling" | "swimming" | string;
      reason: string;
      sessions: Array<{
        sport: string;
        title: string;
        duration_min: number;
        intensity: string;
        description: string;
        focus: string;
      }>;
      recent_mix: Record<string, number>;
    }>("/v1/coaching/session"),

  getSettings: () => apiFetch<UserSettings>("/v1/auth/settings"),

  updateSettings: (settings: UserSettings) =>
    apiFetch<{ ok: boolean }>("/v1/auth/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  stravaStatus: () => apiFetch<StravaStatus>("/v1/strava/status"),

  stravaConnectUrl: () => apiFetch<{ url: string }>("/v1/strava/connect"),

  stravaSync: () =>
    apiFetch<{ activities_upserted: number; last_synced_at: string }>("/v1/strava/sync", {
      method: "POST",
    }),

  stravaDisconnect: () =>
    apiFetch<{ ok: boolean }>("/v1/strava/connection", { method: "DELETE" }),

  coachChat: (messages: CoachMessage[]) =>
    apiFetch<{ reply: string }>("/v1/coaching/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};

export function getEventStreamUrl(): string {
  const token = getToken();
  return `${API_URL}/v1/events/stream?token=${token}`;
}
