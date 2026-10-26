"use client";

import Link from "next/link";
import { Activity, HeartPulse, MessageCircle, Settings, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/training", label: "Training", icon: Activity },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/recovery", label: "Recovery", icon: HeartPulse },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

/** Three stacked strokes in the discipline colours: swim, bike, run. */
function Mark() {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden>
      <rect x="0" y="0" width="14" height="4" rx="2" fill="var(--swim)" />
      <rect x="4" y="7" width="18" height="4" rx="2" fill="var(--bike)" />
      <rect x="0" y="14" width="11" height="4" rx="2" fill="var(--run)" />
    </svg>
  );
}

/** Phones get the main sections as a thumb-reachable bar at the bottom. */
function BottomBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.72rem] font-medium",
                  active ? "text-ink" : "text-slate"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                    active && "bg-ink text-paper"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-4 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="brick home">
          <Mark />
          <span className="display-sm text-[1.35rem] leading-none">brick</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[0.9rem] font-medium transition-colors",
                  active ? "bg-ink text-paper" : "text-slate hover:bg-haze hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 md:hidden" />

        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            pathname.startsWith("/settings") ? "bg-ink text-paper" : "text-slate hover:bg-haze hover:text-ink"
          )}
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="mx-auto max-w-[1120px] px-4 pb-32 pt-8 md:px-8 md:pb-20 md:pt-12">{children}</main>
      <BottomBar />
    </div>
  );
}
