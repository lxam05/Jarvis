"""Stripe business metrics — read-only overview for the owner's account."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import stripe

from app.core.config import settings
from app.modules.stripe.schemas import (
    StripeChargeItem,
    StripeOverviewResponse,
    StripePeriodStats,
    StripePayoutItem,
)


class StripeNotConfiguredError(Exception):
    pass


def _ensure_stripe() -> None:
    if not settings.stripe_secret_key:
        raise StripeNotConfiguredError("STRIPE_SECRET_KEY is not configured")
    stripe.api_key = settings.stripe_secret_key


def _minor_to_major(amount: int | None, currency: str) -> float:
    """Convert Stripe minor units to major (most currencies use 100)."""
    if amount is None:
        return 0.0
    zero_decimal = {
        "bif",
        "clp",
        "djf",
        "gnf",
        "jpy",
        "kmf",
        "krw",
        "mga",
        "pyg",
        "rwf",
        "ugx",
        "vnd",
        "vuv",
        "xaf",
        "xof",
        "xpf",
    }
    if currency.lower() in zero_decimal:
        return float(amount)
    return round(amount / 100.0, 2)


def _sum_balance(buckets: list[Any]) -> tuple[float, str]:
    total = 0.0
    currency = "gbp"
    for b in buckets or []:
        currency = getattr(b, "currency", currency) or currency
        total += _minor_to_major(getattr(b, "amount", 0) or 0, currency)
    return total, currency


def _charge_revenue(ch: Any) -> float:
    """Prefer net after fees when available; else amount - refunded."""
    currency = getattr(ch, "currency", "gbp") or "gbp"
    amount = getattr(ch, "amount", 0) or 0
    refunded = getattr(ch, "amount_refunded", 0) or 0
    return _minor_to_major(amount - refunded, currency)


def _fetch_succeeded_charges_since(created_gte: int, limit: int = 100) -> list[Any]:
    charges: list[Any] = []
    starting_after = None
    while True:
        params: dict[str, Any] = {
            "limit": min(100, limit - len(charges)),
            "created": {"gte": created_gte},
        }
        if starting_after:
            params["starting_after"] = starting_after
        page = stripe.Charge.list(**params)
        data = list(page.data)
        for ch in data:
            if getattr(ch, "status", None) == "succeeded" and not getattr(ch, "disputed", False):
                charges.append(ch)
        if not page.has_more or len(charges) >= limit or not data:
            break
        starting_after = data[-1].id
        if len(charges) >= limit:
            break
    return charges[:limit]


def _period_stats(charges: list[Any], since: datetime, currency: str) -> StripePeriodStats:
    since_ts = since.timestamp()
    matched = [c for c in charges if (getattr(c, "created", 0) or 0) >= since_ts]
    revenue = sum(_charge_revenue(c) for c in matched)
    return StripePeriodStats(revenue=round(revenue, 2), charge_count=len(matched), currency=currency)


def _estimate_mrr() -> tuple[float | None, int | None, str]:
    """Rough MRR from active subscriptions; returns (mrr, count, currency)."""
    try:
        subs = stripe.Subscription.list(status="active", limit=100, expand=["data.items.data.price"])
    except Exception:
        return None, None, "gbp"

    total = 0.0
    currency = "gbp"
    count = 0
    for sub in subs.data:
        count += 1
        items = getattr(getattr(sub, "items", None), "data", None) or []
        for item in items:
            price = getattr(item, "price", None)
            if price is None:
                continue
            currency = getattr(price, "currency", currency) or currency
            unit = getattr(price, "unit_amount", None) or 0
            qty = getattr(item, "quantity", 1) or 1
            interval = getattr(getattr(price, "recurring", None), "interval", None)
            interval_count = getattr(getattr(price, "recurring", None), "interval_count", 1) or 1
            major = _minor_to_major(unit * qty, currency)
            if interval == "year":
                total += major / (12 * interval_count)
            elif interval == "week":
                total += major * (52 / 12) / interval_count
            elif interval == "day":
                total += major * (365 / 12) / interval_count
            else:
                # month (default)
                total += major / interval_count

    if count == 0:
        return None, 0, currency
    return round(total, 2), count, currency


def _build_recap(
    *,
    today: StripePeriodStats,
    week: StripePeriodStats,
    month: StripePeriodStats,
    mrr: float | None,
    balance_available: float,
    currency: str,
) -> str:
    cur = currency.upper()
    parts = [
        f"Today {cur} {today.revenue:,.2f} across {today.charge_count} charge(s).",
        f"Last 7d {cur} {week.revenue:,.2f} ({week.charge_count} charges); "
        f"30d {cur} {month.revenue:,.2f} ({month.charge_count} charges).",
        f"Available balance {cur} {balance_available:,.2f}.",
    ]
    if mrr is not None:
        parts.append(f"Approx MRR {cur} {mrr:,.2f}.")
    if week.revenue <= 0 and month.revenue <= 0:
        parts.append("No recent successful charges — quiet period.")
    elif week.revenue >= month.revenue * 0.45 and month.charge_count >= 3:
        parts.append("Recent week is carrying a strong share of monthly volume.")
    return " ".join(parts)


def _fetch_overview_sync() -> StripeOverviewResponse:
    _ensure_stripe()

    bal = stripe.Balance.retrieve()
    available, currency = _sum_balance(list(bal.available or []))
    pending, _ = _sum_balance(list(bal.pending or []))

    now = datetime.now(UTC)
    start_today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    start_7d = now - timedelta(days=7)
    start_30d = now - timedelta(days=30)

    # Fetch once from 30d window, then slice for periods.
    charges_30d = _fetch_succeeded_charges_since(int(start_30d.timestamp()), limit=200)

    today = _period_stats(charges_30d, start_today, currency)
    last_7d = _period_stats(charges_30d, start_7d, currency)
    last_30d = _period_stats(charges_30d, start_30d, currency)

    recent_raw = stripe.Charge.list(limit=10)
    recent_charges: list[StripeChargeItem] = []
    for ch in recent_raw.data:
        billing = getattr(ch, "billing_details", None)
        email = None
        if billing is not None:
            email = getattr(billing, "email", None)
        if not email:
            email = getattr(ch, "receipt_email", None)
        recent_charges.append(
            StripeChargeItem(
                id=ch.id,
                amount=_minor_to_major(getattr(ch, "amount", 0) or 0, getattr(ch, "currency", currency)),
                currency=(getattr(ch, "currency", currency) or currency).lower(),
                status=getattr(ch, "status", "unknown") or "unknown",
                description=getattr(ch, "description", None),
                created_at=datetime.fromtimestamp(getattr(ch, "created", 0) or 0, tz=UTC),
                customer_email=email,
            )
        )

    recent_payouts: list[StripePayoutItem] = []
    try:
        payouts = stripe.Payout.list(limit=5)
        for p in payouts.data:
            arrival = getattr(p, "arrival_date", None)
            recent_payouts.append(
                StripePayoutItem(
                    id=p.id,
                    amount=_minor_to_major(getattr(p, "amount", 0) or 0, getattr(p, "currency", currency)),
                    currency=(getattr(p, "currency", currency) or currency).lower(),
                    status=getattr(p, "status", "unknown") or "unknown",
                    arrival_date=datetime.fromtimestamp(arrival, tz=UTC) if arrival else None,
                    created_at=datetime.fromtimestamp(getattr(p, "created", 0) or 0, tz=UTC),
                )
            )
    except Exception:
        pass

    mrr, sub_count, mrr_currency = _estimate_mrr()
    if mrr is not None:
        currency = mrr_currency or currency

    recap = _build_recap(
        today=today,
        week=last_7d,
        month=last_30d,
        mrr=mrr,
        balance_available=available,
        currency=currency,
    )

    return StripeOverviewResponse(
        configured=True,
        currency=currency.lower(),
        balance_available=round(available, 2),
        balance_pending=round(pending, 2),
        today=today,
        last_7d=last_7d,
        last_30d=last_30d,
        mrr=mrr,
        active_subscriptions=sub_count,
        recent_charges=recent_charges,
        recent_payouts=recent_payouts,
        recap=recap,
        dashboard_url="https://dashboard.stripe.com",
    )


async def get_overview() -> StripeOverviewResponse:
    return await asyncio.to_thread(_fetch_overview_sync)
