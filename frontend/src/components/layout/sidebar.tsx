"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Apple, Dumbbell, Hexagon, Home, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/settings", label: "Settings", icon: Settings },
];

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-10" />;

  return (
    <div className="px-5 py-3 font-mono">
      <p className="hud-metric text-xl tracking-wider">
        {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.15em] text-[var(--muted)]">
        {now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
      </p>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-[rgba(0,212,255,0.22)] bg-[rgba(2,10,20,0.92)] backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 border-b border-[rgba(0,212,255,0.22)] px-5">
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
      </div>

      <LiveClock />

      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 border border-transparent px-3 py-2.5 font-mono text-xs uppercase tracking-[0.14em] transition-all",
                active
                  ? "border-[rgba(0,212,255,0.4)] bg-[rgba(0,212,255,0.1)] text-[var(--accent)] shadow-[0_0_16px_rgba(0,212,255,0.12)]"
                  : "text-[var(--muted)] hover:border-[rgba(0,212,255,0.2)] hover:bg-[rgba(0,212,255,0.04)] hover:text-[#c8f0ff]"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "drop-shadow-[0_0_6px_rgba(0,212,255,0.6)]")} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(0,212,255,0.18)] px-5 py-4">
        <p className="hud-label">System</p>
        <p className="mt-1 font-mono text-[0.65rem] text-[var(--muted)]">v1.0 · Health OS</p>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="hud-canvas">
      <Sidebar />
      <main className="relative z-10 pl-56">
        <div className="mx-auto max-w-5xl px-6 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
