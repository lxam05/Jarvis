"use client";

import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/card";
import { TodayView } from "@/components/today/today-view";
import { api } from "@/lib/api";

export default function TodayPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[20px] bg-haze px-6 py-10">
        <h1 className="display-sm text-[1.6rem]">Can&apos;t reach your training data.</h1>
        <p className="mt-2 text-slate">The server didn&apos;t respond. Refresh in a minute.</p>
      </div>
    );
  }

  return <TodayView data={data} />;
}
