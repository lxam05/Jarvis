"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";

const ActivityMap = dynamic(
  () => import("@/components/activities/activity-map").then((m) => m.ActivityMap),
  {
    ssr: false,
    loading: () => (
      <div className="hud-panel flex h-[360px] items-center justify-center font-mono text-sm text-[var(--muted)]">
        Loading map…
      </div>
    ),
  }
);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-panel hud-corners p-4">
      <span className="hud-corner-tr" aria-hidden />
      <span className="hud-corner-bl" aria-hidden />
      <p className="hud-label">{label}</p>
      <p className="hud-metric mt-2 text-xl tracking-tight">{value}</p>
    </div>
  );
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatDistance(meters: number | null) {
  if (meters == null) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatPace(meters: number | null, seconds: number | null) {
  if (!meters || !seconds || meters < 1) return null;
  const paceSec = seconds / (meters / 1000);
  const mins = Math.floor(paceSec / 60);
  const secs = Math.round(paceSec % 60);
  return `${mins}:${secs.toString().padStart(2, "0")} /km`;
}

function formatSpeed(mps: number | null) {
  if (mps == null) return null;
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => api.getActivity(id),
    enabled: Boolean(id),
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
      <div>
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="hud-panel border-[rgba(255,77,109,0.4)] p-6 font-mono text-sm text-[var(--danger)]">
          Activity not found
        </div>
      </div>
    );
  }

  const pace = formatPace(data.distance_m, data.moving_seconds ?? data.elapsed_seconds);
  const avgSpeed = formatSpeed(data.avg_speed_mps);
  const route = (data.route || []).map(([lat, lng]) => [lat, lng] as [number, number]);

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>

      <div className="mb-6">
        <p className="hud-label">{data.sport || "Activity"}</p>
        <h1 className="hud-title mt-2 text-xl">{data.name || data.sport || "Activity"}</h1>
        <p className="mt-2 font-mono text-xs text-[var(--muted)]">
          {new Date(data.start_at).toLocaleString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <ActivityMap route={route} />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Duration" value={formatDuration(data.elapsed_seconds)} />
        <Stat label="Distance" value={formatDistance(data.distance_m)} />
        <Stat label="Calories" value={data.calories != null ? `${data.calories} kcal` : "—"} />
        {pace ? <Stat label="Pace" value={pace} /> : null}
        {avgSpeed ? <Stat label="Avg speed" value={avgSpeed} /> : null}
        <Stat label="Avg HR" value={data.avg_hr != null ? `${data.avg_hr} bpm` : "—"} />
        <Stat label="Max HR" value={data.max_hr != null ? `${data.max_hr} bpm` : "—"} />
        {data.ascent_m != null ? <Stat label="Ascent" value={`${Math.round(data.ascent_m)} m`} /> : null}
        {data.descent_m != null ? (
          <Stat label="Descent" value={`${Math.round(data.descent_m)} m`} />
        ) : null}
        {data.training_load != null ? (
          <Stat label="Training load" value={data.training_load.toFixed(0)} />
        ) : null}
      </div>
    </div>
  );
}
