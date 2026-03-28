Phase 57: Cross-Connector State Merger Engine — Global Connector State Layer

## Summary
This PR introduces the **Cross-Connector State Merger Engine** (Phase 57), which serves as the Global Connector State Layer for the Kaivo Orchestrator. It aggregates individual connector states into a unified, deterministic system state.

## Contracts

### Input Contract (`input_contract_v1`)
Pure in-memory envelope containing `connector_states_by_key` and `capabilities_by_connector_key`.
Strict validation enforces:
- No extra top-level fields.
- Strict enums for `health_state`, `drift_status`, `auth_state`, etc.

### Output Contract (`output_contract_v1`)
Returns a deterministic global state:
- `global_health`: Aggregated health (BROKEN > DEGRADED > OK).
- `global_drift`: Aggregated drift (UNRESOLVED > PARTIALLY_RESOLVED > RESOLVED).
- `capability_matrix`: Inverted index of capabilities to connectors.
- `routing_profile`: Aggregated routing stats.
- `merged_state`: Lexicographically sorted connector states.
- `determinism_hash`: SHA-256 of canonical payload.

## Feature Flag Behavior
**Flag:** `FF_GLOBAL_CONNECTOR_STATE_MERGER`

- **Enabled:** Full validation and aggregation logic.
- **Disabled:** Returns safe defaults (`global_health: "UNKNOWN"`, `merged_state: {}`) and `status: "OK"`.

## Determinism
- **Canonical Sorting:** All keys and array elements sorted lexicographically.
- **No Mutation:** Input is deep-cloned and verified against post-processing clone.
- **Stable Hash:** SHA-256 computed over canonical JSON.

## Test Suite
**18 Tests Total:**
- 6 Happy Path
- 6 Negative Path
- 4 Edge Cases
- 1 Regression (Feature Flag)
- 1 Determinism

## Compliance
This implementation fully complies with the **Forward-Hardening Framework (Phases 28+)**:
- Strict Contracts
- No IO
- Deterministic Output
- Comprehensive Observability
