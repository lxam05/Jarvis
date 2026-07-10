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
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Goals">
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="text-zinc-500">Calorie goal</span>
              <input
                type="number"
                value={calorieGoal}
                onChange={(e) => setCalorieGoal(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-500">Protein goal (g)</span>
              <input
                type="number"
                value={proteinGoal}
                onChange={(e) => setProteinGoal(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-500">Goal weight (kg)</span>
              <input
                type="number"
                step="0.1"
                value={goalWeight}
                onChange={(e) => setGoalWeight(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
              />
            </label>
            <button
              onClick={() => saveMutation.mutate()}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
            >
              Save goals
            </button>
          </div>
        </Card>
        <Card title="Garmin Sync">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Last sync</dt>
              <dd className="text-zinc-300">
                {syncStatus?.last_sync_at
                  ? new Date(syncStatus.last_sync_at).toLocaleString("en-GB")
                  : "Never"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Status</dt>
              <dd className="text-zinc-300">{syncStatus?.last_status ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-zinc-600">
            Sync runs via the local Mac agent. See docs/mac-setup.md for setup.
          </p>
        </Card>
      </div>
    </div>
  );
}
