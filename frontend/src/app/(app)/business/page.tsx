"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

function formatMoney(amount: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: compact ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(compact ? 0 : 2)}`;
  }
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="hud-panel hud-corners p-5">
      <span className="hud-corner-tr" aria-hidden />
      <span className="hud-corner-bl" aria-hidden />
      <p className="hud-label">{label}</p>
      <p className="hud-metric mt-3 text-3xl tracking-tight">{value}</p>
      {detail ? (
        <p className="mt-2 font-mono text-xs text-[var(--muted)]">{detail}</p>
      ) : null}
    </div>
  );
}

export default function BusinessPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["stripe", "overview"],
    queryFn: () => api.stripeOverview(),
    retry: false,
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="hud-spinner" />
      </div>
    );
  }

  if (isError || !data) {
    const msg = error instanceof Error ? error.message : "Stripe unavailable";
    const needsKey = msg.includes("STRIPE_SECRET_KEY") || msg.includes("503");
    return (
      <div>
        <h1 className="hud-title mb-6 text-xl">Business</h1>
        <div className="hud-panel border-[rgba(251,191,36,0.35)] p-6">
          <p className="hud-label text-amber-300">Stripe not connected</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#c8f0ff]">
            {needsKey
              ? "Set STRIPE_SECRET_KEY on the API (prefer a restricted read-only key with Balance, Charges, Payouts, Subscriptions)."
              : msg.slice(0, 280)}
          </p>
          <a
            href="https://dashboard.stripe.com/apikeys"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent)] hover:underline"
          >
            Stripe API keys <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  }

  const cur = data.currency;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="hud-title text-xl">Business</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Stripe · live overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="hud-btn px-3 py-1.5 text-[0.65rem]"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <a
            href={data.dashboard_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--accent)] hover:underline"
          >
            Stripe Dashboard <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Available"
          value={formatMoney(data.balance_available, cur)}
          detail={`Pending ${formatMoney(data.balance_pending, cur)}`}
        />
        <MetricCard
          label="Today"
          value={formatMoney(data.today.revenue, cur)}
          detail={`${data.today.charge_count} charge(s)`}
        />
        <MetricCard
          label="Last 7 days"
          value={formatMoney(data.last_7d.revenue, cur, true)}
          detail={`${data.last_7d.charge_count} charge(s)`}
        />
        <MetricCard
          label="Last 30 days"
          value={formatMoney(data.last_30d.revenue, cur, true)}
          detail={`${data.last_30d.charge_count} charge(s)`}
        />
      </div>

      {data.mrr != null ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="Approx MRR"
            value={formatMoney(data.mrr, cur)}
            detail={
              data.active_subscriptions != null
                ? `${data.active_subscriptions} active subscription(s)`
                : undefined
            }
          />
        </div>
      ) : null}

      <Card className="mt-8" title="Recap" subtitle="How it's getting on">
        <p className="max-w-3xl text-sm leading-relaxed text-[#c8f0ff]">{data.recap}</p>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Recent charges" subtitle="Latest Stripe charges">
          {data.recent_charges.length === 0 ? (
            <p className="font-mono text-sm text-[var(--muted)]">No recent charges</p>
          ) : (
            <ul className="space-y-3">
              {data.recent_charges.map((ch) => (
                <li
                  key={ch.id}
                  className="flex items-start justify-between gap-3 border-b border-[rgba(0,212,255,0.12)] pb-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-[#c8f0ff]">
                      {ch.description || ch.customer_email || ch.id}
                    </p>
                    <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                      {ch.status} ·{" "}
                      {new Date(ch.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-[var(--accent)]">
                    {formatMoney(ch.amount, ch.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent payouts" subtitle="Bank transfers">
          {data.recent_payouts.length === 0 ? (
            <p className="font-mono text-sm text-[var(--muted)]">No recent payouts</p>
          ) : (
            <ul className="space-y-3">
              {data.recent_payouts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 border-b border-[rgba(0,212,255,0.12)] pb-3 last:border-0"
                >
                  <div>
                    <p className="font-mono text-sm uppercase tracking-[0.12em] text-[#c8f0ff]">
                      {p.status}
                    </p>
                    <p className="mt-1 font-mono text-[0.6rem] text-[var(--muted)]">
                      {p.arrival_date
                        ? `Arrives ${new Date(p.arrival_date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : new Date(p.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-[var(--accent)]">
                    {formatMoney(p.amount, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
