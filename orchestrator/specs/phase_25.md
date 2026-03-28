# Phase 25: Execution Correction Engine (Pure Logic)

## Objective

The Execution Correction Engine transforms a DriftResolutionPlan (Phase 24) into a deterministic "next action" instruction for the orchestrator. It is the first corrective engine in Kaivo and the beginning of the closed-loop system. It decides the orchestrator's next step (RETRY, REBUILD, ABORT, NO_ACTION) without performing any IO.

## Files

- **Module**: `orchestrator/modules/execution_correction_engine.js`
- **Tests**: `orchestrator/tests/execution_correction_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTION_CORRECTION_V1` intent

## Input Contract

```javascript
{
  "ok": true,
  "module": "execution_drift_resolution_engine",
  "payload": {
    "plan": { ... }, // ExecutionIndexedPlan (Phase 14)
    "resolution": {
      "global_requires_retry": boolean,
      "global_requires_rebuild": boolean,
      "global_is_terminal": boolean,
      "venues": [
        {
          "venue_key": string,
          "requires_retry": boolean,
          "requires_rebuild": boolean,
          "is_terminal": boolean,
          "issues": []
        }
      ]
    }
  }
}
```

## Output Contract

```javascript
{
  "ok": true,
  "module": "execution_correction_engine",
  "timestamp": "<iso8601>",
  "payload": {
    "plan": { ... },  // passthrough
    "resolution": { ... },  // passthrough
    "correction": {
      "action": "RETRY_CONNECTOR_IO" | "REBUILD_CONNECTOR_REQUESTS" | "ABORT_EXECUTION" | "NO_ACTION",
      "reason": string,
      "targets": null | string[],
      "requires_connector_io": boolean,
      "requires_rebuild": boolean,
      "is_terminal": boolean
    }
  }
}
```

## Core Logic (Priority Order)

## Deterministic Terminal Dead-End Rule

Explicitly document:

A terminal dead-end occurs when drift issues are present but there is no corrective action available. This state is reached when (a) one or more venues contain issues, and (b) neither global nor venue-level retry or rebuild flags exist. In this case, the engine must return an ABORT_EXECUTION correction with is_terminal = true.

1. **Terminal Condition**: If global terminal, venue terminal, or unresolved issues -> `ABORT_EXECUTION`.
2. **Global Rebuild**: If global rebuild required -> `REBUILD_CONNECTOR_REQUESTS` (Global).
3. **Venue-Level Rebuild**: If any venue rebuild required -> `REBUILD_CONNECTOR_REQUESTS` (Targeted).
4. **Global Retry**: If global retry required -> `RETRY_CONNECTOR_IO` (Global).
5. **Venue-Level Retry**: If any venue retry required -> `RETRY_CONNECTOR_IO` (Targeted).
6. **Default**: `NO_ACTION`.

## Dispatcher Wiring

Added to `orchestrator/dispatcher.js`:

```javascript
if (type === "EXECUTION_CORRECTION_V1") {
    return execution_correction_engine.determineCorrection(payload || {});
}
```

## Validation Rules

- `INVALID_INPUT` if:
  - Input is null/undefined or not an object.
  - `plan` is invalid or missing.
  - `resolution` is invalid or missing (must match Phase 25 Input Contract).

## Test Coverage

1. **Test 1**: Terminal state (global)
2. **Test 2**: Terminal state (venue)
3. **Test 3**: Global rebuild
4. **Test 4**: Venue-level rebuild
5. **Test 5**: Global retry
6. **Test 6**: Venue-level retry
7. **Test 7**: Default case
8. **Test 8**: Unresolved issues (Terminal)
9. **Test 9**: Input immutability
10. **Test 10**: Envelope error handling
11. **Test 11**: Deterministic output structure
12. **Test 12**: Backward-compat guard for Phase 24 schema (rejects raw Phase 24 output)

All tests run via:
```bash
node orchestrator/tests/execution_correction_engine.test.js
```
