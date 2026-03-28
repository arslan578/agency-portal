# Phase 27B — Connector Backplane Specification Layer (Spec-Aligned, Deterministic, Fully Tested)

## Overview

Phase 27B creates the **Connector Backplane Specification Layer**, the universal, versioned, deterministic connector contract that governs every connector in Kaivo OS.

It serves as the authoritative schema referenced by the entire OS (Phases 53–57, 58–60), ensuring no connector loads, executes, or is included in planning unless it conforms to this backplane.

## Implementation Summary

### 1. Deterministic Spec Generation
- **Engine:** `connector_backplane_engine.js`
- **Function:** `buildBackplaneSpec()` returns a fully deterministic object containing:
  - `request_contract`
  - `response_contract`
  - `capabilities`
  - `error_surface`
  - `routing_flags`
  - `metadata_fields`
  - `readiness_rules`
  - `reconciliation_shape`
  - `snapshot_shape`
  - `policy_bindings`

### 2. Specification Compliance
- **Strict Validation:** Rejects extra fields, missing fields, and schema inconsistencies.
- **Canonical Error Surface:** Enforces the 10 canonical error codes (`AUTH_ERROR` -> `UNKNOWN`).
- **Feature Flag:** `FF_CONNECTOR_BACKPLANE_SPEC` (defaults to true).
- **Observability:** Emits metrics, logs, and trace spans on spec generation.

### 3. Forward-Hardening Compliance
- **No IO:** Purely static and deterministic.
- **Replay Safe:** Output is identical across runs (verified by Test #18).
- **Zero Drift:** Implementation matches the `connector_backplane_spec.md` exactly.

## Tests (23/23 Passing)

Comprehensive deterministic test suite:

```bash
--- Happy Path (6) ---
✓ 1. Builds full backplane spec
✓ 2. Includes full request_contract_v1
✓ 3. Includes full response_contract_v1
✓ 4. Includes full canonical error surface
✓ 5. Includes full capabilities schema
✓ 6. Includes full routing flags

--- Negative Path (6) ---
✓ 7. Missing error code triggers MISSING_ERROR_SURFACE
✓ 8. Extra field in request_contract triggers INVALID_BACKPLANE_SPEC
✓ 9. Extra field in capabilities triggers CAPABILITY_INCONSISTENCY
✓ 10. Missing metadata field triggers INVALID_BACKPLANE_SPEC
✓ 11. Non-boolean routing_flags values trigger INVALID_BACKPLANE_SPEC
✓ 12. Missing policy binding triggers POLICY_MIRROR_RESOLUTION_FAILURE

--- Edge Cases (4) ---
✓ 13. Feature flag off
✓ 14. Empty capabilities arrays valid
✓ 15. Zero budgets allowed
✓ 16. Unknown connector_key field

--- Guards (2) ---
✓ 17. Schema drift guard
✓ 18. Determinism guard

--- Surgical Corrections (5) ---
✓ A. Structured descriptor validation
✓ B. Readiness invariant
✓ C. Policy binding pattern
✓ D. Routing flags forbidden combinations
✓ E. Capabilities semantic validation
```

## Surgical Corrections Applied
1. **Structured Descriptors:** Replaced all string-literal types with `{ type, required }` descriptors.
2. **Capabilities Expansion:** Added `min` constraints and structured array items.
3. **Readiness Invariants:** Enforced `connector_disabled` exclusivity logic.
4. **Policy Bindings:** Enforced `^policy\.` regex pattern for policy references.
5. **Response Contract Upgrade:** Added `origin_timestamp`, `request_classification`, `dry_run`.
6. **Routing Flags:** Enforced forbidden combinations (e.g., `HARD_STOP` + `SAFE_TO_RETRY`).
7. **Strict Validation:** Added extra-field validation for all surfaces.

## Files Added

- `orchestrator/phases/27b_connector_backplane/connector_backplane_spec.md`
- `orchestrator/phases/27b_connector_backplane/connector_backplane_engine.js`
- `orchestrator/phases/27b_connector_backplane/connector_backplane_engine.test.js`

## Ready for Merge

Phase 27B is fully implemented, verified, and ready to serve as the foundational contract for all Kaivo connectors.

## Backplane Integration Wiring
The following phases have been explicitly updated to reference Phase 27B:
- **Phase 45 (Google Ads Connector)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 47 (Meta Ads Connector)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 48 (Meta Ads Logic)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 49 (TikTok Ads Logic)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 50 (TikTok Ads Connector)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 53 (Connector Escalation)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 54 (Drift Repair)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 55 (Repair Executor)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 56 (State Reconciliation)**: Added `Backplane Integration` section and engine header constraints.
- **Phase 57 (Global State Merger)**: Added `Backplane Integration` section and engine header constraints.

*Note: Phases 56B and 58 were checked but do not currently exist in the codebase.*
