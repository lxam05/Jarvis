"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Flame, Footprints, Moon } from "lucide-react";
import { api, type ActivitySummary } from "@/lib/api";

function SyncBadge({ lastSync }: { lastSync: string | null }) {
  if (!lastSync) return null;
  const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
  return (
    <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
      Synced {ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`}
    </span>
  );
}

function MetricTile({
  label,
  value,
  unit,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="hud-panel hud-corners p-5">
      <span className="hud-corner-tr" aria-hidden />
      <span className="hud-corner-bl" aria-hidden />
      <div className="mb-3 flex items-center gap-2 text-[var(--muted)]">
        <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span className="hud-label">{label}</span>
      </div>
      <p className="hud-metric text-3xl tracking-tight">
        {value}
        {unit ? <span className="ml-1.5 text-base text-[var(--muted)]">{unit}</span> : null}
      </p>
      {detail ? (
        <p className="mt-2 font-mono text-xs text-[var(--muted)]">{detail}</p>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDistance(meters: number | null | undefined) {
  if (meters == null) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function ActivityRow({ activity, showDate = false }: { activity: ActivitySummary; showDate?: boolean }) {
  const distance = formatDistance(activity.distance_m);
  const when = showDate
    ? new Date(activity.start_at).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : new Date(activity.start_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
  return (
    <Link
      href={`/activities/${activity.id}`}
      className="hud-panel hud-corners group flex items-center justify-between gap-4 px-5 py-4 transition-all hover:border-[rgba(0,212,255,0.5)] hover:bg-[rgba(0,212,255,0.06)]"
    >
      <span className="hud-corner-tr" aria-hidden />
      <span className="hud-corner-bl" aria-hidden />
      <div className="min-w-0">
        <p className="truncate font-mono text-sm tracking-wide text-[#e8fbff]">
          {activity.name || activity.sport || "Activity"}
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--muted)]">
          {when}
          {" · "}
          {formatDuration(activity.duration_seconds)}
          {distance ? ` · ${distance}` : ""}
          {" · "}
          {activity.calories ?? 0} kcal
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--accent)]" />
    </Link>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="hud-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hud-panel border-[rgba(255,77,109,0.4)] p-6 font-mono text-sm text-[var(--danger)]">
        Failed to load dashboard. Is the API running?
      </div>
    );
  }

  const steps = data.goals.steps_today;
  const stepGoal = data.goals.step_goal;
  const sleep = data.recovery.sleep_score;
  const consumed = data.macros.calories;
  const burned = data.calories_burned;
  const asOf = data.garmin_metrics_as_of
    ? new Date(data.garmin_metrics_as_of).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  const todayIds = new Set(data.training.activities_today.map((a) => a.id));
  const now = new Date();
  const day = now.getDay(); // 0 Sun … 6 Sat
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((day + 6) % 7)); // Monday start

  const thisWeek: ActivitySummary[] = [];
  const previous: ActivitySummary[] = [];
  for (const activity of data.recent_activities) {
    if (todayIds.has(activity.id)) continue;
    const start = new Date(activity.start_at);
    if (start >= weekStart) thisWeek.push(activity);
    else previous.push(activity);
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="hud-title text-xl">Today</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            {new Date(data.date).toLocaleDateString("en-GB", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {asOf ? ` · sleep/steps as of ${asOf}` : ""}
          </p>
        </div>
        <SyncBadge lastSync={data.last_garmin_sync} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <MetricTile
          label="Steps"
          icon={Footprints}
          value={steps != null ? steps.toLocaleString() : "—"}
          detail={
            [
              stepGoal ? `Goal ${stepGoal.toLocaleString()}` : null,
              asOf ? `As of ${asOf}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
        <MetricTile
          label="Sleep"
          icon={Moon}
          value={sleep != null ? String(sleep) : "—"}
          unit={sleep != null ? "/ 100" : undefined}
          detail={
            [
              data.recovery.sleep_hours != null ? `${data.recovery.sleep_hours} hours` : null,
              asOf ? `As of ${asOf}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
        <MetricTile
          label="Calories"
          icon={Flame}
          value={`${consumed.toLocaleString()} / ${burned.toLocaleString()}`}
          detail={
            [
              "Consumed vs burned",
              asOf ? `Burned as of ${asOf}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          }
        />
      </motion.div>

      <section className="mt-10">
        <h2 className="hud-label mb-4">Today&apos;s activities</h2>
        {data.training.activities_today.length === 0 ? (
          <div className="hud-panel border-dashed px-5 py-10 text-center font-mono text-sm text-[var(--muted)]">
            No activities yet today
          </div>
        ) : (
          <div className="space-y-3">
            {data.training.activities_today.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </section>

      {thisWeek.length > 0 ? (
        <section className="mt-10">
          <h2 className="hud-label mb-4">This week</h2>
          <div className="space-y-3">
            {thisWeek.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} showDate />
            ))}
          </div>
        </section>
      ) : null}

      {previous.length > 0 ? (
        <section className="mt-10">
          <h2 className="hud-label mb-4">Previous</h2>
          <div className="space-y-3">
            {previous.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} showDate />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
