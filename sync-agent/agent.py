#!/usr/bin/env python3
"""Jarvis sync agent — reads GarminDB SQLite and pushes to Railway API."""

import json
import logging
import sys
from datetime import datetime
from pathlib import Path

import httpx
import yaml

from adapter.dtos import GarminSyncBatch
from adapter.sqlite_source import SQLiteGarminSource

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("jarvis-sync")


def load_config(path: str) -> dict:
    config_path = Path(path).expanduser()
    with config_path.open() as f:
        return yaml.safe_load(f)


def load_cursors(path: str) -> dict[str, datetime | None]:
    cursors_path = Path(path).expanduser()
    if not cursors_path.exists():
        return {}
    with cursors_path.open() as f:
        data = json.load(f)
    return {k: datetime.fromisoformat(v) if v else None for k, v in data.items()}


def save_cursors(path: str, cursors: dict[str, datetime | None]) -> None:
    cursors_path = Path(path).expanduser()
    cursors_path.parent.mkdir(parents=True, exist_ok=True)
    serializable = {k: v.isoformat() if v else None for k, v in cursors.items()}
    with cursors_path.open("w") as f:
        json.dump(serializable, f, indent=2)


def run(config_path: str = "~/.jarvis/sync-agent.yaml") -> int:
    config = load_config(config_path)
    cursors = load_cursors(config["cursors_path"])

    source = SQLiteGarminSource(
        garmin_db_path=config["garmin_db_path"],
        activities_db_path=config["garmin_activities_db_path"],
    )

    batch: GarminSyncBatch = source.fetch_batch(cursors)
    total = (
        len(batch.daily_summaries)
        + len(batch.sleep)
        + len(batch.hrv)
        + len(batch.activities)
        + len(batch.weight)
    )
    logger.info("Fetched %d records from GarminDB", total)

    if total == 0:
        logger.info("No new data to sync")
        return 0

    payload = {
        "agent_version": config.get("agent_version", "1.0.0"),
        "cursors": {k: v.isoformat() if v else None for k, v in cursors.items()},
        "batch": batch.model_dump(mode="json"),
    }

    api_url = config["api_url"].rstrip("/")
    headers = {"Authorization": f"Bearer {config['api_key']}"}

    with httpx.Client(timeout=60.0) as client:
        response = client.post(f"{api_url}/v1/garmin/sync", json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()

    new_cursors = {
        k: datetime.fromisoformat(v) if v else None
        for k, v in result.get("cursors", {}).items()
    }
    save_cursors(config["cursors_path"], new_cursors)
    logger.info("Sync complete: %s", result.get("records_upserted"))
    return 0


if __name__ == "__main__":
    config_file = sys.argv[1] if len(sys.argv) > 1 else "~/.jarvis/sync-agent.yaml"
    try:
        sys.exit(run(config_file))
    except Exception as exc:
        logger.exception("Sync failed: %s", exc)
        sys.exit(1)
