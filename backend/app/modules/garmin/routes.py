from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, verify_sync_agent_key
from app.core.db import get_db
from app.modules.garmin.schemas import (
    ActivityDetailResponse,
    GarminSyncRequest,
    GarminSyncResponse,
    GarminSyncStatusResponse,
)
from app.modules.garmin.service import activity_to_detail, get_activity, get_sync_status, process_sync

router = APIRouter(prefix="/garmin", tags=["garmin"])


@router.post("/sync", response_model=GarminSyncResponse)
async def sync_garmin_data(
    request: GarminSyncRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(verify_sync_agent_key)],
) -> GarminSyncResponse:
    return await process_sync(db, request)


@router.get("/sync/status", response_model=GarminSyncStatusResponse)
async def sync_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> GarminSyncStatusResponse:
    status = await get_sync_status(db)
    return GarminSyncStatusResponse(**status)


@router.get("/activities/{activity_id}", response_model=ActivityDetailResponse)
async def activity_detail(
    activity_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> ActivityDetailResponse:
    activity = await get_activity(db, user.id, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return ActivityDetailResponse(**activity_to_detail(activity))
