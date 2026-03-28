# OS-65 TikTok Activation

## Summary
This PR activates the **TikTok Ads** connector (`tiktok_ads`) within the OS-65 Connector Registry kernel. It updates the registration decoder to accept TikTok activation packets and adds a comprehensive E2E smoke test to verify registry wiring.

## Changes

### 1. Registry Kernel Update
**`kaivo_os/os_65_connector_registry/os_65_connector_registration_decoder.js`**
- **Allow `tiktok_ads`**: Updated strict connector ID validation to accept `tiktok_ads` alongside `google_ads`.
- **Dynamic Phase Requirements**: Implemented dynamic hash chain validation.
  - `google_ads`: Requires 13 phases (Standard Google PIB).
  - `tiktok_ads`: Requires 12 phases (TikTok PIB Series).

### 2. E2E Verification
**`test/integration/os_65_tiktok_e2e_smoke.test.js`**
- **New Smoke Test**: Synthesizes a valid TikTok Phase 12 CRC packet.
- **Verification**: Confirms that OS-65 correctly decodes the packet and creates a valid `connector_registry.tiktok_ads` entry with:
  - Correct `connector_id` ("tiktok_ads")
  - `version: "1.0.0"`
  - Valid `canonical_hash`
  - Complete 12-phase hash chain.

## Verification
Tests passed locally:
- `test/integration/os_65_tiktok_e2e_smoke.test.js` -> ✅ PASS
- `test/integration/os_65_google_e2e_smoke.test.js` -> ✅ PASS (Regression check)

## Next Steps
Once merged:
1. Enable `FF_PIB_TIKTOK_PHASE_*` flags in staging.
2. Enable `FF_OS_CONNECTOR_REGISTRY` in staging.
3. TikTok connector will be live for orchestration.
