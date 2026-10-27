"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActivityList } from "@/components/activities/activity-row";
import { Section, Spinner } from "@/components/ui/card";
import { api, type ActivitySummary } from "@/lib/api";
import { SPORTS, SPORT_COLOR, SPORT_HEX, SPORT_NAME, type Sport, asSport, sportName, startOfWeek } from "@/lib/sport";
import { cn } from "@/lib/utils";

/** Scale actual km → run-equivalent km for comparable bar heights. */
const EQ: Record<Sport, number> = {
  running: 1,
  // ~4 km bike ≈ 1 km run
  cycling: 1 / 4,
  // 1.5 km swim ≈ 10 km run
  swimming: 10 / 1.5,
};

const KEY: Record<Sport, "running_km" | "cycling_km" | "swimming_km"> = {
  running: "running_km",
  cycling: "cycling_km",
  swimming: "swimming_km",
};

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-3 text-[0.92rem] text-slate hover:text-ink"
    >
      Compare as run-equivalent
      <span
        className={cn("relative h-6 w-10 rounded-full transition-colors", enabled ? "bg-ink" : "bg-haze-strong")}
      >
        <span
          className={cn(
            "absolute top-1 h-4 w-4 rounded-full bg-paper shadow-sm transition-transform",
            enabled ? "translate-x-5" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}

export default function TrainingPage() {
  // Options are picked by position: a runner gets several running sessions to choose from.
  const [selected, setSelected] = useState(0);
  const [equivalences, setEquivalences] = useState(false);

  const { data: coach, isLoading: coachLoading, isError: coachError } = useQuery({
    queryKey: ["coaching", "session"],
    queryFn: api.coachingSession,
    retry: 1,
    staleTime: 10 * 60_000,
  });

  const { data: distance, isLoading: chartLoading } = useQuery({
    queryKey: ["training", "weekly-distance"],
    queryFn: () => api.weeklySportDistance(8),
  });

  const { data: activities = [], isLoading: listLoading } = useQuery({
    queryKey: ["activities", "list"],
    queryFn: () => api.listActivities(60),
  });

  const weekStart = startOfWeek();
  const thisWeek: ActivitySummary[] = [];
  const earlier: ActivitySummary[] = [];
  for (const activity of activities) {
    if (new Date(activity.start_at) >= weekStart) thisWeek.push(activity);
    else earlier.push(activity);
  }

  const chartData = useMemo(
    () =>
      (distance?.weeks ?? []).map((w) => ({
        label: w.label,
        running_km: w.running_km * (equivalences ? EQ.running : 1),
        cycling_km: w.cycling_km * (equivalences ? EQ.cycling : 1),
        swimming_km: w.swimming_km * (equivalences ? EQ.swimming : 1),
        actual: { running_km: w.running_km, cycling_km: w.cycling_km, swimming_km: w.swimming_km },
      })),
    [distance, equivalences]
  );

  const allTotals = SPORTS.map((sport) => ({
    sport,
    km: (distance?.weeks ?? []).reduce((sum, w) => sum + w[KEY[sport]], 0),
  }));
  // Only chart the sports actually trained in this window.
  const totals = allTotals.filter((t) => t.km > 0);
  const charted = totals.length ? totals.map((t) => t.sport) : (["running"] as Sport[]);
  const multiSport = charted.length > 1;

  const activeSession = coach?.sessions[selected] ?? coach?.sessions[0];

  return (
    <div>
      <h1 className="display text-[clamp(2.6rem,6vw,4rem)]">Training</h1>

      <Section
        className="mt-12"
        title="Today's options"
        subtitle={
          coach
            ? coach.race_date
              ? `${coach.weeks_to_race} weeks to ${coach.race_name}, ${coach.phase} phase`
              : `No race set, ${coach.phase} training`
            : undefined
        }
      >
        {coachLoading ? (
          <div className="skeleton h-48 w-full" />
        ) : coachError || !coach ? (
          <p className="rounded-[20px] bg-haze px-6 py-8 text-slate">
            The session coach didn&apos;t respond. Refresh to try again.
          </p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div role="radiogroup" aria-label="Sport" className="flex flex-col gap-2">
              {coach.sessions.map((session, index) => {
                const sport = asSport(session.sport);
                const isSelected = session === activeSession;
                return (
                  <button
                    key={index}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelected(index)}
                    className={cn(
                      "flex items-center gap-4 rounded-[18px] border px-5 py-4 text-left transition-colors",
                      isSelected ? "border-ink bg-paper" : "border-transparent bg-haze hover:bg-haze-strong"
                    )}
                  >
                    <span
                      className="h-10 w-1.5 shrink-0 rounded-full"
                      style={{ background: sport ? SPORT_COLOR[sport] : "var(--slate)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{session.title}</span>
                      <span className="block text-[0.88rem] text-slate">
                        {sport ? SPORT_NAME[sport] : sportName(session.sport)}
                        {session.duration_min > 0 ? `, ${session.duration_min} min` : ""}, {session.intensity}
                      </span>
                    </span>
                    {index === 0 ? (
                      <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[0.75rem] font-semibold text-paper">
                        Coach&apos;s pick
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {activeSession ? (
              <div className="lg:pt-2">
                <p className="text-slate">{activeSession.focus}</p>
                <h3 className="display mt-3 text-[clamp(2rem,4vw,3rem)]">{activeSession.title}.</h3>
                <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed">{activeSession.description}</p>
                <p className="mt-6 max-w-[56ch] border-l-2 border-line pl-4 text-[0.95rem] leading-relaxed text-slate">
                  {coach.reason}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Section
        className="mt-20"
        title="Weekly distance"
        subtitle={
          equivalences && multiSport
            ? "Swim 1.5 km counts as 10 km running; ride km divided by 4."
            : "Last 8 weeks, in km."
        }
        action={multiSport ? <Toggle enabled={equivalences} onChange={setEquivalences} /> : undefined}
      >
        <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2">
          {totals.map(({ sport, km }) => (
            <span key={sport} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SPORT_COLOR[sport] }} aria-hidden />
              <span className="text-slate">{SPORT_NAME[sport]}</span>
              <span className="num font-semibold">{km.toFixed(1)} km</span>
            </span>
          ))}
        </div>
        <div className="h-80">
          {chartLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={3} barCategoryGap="22%">
                <CartesianGrid stroke="#e6edf1" vertical={false} />
                <XAxis dataKey="label" stroke="#5b7083" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#5b7083"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  unit={equivalences ? " eq" : " km"}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: "rgba(14,34,54,0.04)" }}
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #dde5eb",
                    borderRadius: 14,
                    color: "#0e2236",
                    boxShadow: "0 8px 24px rgba(14,34,54,0.08)",
                    fontSize: 13,
                  }}
                  formatter={(value, name, item) => {
                    const sport = SPORTS.find((s) => KEY[s] === name);
                    const num = typeof value === "number" ? value : Number(value ?? 0);
                    const actual = (item?.payload as { actual?: Record<string, number> })?.actual?.[String(name)] ?? num;
                    const label = sport ? SPORT_NAME[sport] : String(name);
                    return equivalences
                      ? [`${num.toFixed(1)} eq (${actual.toFixed(1)} km)`, label]
                      : [`${num.toFixed(1)} km`, label];
                  }}
                />
                {charted.map((sport) => (
                  <Bar key={sport} dataKey={KEY[sport]} fill={SPORT_HEX[sport]} radius={[6, 6, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      <Section className="mt-20" title="This week">
        {listLoading ? (
          <Spinner />
        ) : thisWeek.length === 0 ? (
          <p className="rounded-[20px] bg-haze px-6 py-8 text-slate">Nothing logged since Monday.</p>
        ) : (
          <ActivityList activities={thisWeek} />
        )}
      </Section>

      {earlier.length > 0 ? (
        <Section className="mt-16" title="Earlier">
          <ActivityList activities={earlier} />
        </Section>
      ) : null}
    </div>
  );
}
