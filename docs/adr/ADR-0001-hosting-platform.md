# ADR-0001: Hosting Platform Strategy

**Status**: Accepted
**Date**: 2025-12-16
**Context**: KaivoCore previously explored Render for backend hosting but migrated to DigitalOcean Kubernetes (DOKS) for unified orchestration.

## Decision
1.  **Compute Plane**: DigitalOcean Kubernetes (DOKS) is the sole platform for all services (Frontend, Backend, Workers).
2.  **Registry**: DigitalOcean Container Registry (DOCR) is the single source of truth for build artifacts.
3.  **CI/CD**: GitHub Actions deploys directly to DOKS using `kubectl` and `doctl`.
4.  **Edge**: Cloudflare manages DNS and edge security.

## Consequences
- **Render.com**: Explicitly **OUT OF SCOPE**. No services shall be deployed to Render.
- **Artifacts**: Legacy `render.yaml` must remain in `docs/legacy/` only.
- **Validation**: CI tripwires will reject commits containing `onrender[.]com` references or root `render.yaml`.
