"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame, Footprints, Moon } from "lucide-react";
import { NutritionChat } from "@/components/nutrition/chat";
import { api } from "@/lib/api";

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

export default function NutritionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
    refetchInterval: 60_000,
  });

  const steps = data?.goals.steps_today;
  const stepGoal = data?.goals.step_goal;
  const sleep = data?.recovery.sleep_score;
  const consumed = data?.macros.calories ?? 0;
  const burned = data?.calories_burned ?? 0;
  const asOf = data?.garmin_metrics_as_of
    ? new Date(data.garmin_metrics_as_of).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div>
      <h1 className="hud-title mb-6 text-xl">Nutrition</h1>

      {isLoading && !data ? (
        <div className="mb-8 flex h-24 items-center justify-center">
          <div className="hud-spinner" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 grid gap-4 sm:grid-cols-3"
        >
          <MetricTile
            label="Steps"
            icon={Footprints}
            value={steps != null ? steps.toLocaleString() : "—"}
            detail={
              [stepGoal ? `Goal ${stepGoal.toLocaleString()}` : null, asOf ? `As of ${asOf}` : null]
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
                data?.recovery.sleep_hours != null ? `${data.recovery.sleep_hours} hours` : null,
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
              ["Consumed vs burned", asOf ? `Burned as of ${asOf}` : null]
                .filter(Boolean)
                .join(" · ")
            }
          />
        </motion.div>
      )}

      <NutritionChat />
    </div>
  );
}
