# Phase 23: Execution Drift Engine (Pure Logic)

## Objective

The Execution Drift Engine compares the expected execution plan (Phase 14 ExecutionIndexedPlan) to the actual connector run result (Phase 22 ExecutionRunResult) and produces a deterministic drift report. It detects structural and numeric drift without doing any IO.

## Files

- **Module**: `orchestrator/modules/execution_drift_engine.js`
- **Tests**: `orchestrator/tests/execution_drift_engine.test.js`
- **Dispatcher**: Updated to route `DETECT_EXECUTION_DRIFT_V1` intent

## Input Contract

```javascript
{
  plan: object, // ExecutionIndexedPlan (Phase 14)
  run: object   // ExecutionRunResult (Phase 22)
}
```

## Output Contract

```javascript
{
  ok: boolean,
  module: "execution_drift_engine",
  timestamp: string,
  payload: {
    run_id: string,
    summary: {
      has_drift: boolean,
      highest_severity: "NONE" | "INFO" | "WARNING" | "CRITICAL",
      counts: {
        total_expected_venues: number,
        total_actual_venues: number,
        venues_with_drift: number,
        issues_total: number
      }
    },
    venues: Array<{
      venue_key: string,
      severity: string,
      issues: Array<{
        code: string,
        message: string,
        severity: string,
        venue_key: string | null,
        expected: any,
        actual: any
      }>
    }>
  },
  error?: {
    code: string,
    message: string
  }
}
```

## Core Logic

1. **Index Data**: Indexes expected venues from plan, requested venues from run payload, and result venues from run result.
2. **Global Checks**: Verifies run summary consistency.
3. **Per-Venue Checks**:
   - **Missing/Unexpected**: Checks if venue exists in both plan and run.
   - **Budget/Units**: Compares expected vs actual values (with epsilon for budget).
   - **Connector Errors**: Checks for non-success status codes or error arrays.
4. **Severity Aggregation**: Computes highest severity per venue and globally.
5. **Summary**: Generates drift summary counts.

## Dispatcher Wiring

Added to `orchestrator/dispatcher.js`:

```javascript
if (type === "DETECT_EXECUTION_DRIFT_V1") {
    return execution_drift_engine.detectDrift(payload || {});
}
```

## Validation Rules

- `INVALID_INPUT` if:
  - `input` is null/undefined or not an object
  - `plan` is missing
  - `run` is missing
  - `run.run_id` is missing or invalid

## Test Coverage

1. **Test 1**: Invalid Input - Verifies validation rules.
2. **Test 2**: Happy Path - Verifies no drift when inputs match.
3. **Test 3**: Venue Missing - Verifies `VENUE_MISSING_IN_ACTUAL` (CRITICAL).
4. **Test 4**: Unexpected Venue - Verifies `VENUE_UNEXPECTED_IN_ACTUAL` (WARNING).
5. **Test 5**: Budget Mismatch - Verifies `BUDGET_MISMATCH` (WARNING).
6. **Test 6**: Units Mismatch - Verifies `UNITS_MISMATCH` (INFO).
7. **Test 7**: Connector Error - Verifies `CONNECTOR_ERROR` (CRITICAL).
8. **Test 8**: Summary Mismatch - Verifies `SUMMARY_TOTAL_VENUES_MISMATCH` (WARNING).
9. **Test 9**: Immutability - Verifies inputs are not modified.
10. **Test 10**: Deterministic Ordering - Verifies venue keys are sorted with `_global_` last.

All tests run via:
```bash
node orchestrator/tests/execution_drift_engine.test.js
```
