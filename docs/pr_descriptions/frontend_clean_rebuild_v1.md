# PR: Frontend Clean Rebuild v1 (Vertical Slice + Hardening)

## 📌 Context
This PR introduces the "Clean Rebuild" of the Kaivo Frontend, implementing a fully functioning Vertical Slice (Auth -> Create -> Launch -> Report) while layering on critical Security and Operational Hardening requirements.

**Primary Goal**: Deliver a production-grade staging environment that is provably secure and aligned with the final domain architecture.

## 🛠 Key Changes

### 1. Architecture & Domains
- **Production**: `app.getkaivo.com` (Ingress + Env)
- **Staging**: `staging.app.getkaivo.com` (Ingress + Env)
- **Infrastructure**: Refactored Kustomize patches to use **Strategic Merge Patches** for Environment Variables (`env-patch.yaml`), eliminating brittle index-based patching risks.

### 2. Security Hardening
- **Staging Login Proxy (`api/auth/staging-login`)**:
  - **Strict Host Guard**: Enforces `STAGING_API_HOST` must be EXACTLY `staging.app.getkaivo.com` (or `localhost`/`127.0.0.1` for dev).
  - **Protocol Enforcement**: Mandates `https:` for all non-local traffic.
  - **Fail-Safe**: Rejects bare production domains (`app.getkaivo.com`) or invalid URLs with a 500 error.
- **Environment Gate**:
  - `KAIVO_ENV` is explicitly set to `staging` or `production` in K8s overlays.
  - "Staging Test Mode" button is conditionally rendered only when `KAIVO_ENV !== 'production'`.

### 3. Brand Identity
- **Visuals**: Integrated Kaivo Spiral Logo (`public/images/kaivo_logo.png`).
- **Theming**: Implemented Brand Palette (Teal `#3A9E93`, Coral `#FA8072`) in `globals.css` and applied to Sidebar/Auth pages.

### 4. Operational Assets
- **New Script**: `scripts/verify_manifests.sh` - A CI-ready gate that strictly validates Ingress hosts and Env Patch URLs match the approved domains.
- **Checklist**: `docs/deploy_domains.md` - Required DNS/TLS verification steps.
- **Updated Docs**: `DEPLOYMENT.md`, `frontend_staging_integration.md`, and `api_contract_snapshot_staging.md` updated to reflect `app.getkaivo.com` standard.

## ✅ Verification
- **Build**: `npm run build` passes locally.
- **Drift Check**: `grep` confirmation of no forbidden hosts.
- **Manifest Guard**: `scripts/verify_manifests.sh` ✅ PASS.

## 🚀 Deployment Instructions
1. **Prerequisite**: Ensure DNS A/CNAME records exist for `app.getkaivo.com` and `staging.app.getkaivo.com`.
2. **Merge**: Merge this PR into `main`.
3. **Deploy**: CI/CD pipeline will deploy to Staging.
4. **Smoke**: Run `./scripts/staging_api_smoke.sh` against `staging.app.getkaivo.com`.
