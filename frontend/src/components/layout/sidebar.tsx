"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Apple,
  Brain,
  Dumbbell,
  Home,
  LogOut,
  Moon,
  Scale,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearToken } from "@/lib/api";

const nav = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/recovery", label: "Recovery", icon: Moon },
  { href: "/weight", label: "Weight", icon: Scale },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-800/60 bg-zinc-950/95 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 border-b border-zinc-800/60 px-6">
        <Brain className="h-6 w-6 text-emerald-400" />
        <span className="text-lg font-semibold tracking-tight text-zinc-50">JARVIS</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800/60 p-4">
        <button
          onClick={() => {
            clearToken();
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="pl-64">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
