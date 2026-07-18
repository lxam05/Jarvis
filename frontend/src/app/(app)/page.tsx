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
    <span className="text-xs text-zinc-500">
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
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-5">
      <div className="mb-3 flex items-center gap-2 text-zinc-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-base font-normal text-zinc-500">{unit}</span> : null}
      </p>
      {detail ? <p className="mt-2 text-sm text-zinc-500">{detail}</p> : null}
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

function ActivityRow({ activity }: { activity: ActivitySummary }) {
  const distance = formatDistance(activity.distance_m);
  return (
    <Link
      href={`/activities/${activity.id}`}
      className="group flex items-center justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-5 py-4 transition-colors hover:border-emerald-500/40 hover:bg-zinc-900/80"
    >
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-zinc-100">
          {activity.name || activity.sport || "Activity"}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {new Date(activity.start_at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" · "}
          {formatDuration(activity.duration_seconds)}
          {distance ? ` · ${distance}` : ""}
          {" · "}
          {activity.calories ?? 0} kcal
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-600 transition-colors group-hover:text-emerald-400" />
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-red-400">
        Failed to load dashboard. Is the API running?
      </div>
    );
  }

  const steps = data.goals.steps_today;
  const stepGoal = data.goals.step_goal;
  const sleep = data.recovery.sleep_score;
  const consumed = data.macros.calories;
  const burned = data.calories_burned;

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Today</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {new Date(data.date).toLocaleDateString("en-GB", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
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
          detail={stepGoal ? `Goal ${stepGoal.toLocaleString()}` : undefined}
        />
        <MetricTile
          label="Sleep"
          icon={Moon}
          value={sleep != null ? String(sleep) : "—"}
          unit={sleep != null ? "/ 100" : undefined}
          detail={
            data.recovery.sleep_hours != null ? `${data.recovery.sleep_hours} hours` : undefined
          }
        />
        <MetricTile
          label="Calories"
          icon={Flame}
          value={`${consumed.toLocaleString()} / ${burned.toLocaleString()}`}
          detail="Consumed vs burned"
        />
      </motion.div>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Today&apos;s activities
        </h2>
        {data.training.activities_today.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-10 text-center text-sm text-zinc-500">
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

      {data.recent_activities.length > 0 && data.training.activities_today.length === 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Recent activities
          </h2>
          <div className="space-y-3">
            {data.recent_activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
