import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, event_bus
from app.modules.core.models import User
from app.modules.garmin.models import (
    GarminActivity,
    GarminDailySummary,
    GarminHrv,
    GarminSleep,
    GarminSyncCursor,
    GarminSyncRun,
    GarminWeight,
)
from app.modules.garmin.schemas import GarminSyncBatch, GarminSyncRequest, GarminSyncResponse
from app.modules.nutrition.models import BodyWeightEntry


async def get_default_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    if user is None:
        raise RuntimeError("No user found. Run startup seed.")
    return user


async def _upsert_cursor(db: AsyncSession, source: str, modified_at: datetime | None, external_id: str | None) -> None:
    stmt = insert(GarminSyncCursor).values(
        source=source,
        last_modified_at=modified_at,
        last_external_id=external_id,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["source"],
        set_={
            "last_modified_at": stmt.excluded.last_modified_at,
            "last_external_id": stmt.excluded.last_external_id,
        },
    )
    await db.execute(stmt)


async def process_sync(db: AsyncSession, request: GarminSyncRequest) -> GarminSyncResponse:
    user = await get_default_user(db)
    run = GarminSyncRun(started_at=datetime.now(UTC), status="running")
    db.add(run)
    await db.flush()

    counts: dict[str, int] = {
        "daily_summaries": 0,
        "sleep": 0,
        "hrv": 0,
        "activities": 0,
        "weight": 0,
    }
    new_cursors: dict[str, datetime | None] = dict(request.cursors)

    try:
        counts["daily_summaries"] = await _upsert_daily_summaries(db, user.id, request.batch)
        counts["sleep"] = await _upsert_sleep(db, user.id, request.batch)
        counts["hrv"] = await _upsert_hrv(db, user.id, request.batch)
        counts["activities"] = await _upsert_activities(db, user.id, request.batch)
        counts["weight"] = await _upsert_weight(db, user.id, request.batch)

        for source, cursor_time in _compute_cursors(request.batch).items():
            if cursor_time:
                new_cursors[source] = cursor_time
                await _upsert_cursor(db, source, cursor_time, None)

        run.status = "success"
        run.finished_at = datetime.now(UTC)
        run.records_upserted = counts

        await event_bus.publish(
            DomainEvent("garmin.synced", {"user_id": str(user.id), "sync_run_id": str(run.id)})
        )

        return GarminSyncResponse(
            sync_run_id=str(run.id),
            status="success",
            records_upserted=counts,
            cursors=new_cursors,
        )
    except Exception as exc:
        run.status = "failed"
        run.finished_at = datetime.now(UTC)
        run.error = str(exc)
        raise


def _compute_cursors(batch: GarminSyncBatch) -> dict[str, datetime | None]:
    cursors: dict[str, datetime | None] = {}
    if batch.daily_summaries:
        latest = max(d.day for d in batch.daily_summaries)
        cursors["daily_summary"] = datetime.combine(latest, datetime.min.time(), tzinfo=UTC)
    if batch.sleep:
        latest = max(s.day for s in batch.sleep)
        cursors["sleep"] = datetime.combine(latest, datetime.min.time(), tzinfo=UTC)
    if batch.hrv:
        latest = max(h.day for h in batch.hrv)
        cursors["hrv"] = datetime.combine(latest, datetime.min.time(), tzinfo=UTC)
    if batch.activities:
        cursors["activities"] = max(a.start_at for a in batch.activities)
    if batch.weight:
        cursors["weight"] = max(w.measured_at for w in batch.weight)
    return cursors


async def _upsert_daily_summaries(db: AsyncSession, user_id: uuid.UUID, batch: GarminSyncBatch) -> int:
    count = 0
    for dto in batch.daily_summaries:
        values = {
            "user_id": user_id,
            "day": dto.day,
            "steps": dto.steps,
            "step_goal": dto.step_goal,
            "stress_avg": dto.stress_avg,
            "calories_total": dto.calories_total,
            "calories_active": dto.calories_active,
            "calories_bmr": dto.calories_bmr,
            "bb_min": dto.bb_min,
            "bb_max": dto.bb_max,
            "bb_charged": dto.bb_charged,
            "rhr": dto.rhr,
            "hr_min": dto.hr_min,
            "hr_max": dto.hr_max,
            "distance_m": dto.distance_m,
            "intensity_seconds": dto.intensity_seconds,
            "raw": dto.raw,
            "synced_at": datetime.now(UTC),
        }
        stmt = insert(GarminDailySummary).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="garmin_daily_summaries_user_id_day_key",
            set_={k: v for k, v in values.items() if k not in ("user_id", "day")},
        )
        await db.execute(stmt)
        count += 1
    return count


async def _upsert_sleep(db: AsyncSession, user_id: uuid.UUID, batch: GarminSyncBatch) -> int:
    count = 0
    for dto in batch.sleep:
        values = {
            "user_id": user_id,
            "day": dto.day,
            "start_at": dto.start_at,
            "end_at": dto.end_at,
            "total_seconds": dto.total_seconds,
            "deep_seconds": dto.deep_seconds,
            "light_seconds": dto.light_seconds,
            "rem_seconds": dto.rem_seconds,
            "awake_seconds": dto.awake_seconds,
            "score": dto.score,
            "avg_spo2": dto.avg_spo2,
            "avg_stress": dto.avg_stress,
            "raw": dto.raw,
            "synced_at": datetime.now(UTC),
        }
        stmt = insert(GarminSleep).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="garmin_sleep_user_id_day_key",
            set_={k: v for k, v in values.items() if k not in ("user_id", "day")},
        )
        await db.execute(stmt)
        count += 1
    return count


