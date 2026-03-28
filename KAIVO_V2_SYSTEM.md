# Kaivo v2.0 System Architecture

## Overview
Kaivo v2.0 is an AI-driven cross-platform ad operating system. It uses a unified backend architecture on Render and a Next.js frontend on Cloudflare Pages.

## Core Components

### 1. Backend (Render)
- **Unified API Gateway**: `services/api_gateway` (FastAPI)
- **Database**: PostgreSQL (Render Internal)
- **Cache/Broker**: Redis (Render Internal)
- **Workers**: Celery (`services/shared/celery_app.py`)

### 2. Frontend (Cloudflare Pages)
- **Framework**: Next.js 14 (App Router)
- **Runtime**: Edge
- **Auth**: Auth.js v5

## Key Modules
- **Domain Model**: `packages/db/models.py` (Unified Schema)
- **Pricing Engine**: `services/pricing_service` (1.5x Markup + Tiers)
- **Billing**: `services/billing_service` (Usage Aggregation)
- **Agency System**: `services/account_service` (Client Management)
- **Orchestrator**: `services/orchestrator_service` (AI Chat & Drift Detection)
- **i18n**: `services/i18n_service` (Google Translate)

## Documentation Index
- [Backend Overview](./BACKEND_V2_OVERVIEW.md)
- [Domain Model](./DOMAIN_MODEL_V2.md)
- [Pricing Engine](./PRICING_ENGINE_V2.md)
- [Billing System](./BILLING_V2.md)
- [Agency System](./AGENCY_SYSTEM_V2.md)
- [Orchestrator](./ORCHESTRATOR_V2.md)
- [i18n Backend](./I18N_BACKEND_V2.md)
- [Frontend Overview](./FRONTEND_V2_OVERVIEW.md)
- [CI Notes](./CI_NOTES_V2.md)
