"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, MetricValue } from "@/components/ui/card";
import { api } from "@/lib/api";

const CHART_STROKE = "#4a7a90";
const TOOLTIP_STYLE = {
  background: "rgba(2, 16, 28, 0.95)",
  border: "1px solid rgba(0, 212, 255, 0.35)",
  color: "#e0f7ff",
  fontFamily: "var(--font-hud-mono)",
  fontSize: 12,
};

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
      <h1 className="hud-title mb-6 text-xl">Weight</h1>
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
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  }
                  stroke={CHART_STROKE}
                  fontSize={11}
                  fontFamily="var(--font-hud-mono)"
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke={CHART_STROKE}
                  fontSize={11}
                  fontFamily="var(--font-hud-mono)"
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="#00d4ff"
                  fill="url(#weightGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {trend && trend.points.length === 0 && (
            <p className="font-mono text-sm text-[var(--muted)]">No weight data yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}
