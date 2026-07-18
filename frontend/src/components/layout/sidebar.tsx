"use client";

import Link from "next/link";
import { Hexagon, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function TopBar() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <header className="relative z-40 flex h-14 items-center justify-between border-b border-[rgba(0,212,255,0.18)] px-5 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <Hexagon className="h-8 w-8 text-[var(--accent)] hud-glow" strokeWidth={1.25} />
          <span className="absolute inset-0 flex items-center justify-center text-[0.55rem] font-semibold tracking-wider text-[var(--accent)]">
            J
          </span>
        </div>
        <div>
          <p className="hud-title text-sm leading-none">JARVIS</p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-[var(--muted)]">
            <span className="hud-status-dot" />
            Online
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-3">
        {!onHome ? (
          <Link
            href="/"
            className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--accent)]"
          >
            Core
          </Link>
        ) : null}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors",
            pathname.startsWith("/settings")
              ? "border-[rgba(0,212,255,0.45)] text-[var(--accent)]"
              : "border-transparent text-[var(--muted)] hover:border-[rgba(0,212,255,0.25)] hover:text-[#c8f0ff]"
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="hud-canvas min-h-screen">
      <TopBar />
      <main className="relative z-10">
        <div className="mx-auto max-w-[1400px] px-4 py-4 md:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
