from datetime import datetime

from pydantic import BaseModel, Field


class MoneyAmount(BaseModel):
    amount: float
    currency: str = "gbp"


class StripeChargeItem(BaseModel):
    id: str
    amount: float
    currency: str
    status: str
    description: str | None = None
    created_at: datetime
    customer_email: str | None = None


class StripePayoutItem(BaseModel):
    id: str
    amount: float
    currency: str
    status: str
    arrival_date: datetime | None = None
    created_at: datetime


class StripePeriodStats(BaseModel):
    revenue: float
    charge_count: int
    currency: str = "gbp"


class StripeOverviewResponse(BaseModel):
    configured: bool = True
    currency: str = "gbp"
    balance_available: float = 0
    balance_pending: float = 0
    today: StripePeriodStats
    last_7d: StripePeriodStats
    last_30d: StripePeriodStats
    mrr: float | None = None
    active_subscriptions: int | None = None
    recent_charges: list[StripeChargeItem] = Field(default_factory=list)
    recent_payouts: list[StripePayoutItem] = Field(default_factory=list)
    recap: str = ""
    dashboard_url: str = "https://dashboard.stripe.com"
