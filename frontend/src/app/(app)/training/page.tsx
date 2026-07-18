"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ActivityRow } from "@/components/activities/activity-row";
import { Card } from "@/components/ui/card";
import { api, type ActivitySummary } from "@/lib/api";

const CHART_STROKE = "#4a7a90";
const TOOLTIP_STYLE = {
  background: "rgba(2, 16, 28, 0.95)",
  border: "1px solid rgba(0, 212, 255, 0.35)",
  color: "#e0f7ff",
  fontFamily: "var(--font-hud-mono)",
  fontSize: 12,
};

const SPORT_COLORS = {
  running_km: "#00d4ff",
  cycling_km: "#34d399",
  swimming_km: "#a78bfa",
};

export default function TrainingPage() {
  const { data: distance, isLoading: chartLoading } = useQuery({
    queryKey: ["training", "weekly-distance"],
    queryFn: () => api.weeklySportDistance(8),
  });

  const { data: activities = [], isLoading: listLoading } = useQuery({
    queryKey: ["activities", "list"],
    queryFn: () => api.listActivities(60),
  });

  const now = new Date();
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((day + 6) % 7));

  const thisWeek: ActivitySummary[] = [];
  const previous: ActivitySummary[] = [];
  for (const activity of activities) {
    const start = new Date(activity.start_at);
    if (start >= weekStart) thisWeek.push(activity);
    else previous.push(activity);
  }

  const chartData =
    distance?.weeks.map((w) => ({
      label: w.label,
      running_km: w.running_km,
      cycling_km: w.cycling_km,
      swimming_km: w.swimming_km,
    })) ?? [];

  const totals = chartData.reduce(
    (acc, w) => ({
      running: acc.running + w.running_km,
      cycling: acc.cycling + w.cycling_km,
      swimming: acc.swimming + w.swimming_km,
    }),
    { running: 0, cycling: 0, swimming: 0 }
  );

  return (
    <div>
      <h1 className="hud-title mb-6 text-xl">Training</h1>

      <Card title="Weekly distance" subtitle="Last 8 weeks · km by sport">
        <div className="mb-4 flex flex-wrap gap-4 font-mono text-xs text-[var(--muted)]">
          <span>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#00d4ff]" />
            Run {totals.running.toFixed(1)} km
          </span>
          <span>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#34d399]" />
            Ride {totals.cycling.toFixed(1)} km
          </span>
          <span>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#a78bfa]" />
            Swim {totals.swimming.toFixed(1)} km
          </span>
        </div>
        <div className="h-72">
          {chartLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="hud-spinner" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2} barCategoryGap="18%">
                <CartesianGrid stroke="rgba(0,212,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={CHART_STROKE}
                  fontSize={11}
                  fontFamily="var(--font-hud-mono)"
                  tickLine={false}
                />
                <YAxis
                  stroke={CHART_STROKE}
                  fontSize={11}
                  fontFamily="var(--font-hud-mono)"
                  tickLine={false}
                  axisLine={false}
                  unit=" km"
                  width={48}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      running_km: "Running",
                      cycling_km: "Cycling",
                      swimming_km: "Swimming",
                    };
                    const n = String(name);
                    const num = typeof value === "number" ? value : Number(value ?? 0);
                    return [`${num.toFixed(1)} km`, labels[n] ?? n];
                  }}
                />
                <Legend
                  formatter={(value) =>
                    ({
                      running_km: "Running",
                      cycling_km: "Cycling",
                      swimming_km: "Swimming",
                    })[value] ?? value
                  }
                  wrapperStyle={{ fontFamily: "var(--font-hud-mono)", fontSize: 11 }}
                />
                <Bar dataKey="running_km" fill={SPORT_COLORS.running_km} radius={[2, 2, 0, 0]} />
                <Bar dataKey="cycling_km" fill={SPORT_COLORS.cycling_km} radius={[2, 2, 0, 0]} />
                <Bar dataKey="swimming_km" fill={SPORT_COLORS.swimming_km} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <section className="mt-10">
        <h2 className="hud-label mb-4">This week</h2>
        {listLoading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="hud-spinner" />
          </div>
        ) : thisWeek.length === 0 ? (
          <div className="hud-panel border-dashed px-5 py-10 text-center font-mono text-sm text-[var(--muted)]">
            No activities this week
          </div>
        ) : (
          <div className="space-y-3">
            {thisWeek.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} showDate />
            ))}
          </div>
        )}
      </section>

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
