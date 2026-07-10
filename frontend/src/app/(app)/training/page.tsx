"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function TrainingPage() {
  const { data: week } = useQuery({
    queryKey: ["training", "week"],
    queryFn: api.trainingWeek,
  });

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Training</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Weekly Volume">
          <div className="h-64">
            {week && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week.days}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("en-GB", { weekday: "short" })
                    }
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <YAxis stroke="#71717a" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a" }}
                  />
                  <Bar dataKey="calories" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Today's Activities">
          {dashboard?.training.activities_today.length === 0 ? (
            <p className="text-sm text-zinc-500">Rest day so far</p>
          ) : (
            <ul className="space-y-3">
              {dashboard?.training.activities_today.map((a, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{a.name || a.sport}</span>
                  <span className="text-zinc-500">
                    {a.duration_seconds ? `${Math.round(a.duration_seconds / 60)} min` : ""} ·{" "}
                    {a.calories ?? 0} kcal
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
