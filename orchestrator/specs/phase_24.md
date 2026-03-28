# Phase 24: Execution Drift Resolution Engine (Pure Logic)

## Objective

The Execution Drift Resolution Engine consumes the ExecutionIndexedPlan (Phase 14), ExecutionRunResult (Phase 22), and ExecutionDriftReport (Phase 23) to produce a deterministic, machine-readable DriftResolutionPlan. It determines what corrective action is required (RETRY, REBUILD_REQUESTS, ABORT, NOOP) without performing any IO or calling connectors.

## Files

- **Module**: `orchestrator/modules/execution_drift_resolution_engine.js`
- **Tests**: `orchestrator/tests/execution_drift_resolution_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTION_DRIFT_RESOLUTION_V1` intent

## Input Contract

```javascript
{
  type: "EXECUTION_DRIFT_RESOLUTION_V1",
  payload: {
    plan: ExecutionIndexedPlan,             // from Phase 14
    run: ExecutionRunResult,                // from Phase 22
    drift: ExecutionDriftReport             // from Phase 23
  }
}
```

## Output Contract

```javascript
{
  ok: true,
  module: "execution_drift_resolution_engine",
  timestamp: <iso8601>,
  payload: {
    run_id: string,
    has_drift: boolean,
    highest_severity: "CRITICAL" | "WARNING" | "INFO" | "NONE",

    actions: {
      global: ResolutionAction[],
      venues: {
        [venue_key: string]: ResolutionAction[]
      }
    },

    summary: {
      total_actions: number,
      venues_with_actions: number,
      requires_rerun: boolean,
      requires_rebuild: boolean
    }
  }
}
```

### ResolutionAction Schema

```javascript
{
  type: "RETRY" | "REBUILD_REQUESTS" | "ABORT" | "NOOP",
  severity: "CRITICAL" | "WARNING" | "INFO",
  reason: string,     // deterministic explanation
  source_issue: string // issue.code from Phase 23
}
```

## Core Logic

1. **Input Validation**: Strictly validates presence and shape of plan, run, and drift.
2. **Action Mapping**:
   - **CRITICAL Drift** (Missing/Unexpected Venue, Connector Error, Summary Mismatch) -> `REBUILD_REQUESTS` (CRITICAL)
   - **WARNING Drift** (Budget/Units Mismatch) -> `RETRY` (WARNING)
   - **INFO Drift** -> `NOOP` (INFO)
3. **Flag Calculation**:
   - `requires_rebuild = true` if any CRITICAL action exists.
   - `requires_rerun = true` if any WARNING action exists (and no CRITICAL actions, as rebuild supersedes rerun).
4. **Deterministic Ordering**:
   - Venue keys sorted lexicographically.
   - Actions sorted by severity DESC, then issue code ASC.
   - Global actions separate from venue actions.

## Dispatcher Wiring

Added to `orchestrator/dispatcher.js`:

```javascript
if (type === "EXECUTION_DRIFT_RESOLUTION_V1") {
    return execution_drift_resolution_engine.resolveDrift(payload || {});
}
```

## Validation Rules

- `INVALID_INPUT` if:
  - Input is null/undefined or not an object.
  - `plan` is invalid or missing.
  - `run` is invalid or missing.
  - `drift` is invalid or missing.

## Test Coverage

1. **Test 1**: Invalid Input - Verifies validation rules for all inputs.
2. **Test 2**: No Drift - Verifies empty actions and false flags.
3. **Test 3**: CRITICAL Tests - Verifies mapping to `REBUILD_REQUESTS` and `requires_rebuild=true`.
4. **Test 4**: WARNING Tests - Verifies mapping to `RETRY` and `requires_rerun=true`.
5. **Test 5**: INFO Tests - Verifies mapping to `NOOP`.
6. **Test 6**: Deterministic Ordering - Verifies sorting of venues and actions.
7. **Test 7**: Immutability - Verifies inputs are not modified.

All tests run via:
```bash
node orchestrator/tests/execution_drift_resolution_engine.test.js
```
