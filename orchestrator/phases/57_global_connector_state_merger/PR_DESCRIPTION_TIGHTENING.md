Phase 57 Tightening Patch: Contract Names and Spec Alignment

## Summary
This patch applies tightening to Phase 57 (Cross Connector State Merger Engine) by adding explicit contract version identifiers and aligning the specification document with the exact implementation.

## Changes
- **Contract Constants:** Added `INPUT_CONTRACT_NAME` and `OUTPUT_CONTRACT_NAME` constants to `global_connector_state_merger_engine.js` and exported them.
- **Spec Alignment:** Updated `phase_57_spec.md` to match the implemented contracts, feature flag behavior, aggregation rules, and determinism guarantees exactly.

## Verification
- **No Behavioral Changes:** The engine logic remains identical.
- **Test Suite:** All 18 existing tests pass unmodified.

```
Phase 57: Cross-Connector State Merger Engine
  ✓ Happy 1: All OK -> Global OK, RESOLVED
  ...
  ✓ Determinism: Order Independence

18 passed, 0 failed
```
