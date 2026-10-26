# JARVIS

Personal training app — Strava activities, Garmin recovery (sleep, HRV, body battery), and an AI coach you can ask about your training.

## Stack

- **Backend:** FastAPI, PostgreSQL, Alembic, OpenAI
- **Frontend:** Next.js 16, Tailwind CSS 4, Framer Motion, Recharts, TanStack Query
- **Data:** Strava API for activities; local Mac agent reading GarminDB SQLite for recovery

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
| `OPENAI_API_KEY` | AI coach chat, session plans and insights |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | From your Strava API app ([settings/api](https://www.strava.com/settings/api)) |
| `PUBLIC_API_URL` | Public URL of this API; Strava redirects to `{PUBLIC_API_URL}/v1/strava/callback` |
| `FRONTEND_URL` | Where the browser returns after connecting Strava |
| `NEXT_PUBLIC_API_URL` | Frontend → API URL |

## Strava Setup

1. Create an app at https://www.strava.com/settings/api. Set **Authorization Callback Domain** to the API's host (e.g. `your-app.up.railway.app`, or `localhost` for local dev).
2. Set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `PUBLIC_API_URL` and `FRONTEND_URL` on the backend.
3. Open Settings in the app and click **Connect Strava**. The last year of activities is imported, and new ones sync automatically whenever the app is opened (at most every 15 minutes).

## Railway Deployment

1. Create PostgreSQL service with pgvector extension
2. Deploy backend from `backend/` using `railway.toml`
3. Set environment variables
4. Deploy frontend to Vercel with `NEXT_PUBLIC_API_URL`
