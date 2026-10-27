"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { ActivityList } from "@/components/activities/activity-row";
import { Panel, Section } from "@/components/ui/card";
import { WeekStrip } from "@/components/today/week-strip";
import { api, type DashboardToday } from "@/lib/api";
import { sportColor, sportName } from "@/lib/sport";

function recoveryWord(score: number) {
  if (score >= 75) return "Fresh";
  if (score >= 60) return "Ready";
  if (score >= 45) return "Holding up";
  return "Run down";
}

function AskCoach() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="mt-8 flex max-w-xl items-center gap-2 rounded-full border border-line bg-paper py-1.5 pl-5 pr-1.5 focus-within:border-ink"
      onSubmit={(e) => {
        e.preventDefault();
        const text = q.trim();
        if (text) router.push(`/coach?q=${encodeURIComponent(text)}`);
      }}
    >
      <label htmlFor="ask" className="sr-only">
        Ask your coach
      </label>
      <input
        id="ask"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask your coach about today…"
        className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-[#8fa1b0]"
      />
      <button type="submit" className="btn btn-primary btn-icon" aria-label="Ask">
        <ArrowUp className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}

function SessionHero() {
  const { data: coach, isLoading, isError } = useQuery({
    queryKey: ["coaching", "session"],
    queryFn: api.coachingSession,
    retry: 1,
    staleTime: 10 * 60_000,
  });

  // The coach returns today's pick first.
  const session = coach?.sessions[0];

  if (isLoading) {
    return (
      <div aria-busy="true">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton mt-5 h-16 w-full max-w-lg" />
        <div className="skeleton mt-3 h-16 w-2/3 max-w-sm" />
        <p className="mt-6 text-slate">Planning today&apos;s session from your recent training…</p>
      </div>
    );
  }

  if (isError || !session || !coach) {
    return (
      <div>
        <h1 className="display text-[clamp(2.6rem,7vw,4.6rem)]">Today&apos;s plan isn&apos;t ready.</h1>
        <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed text-slate">
          The session coach couldn&apos;t load. Check that Strava is connected in Settings, then refresh.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="flex items-center gap-2 font-medium">
        <span className="h-3 w-3 rounded-full" style={{ background: sportColor(session.sport) }} aria-hidden />
        {sportName(session.sport)}
        {session.duration_min > 0 ? <span className="text-slate">for {session.duration_min} minutes</span> : null}
      </p>
      <h1 className="display mt-4 max-w-[14ch] text-[clamp(2.8rem,8vw,5.25rem)]">{session.title}.</h1>
      <p className="mt-6 max-w-[58ch] text-[1.05rem] leading-relaxed text-ink/80">{session.description}</p>
      <p className="mt-3 max-w-[58ch] text-[0.95rem] leading-relaxed text-slate">{coach.reason}</p>
    </div>
  );
}

function RecoveryPanel({ data }: { data: DashboardToday }) {
  const r = data.recovery;
  const asOf = data.garmin_metrics_as_of
    ? new Date(data.garmin_metrics_as_of + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <Panel className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">Recovery</h2>
        <Link href="/recovery" className="text-[0.88rem] text-slate underline-offset-4 hover:text-ink hover:underline">
          Details
        </Link>
      </div>
      <p className="mt-4 flex items-baseline gap-3">
        <span className="display num text-[4.5rem]">{Math.round(r.recovery_score)}</span>
        <span className="display-sm text-[1.4rem]">{recoveryWord(r.recovery_score)}</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-ink" style={{ width: `${r.recovery_score}%` }} />
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-[0.82rem] text-slate">Sleep</dt>
          <dd className="num mt-0.5 text-[1.15rem] font-semibold">{r.sleep_score ?? "—"}</dd>
          <dd className="num text-[0.82rem] text-slate">{r.sleep_hours ? `${r.sleep_hours} h` : ""}</dd>
        </div>
        <div>
          <dt className="text-[0.82rem] text-slate">HRV</dt>
          <dd className="num mt-0.5 text-[1.15rem] font-semibold">{r.hrv_ms != null ? `${r.hrv_ms} ms` : "—"}</dd>
          <dd className="text-[0.82rem] capitalize text-slate">{(r.hrv_status && r.hrv_status !== "NONE" ? r.hrv_status.toLowerCase() : null) ?? ""}</dd>
        </div>
        <div>
          <dt className="text-[0.82rem] text-slate">Body battery</dt>
          <dd className="num mt-0.5 text-[1.15rem] font-semibold">{r.body_battery_max ?? "—"}</dd>
          <dd className="num text-[0.82rem] text-slate">{r.body_battery_min != null ? `low ${r.body_battery_min}` : ""}</dd>
        </div>
      </dl>
      {asOf ? <p className="mt-auto pt-6 text-[0.82rem] text-slate">From Garmin, {asOf}</p> : null}
    </Panel>
  );
}

export function TodayView({ data }: { data: DashboardToday }) {
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", "list"],
    queryFn: () => api.listActivities(60),
  });

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <p className="text-slate">{today}</p>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div>
          <SessionHero />
          <AskCoach />
        </div>
        <RecoveryPanel data={data} />
      </div>

      <Section className="mt-20" title="This week">
        <WeekStrip activities={activities} />
      </Section>

      <Section
        className="mt-20"
        title="Recent activities"
        action={
          <Link href="/training" className="text-[0.92rem] text-slate underline-offset-4 hover:text-ink hover:underline">
            All training
          </Link>
        }
      >
        {data.recent_activities.length === 0 ? (
          <p className="rounded-[20px] bg-haze px-6 py-10 text-slate">
            No activities yet.{" "}
            <Link href="/settings" className="font-medium text-ink underline underline-offset-4">
              Connect Strava
            </Link>{" "}
            to import your training.
          </p>
        ) : (
          <ActivityList activities={data.recent_activities.slice(0, 6)} />
        )}
      </Section>
    </div>
  );
}
