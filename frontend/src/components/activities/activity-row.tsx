"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ActivitySummary } from "@/lib/api";

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

export function ActivityRow({
  activity,
  showDate = false,
}: {
  activity: ActivitySummary;
  showDate?: boolean;
}) {
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
