"use client";

import Link from "next/link";
import type { ActivitySummary } from "@/lib/api";
import { formatDistance, formatDuration, formatPace, sportColor, sportName } from "@/lib/sport";

/** One activity as a hairline row: what, how far, how fast, when. */
export function ActivityRow({ activity }: { activity: ActivitySummary }) {
  const date = new Date(activity.start_at);
  const pace = formatPace(activity.sport, activity.distance_m, activity.duration_seconds);

  return (
    <li className="border-b border-line last:border-0">
      <Link
        href={`/activities/${activity.id}`}
        className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-0.5 py-4 md:grid-cols-[auto_minmax(0,1fr)_7rem_7rem_6rem_7rem]"
      >
        <span
          className="row-span-2 h-9 w-1.5 rounded-full md:row-span-1"
          style={{ background: sportColor(activity.sport) }}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block truncate font-medium group-hover:underline group-hover:underline-offset-4">
            {activity.name || sportName(activity.sport)}
          </span>
          <span className="block text-[0.85rem] text-slate md:hidden">
            {formatDistance(activity.distance_m) ?? formatDuration(activity.duration_seconds)}
            {pace ? `, ${pace}` : ""}
          </span>
        </span>
        <span className="num hidden text-right md:block">{formatDistance(activity.distance_m) ?? "—"}</span>
        <span className="num hidden text-right text-slate md:block">{formatDuration(activity.duration_seconds)}</span>
        <span className="num hidden text-right text-slate md:block">{pace ?? ""}</span>
        <span className="num text-right text-[0.85rem] text-slate md:text-[0.95rem]">
          {date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </Link>
    </li>
  );
}

export function ActivityList({ activities }: { activities: ActivitySummary[] }) {
  return (
    <ul className="border-t border-line">
      {activities.map((a) => (
        <ActivityRow key={a.id} activity={a} />
      ))}
    </ul>
  );
}
