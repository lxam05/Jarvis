"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function SyncBadge({ lastSync }: { lastSync: string | null }) {
  if (!lastSync) return null;
  const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
  return (
    <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
      Synced {ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`}
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  solid: "Solid",
  caution: "Caution",
  off_track: "Off track",
};

function PillarBar({
  name,
  score,
  label,
  detail,
}: {
  name: string;
  score: number;
  label: string;
  detail: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          {name}
        </span>
        <span className="font-mono text-sm tabular-nums text-[#c8f0ff]">
          {Math.round(score)}%
          <span className="ml-2 text-[0.65rem] text-[var(--muted)]">{label}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[rgba(0,212,255,0.12)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full bg-[var(--accent)]"
        />
      </div>
      <p className="mt-2 font-mono text-[0.65rem] leading-relaxed text-[var(--muted)]">{detail}</p>
    </div>
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

  const him = data.him_readiness;

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="hud-title text-xl">Dashboard</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            {new Date(data.date).toLocaleDateString("en-GB", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <SyncBadge lastSync={data.last_garmin_sync} />
      </div>

      {!him ? (
        <div className="hud-panel p-6 font-mono text-sm text-[var(--muted)]">
          Half Ironman readiness unavailable — API may still be deploying.
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="hud-panel hud-corners p-6 sm:p-8"
        >
          <span className="hud-corner-tr" aria-hidden />
          <span className="hud-corner-bl" aria-hidden />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="hud-label">{him.race_name}</p>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                {him.weeks_to_race}w out · {him.phase} ·{" "}
                {new Date(him.race_date + "T12:00:00").toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <span
              className={cn(
                "border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em]",
                him.status === "on_track" || him.status === "solid"
                  ? "border-[rgba(0,212,255,0.45)] text-[var(--accent)]"
                  : him.status === "caution"
                    ? "border-[rgba(251,191,36,0.45)] text-amber-300"
                    : "border-[rgba(255,77,109,0.45)] text-[var(--danger)]"
              )}
            >
              {STATUS_LABEL[him.status] ?? him.status}
            </span>
          </div>

          <div className="mt-8 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Overall
              </p>
              <p className="hud-metric mt-1 text-6xl tracking-tight sm:text-7xl">
                {Math.round(him.overall)}
                <span className="ml-1 text-2xl text-[var(--muted)]">%</span>
              </p>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-[#c8f0ff]">{him.summary}</p>
          </div>

          <div className="mt-10 space-y-7">
            <PillarBar
              name="Readiness"
              score={him.readiness.score}
              label={him.readiness.label}
              detail={him.readiness.detail}
            />
            <PillarBar
              name="Food"
              score={him.food.score}
              label={him.food.label}
              detail={him.food.detail}
            />
            <PillarBar
              name="Training"
              score={him.training.score}
              label={him.training.label}
              detail={him.training.detail}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
