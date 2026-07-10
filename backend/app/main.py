from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import session_scope
from app.core.events import event_bus
from app.modules.coaching.service import on_domain_event
from app.modules.core.routes import seed_default_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    event_bus.subscribe("garmin.synced", on_domain_event)
    event_bus.subscribe("meal.logged", on_domain_event)
    event_bus.subscribe("weight.updated", on_domain_event)

    async with session_scope() as db:
        await seed_default_user(db)

    yield


app = FastAPI(title="JARVIS", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "jarvis"}
