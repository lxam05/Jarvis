import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.auth import CurrentUser
from app.core.db import get_db
from app.core.events import DomainEvent, event_bus
from app.modules.dashboard.schemas import (
    DashboardTodayResponse,
    WeeklySportDistanceResponse,
    WeeklyTrainingResponse,
    WeightTrendResponse,
)
from app.modules.dashboard.service import (
    get_dashboard_today,
    get_weekly_sport_distance,
    get_weekly_training,
    get_weight_trend,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/today", response_model=DashboardTodayResponse)
async def dashboard_today(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> DashboardTodayResponse:
    return await get_dashboard_today(db, user.id)


@router.get("/weight-trend", response_model=WeightTrendResponse)
async def weight_trend(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
    days: int = Query(default=30, ge=7, le=365),
) -> WeightTrendResponse:
    return await get_weight_trend(db, user.id, days)


@router.get("/training/week", response_model=WeeklyTrainingResponse)
async def training_week(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> WeeklyTrainingResponse:
    return await get_weekly_training(db, user.id)


@router.get("/training/weekly-distance", response_model=WeeklySportDistanceResponse)
async def training_weekly_distance(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
    weeks: int = Query(default=8, ge=4, le=26),
) -> WeeklySportDistanceResponse:
    return await get_weekly_sport_distance(db, user.id, weeks)


events_router = APIRouter(prefix="/events", tags=["events"])


@events_router.get("/stream")
async def event_stream(user: CurrentUser) -> EventSourceResponse:
    queue: asyncio.Queue[DomainEvent] = asyncio.Queue()
    event_bus.register_sse_queue(queue)

    async def generator():
        try:
            yield {"event": "connected", "data": json.dumps({"user_id": str(user.id)})}
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {"event": event.name, "data": json.dumps(event.payload)}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            event_bus.unregister_sse_queue(queue)

    return EventSourceResponse(generator())
