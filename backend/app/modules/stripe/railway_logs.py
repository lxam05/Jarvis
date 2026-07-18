"""Fetch Railway environment runtime logs for the Business page."""

from __future__ import annotations

import asyncio
from datetime import datetime

import httpx

from app.core.config import settings
from app.modules.stripe.schemas import RailwayLogLine, RailwayLogsResponse

RAILWAY_GRAPHQL = "https://backboard.railway.app/graphql/v2"


class RailwayLogsNotConfiguredError(Exception):
    pass


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _fetch_logs_sync(limit: int = 80) -> RailwayLogsResponse:
    token = settings.railway_token
    env_id = settings.railway_environment_id
    service_id = settings.railway_service_id
    if not token or not env_id:
        raise RailwayLogsNotConfiguredError(
            "Set RAILWAY_TOKEN and RAILWAY_ENVIRONMENT_ID (RAILWAY_SERVICE_ID optional)."
        )

    filter_q = f"@service:{service_id}" if service_id else None
    query = """
    query($environmentId: String!, $filter: String, $beforeLimit: Int) {
      environmentLogs(
        environmentId: $environmentId
        filter: $filter
        beforeLimit: $beforeLimit
      ) {
        timestamp
        message
        severity
      }
    }
    """
    variables = {
        "environmentId": env_id,
        "filter": filter_q,
        "beforeLimit": max(10, min(limit, 200)),
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            RAILWAY_GRAPHQL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "Jarvis/1.0",
            },
            json={"query": query, "variables": variables},
        )
        response.raise_for_status()
        payload = response.json()

    if payload.get("errors"):
        msg = payload["errors"][0].get("message", "Railway GraphQL error")
        raise RuntimeError(msg)

    raw = (payload.get("data") or {}).get("environmentLogs") or []
    lines = [
        RailwayLogLine(
            timestamp=_parse_ts(item.get("timestamp")),
            message=item.get("message") or "",
            severity=item.get("severity"),
        )
        for item in raw
        if item.get("message")
    ]
    # Railway returns oldest→newest typically; show newest last for terminal feel
    return RailwayLogsResponse(lines=lines, source="railway")


async def get_railway_logs(limit: int = 80) -> RailwayLogsResponse:
    return await asyncio.to_thread(_fetch_logs_sync, limit)
