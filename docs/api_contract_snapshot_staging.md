# API Contract Snapshot: Staging (Vertical Slice)

**Status**: LOCKED
**| Environment | Base URL |
| :--- | :--- |
| **Staging** | `https://staging-app.getkaivo.com` |
**Base URL**: `https://staging.app.getkaivo.com/api`
**Validation**: `scripts/staging_api_smoke.sh` (Curl)

## 1. Authentication (`auth-service`)
**Base URL**: `http://auth-service:8000` (or Ingress `/api/auth`)
**Gap Resolution (Gate A)**: Auth service does *not* provide `account_id`. Frontend must request it manually via Context Selector.

| Method | Endpoint | Request Schema | Response Schema | Auth | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/login` | `{"email": "...", "password": "..."}` | `{"access_token": "...", "token_type": "bearer"}` | Public | Store token in Session/Memory |
| `GET` | `/me` | - | `{"id": 1, "email": "...", ...}` | **Bearer** | Used for user info display |

## 2. Campaigns (`campaign-service`)
**Base URL**: `http://campaign-service:8000` (or Ingress `/api/campaign`)

| Method | Endpoint | Description | Request Model | Response Model | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/campaigns` | List campaigns | Query: `account_id` (required), `client_id` (optional) | `[CampaignOut]` | **Locked** |
| `GET` | `/campaigns/{id}` | Get campaign details | - | `CampaignOut` | **Locked** |
| `POST` | `/plans/` | Create a plan (draft) | `{"account_id": int, "name": str, "goal": str, "total_budget": number, "audience_id": int, "platform_allocations_json": object}` | `PlanOut` (with id) | **Locked** |
| `POST` | `/plans/{id}/launch` | Launch a plan | `null` | `CampaignOut` | **Locked** |

## 3. Audiences (`audience-service`)
**Base URL**: `http://audience-service:8000` (or Ingress `/api/audience`)
**Gap Resolution (Gate A)**: No list endpoint exists.
**Strategy**: Targeting page allows **Creation Only**.

| Method | Endpoint | Description | Request Model | Response Model | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/audiences/` | Create audience | `{"account_id": int, "name": str, "definition": object}` | `AudienceOut` | **Locked** |
| `GET` | `/audiences/{id}` | Get audience details | - | `AudienceOut` | **Locked** |

## 4. Creative (`creative-service`)
**Base URL**: `http://creative-service:8000` (or Ingress `/api/creative`)

| Method | Path | Request Schema | Response Schema | Auth | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/assets/upload` | `Multipart` | `{"id": 1, "url": "..."}` | Bearer | |

## 5. Reporting (`reporting-service`)
**Base URL**: `http://reporting-service:8000` (or Ingress `/api/reporting`)

| Method | Path | Request Schema | Response Schema | Auth | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/reports/campaign/{id}` | - | `[...]` | Bearer | |

## Smoke Test Requirement
Before UI work, verify endpoints:
```bash
./scripts/staging_api_smoke.sh <email> <password>
```
