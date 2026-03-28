# Phase 56B: Connector Profile Harmonizer (Deterministic, Backplane-Aligned)

## Summary
This PR implements **Phase 56B: Connector Profile Harmonizer**, a critical Forward-Hardening phase that sits between Phase 56 (Autonomous State Reconciliation) and Phase 57 (Global Connector State Merger). It guarantees that all connector profiles are normalized, schema-compliant, and capability-resolved before global merging.

## Changes
*   **New Engine:** `connector_profile_harmonizer_engine.js` (Pure logic, no IO).
*   **New Spec:** `phase_56b_spec.md` (Full contract definition).
*   **New Tests:** `__tests__/connector_profile_harmonizer_engine.test.js` (18 deterministic tests).
*   **Documentation:** `README.md`.

## Forward-Hardening Compliance
*   **Determinism:** All outputs are sorted and deeply normalized. 100-run determinism guard included.
*   **Replay Safety:** Identical inputs produce bit-identical outputs.
*   **No Hardcoded Knowledge:** Capabilities and schema are injected via inputs (`capability_tables`, `backplane_schema`).
*   **Observability:** Structured logs, metrics, and tracing implemented.
*   **Feature Flag:** `FF_CONNECTOR_PROFILE_HARMONIZER` support with pass-through behavior.

## Verification
*   **Test Suite:** 18 tests passing (Happy Path, Negative Path, Edge Cases, Guards).
*   **Regression Guard:** Ensures forbidden fields are strictly stripped.
*   **Determinism Guard:** Verified stability across repeated runs.

## Next Steps
*   Merge into `main`.
*   Proceed to Phase 57 (Global Connector State Merger).
