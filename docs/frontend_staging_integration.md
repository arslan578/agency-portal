# Frontend Staging Integration Plan

## Strategy: Ingress-Driven Same Origin Routing

We will utilize the existing Kubernetes Ingress configuration (`infrastructure/staging_manifest.yaml`) which maps `/api/*` paths directly to backend services. This ensures robust "Same Origin" behavior for the browser without requiring a separate BFF proxy layer for all traffic, while adhering to the "Non Negotiable" of using Ingress availability.

## Ingress Route Map

This table maps the public API paths available on Staging (via Ingress) to their backend services. The frontend MUST use these paths relative to the current origin (e.g., `/api/campaign/results`).

| Public Path Prefix | Service Name | Target Port | Example Endpoint | Auth Expectation |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth` | `auth-service` | 8000 | `POST /api/auth/login` | Public (init) / Cookie |
| `/api/account` | `account-service` | 8000 | `GET /api/account/profile` | Session / Bearer |
| `/api/campaign` | `campaign-service` | 8000 | `GET /api/campaign/campaigns` | Session / Bearer |
| `/api/creative` | `creative-service` | 8000 | `GET /api/creative/assets` | Session / Bearer |
| `/api/audience` | `audience-service` | 8000 | `GET /api/audience/segments` | Session / Bearer |
| `/api/reporting` | `reporting-service` | 8000 | `GET /api/reporting/dashboard` | Session / Bearer |
| `/api/policy` | `policy-service` | 8000 | `GET /api/policy/rules` | Session / Bearer |
| `/api/intelligence` | `intelligence-service` | 8000 | `GET /api/intelligence/insights` | Session / Bearer |
| `/api/billing` | `billing-service` | 8000 | `GET /api/billing/invoices` | Session / Bearer |
| `/api/agent` | `agent-service` | 8000 | `POST /api/agent/interact` | Session / Bearer |

> **Note:** All services are served- **Staging**: `https://staging-app.getkaivo.com` (Ingress). The frontend should make requests to `/api/...` which will be routed to the correct service on port 8000.

## Route Map

The following routes will be implemented/fixed:

| Route | Description | API Dependency |
| :--- | :--- | :--- |
| `/dashboard` | Main Dash | `/api/reporting/*` (or stub) |
| `/campaigns` | List Campaigns | `/api/campaign/campaigns` |
| `/audiences` | List Audiences | `/api/audience/audiences` |
| `/auth/signout` | Sign out | `/api/auth/logout` |

## Integration Checklist (Smoke Test)

1.  **Dashboard Loads**: Visit `/dashboard`. No console errors.
2.  **Network**: Verify XHR request to `/api/...` returns 200 (or 401 if unauth).
3.  **No Render**: Ensure no requests go to deprecated legacy domains (e.g. `*.onrender[.]com`).
4.  **CORS**: Verify no CORS errors in console.
