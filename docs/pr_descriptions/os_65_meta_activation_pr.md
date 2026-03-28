# OS-65: Add meta_ads connector registry support + E2E smoke test

## Description
This PR brings the **Meta Ads** connector (`meta_ads`) to full parity with Google and TikTok at the **OS-65 Connector Registry** layer.
It extends the registry decoder to recognize `meta_ads` packets, enforce its specific 12-phase PIB hash chain requirements, and validates proper registry entry construction.

**Target Environment:** Staging / Production (Logic modification)
**Breaking Changes:** None (Purely additive for meta_ads)

## Changes
1.  **OS-65 Decoder (`kaivo_os/os_65_connector_registry/os_65_connector_registration_decoder.js`)**:
    *   Added `REQUIRED_PHASES_META` (12 phases).
    *   Updated `validateInput` to dynamically enforce phase requirements for `meta_ads`.
    *   Updated strict `connector_id` validation to allow `meta_ads`.

2.  **Tests**:
    *   Added `test/integration/os_65_meta_e2e_smoke.test.js` (Mirrors TikTok/Google smoke tests).

3.  **Documentation**:
    *   Added `docs/connectors/meta_connector_bringup.md` documenting OS-65 parity and staging status.

## Verification
*   `os_65_google_e2e_smoke.test.js`: **PASS** (Regression check)
*   `os_65_tiktok_e2e_smoke.test.js`: **PASS** (Regression check)
*   `os_65_meta_e2e_smoke.test.js`: **PASS** (New coverage)