async def _upsert_hrv(db: AsyncSession, user_id: uuid.UUID, batch: GarminSyncBatch) -> int:
    count = 0
    for dto in batch.hrv:
        values = {
            "user_id": user_id,
            "day": dto.day,
            "weekly_avg_ms": dto.weekly_avg_ms,
            "last_night_avg_ms": dto.last_night_avg_ms,
            "last_night_5min_high_ms": dto.last_night_5min_high_ms,
            "baseline_low_ms": dto.baseline_low_ms,
            "baseline_upper_ms": dto.baseline_upper_ms,
            "status": dto.status,
            "raw": dto.raw,
            "synced_at": datetime.now(UTC),
        }
        stmt = insert(GarminHrv).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="garmin_hrv_user_id_day_key",
            set_={k: v for k, v in values.items() if k not in ("user_id", "day")},
        )
        await db.execute(stmt)
        count += 1
    return count


async def _upsert_activities(db: AsyncSession, user_id: uuid.UUID, batch: GarminSyncBatch) -> int:
    count = 0
    for dto in batch.activities:
        values = {
            "user_id": user_id,
            "garmin_activity_id": dto.garmin_activity_id,
            "name": dto.name,
            "sport": dto.sport,
            "sub_sport": dto.sub_sport,
            "start_at": dto.start_at,
            "elapsed_seconds": dto.elapsed_seconds,
            "moving_seconds": dto.moving_seconds,
            "distance_m": dto.distance_m,
            "calories": dto.calories,
            "avg_hr": dto.avg_hr,
            "max_hr": dto.max_hr,
            "training_load": dto.training_load,
            "training_effect": dto.training_effect,
            "route": dto.route or None,
            "raw": dto.raw,
            "synced_at": datetime.now(UTC),
        }
        stmt = insert(GarminActivity).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="garmin_activities_user_id_garmin_activity_id_key",
            set_={k: v for k, v in values.items() if k not in ("user_id", "garmin_activity_id")},
        )
        await db.execute(stmt)
        count += 1
    return count


async def get_activity(db: AsyncSession, user_id: uuid.UUID, activity_id: uuid.UUID) -> GarminActivity | None:
    result = await db.execute(
        select(GarminActivity).where(GarminActivity.id == activity_id, GarminActivity.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_activities(db: AsyncSession, user_id: uuid.UUID, limit: int = 60) -> list[dict]:
    result = await db.execute(
        select(GarminActivity)
        .where(GarminActivity.user_id == user_id)
        .order_by(GarminActivity.start_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "sport": a.sport,
            "start_at": a.start_at.isoformat(),
            "calories": a.calories,
            "duration_seconds": a.elapsed_seconds,
            "distance_m": float(a.distance_m) if a.distance_m is not None else None,
        }
        for a in result.scalars()
    ]

def activity_to_detail(activity: GarminActivity) -> dict:
    raw = activity.raw or {}

    def _float(key: str) -> float | None:
        val = raw.get(key)
        if val is None or val == "None":
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    return {
        "id": str(activity.id),
        "garmin_activity_id": activity.garmin_activity_id,
        "name": activity.name,
        "sport": activity.sport,
        "sub_sport": activity.sub_sport,
        "start_at": activity.start_at,
        "elapsed_seconds": activity.elapsed_seconds,
        "moving_seconds": activity.moving_seconds,
        "distance_m": float(activity.distance_m) if activity.distance_m is not None else None,
        "calories": activity.calories,
        "avg_hr": activity.avg_hr,
        "max_hr": activity.max_hr,
        "training_load": float(activity.training_load) if activity.training_load is not None else None,
        "training_effect": float(activity.training_effect) if activity.training_effect is not None else None,
        "ascent_m": _float("ascent"),
        "descent_m": _float("descent"),
        "avg_speed_mps": _float("avg_speed"),
        "max_speed_mps": _float("max_speed"),
        "route": activity.route or [],
    }


async def _upsert_weight(db: AsyncSession, user_id: uuid.UUID, batch: GarminSyncBatch) -> int:
    count = 0
    for dto in batch.weight:
        gw_values = {
            "user_id": user_id,
            "measured_at": dto.measured_at,
            "weight_kg": dto.weight_kg,
            "source": "garmin",
            "raw": dto.raw,
            "synced_at": datetime.now(UTC),
        }
        stmt = insert(GarminWeight).values(**gw_values)
        stmt = stmt.on_conflict_do_update(
            constraint="garmin_weight_user_id_measured_at_source_key",
            set_={"weight_kg": dto.weight_kg, "raw": dto.raw, "synced_at": datetime.now(UTC)},
        )
        await db.execute(stmt)

        bw_values = {
            "user_id": user_id,
            "measured_at": dto.measured_at,
            "weight_kg": dto.weight_kg,
            "source": "garmin",
        }
        bw_stmt = insert(BodyWeightEntry).values(**bw_values)
        bw_stmt = bw_stmt.on_conflict_do_update(
            constraint="body_weight_entries_user_id_measured_at_source_key",
            set_={"weight_kg": dto.weight_kg},
        )
        await db.execute(bw_stmt)
        count += 1
    return count


async def get_sync_status(db: AsyncSession) -> dict:
    result = await db.execute(
        select(GarminSyncRun).order_by(GarminSyncRun.started_at.desc()).limit(1)
    )
    last_run = result.scalar_one_or_none()

    cursor_result = await db.execute(select(GarminSyncCursor))
    cursors = {
        row.source: row.last_modified_at
        for row in cursor_result.scalars().all()
    }

    return {
        "last_sync_at": last_run.finished_at if last_run else None,
        "last_status": last_run.status if last_run else None,
        "records_upserted": last_run.records_upserted if last_run else None,
        "cursors": cursors,
    }
