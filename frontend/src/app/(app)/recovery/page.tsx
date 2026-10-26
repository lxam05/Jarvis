"use client";

import { useQuery } from "@tanstack/react-query";
import { Metric, Panel, Spinner } from "@/components/ui/card";
import { api } from "@/lib/api";

function Meter({ value, max = 100 }: { value: number | null; max?: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
      <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function RecoveryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const r = data.recovery;
  const asOf = data.garmin_metrics_as_of
    ? new Date(data.garmin_metrics_as_of + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "today";

  return (
    <div>
      <h1 className="display text-[clamp(2.6rem,6vw,4rem)]">Recovery</h1>
      <p className="mt-3 text-slate">From your Garmin, {asOf}.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-[1.3fr_1fr_1fr]">
        <Panel className="md:row-span-2 md:p-8">
          <p className="text-slate">Recovery score</p>
          <p className="display num mt-2 text-[clamp(5rem,12vw,8rem)]">{Math.round(r.recovery_score)}</p>
          <Meter value={r.recovery_score} />
          <p className="mt-5 max-w-[40ch] text-[0.95rem] leading-relaxed text-slate">
            Combines last night&apos;s sleep score, HRV status and how low your body battery dropped.
          </p>
        </Panel>
        <Panel>
          <Metric label="Sleep score" value={r.sleep_score ?? "—"} note={r.sleep_hours ? `${r.sleep_hours} hours` : undefined} />
          <Meter value={r.sleep_score} />
        </Panel>
        <Panel>
          <Metric
            label="HRV"
            value={r.hrv_ms ?? "—"}
            unit="ms"
            note={r.hrv_status ? <span className="capitalize">{r.hrv_status.toLowerCase()}</span> : "No data"}
          />
        </Panel>
        <Panel>
          <Metric
            label="Body battery"
            value={r.body_battery_max ?? "—"}
            note={r.body_battery_min != null ? `Lowest ${r.body_battery_min}` : undefined}
          />
          <Meter value={r.body_battery_max} />
        </Panel>
        <Panel>
          <Metric label="Stress" value={r.stress_avg ?? "—"} note="Daily average" />
          <Meter value={r.stress_avg} />
        </Panel>
      </div>
    </div>
  );
}
