# JARVIS Architecture

JARVIS v1 is a modular monolith: FastAPI + PostgreSQL on Railway, Next.js frontend, and a local Mac sync agent for Garmin data.

## Modules

| Module | Responsibility |
|--------|----------------|
| `garmin` | Ingest API, cursor management, Garmin domain models |
| `nutrition` | AI meal parsing, meal memory, weight tracking, chat |
| `coaching` | Rule engine + OpenAI insight synthesis |
| `dashboard` | Pre-aggregated read models, SSE events |

## Data Flow

```
Garmin Watch → Garmin Connect → GarminDB (Mac SQLite)
                                    ↓ read-only
                              Sync Agent → POST /v1/garmin/sync → PostgreSQL
                                                                    ↓
                                                              Dashboard / Coaching
```

## Event Bus

Domain events trigger downstream updates:

- `garmin.synced` → regenerate coaching insights, push SSE
- `meal.logged` → regenerate coaching insights, push SSE
- `weight.updated` → regenerate coaching insights, push SSE

## Future Modules

Register new modules in `backend/app/modules/registry.py`. Calendar, Email, Projects, and Home Assistant can plug in without changing existing module internals.

See the full plan in `.cursor/plans/` for schema details and API surface.
