"use client";

import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, MetricValue } from "@/components/ui/card";
import type { DashboardToday } from "@/lib/api";

const COLORS = ["#34d399", "#60a5fa", "#fbbf24"];

export function CaloriesCard({ data }: { data: DashboardToday["macros"] }) {
  const goal = data.calorie_goal || 2500;
  const pct = Math.min(100, (data.calories / goal) * 100);

  return (
    <Card title="Today's Calories" subtitle={`Goal: ${goal.toLocaleString()} kcal`}>
      <MetricValue value={data.calories.toLocaleString()} unit="kcal" />
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </Card>
  );
}

export function MacrosCard({ data }: { data: DashboardToday["macros"] }) {
  const chartData = [
    { name: "Protein", value: data.protein_g },
    { name: "Carbs", value: data.carbs_g },
    { name: "Fat", value: data.fat_g },
  ];

  return (
    <Card title="Macros">
      <div className="flex items-center gap-4">
        <div className="h-24 w-24">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} innerRadius={28} outerRadius={40} dataKey="value" stroke="none">
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-400">Protein</span>
            <span className="ml-auto tabular-nums text-zinc-200">{data.protein_g.toFixed(0)}g</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-zinc-400">Carbs</span>
            <span className="ml-auto tabular-nums text-zinc-200">{data.carbs_g.toFixed(0)}g</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-zinc-400">Fat</span>
            <span className="ml-auto tabular-nums text-zinc-200">{data.fat_g.toFixed(0)}g</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function RemainingCard({ data }: { data: DashboardToday["macros"] }) {
  const calRemaining = data.calories_remaining ?? 0;
  const protRemaining = data.protein_remaining_g ?? 0;

  return (
    <Card title="Remaining">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500">Calories</p>
          <MetricValue
            value={calRemaining > 0 ? calRemaining.toLocaleString() : "0"}
            unit="kcal"
            className="mt-1"
          />
        </div>
        <div>
          <p className="text-xs text-zinc-500">Protein</p>
          <MetricValue
            value={protRemaining > 0 ? protRemaining.toFixed(0) : "0"}
            unit="g"
            className="mt-1"
          />
        </div>
      </div>
    </Card>
  );
}

export function WeightCard({ data }: { data: DashboardToday["weight"] }) {
  return (
    <Card title="Weight">
      <MetricValue
        value={data.current_kg?.toFixed(1) ?? "—"}
        unit="kg"
      />
      {data.weekly_change_kg !== null && (
        <p
          className={`mt-2 text-sm ${data.weekly_change_kg <= 0 ? "text-emerald-400" : "text-amber-400"}`}
        >
          {data.weekly_change_kg > 0 ? "+" : ""}
          {data.weekly_change_kg} kg this week
        </p>
      )}
      {data.trend_7d.length > 1 && (
        <div className="mt-4 flex h-12 items-end gap-1">
          {data.trend_7d.map((w, i) => {
            const min = Math.min(...data.trend_7d);
            const max = Math.max(...data.trend_7d);
            const h = max === min ? 50 : ((w - min) / (max - min)) * 100;
            return (
              <motion.div
                key={i}
                className="flex-1 rounded-sm bg-emerald-500/40"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(10, h)}%` }}
                transition={{ delay: i * 0.05 }}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function SleepCard({ data }: { data: DashboardToday["recovery"] }) {
  return (
    <Card title="Sleep">
      <MetricValue value={data.sleep_score ?? "—"} unit={data.sleep_hours ? `${data.sleep_hours}h` : undefined} />
    </Card>
  );
}

export function HrvCard({ data }: { data: DashboardToday["recovery"] }) {
  return (
    <Card title="HRV">
      <MetricValue value={data.hrv_ms ?? "—"} unit="ms" />
      {data.hrv_status && <p className="mt-2 text-sm text-zinc-500">{data.hrv_status}</p>}
    </Card>
  );
}

export function BodyBatteryCard({ data }: { data: DashboardToday["recovery"] }) {
  return (
    <Card title="Body Battery">
      <MetricValue
        value={data.body_battery_min !== null ? `${data.body_battery_min}–${data.body_battery_max}` : "—"}
      />
      <p className="mt-2 text-sm text-zinc-500">Recovery score: {data.recovery_score.toFixed(0)}</p>
    </Card>
  );
}

export function TrainingCard({ data }: { data: DashboardToday["training"] }) {
  return (
    <Card title="Today's Training">
      {data.activities_today.length === 0 ? (
        <p className="text-sm text-zinc-500">No activities yet</p>
      ) : (
        <ul className="space-y-3">
          {data.activities_today.map((a, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{a.name || a.sport}</span>
              <span className="text-zinc-500">{a.calories ?? 0} kcal</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-zinc-600">
        Weekly: {data.weekly_activities} activities · Load {data.weekly_load.toFixed(0)}
      </p>
    </Card>
  );
}

export function StreaksCard({ data }: { data: DashboardToday["streaks"] }) {
  return (
    <Card title="Streaks">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500">Logging</p>
          <MetricValue value={data.logging_streak_days} unit="days" />
        </div>
        <div>
          <p className="text-xs text-zinc-500">Training</p>
          <MetricValue value={data.training_streak_days} unit="days" />
        </div>
      </div>
    </Card>
  );
}

export function GoalsCard({ data }: { data: DashboardToday["goals"] }) {
  const stepPct =
    data.step_goal && data.steps_today
      ? Math.min(100, (data.steps_today / data.step_goal) * 100)
      : 0;

  return (
    <Card title="Goals">
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Steps</span>
          <span className="tabular-nums text-zinc-200">
            {data.steps_today?.toLocaleString() ?? "—"} / {data.step_goal?.toLocaleString() ?? "—"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${stepPct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

export function InsightsCard({ insights }: { insights: DashboardToday["insights"] }) {
  const severityColor: Record<string, string> = {
    info: "border-zinc-700",
    warning: "border-amber-500/50",
    critical: "border-red-500/50",
  };

  return (
    <Card title="AI Insights" className="col-span-full lg:col-span-2">
      {insights.length === 0 ? (
        <p className="text-sm text-zinc-500">No insights yet — log food or sync Garmin data.</p>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-xl border-l-2 bg-zinc-900/50 p-4 ${severityColor[insight.severity] || severityColor.info}`}
            >
              <p className="font-medium text-zinc-200">{insight.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{insight.body}</p>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function RecentActivitiesCard({
  activities,
}: {
  activities: DashboardToday["recent_activities"];
}) {
  return (
    <Card title="Recent Activities">
      {activities.length === 0 ? (
        <p className="text-sm text-zinc-500">No recent activities</p>
      ) : (
        <ul className="space-y-3">
          {activities.map((a, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <div>
                <p className="text-zinc-300">{a.name || a.sport}</p>
                <p className="text-xs text-zinc-600">
                  {new Date(a.start_at).toLocaleDateString("en-GB", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <span className="text-zinc-500">{a.calories ?? 0} kcal</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SyncBadge({ lastSync }: { lastSync: string | null }) {
  if (!lastSync) return null;
  const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
  return (
    <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
      Synced {ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`}
    </span>
  );
}
