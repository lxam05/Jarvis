from fastapi import APIRouter

from app.modules.coaching.routes import router as coaching_router
from app.modules.core.routes import router as auth_router
from app.modules.dashboard.routes import events_router, router as dashboard_router
from app.modules.garmin.routes import router as garmin_router
from app.modules.nutrition.routes import router as nutrition_router

api_router = APIRouter(prefix="/v1")
api_router.include_router(auth_router)
api_router.include_router(garmin_router)
api_router.include_router(nutrition_router)
api_router.include_router(coaching_router)
api_router.include_router(dashboard_router)
api_router.include_router(events_router)
