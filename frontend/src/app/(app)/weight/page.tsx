"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, MetricValue } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function WeightPage() {
  const { data: trend } = useQuery({
    queryKey: ["weight", "trend"],
    queryFn: () => api.weightTrend(30),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Weight</h1>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card title="Current">
          <MetricValue value={dashboard?.weight.current_kg?.toFixed(1) ?? "—"} unit="kg" />
        </Card>
        <Card title="Goal">
          <MetricValue value={dashboard?.weight.goal_kg?.toFixed(1) ?? "—"} unit="kg" />
        </Card>
        <Card title="Weekly Change">
          <MetricValue
            value={
              dashboard?.weight.weekly_change_kg !== null &&
              dashboard?.weight.weekly_change_kg !== undefined
                ? `${dashboard.weight.weekly_change_kg > 0 ? "+" : ""}${dashboard.weight.weekly_change_kg}`
                : "—"
            }
            unit="kg"
          />
        </Card>
      </div>
      <Card title="30-Day Trend">
        <div className="h-72">
          {trend && trend.points.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.points}>
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  stroke="#71717a"
                  fontSize={12}
                />
                <YAxis domain={["auto", "auto"]} stroke="#71717a" fontSize={12} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a" }} />
                <Area
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="#34d399"
                  fill="url(#weightGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {trend && trend.points.length === 0 && (
            <p className="text-sm text-zinc-500">No weight data yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}
