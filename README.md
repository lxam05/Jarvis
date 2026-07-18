# JARVIS

Personal AI operating system — v1 features: Garmin integration, AI nutrition with meal memory, and a premium health dashboard.

## Stack

- **Backend:** FastAPI, PostgreSQL, Alembic, OpenAI
- **Frontend:** Next.js 16, Tailwind CSS 4, Framer Motion, Recharts, TanStack Query
- **Sync:** Local Mac agent reading GarminDB SQLite

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Start PostgreSQL with pgvector, set DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload
```

Default login: `me@example.com` / `jarvis`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

### Sync Agent (Mac)

See [docs/mac-setup.md](docs/mac-setup.md)

## Project Structure

```
Jarvis/
├── backend/       FastAPI API
├── frontend/      Next.js dashboard
├── sync-agent/    Mac GarminDB → API sync
└── docs/          Architecture & setup guides
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Web auth secret |
| `SYNC_AGENT_API_KEY` | Sync agent bearer token |
| `OPENAI_API_KEY` | Nutrition AI & coaching |
| `STRIPE_SECRET_KEY` | Read-only Stripe key for business metrics (prefer restricted) |
| `NEXT_PUBLIC_API_URL` | Frontend → API URL |

## Railway Deployment

1. Create PostgreSQL service with pgvector extension
2. Deploy backend from `backend/` using `railway.toml`
3. Set environment variables
4. Deploy frontend to Vercel with `NEXT_PUBLIC_API_URL`
