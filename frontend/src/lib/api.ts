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
  garmin_activity_id: string;
  name: string | null;
  sport: string | null;
  sub_sport: string | null;
  start_at: string;
  elapsed_seconds: number | null;
  moving_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  training_load: number | null;
  training_effect: number | null;
  ascent_m: number | null;
  descent_m: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  route: [number, number][];
};

export type DashboardToday = {
  date: string;
  macros: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    calorie_goal: number | null;
    protein_goal_g: number | null;
    calories_remaining: number | null;
    protein_remaining_g: number | null;
  };
  weight: {
    current_kg: number | null;
    goal_kg: number | null;
    weekly_change_kg: number | null;
    trend_7d: number[];
  };
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
    total_calories_burned_today: number;
  };
  streaks: { logging_streak_days: number; training_streak_days: number };
  goals: {
    calorie_goal: number | null;
    protein_goal_g: number | null;
    step_goal: number | null;
    steps_today: number | null;
  };
  recent_activities: ActivitySummary[];
  insights: Array<{ title: string; body: string; category: string; severity: string }>;
  last_garmin_sync: string | null;
  calories_burned: number;
  garmin_metrics_as_of: string | null;
};

export type Meal = {
  id: string;
  logged_at: string;
  meal_type: string | null;
  raw_input: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  status: string;
  items: Array<{
    name: string;
    quantity: string | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  }>;
};

export type ChatResponse = {
  conversation_id: string;
  reply: string;
  state: string;
  meal_draft?: {
    id: string;
    parsed: {
      total_calories: number;
      total_protein_g: number;
      total_carbs_g: number;
      total_fat_g: number;
      confidence: number;
    };
    raw_input: string;
  };
  follow_up_questions?: string[];
};

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

  getActivity: (id: string) => apiFetch<ActivityDetail>(`/v1/garmin/activities/${id}`),

  weightTrend: (days = 30) =>
    apiFetch<{ points: Array<{ date: string; weight_kg: number }> }>(
      `/v1/dashboard/weight-trend?days=${days}`
    ),

  trainingWeek: () =>
    apiFetch<{ days: Array<{ date: string; activities: number; calories: number }> }>(
      "/v1/dashboard/training/week"
    ),

  syncStatus: () =>
    apiFetch<{
      last_sync_at: string | null;
      last_status: string | null;
      records_upserted: Record<string, number> | null;
    }>("/v1/garmin/sync/status"),

  chat: (message: string, conversationId?: string) =>
    apiFetch<ChatResponse>("/v1/nutrition/chat", {
      method: "POST",
      body: JSON.stringify({ message, conversation_id: conversationId }),
    }),

  confirmMeal: (mealId: string, saveAsTemplate = false, templateName?: string) =>
    apiFetch<Meal>(`/v1/nutrition/meals/${mealId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ save_as_template: saveAsTemplate, template_name: templateName }),
    }),

  mealsToday: () => apiFetch<Meal[]>("/v1/nutrition/meals/today"),

  insights: () =>
    apiFetch<Array<{ title: string; body: string; category: string; severity: string }>>(
      "/v1/coaching/insights"
    ),

  updateSettings: (settings: Record<string, number | null>) =>
    apiFetch<{ ok: boolean }>("/v1/auth/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};

export function getEventStreamUrl(): string {
  const token = getToken();
  return `${API_URL}/v1/events/stream?token=${token}`;
}
