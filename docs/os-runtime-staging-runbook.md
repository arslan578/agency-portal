# OS Runtime Staging Rollout Runbook

This document outlines the procedure for enabling the OS Runtime layer in the Staging environment.

## 1. Pre-Deployment Checks
- [ ] Verify `os-runtime-service` is deployed and running in the cluster.
- [ ] Verify `api-gateway` has been redeployed with the latest code (image tag = commit SHA).
- [ ] Confirm `FF_OS_RUNTIME_ENABLED` is **FALSE** (default state).

## 2. Environment Verification (Flag OFF)
Execute the following against Staging Gateway URL:
```bash
# 1. Capabilities should show enabled=false
curl -s https://staging.api.kaivo.com/capabilities | jq .features.ff_os_runtime_enabled
# Expected: false

# 2. Run Intent should be strictly forbidden
curl -X POST https://staging.api.kaivo.com/os/run -d '{}'
# Expected: 403 Forbidden {"code": "FEATURE_DISABLED"}
```

## 3. Activation (Phase 1: Internal Testing)
Set the feature flag in the capabilities/deployment config:
`FF_OS_RUNTIME_ENABLED=true`

Restart `api-gateway` if necessary (deployment rollout).

## 4. Verification (Flag ON)
```bash
# 1. Capabilities should show enabled=true
curl -s https://staging.api.kaivo.com/capabilities | jq .features.ff_os_runtime_enabled
# Expected: true

# 2. Run Intent (Unauthorized)
curl -X POST https://staging.api.kaivo.com/os/run -d '{}'
# Expected: 401 Unauthorized {"code": "UNAUTHORIZED"}

# 3. Run Intent (Authorized but Invalid)
curl -X POST https://staging.api.kaivo.com/os/run \
  -H "Authorization: Bearer <STAGING_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400 Invalid Request (Missing fields)
```

## 5. Rollback Procedure
If any critical issues are observed (latency spikes, 500 errors):

1. **Immediate Disable**: Set `FF_OS_RUNTIME_ENABLED=false` in the cluster config.
2. **Verify**: Run the "Flag OFF" checks from Section 2.
3. **Logs**: Export logs from `os-runtime-service` for triage.

## 6. Known Failure Modes
- **DB Connection Error**: If `api-gateway` fails to start, ensure `TEST_MODE` is NOT set in staging, and DB credentials are valid.
- **Timeout**: If `/os/run` times out (10s), the OS Runtime service might be unreachable. Check `services/os_runtime_service` logs.

## 7. Production Database Migrations

Migrations are **OPTIONAL** and **DISABLED** by default. To apply database schema changes in Production:

1.  Navigate to **Actions** -> **Kaivo Deployment Pipeline**.
2.  Click **Run workflow**.
3.  Select **Environment**: `production`.
4.  Check **Run Database Migrations?**: `true`.
5.  Click **Run workflow**.

This spins up a dedicated Kubernetes Job (`migration-job-<SHA>`) that:
1.  Runs `alembic upgrade head`.
2.  Runs verification contract tests *only if* the migration succeeds.
3.  Cleans up automatically on success.

> **Note**: This process uses the exact container image corresponding to the `main` branch commit SHA being deployed.
