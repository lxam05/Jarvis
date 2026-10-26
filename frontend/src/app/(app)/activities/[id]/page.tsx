"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/card";
import { api } from "@/lib/api";
import { SPORT_HEX, asSport, formatDistance, formatDuration, formatPace, sportColor, sportName } from "@/lib/sport";

const ActivityMap = dynamic(
  () => import("@/components/activities/activity-map").then((m) => m.ActivityMap),
  {
    ssr: false,
    loading: () => <div className="skeleton h-[380px] w-full rounded-[28px]" />,
  }
);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line pt-4">
      <dt className="text-[0.85rem] text-slate">{label}</dt>
      <dd className="display num mt-1 text-[2rem]">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/training" className="inline-flex items-center gap-2 text-slate hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Training
    </Link>
  );
}

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => api.getActivity(id),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <BackLink />
        <p className="mt-8 rounded-[20px] bg-haze px-6 py-10 text-slate">
          This activity wasn&apos;t found. It may have been deleted on Strava.
        </p>
      </div>
    );
  }

  const sport = asSport(data.sport);
  const moving = data.moving_seconds ?? data.elapsed_seconds;
  const pace = formatPace(data.sport, data.distance_m, moving);
  const route = (data.route || []).map(([lat, lng]) => [lat, lng] as [number, number]);

  const stats: Array<[string, string | null]> = [
    ["Distance", formatDistance(data.distance_m, 2)],
    ["Moving time", formatDuration(moving)],
    [sport === "cycling" ? "Avg speed" : "Avg pace", pace],
    ["Elevation gain", data.ascent_m != null ? `${Math.round(data.ascent_m)} m` : null],
    ["Avg heart rate", data.avg_hr != null ? `${data.avg_hr} bpm` : null],
    ["Max heart rate", data.max_hr != null ? `${data.max_hr} bpm` : null],
    ["Avg power", data.avg_watts != null ? `${Math.round(data.avg_watts)} W` : null],
    ["Relative effort", data.training_load != null ? data.training_load.toFixed(0) : null],
    ["Energy", data.calories != null ? `${data.calories} kcal` : null],
  ];

  return (
    <div>
      <BackLink />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="h-3 w-3 rounded-full" style={{ background: sportColor(data.sport) }} aria-hidden />
            {sportName(data.sport)}
            <span className="text-slate">
              {new Date(data.start_at).toLocaleString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
          <h1 className="display mt-4 max-w-[18ch] text-[clamp(2.4rem,6vw,4rem)]">{data.name || sportName(data.sport)}</h1>
        </div>
        <a href={data.strava_url} target="_blank" rel="noreferrer" className="btn btn-quiet">
          Open in Strava <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-10">
        <ActivityMap route={route} color={sport ? SPORT_HEX[sport] : "#0e2236"} />
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-3">
        {stats
          .filter((s): s is [string, string] => s[1] != null && s[1] !== "—")
          .map(([label, value]) => (
            <Stat key={label} label={label} value={value} />
          ))}
      </dl>
    </div>
  );
}
