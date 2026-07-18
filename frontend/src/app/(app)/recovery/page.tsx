"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, MetricValue } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function RecoveryPage() {
  const { data } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
  });

  if (!data) return null;
  const r = data.recovery;

  return (
    <div>
      <h1 className="hud-title mb-6 text-xl">Recovery</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Sleep Score">
          <MetricValue value={r.sleep_score ?? "—"} />
          {r.sleep_hours && (
            <p className="mt-2 font-mono text-sm text-[var(--muted)]">{r.sleep_hours} hours</p>
          )}
        </Card>
        <Card title="HRV">
          <MetricValue value={r.hrv_ms ?? "—"} unit="ms" />
          <p className="mt-2 font-mono text-sm text-[var(--muted)]">{r.hrv_status ?? "No data"}</p>
        </Card>
        <Card title="Body Battery">
          <MetricValue value={r.body_battery_min ?? "—"} unit={`– ${r.body_battery_max ?? "—"}`} />
        </Card>
        <Card title="Stress">
          <MetricValue value={r.stress_avg ?? "—"} unit="avg" />
        </Card>
        <Card title="Recovery Score">
          <MetricValue value={r.recovery_score.toFixed(0)} unit="/ 100" />
          <div className="mt-4 h-1.5 overflow-hidden bg-[rgba(0,212,255,0.12)]">
            <div
              className="h-full bg-gradient-to-r from-[var(--danger)] via-amber-400 to-[var(--accent)] shadow-[0_0_8px_rgba(0,212,255,0.4)]"
              style={{ width: `${r.recovery_score}%` }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
