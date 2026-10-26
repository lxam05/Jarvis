"use client";

import type { ActivitySummary } from "@/lib/api";
import { SPORTS, SPORT_COLOR, SPORT_NAME, type Sport, asSport, startOfWeek } from "@/lib/sport";

type Day = { date: Date; minutes: Record<Sport | "other", number>; km: number };

function buildWeek(activities: ActivitySummary[]): Day[] {
  const monday = startOfWeek();
  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { date, minutes: { swimming: 0, cycling: 0, running: 0, other: 0 }, km: 0 };
  });
  for (const a of activities) {
    const start = new Date(a.start_at);
    const index = Math.floor((start.getTime() - monday.getTime()) / 86_400_000);
    if (index < 0 || index > 6) continue;
    const key = asSport(a.sport) ?? "other";
    days[index].minutes[key] += (a.duration_seconds ?? 0) / 60;
    days[index].km += (a.distance_m ?? 0) / 1000;
  }
  return days;
}

/** Mon–Sun columns; each bar is stacked by discipline and sized by minutes trained. */
export function WeekStrip({ activities }: { activities: ActivitySummary[] }) {
  const days = buildWeek(activities);
  const totals = days.map((d) => SPORTS.reduce((s, k) => s + d.minutes[k], d.minutes.other));
  const max = Math.max(90, ...totals);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekMinutes = totals.reduce((a, b) => a + b, 0);
  const bySport = SPORTS.map((sport) => ({
    sport,
    minutes: days.reduce((s, d) => s + d.minutes[sport], 0),
  })).filter((x) => x.minutes > 0);

  return (
    <div>
      <ol className="grid grid-cols-7 gap-2 sm:gap-4" aria-label="This week by day">
        {days.map((day, i) => {
          const isToday = day.date.getTime() === today.getTime();
          const isFuture = day.date.getTime() > today.getTime();
          const total = totals[i];
          return (
            <li key={i} className="flex min-w-0 flex-col">
              <div
                className="relative flex h-40 flex-col justify-end overflow-hidden rounded-[14px] bg-haze sm:h-48"
                style={isFuture ? { background: "transparent", border: "1px dashed var(--line)" } : undefined}
                aria-label={`${day.date.toLocaleDateString("en-GB", { weekday: "long" })}: ${Math.round(total)} minutes`}
              >
                {total > 0 ? (
                  <div
                    className="bar-rise flex flex-col-reverse"
                    style={{ height: `${(total / max) * 100}%`, animationDelay: `${i * 60}ms` }}
                  >
                    {[...SPORTS, "other" as const].map((key) =>
                      day.minutes[key] > 0 ? (
                        <div
                          key={key}
                          style={{
                            flexGrow: day.minutes[key],
                            background: key === "other" ? "var(--slate)" : SPORT_COLOR[key],
                          }}
                        />
                      ) : null
                    )}
                  </div>
                ) : null}
              </div>
              <span className={isToday ? "mt-2.5 font-semibold" : "mt-2.5 text-slate"}>
                {isToday ? "Today" : day.date.toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
              <span className="num text-[0.8rem] text-slate">
                {day.km > 0 ? `${day.km.toFixed(1)} km` : total > 0 ? `${Math.round(total)} min` : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[0.92rem]">
        <span>
          <span className="num font-semibold">{(weekMinutes / 60).toFixed(1)} h</span>{" "}
          <span className="text-slate">trained</span>
        </span>
        {bySport.map(({ sport, minutes }) => (
          <span key={sport} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SPORT_COLOR[sport] }} aria-hidden />
            <span className="text-slate">{SPORT_NAME[sport]}</span>
            <span className="num">{Math.round(minutes)} min</span>
          </span>
        ))}
      </div>
    </div>
  );
}
