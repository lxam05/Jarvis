"use client";

import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

const CHART_STROKE = "#4a7a90";
const TOOLTIP_STYLE = {
  background: "rgba(2, 16, 28, 0.95)",
  border: "1px solid rgba(0, 212, 255, 0.35)",
  color: "#e0f7ff",
  fontFamily: "var(--font-hud-mono)",
  fontSize: 12,
};

const SPORT_COLORS = {
  running: "#00d4ff",
  cycling: "#34d399",
  swimming: "#a78bfa",
} as const;

const SPORT_LABEL: Record<string, string> = {
  running: "Run",
  cycling: "Ride",
  swimming: "Swim",
};

/** Scale actual km → run-equivalent km for comparable bar heights. */
const EQ = {
  running: 1,
  // ~4 km bike ≈ 1 km run
  cycling: 1 / 4,
  // 1.5 km swim ≈ 10 km run
  swimming: 10 / 1.5,
} as const;

type Sport = "running" | "cycling" | "swimming";

function EquivalenceToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors",
        enabled
          ? "border-[rgba(0,212,255,0.55)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)]"
          : "border-[rgba(0,212,255,0.22)] text-[var(--muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[#c8f0ff]"
      )}
    >
      Equivalences
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          enabled ? "bg-[var(--accent)]" : "bg-[rgba(0,212,255,0.2)]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-[#02101c] transition-transform",
            enabled ? "left-3.5" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export default function TrainingPage() {
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [equivalences, setEquivalences] = useState(false);

  const {
    data: coach,
    isLoading: coachLoading,
    isError: coachError,
    error: coachErr,
  } = useQuery({
    queryKey: ["coaching", "session"],
    queryFn: () => api.coachingSession(),
    retry: 1,
  });

  const { data: distance, isLoading: chartLoading } = useQuery({
    queryKey: ["training", "weekly-distance"],
    queryFn: () => api.weeklySportDistance(8),
  });

  const { data: activities = [], isLoading: listLoading } = useQuery({
    queryKey: ["activities", "list"],
    queryFn: () => api.listActivities(60),
  });

  useEffect(() => {
    if (coach?.recommended_sport && selectedSport === null) {
      const sport = coach.recommended_sport as Sport;
      if (sport === "running" || sport === "cycling" || sport === "swimming") {
        setSelectedSport(sport);
      }
    }
  }, [coach?.recommended_sport, selectedSport]);

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

  const rawWeeks = distance?.weeks ?? [];

  const chartData = useMemo(
    () =>
      rawWeeks.map((w) => {
        if (!equivalences) {
          return {
            label: w.label,
            running_km: w.running_km,
            cycling_km: w.cycling_km,
            swimming_km: w.swimming_km,
            running_actual: w.running_km,
            cycling_actual: w.cycling_km,
            swimming_actual: w.swimming_km,
          };
        }
        return {
          label: w.label,
          running_km: w.running_km * EQ.running,
          cycling_km: w.cycling_km * EQ.cycling,
          swimming_km: w.swimming_km * EQ.swimming,
          running_actual: w.running_km,
          cycling_actual: w.cycling_km,
          swimming_actual: w.swimming_km,
        };
      }),
    [rawWeeks, equivalences]
  );

  const totals = rawWeeks.reduce(
    (acc, w) => ({
      running: acc.running + w.running_km,
      cycling: acc.cycling + w.cycling_km,
      swimming: acc.swimming + w.swimming_km,
    }),
    { running: 0, cycling: 0, swimming: 0 }
  );

  const eqTotals = {
    running: totals.running * EQ.running,
    cycling: totals.cycling * EQ.cycling,
    swimming: totals.swimming * EQ.swimming,
  };

  const activeSport = selectedSport ?? (coach?.recommended_sport as Sport | undefined);
  const activeSession = coach?.sessions.find((s) => s.sport === activeSport);

  return (
    <div>
      <h1 className="hud-title mb-6 text-xl">Training</h1>

      <Card
        title="Today's session"
        subtitle={
          coach
            ? `${coach.race_name} · ${coach.weeks_to_race}w out · ${coach.phase}`
            : "Half Ironman coach"
        }
      >
        {coachLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="hud-spinner" />
          </div>
        ) : coachError ? (
          <p className="font-mono text-sm text-[var(--muted)]">
            Coach unavailable
            {coachErr instanceof Error && coachErr.message.includes("Not Found")
              ? " — API not deployed yet"
              : coachErr instanceof Error
                ? ` — ${coachErr.message.slice(0, 120)}`
                : ""}
            .
          </p>
        ) : !coach ? (
          <p className="font-mono text-sm text-[var(--muted)]">Coach unavailable.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3 font-mono text-xs text-[var(--muted)]">
              <span>
                Recovery{" "}
                <span className="text-[#c8f0ff]">{Math.round(coach.recovery_score)}</span>
              </span>
              {coach.sleep_score != null ? (
                <span>
                  Sleep <span className="text-[#c8f0ff]">{coach.sleep_score}</span>
                </span>
              ) : null}
              {coach.hrv_status ? (
                <span>
                  HRV <span className="text-[#c8f0ff]">{coach.hrv_status}</span>
                </span>
              ) : null}
              <span>
                Race{" "}
                <span className="text-[#c8f0ff]">
                  {new Date(coach.race_date + "T12:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </span>
            </div>

            <p className="max-w-2xl text-sm leading-relaxed text-[#c8f0ff]">
              {coach.reason}
            </p>

            <div className="flex flex-wrap gap-2">
              {(["running", "cycling", "swimming"] as Sport[]).map((sport) => {
                const isRecommended = coach.recommended_sport === sport;
                const isSelected = activeSport === sport;
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => setSelectedSport(sport)}
                    className={cn(
                      "border px-3 py-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] transition-colors",
                      isSelected
                        ? "border-[rgba(0,212,255,0.65)] bg-[rgba(0,212,255,0.14)] text-[var(--accent)]"
                        : "border-[rgba(0,212,255,0.22)] text-[var(--muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[#c8f0ff]"
                    )}
                  >
                    {SPORT_LABEL[sport]}
                    {isRecommended ? (
                      <span className="ml-2 text-[0.6rem] text-[var(--accent)]">priority</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {activeSession ? (
              <div
                className={cn(
                  "border border-[rgba(0,212,255,0.28)] bg-[rgba(0,212,255,0.06)] p-4",
                  coach.recommended_sport === activeSession.sport &&
                    "border-[rgba(0,212,255,0.5)]"
                )}
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-mono text-sm uppercase tracking-[0.12em] text-[var(--accent)]">
                    {activeSession.title}
                  </h3>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {activeSession.duration_min} min · {activeSession.intensity}
                  </span>
                </div>
                <p className="mb-2 text-sm leading-relaxed text-[#c8f0ff]">
                  {activeSession.description}
                </p>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                  Focus · {activeSession.focus}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              {coach.sessions.map((session) => {
                const isRec = session.sport === coach.recommended_sport;
                const isSel = session.sport === activeSport;
                return (
                  <button
                    key={session.sport}
                    type="button"
                    onClick={() => setSelectedSport(session.sport as Sport)}
                    className={cn(
                      "border p-3 text-left transition-colors",
                      isSel
                        ? "border-[rgba(0,212,255,0.55)] bg-[rgba(0,212,255,0.1)]"
                        : "border-[rgba(0,212,255,0.18)] hover:border-[rgba(0,212,255,0.35)]"
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background:
                            SPORT_COLORS[session.sport as Sport] ?? SPORT_COLORS.running,
                        }}
                      />
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {SPORT_LABEL[session.sport] ?? session.sport}
                      </span>
                      {isRec ? (
                        <span className="font-mono text-[0.55rem] uppercase text-[var(--accent)]">
                          do this
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-[#c8f0ff]">{session.title}</p>
                    <p className="mt-1 font-mono text-[0.65rem] text-[var(--muted)]">
                      {session.duration_min} min · {session.intensity}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card
        className="mt-8"
        title="Weekly distance"
        subtitle={
          equivalences
            ? "Run-eq km · swim 1.5≈10 run · bike ÷4"
            : "Last 8 weeks · actual km by sport"
        }
        action={<EquivalenceToggle enabled={equivalences} onChange={setEquivalences} />}
      >
        <div className="mb-4 flex flex-wrap gap-4 font-mono text-xs text-[var(--muted)]">
          <span>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#00d4ff]" />
            Run {totals.running.toFixed(1)} km
            {equivalences ? ` · ${eqTotals.running.toFixed(1)} eq` : ""}
          </span>
          <span>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#34d399]" />
            Ride {totals.cycling.toFixed(1)} km
            {equivalences ? ` · ${eqTotals.cycling.toFixed(1)} eq` : ""}
          </span>
          <span>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#a78bfa]" />
            Swim {totals.swimming.toFixed(1)} km
            {equivalences ? ` · ${eqTotals.swimming.toFixed(1)} eq` : ""}
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
                  unit={equivalences ? " eq" : " km"}
                  width={52}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name, item) => {
                    const labels: Record<string, string> = {
                      running_km: "Running",
                      cycling_km: "Cycling",
                      swimming_km: "Swimming",
                    };
                    const actualKey: Record<string, string> = {
                      running_km: "running_actual",
                      cycling_km: "cycling_actual",
                      swimming_km: "swimming_actual",
                    };
                    const n = String(name);
                    const num = typeof value === "number" ? value : Number(value ?? 0);
                    const payload = item?.payload as Record<string, number> | undefined;
                    const actual = payload?.[actualKey[n] ?? ""] ?? num;
                    if (equivalences) {
                      return [
                        `${num.toFixed(1)} eq (${actual.toFixed(1)} km)`,
                        labels[n] ?? n,
                      ];
                    }
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
                <Bar dataKey="running_km" fill={SPORT_COLORS.running} radius={[2, 2, 0, 0]} />
                <Bar dataKey="cycling_km" fill={SPORT_COLORS.cycling} radius={[2, 2, 0, 0]} />
                <Bar dataKey="swimming_km" fill={SPORT_COLORS.swimming} radius={[2, 2, 0, 0]} />
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
