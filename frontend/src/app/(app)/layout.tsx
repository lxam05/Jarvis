"use client";

import { AppShell } from "@/components/layout/sidebar";
import { useEventStream } from "@/hooks/use-event-stream";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useEventStream();
  return <AppShell>{children}</AppShell>;
}
