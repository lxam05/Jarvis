import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.events import DomainEvent, event_bus
from app.modules.strava.models import StravaActivity, StravaConnection

AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize"
API_BASE = "https://www.strava.com/api/v3"
SCOPE = "read,activity:read_all"
# How far back the first import reaches.
INITIAL_IMPORT_DAYS = 365
# Re-fetch a little before the newest stored activity so edits (names, HR) get picked up.
RESYNC_OVERLAP = timedelta(days=2)

SPORT_MAP = {
    "Run": "running",
    "TrailRun": "running",
    "VirtualRun": "running",
    "Ride": "cycling",
    "VirtualRide": "cycling",
    "GravelRide": "cycling",
    "MountainBikeRide": "cycling",
    "EBikeRide": "cycling",
    "EMountainBikeRide": "cycling",
    "Velomobile": "cycling",
    "Swim": "swimming",
}


def is_configured() -> bool:
    return bool(settings.strava_client_id and settings.strava_client_secret)


def _redirect_uri() -> str:
    return f"{settings.public_api_url.rstrip('/')}/v1/strava/callback"


def build_authorize_url(user_id: uuid.UUID) -> str:
    if not is_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Strava is not configured on the server")
    # Signed state ties the callback to this user and stops forged callbacks.
    state = jwt.encode(
        {"sub": str(user_id), "purpose": "strava", "exp": datetime.now(UTC) + timedelta(minutes=10)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    query = urlencode(
        {
            "client_id": settings.strava_client_id,
            "redirect_uri": _redirect_uri(),
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": SCOPE,
            "state": state,
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def user_id_from_state(state: str) -> uuid.UUID:
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("purpose") != "strava":
            raise ValueError("wrong purpose")
        return uuid.UUID(payload["sub"])
    except (JWTError, ValueError, KeyError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired Strava state") from exc


async def _token_request(data: dict) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                **data,
            },
        )
    if response.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Strava token request failed: {response.text}")
    return response.json()


async def complete_connection(db: AsyncSession, user_id: uuid.UUID, code: str, scope: str | None) -> None:
    token = await _token_request({"code": code, "grant_type": "authorization_code"})
    athlete = token.get("athlete") or {}
    name = " ".join(p for p in (athlete.get("firstname"), athlete.get("lastname")) if p) or None
    values = {
        "user_id": user_id,
        "athlete_id": athlete.get("id"),
        "athlete_name": name,
        "access_token": token["access_token"],
        "refresh_token": token["refresh_token"],
        "expires_at": datetime.fromtimestamp(token["expires_at"], UTC),
        "scope": scope,
    }
    stmt = insert(StravaConnection).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={k: v for k, v in values.items() if k != "user_id"},
    )
    await db.execute(stmt)


async def get_connection(db: AsyncSession, user_id: uuid.UUID) -> StravaConnection | None:
    return await db.get(StravaConnection, user_id)


async def _access_token(conn: StravaConnection) -> str:
    if conn.expires_at - datetime.now(UTC) > timedelta(minutes=2):
        return conn.access_token
    token = await _token_request({"grant_type": "refresh_token", "refresh_token": conn.refresh_token})
    conn.access_token = token["access_token"]
    conn.refresh_token = token["refresh_token"]
    conn.expires_at = datetime.fromtimestamp(token["expires_at"], UTC)
    return conn.access_token


def decode_polyline(encoded: str | None) -> list[list[float]]:
    """Decode a Google encoded polyline (Strava's map.summary_polyline) to [[lat, lng], ...]."""
    if not encoded:
        return []
    coords: list[list[float]] = []
    index = lat = lng = 0
    while index < len(encoded):
        for axis in range(2):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += delta
            else:
                lng += delta
        coords.append([lat / 1e5, lng / 1e5])
    return coords


def _activity_values(user_id: uuid.UUID, a: dict) -> dict:
    sport_type = a.get("sport_type") or a.get("type")
    kilojoules = a.get("kilojoules")
    return {
        "user_id": user_id,
        "strava_activity_id": a["id"],
        "name": a.get("name"),
        "sport": SPORT_MAP.get(sport_type, (sport_type or "").lower() or None),
        "sport_type": sport_type,
        "start_at": datetime.fromisoformat(a["start_date"].replace("Z", "+00:00")),
        "elapsed_seconds": a.get("elapsed_time"),
        "moving_seconds": a.get("moving_time"),
        "distance_m": a.get("distance"),
        "elevation_gain_m": a.get("total_elevation_gain"),
        # Summary activities carry no calories; ride kJ ≈ kcal burned is the usual approximation.
        "calories": int(kilojoules) if kilojoules else None,
        "avg_hr": round(a["average_heartrate"]) if a.get("average_heartrate") else None,
        "max_hr": round(a["max_heartrate"]) if a.get("max_heartrate") else None,
        "avg_watts": a.get("average_watts"),
        "training_load": a.get("suffer_score"),
        "route": decode_polyline((a.get("map") or {}).get("summary_polyline")) or None,
        "raw": a,
        "synced_at": datetime.now(UTC),
    }


async def sync_activities(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, datetime]:
    conn = await get_connection(db, user_id)
    if conn is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Strava is not connected")

    latest = await db.execute(
        select(func.max(StravaActivity.start_at)).where(StravaActivity.user_id == user_id)
    )
    newest = latest.scalar_one_or_none()
    since = newest - RESYNC_OVERLAP if newest else datetime.now(UTC) - timedelta(days=INITIAL_IMPORT_DAYS)

    token = await _access_token(conn)
    count = 0
    page = 1
    async with httpx.AsyncClient(timeout=30.0, headers={"Authorization": f"Bearer {token}"}) as client:
        while True:
            response = await client.get(
                f"{API_BASE}/athlete/activities",
                params={"after": int(since.timestamp()), "per_page": 200, "page": page},
            )
            if response.status_code == 401:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Strava rejected the token — reconnect Strava")
            if response.status_code == 429:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Strava rate limit hit — try again later")
            response.raise_for_status()
            items = response.json()
            if not items:
                break
            for item in items:
                values = _activity_values(user_id, item)
                stmt = insert(StravaActivity).values(**values)
                stmt = stmt.on_conflict_do_update(
                    constraint="strava_activities_user_id_strava_activity_id_key",
                    set_={k: v for k, v in values.items() if k not in ("user_id", "strava_activity_id")},
                )
                await db.execute(stmt)
                count += 1
            if len(items) < 200:
                break
            page += 1

    conn.last_synced_at = datetime.now(UTC)
    await db.flush()
    await event_bus.publish(DomainEvent("strava.synced", {"user_id": str(user_id), "activities": count}))
    return count, conn.last_synced_at


async def disconnect(db: AsyncSession, user_id: uuid.UUID) -> None:
    conn = await get_connection(db, user_id)
    if conn is None:
        return
    try:
        token = await _access_token(conn)
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(DEAUTHORIZE_URL, data={"access_token": token})
    except (httpx.HTTPError, HTTPException):
        pass  # Still drop the local tokens even if Strava is unreachable.
    await db.delete(conn)


async def get_status(db: AsyncSession, user_id: uuid.UUID) -> dict:
    conn = await get_connection(db, user_id)
    count = await db.execute(select(func.count(StravaActivity.id)).where(StravaActivity.user_id == user_id))
    return {
        "configured": is_configured(),
        "connected": conn is not None,
        "athlete_name": conn.athlete_name if conn else None,
        "last_synced_at": conn.last_synced_at if conn else None,
        "activity_count": int(count.scalar_one()),
    }


def activity_summary(a: StravaActivity) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "sport": a.sport,
        "start_at": a.start_at.isoformat(),
        "calories": a.calories,
        "duration_seconds": a.moving_seconds or a.elapsed_seconds,
        "distance_m": float(a.distance_m) if a.distance_m is not None else None,
    }


async def list_activities(db: AsyncSession, user_id: uuid.UUID, limit: int = 60) -> list[dict]:
    result = await db.execute(
        select(StravaActivity)
        .where(StravaActivity.user_id == user_id)
        .order_by(StravaActivity.start_at.desc())
        .limit(limit)
    )
    return [activity_summary(a) for a in result.scalars()]


async def get_activity(db: AsyncSession, user_id: uuid.UUID, activity_id: uuid.UUID) -> StravaActivity | None:
    result = await db.execute(
        select(StravaActivity).where(StravaActivity.id == activity_id, StravaActivity.user_id == user_id)
    )
    return result.scalar_one_or_none()


def activity_to_detail(a: StravaActivity) -> dict:
    raw = a.raw or {}
    return {
        "id": str(a.id),
        "strava_activity_id": a.strava_activity_id,
        "strava_url": f"https://www.strava.com/activities/{a.strava_activity_id}",
        "name": a.name,
        "sport": a.sport,
        "sport_type": a.sport_type,
        "start_at": a.start_at,
        "elapsed_seconds": a.elapsed_seconds,
        "moving_seconds": a.moving_seconds,
        "distance_m": float(a.distance_m) if a.distance_m is not None else None,
        "calories": a.calories,
        "avg_hr": a.avg_hr,
        "max_hr": a.max_hr,
        "avg_watts": float(a.avg_watts) if a.avg_watts is not None else None,
        "training_load": float(a.training_load) if a.training_load is not None else None,
        "ascent_m": float(a.elevation_gain_m) if a.elevation_gain_m is not None else None,
        "avg_speed_mps": raw.get("average_speed"),
        "max_speed_mps": raw.get("max_speed"),
        "route": a.route or [],
    }
