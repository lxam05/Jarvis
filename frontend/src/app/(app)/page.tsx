"use client";

import { useQuery } from "@tanstack/react-query";
import { JarvisHud } from "@/components/dashboard/jarvis-hud";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
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

  return (
    <JarvisHud
      him={data.him_readiness ?? null}
      calories={data.macros.calories}
      proteinG={data.macros.protein_g}
    />
  );
}
