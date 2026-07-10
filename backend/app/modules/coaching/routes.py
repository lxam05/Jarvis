from typing import Annotated
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.core.db import get_db
from app.modules.coaching.models import CoachingInsight
from app.modules.coaching.schemas import InsightOutput

router = APIRouter(prefix="/coaching", tags=["coaching"])


@router.get("/insights", response_model=list[InsightOutput])
async def get_insights(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> list[InsightOutput]:
    result = await db.execute(
        select(CoachingInsight)
        .where(CoachingInsight.user_id == user.id, CoachingInsight.dismissed_at.is_(None))
        .order_by(CoachingInsight.generated_at.desc())
        .limit(5)
    )
    return [
        InsightOutput(category=i.category, severity=i.severity, title=i.title, body=i.body)
        for i in result.scalars()
    ]


@router.post("/insights/{insight_id}/dismiss")
async def dismiss_insight(
    insight_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> dict:
    from datetime import UTC, datetime

    insight = await db.get(CoachingInsight, insight_id)
    if insight and insight.user_id == user.id:
        insight.dismissed_at = datetime.now(UTC)
    return {"ok": True}
