from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.core.auth import CurrentUser
from app.modules.stripe.railway_logs import RailwayLogsNotConfiguredError, get_railway_logs
from app.modules.stripe.schemas import RailwayLogsResponse, StripeOverviewResponse
from app.modules.stripe.service import StripeNotConfiguredError, get_overview

router = APIRouter(prefix="/stripe", tags=["stripe"])


@router.get("/overview", response_model=StripeOverviewResponse)
async def stripe_overview(_user: CurrentUser) -> StripeOverviewResponse:
    try:
        return await get_overview()
    except StripeNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc}") from exc


@router.get("/runtime-logs", response_model=RailwayLogsResponse)
async def stripe_runtime_logs(
    _user: CurrentUser,
    limit: int = Query(default=80, ge=10, le=200),
) -> RailwayLogsResponse:
    """Railway deploy/runtime logs for the API service (shown on Business page)."""
    try:
        return await get_railway_logs(limit=limit)
    except RailwayLogsNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Railway logs error: {exc}") from exc
