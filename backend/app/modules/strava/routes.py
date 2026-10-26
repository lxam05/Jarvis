from typing import Annotated
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.core.config import settings
from app.core.db import get_db
from app.modules.strava.schemas import (
    ActivityDetailResponse,
    StravaConnectResponse,
    StravaStatusResponse,
    StravaSyncResponse,
)
from app.modules.strava.service import (
    activity_to_detail,
    build_authorize_url,
    complete_connection,
    disconnect,
    get_activity,
    get_status,
    list_activities,
    sync_activities,
    user_id_from_state,
)

router = APIRouter(prefix="/strava", tags=["strava"])


def _settings_redirect(**params: str) -> RedirectResponse:
    return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/settings?{urlencode(params)}")


@router.get("/status", response_model=StravaStatusResponse)
async def strava_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> StravaStatusResponse:
    return StravaStatusResponse(**await get_status(db, user.id))


@router.get("/connect", response_model=StravaConnectResponse)
async def strava_connect(user: CurrentUser) -> StravaConnectResponse:
    return StravaConnectResponse(url=build_authorize_url(user.id))


@router.get("/callback")
async def strava_callback(
    db: Annotated[AsyncSession, Depends(get_db)],
    state: str,
    code: str | None = None,
    scope: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if error or not code:
        return _settings_redirect(strava="denied")
    user_id = user_id_from_state(state)
    if not scope or "activity:read" not in scope:
        return _settings_redirect(strava="missing_scope")
    await complete_connection(db, user_id, code, scope)
    try:
        await sync_activities(db, user_id)
    except HTTPException:
        # Connected but the first import failed; the app retries on next load.
        return _settings_redirect(strava="connected_sync_failed")
    return _settings_redirect(strava="connected")


@router.post("/sync", response_model=StravaSyncResponse)
async def strava_sync(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> StravaSyncResponse:
    count, synced_at = await sync_activities(db, user.id)
    return StravaSyncResponse(activities_upserted=count, last_synced_at=synced_at)


@router.delete("/connection")
async def strava_disconnect(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> dict:
    await disconnect(db, user.id)
    return {"ok": True}


@router.get("/activities")
async def activities_list(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
    limit: int = Query(default=60, ge=1, le=200),
) -> list[dict]:
    return await list_activities(db, user.id, limit)


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
