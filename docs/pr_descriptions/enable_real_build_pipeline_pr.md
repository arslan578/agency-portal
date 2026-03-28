# Enable real build+push pipeline (11 services, SHA-tagged, kustomize deploy)

## 🚀 What Changed

This PR enables the full CI/CD pipeline, moving from "mock" deployments to real image builds and deployments.

*   **Workflow (`deployment.yml`)**:
    *   Added `Build and Push Images` step to the `build-and-test` job.
    *   Builds Docker images for **11 services** (including Frontend).
    *   Tags images with `${GITHUB_SHA}` (immutable tags) and pushes to GHCR.
    *   Added `Install Kustomize` step to runners.
    *   Added `Verify pods are running` step to validate post-deployment health.
*   **Deployment Script (`deploy.sh`)**:
    *   Removed mock logic.
    *   Added `GIT_SHA` enviromment variable check.
    *   Implemented `kustomize edit set image` to inject the exact `${GITHUB_SHA}` tag into manifests before applying.
    *   **Hardening**: Added `set -euo pipefail`, safe variable quoting, and `kubectl rollout status` gates to ensure all pods are up before success.
*   **Documentation**:
    *   Added `infrastructure/docs/build_and_deploy.md` explaining the new pipeline.

## 🔒 Hardening Measures
*   **Permissions**: Least-privilege `packages: write` added to workflow.
*   **Supply Chain**: Pinned Kustomize version to v5.4.3.
*   **Rollout Gates**: Deployment script waits for all 11 services to be healthy (`kubectl rollout status`) before succeeding.

## 📦 Services & Images

The following images are now built and deployed to `ghcr.io/universalmedialtd/`:

| Service | Image Name |
| :--- | :--- |
| Account | `kaivocore-account-service` |
| Agent | `kaivocore-agent-service` |
| Audience | `kaivocore-audience-service` |
| Auth | `kaivocore-auth-service` |
| Billing | `kaivocore-billing-service` |
| Campaign | `kaivocore-campaign-service` |
| Creative | `kaivocore-creative-service` |
| Frontend | `kaivocore-frontend` |
| Intelligence | `kaivocore-intelligence-service` |
| Policy | `kaivocore-policy-service` |
| Reporting | `kaivocore-reporting-service` |

## ✅ Verification Checklist

Upon merging/deploying this PR:

- [ ] **GHCR Packages**: Verify all 11 packages appear in the GitHub org packages list.
- [ ] **Staging Success**: `Deploy to Staging` job completes green.
- [ ] **Rollout Status**: `kubectl rollout status deploy/<service> -n staging` returns success for all services.
- [ ] **Image Integrity**: `kubectl get pods -n staging -o jsonpath="{..image}"` confirms running images end with the commit SHA.
