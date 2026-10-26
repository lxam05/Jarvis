"use client";

import { AppShell } from "@/components/layout/sidebar";
import { useEventStream } from "@/hooks/use-event-stream";
import { useStravaAutoSync } from "@/hooks/use-strava-auto-sync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useEventStream();
  useStravaAutoSync();
  return <AppShell>{children}</AppShell>;
}
