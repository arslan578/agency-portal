# Enable Google, Meta, and TikTok connector flags in staging

## Description
This PR enables the full suite of connector feature flags for the **Staging** environment, activating the OS-65 Connector Registry and runtime engines for **Google**, **Meta**, and **TikTok** connectors.

**Target Environment:** Staging (`env.staging`)
**Production Status:** Unchanged (all flags remain OFF in production)

## Changes
- **`env.staging`**:
  - `FF_OS_CONNECTOR_REGISTRATION=true`
  - **Google**: `FF_GOOGLE_ADS_CONNECTOR_IO=true` + `FF_PIB_GOOGLE_PHASE_1..13=true`
  - **Meta**: `FF_META_ADS_CONNECTOR=true` + `FF_PIB_META_PHASE_1..12=true`
  - **TikTok**: `FF_TIKTOK_ADS_CONNECTOR_ENGINE=true` + `FF_PIB_TIKTOK_PHASE_1..12=true`
- **Docs**:
  - Updated Google, Meta, and TikTok connector bring-up docs with **Staging Activation Status**.

## Verification
- **Config-only change**; no code modifications to OS-65 or connector implementations (core logic resides in `main`).
- Verified via existing E2E smoke tests (run on `main`), not re-added in this PR:
  - `os_65_google_e2e_smoke.test.js`
  - `os_65_meta_e2e_smoke.test.js`
  - `os_65_tiktok_e2e_smoke.test.js`

## Risk
- **Low**: Isolated to staging environment configuration and documentation. Production remains strict gated.
