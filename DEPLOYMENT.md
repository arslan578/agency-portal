# Kaivo Deployment Guide

## Agency System
See [AGENCY_SYSTEM.md](AGENCY_SYSTEM.md) for details on the new Agency/Client hierarchy and markup logic.

## Deployment Instructions
Welcome to the Kaivo Deployment Instructions guide explains the architecture and deployment process for the Kaivo platform.

## 🏗️ Architecture & Domains

| Component | Domain(s) | Hosting |
| :--- | :--- | :--- |
| **Marketing Site** | `getkaivo.com`, `www.getkaivo.com` | WordPress Host |
| **Frontend App** | - **Staging**: `staging-app.getkaivo.com`<br>- **Prod**: `app.getkaivo.com` | User Interface |
| **Backend API** | `app.getkaivo.com/api` | API Ingress |

*Ensure your CNAME/A records point to the Ingress Controller IP.*

## 🌐 DNS Setup (Cloudflare)

Configure your DNS records in Cloudflare as follows:

| Type | Name | Content | Proxy Status | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `A` | `@` | [WordPress Host IP] | Proxied (Orange Cloud) | Marketing Site |
| `CNAME` | `www` | `getkaivo.com` | Proxied (Orange Cloud) | Marketing Site |
| `A` / `CNAME` | `api` | [Backend Host IP/URL] | Proxied (Orange Cloud) | Backend API |

## 🚀 Deployment

### 1. Frontend (Cloudflare Pages)
The frontend is deployed automatically via Cloudflare Pages integration with GitHub.
- **Staging**: Pushes to `main` deploy to a preview URL (or staging alias).
- **Production**: Releases or specific branch rules deploy to `app.getkaivo.com`.

**Environment Variables (Cloudflare Pages):**
Set these in the Cloudflare Pages dashboard (Settings -> Environment variables):
- `NEXT_PUBLIC_API_URL`: `https://api.getkaivo.com` (or staging URL)
- `NEXT_PUBLIC_APP_URL`: `https://app.getkaivo.com` (or staging URL)
- `NEXTAUTH_URL`: `https://app.getkaivo.com` (or staging URL)
- `NEXTAUTH_SECRET`: [Your Secret]
- `GOOGLE_CLIENT_ID`: [Your Google Client ID]
- `GOOGLE_CLIENT_SECRET`: [Your Google Client Secret]

### 2. Backend (Unified API Gateway)
Deploy the **Unified Backend** service to your chosen provider (Render, Fly.io, etc.). This single service handles all API requests for Auth, Agents, Campaigns, etc.

- **Name**: `Kaivo-Backend`
- **Type**: Web Service
- **Dockerfile Path**: `services/api_gateway/Dockerfile`
- **Root Directory**: `.` (Repository Root)
- **Environment Variables**: Same as listed below.

**Environment Variables (Backend Host):**
Set these in your backend provider's dashboard:
- `DATABASE_URL`: [Your PostgreSQL Connection String]
- `REDIS_URL`: [Your Redis Connection String] (**Single source of truth for Celery**)
- `OPENAI_API_KEY`: [Your OpenAI Key]
- `STRIPE_SECRET_KEY`: [Your Stripe Key]
- `CORS_ALLOWED_ORIGINS`: `https://app.getkaivo.com`
- `ALLOWED_HOSTS`: `api.getkaivo.com`
- `META_APP_ID`: [Meta Business App ID]
- `META_APP_SECRET`: [Meta Business App Secret]
- `META_REDIRECT_URI`: `https://app.getkaivo.com/integrations`

### 3. Celery Worker (Background Tasks)
Deploy the worker using the same Docker image as the Backend API (`services/intelligence_service/Dockerfile`).
- **Start Command**: `celery -A services.shared.celery_app worker --loglevel=INFO`
- **Environment Variables**: Same as Backend API.

### 4. Marketing Site (WordPress)
Managed separately via your WordPress hosting provider. Ensure it serves the landing page content at the root domain.

### 5. Worker Validation
After deploying the Celery worker, you can verify it is active and processing tasks:

1.  **Deploy the Worker**: Ensure the service is running in Render.
2.  **Run Diagnostic Script**:
    Execute the heartbeat script from your local machine (ensure `REDIS_URL` is set locally to point to the remote Redis, or run this in a shell on the worker itself):
    ```bash
    python run_heartbeat.py
    ```
3.  **Check Logs**:
    Go to the Render dashboard and view the logs for the `Kaivo-Celery` service. You should see:
    ```
    [INFO/MainProcess] Task shared_tasks.heartbeat[...] received
    [INFO/ForkPoolWorker-1] Heartbeat task executed successfully.
    [INFO/ForkPoolWorker-1] Task shared_tasks.heartbeat[...] succeeded in ...s: {'status': 'ok'}
    ```

## ☸️ Kubernetes (Optional / Legacy)
*Note: Kubernetes deployment is currently optional as we transition to the new architecture.*

If you are still using Kubernetes for backend orchestration:
1.  Ensure `KUBE_CONFIG` is set in GitHub Secrets.
2.  Use the "Kaivo Deployment Pipeline" GitHub Action for deployments.
