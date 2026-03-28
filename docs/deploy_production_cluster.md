# Production Cluster Deployment Guide

## Overview
This document outlines the deployment targeting mechanism for the new KaivoCore Production Environment (`e772d35d-fd1e-450e-a82f-5f5f4cbb65f9`).

## 1. Cluster Targeting Mechanism
The deployment pipeline (`.github/workflows/deployment.yml`) now dynamically authenticates with DigitalOcean to retrieve the correct `kubeconfig` based on the environment.

### Secrets Configuration
The pipeline relies on the following secrets being present in the GitHub Actions context:

| Secret Name | Purpose | Value Scope |
| :--- | :--- | :--- |
| `DIGITALOCEAN_ACCESS_TOKEN` | Auth for `doctl` (API Key, starts with `dop_v1_...`) | Repo Level |
| `DO_CLUSTER_ID_STAGING` | Target ID for Staging (UUID, e.g. `e772d35d...`) | Repo/Env Level |
| `DO_CLUSTER_ID_PRODUCTION` | Target ID for Production | **Env: Production** |

**Workflow Logic:**
- **Staging Job**: `doctl kubernetes cluster kubeconfig save $DO_CLUSTER_ID_STAGING`
- **Production Job**: `doctl kubernetes cluster kubeconfig save $DO_CLUSTER_ID_PRODUCTION`

> **Note**: The legacy `KUBE_CONFIG` secret is no longer used for cluster access.
> **Critical**: For a fresh cluster, you MUST manually create the `kaivo-secrets` (app config) and `ghcr-secret` (registry auth) in the `production` namespace ONCE before the first deployment.

### Bootstrap Application Secrets
The deployment script checks for `kaivo-secrets` in the cluster. Run this locally to bootstrap it:
```bash
# 1. Login to Prod
doctl kubernetes cluster kubeconfig save $DO_CLUSTER_ID_PRODUCTION

# 2. Create Namespace (if not exists)
kubectl create ns production || true

# 3. Create Secrets
kubectl -n production create secret generic kaivo-secrets \
  --from-literal=DATABASE_URL="postgresql://user:pass@host:5432/db" \
  --from-literal=STRIPE_SECRET_KEY="sk_live_..." \
  --from-literal=OPENAI_API_KEY="sk-..." \
  --from-literal=JWT_SECRET="your-secret"
```

## 2. Post-Deploy Verification
The `deploy-production` job performs automatic safety checks immediately after applying manifests:
1.  **Workload Presence**: Fails (`PROD_DEPLOY_EMPTY_CLUSTER`) if 0 deployments or 0 pods exist in the `production` namespace.

## 3. Safe Baseline Migration (Conditioned)
To handle the initial baseline migration safely, a gated step exists in the production job.

**Trigger:**
This step only runs if the GitHub Action Variable `RUN_DB_MIGRATIONS_PROD` is set to `true`.

**Safety Checks:**
1.  **Empty Prevention**: Runs `alembic current`. If any revision or history exists, it aborts (`PROD_DB_NOT_EMPTY_ABORT`).
2.  **Upgrade**: Runs `alembic upgrade head`.
3.  **Validation**: Runs `pytest tests/contract/test_hardening.py` inside the live production pod.

**Usage:**
Enable this ONLY for the first deployment to the fresh production cluster. Disable it immediately after.
