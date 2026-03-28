# Kaivo v2.0 Backend Overview

## Architecture
Kaivo v2.0 uses a **Unified API Gateway** pattern hosted on Render.
- **Service**: `Kaivo-Backend`
- **Entry Point**: `services/api_gateway/main.py`
- **Framework**: FastAPI

## Infrastructure
- **Database**: PostgreSQL (Render Internal)
- **Broker/Cache**: Redis (Render Internal)
- **Workers**: Celery (`Kaivo-Celery`)

## Environment Variables
The following environment variables are **MANDATORY**:
- `DATABASE_URL`: Connection string for PostgreSQL
- `REDIS_URL`: Connection string for Redis
- `OPENAI_API_KEY`: For Intelligence Service
- `STRIPE_SECRET_KEY`: For Billing Service
- `NEXTAUTH_SECRET`: For Auth Service
- `GOOGLE_CLIENT_ID`: For Auth Service
- `GOOGLE_CLIENT_SECRET`: For Auth Service
- `NEXTAUTH_URL`: The full URL of the frontend (e.g., `https://app.getkaivo.com`)
- `NEXT_PUBLIC_APP_URL`: Same as NEXTAUTH_URL
- `NEXT_PUBLIC_API_URL`: The full URL of the backend

## Health Checks
- `GET /healthz`: Checks connectivity to Database and Redis. Returns 200 OK if healthy, 503 if not.

## CORS
Configured to allow:
- `https://kaivocore.pages.dev` (Staging/Preview)
- `https://app.getkaivo.com` (Production)
- `http://localhost:3000` (Local Dev)

## Celery Workers
- Entry point: `services/shared/celery_app.py`
- Queues:
    - `campaigns`: Campaign launch and management tasks
    - `reporting`: Data ingestion tasks
    - `default`: Heartbeat and misc tasks
