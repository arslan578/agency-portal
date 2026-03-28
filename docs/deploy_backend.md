# Backend Deployment & Hardening Guide

## Overview
This document outlines the hardened state of the KaivoCore backend, including authentication, schema standardization, and deployment requirements.

## 1. Hardening Achievements
- **Authentication**: All endpoints (including `/capabilities`) require valid JWTs via `require_principal`. Errors utilize standard JSON shape `{"code": "UNAUTHORIZED", ...}`.
- **Schema Contracts**:
    - **Enums**: All enums (PlanStatus, CampaignStatus) standardized to UPPERCASE.
    - **Currency**: Monetary values standardized to Integer `..._cents` (e.g., `total_budget_cents`).
- **Model Unification**: All core database models (`User`, `Account`, `Campaign`, `Plan`, `Audience`) are now centralized in `packages/db/models.py` to prevent SQLAlchemy Mapper conflicts. Service-specific models import from Core.
- **Idempotency**: `POST /plans/{id}/submit` is idempotent. Repeated calls return the same Campaign object without error.
- **Testing**: `tests/contract/test_hardening.py` provides an atomic bundle of 18 tests verifying these contracts.

## 2. Environment Variables
Ensure the following variables are set for production:

- `PROD_CLUSTER_ID`: See [deploy_production_cluster.md](./deploy_production_cluster.md)
- `DATABASE_URL`: The production database connection string.
```bash
DATABASE_URL=postgresql://user:pass@host:5432/kaivo
SECRET_KEY=...
ALGORITHM=HS256
# Storage
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=auto
# Feature Flags
FF_OPTIMIZATION_ENABLED=false
```

## 3. Database Migration
A baseline migration has been generated at `migrations/versions/4cacb7fbd509_harden_contracts_and_unify_models.py`.

> [!WARNING]
> **Empty Database Required**: This migration creates the complete schema from scratch. Running this against a database with existing tables will fail. Ensure the target database is clean before applying.

1.  **Apply Migration**:
    ```bash
    alembic upgrade head
    ```

## 4. Production Promotion Checklist

> [!CAUTION]
> **BASELINE MIGRATION RISK**: The migration `4cacb7fbd509` is a baseline (down_revision=None). It *will fail* if requested to run against a database that already contains tables.

### Step 1: Verify Empty Database
Before deploying to production, verify the target database is truly empty:
```bash
# Option A: Alembic (should show no revision or "base")
alembic current

# Option B: SQL (should return 0 rows)
psql $DATABASE_URL -c "\dt"
```

### Step 2: Choose Strategy
- **If DB is Empty**: Proceed to Step 3.
- **If DB has Tables**: **STOP**. do NOT run `upgrade head`.
    - **Recommended**: Provision a fresh production database and point `DATABASE_URL` to it.
    - **Alternative**: clear all tables manually (destructive).

### Step 3: Deploy via Pipeline
The pipeline now handles the risky baseline migration automatically if gated correctly:

1.  **Set Variable**: In GitHub Actions -> Variables, set `RUN_DB_MIGRATIONS_PROD` to `true`.
2.  **Trigger Deployment**: Run the `deploy-production` workflow.
3.  **Pipeline Actions**:
    - The pipeline attempts to deploy.
    - It connects to the pod.
    - It checks that the DB is empty (Safety Gate).
    - It runs `alembic upgrade head`.
    - It runs `pytest tests/contract/test_hardening.py`.
    
If the pipeline succeeds, your production environment is live, migrated, and verified.

**Post-Deploy:**
- Set `RUN_DB_MIGRATIONS_PROD` back to `false` to prevent accidental re-runs (though the safety gate should catch it).
- Perform manual sanity checks:
    - `GET /capabilities` (with JWT) -> 200 OK.
    - Plan Lifecycle: Create -> Patch -> Submit -> Submit.

## 5. Verification
Run the hardening suite to verify compliance:

```bash
export DATABASE_URL=sqlite:///:memory:
pytest tests/contract/test_hardening.py
```

## 6. Known Constraints
- **Campaign Client ID**: `Campaign.client_id` is currently nullable to support Plans created at the Account level.
- **StaticPool in Tests**: Tests use `StaticPool` to ensure in-memory SQLite shared access across threads. Do not remove this from `test_hardening.py`.
