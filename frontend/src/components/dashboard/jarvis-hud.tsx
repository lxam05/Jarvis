"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export type HimReadiness = {
  overall: number;
  status: string;
  weeks_to_race: number;
  phase: string;
  race_name: string;
  race_date: string;
  readiness: { score: number; label: string; detail: string };
  food: { score: number; label: string; detail: string };
  training: { score: number; label: string; detail: string };
  summary: string;
};

/** Module anchors in % of the HUD canvas — layout + SVG branches. */
const NODES = {
  hub: { x: 50, y: 50 },
  training: { x: 18, y: 28 },
  nutrition: { x: 82, y: 28 },
  business: { x: 12, y: 62 },
  slotB: { x: 88, y: 62 },
  slotC: { x: 28, y: 86 },
  slotD: { x: 72, y: 86 },
  slotE: { x: 50, y: 14 },
} as const;

type NodeKey = keyof typeof NODES;

function branchPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const midX = from.x + (to.x - from.x) * 0.55;
  return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(0)}`;
  }
}

function MiniRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score)) / 100;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(0,212,255,0.15)"
        strokeWidth="3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.6))" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="#c8f0ff"
        fontSize="13"
        fontFamily="var(--font-hud-mono)"
      >
        {Math.round(score)}%
      </text>
    </svg>
  );
}

function CoreHub() {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * 360;
    const outer = polar(cx, cy, 132, a);
    const inner = polar(cx, cy, i % 5 === 0 ? 122 : 127, a);
    return { outer, inner, major: i % 5 === 0 };
  });

  return (
    <div className="relative mx-auto h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
      <div
        className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(0,180,255,0.35)_0%,transparent_70%)] blur-2xl"
        aria-hidden
      />

      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full">
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur="90s"
            repeatCount="indefinite"
          />
          <circle
            cx={cx}
            cy={cy}
            r={142}
            fill="none"
            stroke="rgba(0,212,255,0.28)"
            strokeWidth="1"
            strokeDasharray="2 10"
          />
        </g>

        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`360 ${cx} ${cy}`}
            to={`0 ${cx} ${cy}`}
            dur="64s"
            repeatCount="indefinite"
          />
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.inner.x}
              y1={t.inner.y}
              x2={t.outer.x}
              y2={t.outer.y}
              stroke={t.major ? "rgba(0,212,255,0.55)" : "rgba(0,212,255,0.22)"}
              strokeWidth={t.major ? 1.5 : 1}
            />
          ))}
        </g>

        <circle cx={cx} cy={cy} r={108} fill="none" stroke="rgba(0,212,255,0.18)" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={88} fill="none" stroke="rgba(0,212,255,0.14)" strokeWidth="5" />

        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur="48s"
            repeatCount="indefinite"
          />
          <circle
            cx={cx}
            cy={cy}
            r={56}
            fill="none"
            stroke="rgba(0,212,255,0.45)"
            strokeWidth="2"
            strokeDasharray="12 6 4 6"
          />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="hud-core-glow flex h-24 w-24 flex-col items-center justify-center rounded-full border border-[rgba(0,212,255,0.55)] bg-[radial-gradient(circle_at_35%_30%,#5ce1ff_0%,#0088cc_45%,#023a55_100%)] sm:h-28 sm:w-28">
          <p className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-[rgba(2,16,28,0.8)]">
            Jarvis
          </p>
          <p className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-[rgba(2,16,28,0.65)]">
            Core
          </p>
        </div>
      </div>
    </div>
  );
}

function SatelliteShell({
  title,
  className,
  children,
  href,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
  href?: string;
}) {
  const base = cn(
    "absolute z-20 w-[156px] border border-[rgba(0,212,255,0.32)] bg-[rgba(2,14,28,0.82)] p-3 backdrop-blur-md sm:w-[180px]",
    "shadow-[0_0_24px_rgba(0,212,255,0.08)] transition-all",
    href &&
      "cursor-pointer hover:border-[rgba(0,212,255,0.65)] hover:bg-[rgba(0,212,255,0.1)] hover:shadow-[0_0_28px_rgba(0,212,255,0.2)]",
    className
  );

  const inner = (
    <>
      <p className="hud-label mb-2 text-[0.55rem]">{title}</p>
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}

function PlaceholderNode({ className }: { className?: string }) {
  return (
    <SatelliteShell title="Placeholder" className={className}>
      <p className="py-4 text-center font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        Placeholder
      </p>
    </SatelliteShell>
  );
}

export function JarvisHud({
  him,
  calories,
  proteinG,
}: {
  him: HimReadiness | null;
  calories: number;
  proteinG: number;
}) {
  const { data: stripe, isError: stripeError } = useQuery({
    queryKey: ["stripe", "overview"],
    queryFn: () => api.stripeOverview(),
    retry: false,
    refetchInterval: 120_000,
  });

  const branches: NodeKey[] = [
    "training",
    "nutrition",
    "business",
    "slotB",
    "slotC",
    "slotD",
    "slotE",
  ];

  const overall = him?.overall ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative min-h-[calc(100vh-5.5rem)] w-full overflow-hidden"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,80,120,0.18)_0%,transparent_55%)]"
        aria-hidden
      />

      <svg
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="branchGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#00d4ff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {branches.map((key) => (
          <g key={key}>
            <path
              d={branchPath(NODES.hub, NODES[key])}
              fill="none"
              stroke="url(#branchGrad)"
              strokeWidth="0.18"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={NODES[key].x} cy={NODES[key].y} r="0.45" fill="#00d4ff" opacity="0.8" />
          </g>
        ))}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const p = polar(NODES.hub.x, NODES.hub.y, 10, deg);
          return <circle key={deg} cx={p.x} cy={p.y} r="0.35" fill="#00d4ff" opacity="0.55" />;
        })}
      </svg>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <CoreHub />
      </div>

      <SatelliteShell
        title="Training"
        href="/training"
        className="left-[3%] top-[16%] sm:left-[6%] sm:top-[18%]"
      >
        <div className="flex items-center gap-3">
          <MiniRing score={overall} />
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-[var(--muted)]">
              HIM readiness
            </p>
            <p className="mt-1 font-mono text-xs text-[#c8f0ff]">
              {him ? `${him.weeks_to_race}w · ${him.phase}` : "—"}
            </p>
            <p className="mt-2 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[var(--accent)]">
              Open →
            </p>
          </div>
        </div>
      </SatelliteShell>

      <SatelliteShell
        title="Nutrition"
        href="/nutrition"
        className="right-[3%] top-[16%] sm:right-[6%] sm:top-[18%]"
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[var(--muted)]">
              Kcal
            </span>
            <span className="hud-metric text-lg leading-none">{calories.toLocaleString()}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[var(--muted)]">
              Protein
            </span>
            <span className="hud-metric text-lg leading-none">
              {Math.round(proteinG)}
              <span className="text-xs text-[var(--muted)]">g</span>
            </span>
          </div>
          <p className="pt-1 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[var(--accent)]">
            Open →
          </p>
        </div>
      </SatelliteShell>

      <SatelliteShell
        title="Business"
        href="/business"
        className="left-[2%] top-[54%] sm:left-[4%]"
      >
        {stripe ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                Today
              </span>
              <span className="hud-metric text-base leading-none">
                {formatMoney(stripe.today.revenue, stripe.currency)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                Balance
              </span>
              <span className="font-mono text-xs text-[#c8f0ff]">
                {formatMoney(stripe.balance_available, stripe.currency)}
              </span>
            </div>
            <p className="pt-1 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[var(--accent)]">
              Open →
            </p>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            <p className="font-mono text-xs text-[var(--muted)]">
              {stripeError ? "Connect Stripe" : "Loading…"}
            </p>
            <p className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-[var(--accent)]">
              Open →
            </p>
          </div>
        )}
      </SatelliteShell>

      <PlaceholderNode className="right-[2%] top-[54%] sm:right-[4%]" />
      <PlaceholderNode className="bottom-[6%] left-[16%] hidden sm:block" />
      <PlaceholderNode className="bottom-[6%] right-[16%] hidden sm:block" />
      <PlaceholderNode className="left-1/2 top-[3%] hidden -translate-x-1/2 sm:block" />
    </motion.div>
  );
}
