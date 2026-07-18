from typing import Annotated

from fastapi import APIRouter, HTTPException

from app.core.auth import CurrentUser
from app.modules.stripe.schemas import StripeOverviewResponse
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
