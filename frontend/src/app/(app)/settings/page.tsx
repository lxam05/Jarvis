"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useState } from "react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: syncStatus } = useQuery({
    queryKey: ["sync", "status"],
    queryFn: api.syncStatus,
  });

  const [calorieGoal, setCalorieGoal] = useState("2500");
  const [proteinGoal, setProteinGoal] = useState("160");
  const [goalWeight, setGoalWeight] = useState("78");

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateSettings({
        calorie_goal: parseInt(calorieGoal),
        protein_goal_g: parseInt(proteinGoal),
        goal_weight_kg: parseFloat(goalWeight),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  return (
    <div>
      <h1 className="hud-title mb-6 text-xl">Settings</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Goals">
          <div className="space-y-4">
            <label className="block">
              <span className="hud-label">Calorie goal</span>
              <input
                type="number"
                value={calorieGoal}
                onChange={(e) => setCalorieGoal(e.target.value)}
                className="hud-input mt-1.5"
              />
            </label>
            <label className="block">
              <span className="hud-label">Protein goal (g)</span>
              <input
                type="number"
                value={proteinGoal}
                onChange={(e) => setProteinGoal(e.target.value)}
                className="hud-input mt-1.5"
              />
            </label>
            <label className="block">
              <span className="hud-label">Goal weight (kg)</span>
              <input
                type="number"
                step="0.1"
                value={goalWeight}
                onChange={(e) => setGoalWeight(e.target.value)}
                className="hud-input mt-1.5"
              />
            </label>
            <button onClick={() => saveMutation.mutate()} className="hud-btn hud-btn-solid">
              Save goals
            </button>
          </div>
        </Card>
        <Card title="Garmin Sync">
          <dl className="space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Last sync</dt>
              <dd className="text-[#c8f0ff]">
                {syncStatus?.last_sync_at
                  ? new Date(syncStatus.last_sync_at).toLocaleString("en-GB")
                  : "Never"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Status</dt>
              <dd className="text-[#c8f0ff]">{syncStatus?.last_status ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 font-mono text-xs text-[var(--muted)]">
            Sync runs via the local Mac agent. See docs/mac-setup.md for setup.
          </p>
        </Card>
      </div>
    </div>
  );
}
