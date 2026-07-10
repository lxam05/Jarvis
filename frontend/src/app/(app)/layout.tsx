"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/sidebar";
import { useEventStream } from "@/hooks/use-event-stream";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEventStream();

  useEffect(() => {
    const token = localStorage.getItem("jarvis_token");
    if (!token) router.replace("/login");
  }, [router]);

  return <AppShell>{children}</AppShell>;
}
