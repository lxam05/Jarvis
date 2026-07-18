import sqlite3
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from adapter.dtos import (
    ActivityDTO,
    DailySummaryDTO,
    GarminSyncBatch,
    HrvDTO,
    SleepDTO,
    WeightDTO,
)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value[:10], "%Y-%m-%d").date()


def _time_to_seconds(value: str | None) -> int | None:
    if not value:
        return None
    parts = value.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(float(h)) * 3600 + int(float(m)) * 60 + int(float(s))
    return None


def _row_to_dict(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict[str, Any]:
    return {desc[0]: row[idx] for idx, desc in enumerate(cursor.description)}


class SQLiteGarminSource:
    """Read-only adapter for GarminDB SQLite files."""

    def __init__(self, garmin_db_path: str, activities_db_path: str) -> None:
        self.garmin_db_path = str(Path(garmin_db_path).expanduser())
        self.activities_db_path = str(Path(activities_db_path).expanduser())

    def _connect(self, path: str) -> sqlite3.Connection:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def fetch_batch(self, cursors: dict[str, datetime | None]) -> GarminSyncBatch:
        return GarminSyncBatch(
            daily_summaries=self.fetch_daily_summaries(cursors.get("daily_summary")),
            sleep=self.fetch_sleep(cursors.get("sleep")),
            hrv=self.fetch_hrv(cursors.get("hrv")),
            activities=self.fetch_activities(cursors.get("activities")),
            weight=self.fetch_weight(cursors.get("weight")),
        )

    def fetch_daily_summaries(self, since: datetime | None) -> list[DailySummaryDTO]:
        conn = self._connect(self.garmin_db_path)
        try:
            cur = conn.cursor()
            query = "SELECT * FROM daily_summary"
            params: tuple = ()
            if since:
                query += " WHERE day >= ?"
                params = (since.strftime("%Y-%m-%d"),)
            cur.execute(query, params)
            results = []
            for row in cur.fetchall():
                raw = _row_to_dict(cur, row)
                day = _parse_date(raw.get("day"))
                if not day:
                    continue
                moderate = _time_to_seconds(str(raw.get("moderate_activity_time")))
                vigorous = _time_to_seconds(str(raw.get("vigorous_activity_time")))
                intensity = (moderate or 0) + 2 * (vigorous or 0)
                distance = raw.get("distance")
                results.append(
                    DailySummaryDTO(
                        day=day,
                        steps=raw.get("steps"),
                        step_goal=raw.get("step_goal"),
                        stress_avg=raw.get("stress_avg"),
                        calories_total=raw.get("calories_total"),
                        calories_active=raw.get("calories_active"),
                        calories_bmr=raw.get("calories_bmr"),
                        bb_min=raw.get("bb_min"),
                        bb_max=raw.get("bb_max"),
                        bb_charged=raw.get("bb_charged"),
                        rhr=raw.get("rhr"),
                        hr_min=raw.get("hr_min"),
                        hr_max=raw.get("hr_max"),
                        distance_m=Decimal(str(distance)) * 1000 if distance else None,
                        intensity_seconds=intensity or None,
                        raw={k: str(v) if v is not None else None for k, v in raw.items()},
                    )
                )
            return results
        finally:
            conn.close()

    def fetch_sleep(self, since: datetime | None) -> list[SleepDTO]:
        conn = self._connect(self.garmin_db_path)
        try:
            cur = conn.cursor()
            query = "SELECT * FROM sleep"
            params: tuple = ()
            if since:
                query += " WHERE day >= ?"
                params = (since.strftime("%Y-%m-%d"),)
            cur.execute(query, params)
            results = []
            for row in cur.fetchall():
                raw = _row_to_dict(cur, row)
                day = _parse_date(raw.get("day"))
                if not day:
                    continue
                results.append(
                    SleepDTO(
                        day=day,
                        start_at=_parse_datetime(str(raw.get("start"))),
                        end_at=_parse_datetime(str(raw.get("end"))),
                        total_seconds=_time_to_seconds(str(raw.get("total_sleep"))),
                        deep_seconds=_time_to_seconds(str(raw.get("deep_sleep"))),
                        light_seconds=_time_to_seconds(str(raw.get("light_sleep"))),
                        rem_seconds=_time_to_seconds(str(raw.get("rem_sleep"))),
                        awake_seconds=_time_to_seconds(str(raw.get("awake"))),
                        score=raw.get("score"),
                        avg_spo2=Decimal(str(raw["avg_spo2"])) if raw.get("avg_spo2") else None,
                        avg_stress=Decimal(str(raw["avg_stress"])) if raw.get("avg_stress") else None,
                        raw={k: str(v) if v is not None else None for k, v in raw.items()},
                    )
                )
            return results
        finally:
            conn.close()

    def fetch_hrv(self, since: datetime | None) -> list[HrvDTO]:
        conn = self._connect(self.garmin_db_path)
        try:
            cur = conn.cursor()
            query = "SELECT * FROM hrv"
            params: tuple = ()
            if since:
                query += " WHERE day >= ?"
                params = (since.strftime("%Y-%m-%d"),)
            cur.execute(query, params)
            results = []
            for row in cur.fetchall():
                raw = _row_to_dict(cur, row)
                day = _parse_date(raw.get("day"))
                if not day:
                    continue
                results.append(
                    HrvDTO(
                        day=day,
                        weekly_avg_ms=raw.get("weekly_avg"),
                        last_night_avg_ms=raw.get("last_night_avg"),
                        last_night_5min_high_ms=raw.get("last_night_5min_high"),
                        baseline_low_ms=raw.get("baseline_low"),
                        baseline_upper_ms=raw.get("baseline_upper"),
                        status=raw.get("status"),
                        raw={k: str(v) if v is not None else None for k, v in raw.items()},
                    )
                )
            return results
        finally:
            conn.close()

    def fetch_activities(self, since: datetime | None) -> list[ActivityDTO]:
        conn = self._connect(self.activities_db_path)
        try:
            cur = conn.cursor()
            query = "SELECT * FROM activities"
            params: tuple = ()
            if since:
                query += " WHERE start_time >= ?"
                params = (since.strftime("%Y-%m-%d %H:%M:%S"),)
            cur.execute(query, params)
            results = []
            for row in cur.fetchall():
                raw = _row_to_dict(cur, row)
                start_at = _parse_datetime(str(raw.get("start_time")))
                if not start_at:
                    continue
                distance = raw.get("distance")
                activity_id = str(raw.get("activity_id"))
                results.append(
                    ActivityDTO(
                        garmin_activity_id=activity_id,
                        name=raw.get("name"),
                        sport=raw.get("sport"),
                        sub_sport=raw.get("sub_sport"),
                        start_at=start_at,
                        elapsed_seconds=_time_to_seconds(str(raw.get("elapsed_time"))),
                        moving_seconds=_time_to_seconds(str(raw.get("moving_time"))),
                        distance_m=Decimal(str(distance)) * 1000 if distance else None,
                        calories=raw.get("calories"),
                        avg_hr=raw.get("avg_hr"),
                        max_hr=raw.get("max_hr"),
                        training_load=Decimal(str(raw["training_load"])) if raw.get("training_load") else None,
                        training_effect=Decimal(str(raw["training_effect"])) if raw.get("training_effect") else None,
                        route=self._fetch_route(conn, activity_id),
                        raw={k: str(v) if v is not None else None for k, v in raw.items()},
                    )
                )
            return results
        finally:
            conn.close()

    def _fetch_route(self, conn: sqlite3.Connection, activity_id: str) -> list[list[float]]:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT position_lat, position_long
            FROM activity_records
            WHERE activity_id = ?
              AND position_lat IS NOT NULL
              AND position_long IS NOT NULL
            ORDER BY record ASC
            """,
            (activity_id,),
        )
        points = [[float(lat), float(lng)] for lat, lng in cur.fetchall()]
        if not points:
            return []
        target = 400
        if len(points) <= target:
            return points
        stride = max(1, len(points) // target)
        downsampled = points[::stride]
        if downsampled[-1] != points[-1]:
            downsampled.append(points[-1])
        return downsampled

    def fetch_weight(self, since: datetime | None) -> list[WeightDTO]:
        conn = self._connect(self.garmin_db_path)
        try:
            cur = conn.cursor()
            query = "SELECT * FROM weight"
            params: tuple = ()
            if since:
                query += " WHERE day >= ?"
                params = ((since - timedelta(days=1)).strftime("%Y-%m-%d"),)
            cur.execute(query, params)
            results = []
            for row in cur.fetchall():
                raw = _row_to_dict(cur, row)
                measured_at = _parse_datetime(str(raw.get("day")))
                weight = raw.get("weight")
                if not measured_at or weight is None:
                    continue
                results.append(
                    WeightDTO(
                        measured_at=measured_at,
                        weight_kg=Decimal(str(weight)),
                        raw={k: str(v) if v is not None else None for k, v in raw.items()},
                    )
                )
            return results
        finally:
            conn.close()
