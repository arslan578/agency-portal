# PR: Phase 49 TikTok Ads Connector Logic Layer

## Title
feat: Phase 49 TikTok Ads Connector Logic Layer

## Summary
This PR implements the **TikTok Ads Connector Logic Layer (Phase 49)**, a pure logic component responsible for validating and transforming Kaivo's normalized connector requests into deterministic, connector-safe envelopes for the TikTok Ads connector engine. This implementation adheres strictly to the Forward Hardening Framework, ensuring no IO side effects and byte-for-byte deterministic outputs.

## Key Changes

### 1. Core Logic Engine (`tiktok_ads_logic_engine.js`)
- **Strict Validation:** Implements deep validation of `TikTokLogicInputV1`, ensuring all required fields (campaign, adgroups, creatives, targeting) are present and valid.
- **Unknown Field Rejection:** Explicitly rejects any unknown fields at all levels (root, tenant, request, campaign, adgroup, targeting, creative) to prevent data leakage.
- **Forbidden Field Rejection:** actively rejects TikTok API-shaped fields (e.g., `campaign_id`, `adgroup_id`) in the input.
- **Deterministic Translation:** Maps Kaivo concepts to TikTok API shapes using centralized mappings.
- **Immutability:** Uses deep cloning, lexicographical sorting of all arrays and object keys, and deep freezing of outputs.
- **Feature Flag:** Gated by `FF_TIKTOK_ADS_LOGIC_LAYER`.

### 2. Mapping Resolver (`knowledge/tiktok_mappings_resolver.js`)
- Centralized source of truth for all TikTok enums and rules.
- Handles mappings for:
  - Objectives, Optimization Goals, Billing Events, Placements.
  - Allowed/Disallowed targeting fields.
  - Status and Budget Mode translations.
  - Gender logic (resolving mixed genders to `GENDER_UNLIMITED`).

### 3. Comprehensive Test Suite (`__tests__/tiktok_ads_logic_engine.test.js`)
- **18 Tests Total** (All Passing):
  - **6 Happy Path:** Verifies correct translation for various scenarios (single/multi adgroups, budgets, targeting).
  - **6 Negative Path:** Verifies rejection of invalid inputs (missing fields, unknown mappings, feature flag disabled).
  - **4 Edge Cases:** Verifies handling of empty targeting, maximal targeting, mixed genders, and currency mismatches.
  - **1 Regression Guard:** Ensures output matches a golden snapshot.
  - **1 Determinism Guard:** Proves byte-identical output for identical inputs.

## Validation Results

### Automated Tests
Ran `FF_TIKTOK_ADS_LOGIC_LAYER=true node orchestrator/phases/49_tiktok_ads_logic/__tests__/tiktok_ads_logic_engine.test.js`:
```
Phase 49: TikTok Ads Connector Logic Layer
  ✓ Happy 1: Single adgroup, single video creative
  ✓ Happy 2: Multiple adgroups, shared creatives
  ✓ Happy 3: Daily budget with day budget mode
  ✓ Happy 4: Lifetime budget with total budget mode
  ✓ Happy 5: Targeting with geo, age, gender, interests, behaviors
  ✓ Happy 6: Replay mode deterministic output
  ✓ Negative 7: Feature flag disabled
  ✓ Negative 8: Missing required campaign objective
  ✓ Negative 9: Unknown mapping for objective
  ✓ Negative 10: Unknown mapping for billing event
  ✓ Negative 11: Unknown placement
  ✓ Negative 12: Creative reference missing in creatives map
  ✓ Edge 13: Empty optional targeting
  ✓ Edge 14: Maximal targeting set
  ✓ Edge 15: Mixed genders including UNKNOWN
  ✓ Edge 16: Currency mismatch across adgroups
  ✓ Regression 17: Golden snapshot for known good payload
  ✓ Determinism 18: Identical inputs produce byte-identical outputs

18 passed, 0 failed
```

### Manual Verification
- Verified strict rejection of unknown fields (e.g., `unknown_field` in campaign).
- Verified strict rejection of TikTok-shaped fields (e.g., `campaign_id`).
- Verified gender logic correctly standardizes mixed inputs.

## Checklist
- [x] Logic implementation complete and spec-compliant.
- [x] All 18 tests passing.
- [x] No IO operations or side effects.
- [x] Determinism verified.
- [x] Feature flag implemented.
- [x] Documentation (`phase_49_spec.md`) created.
