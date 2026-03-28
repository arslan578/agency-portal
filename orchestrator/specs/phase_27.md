# Phase 27: Execution Loop Engine (Pure Logic)

## Objective

Pure logic controller that integrates outputs from Phases 22-26. Produces a deterministic ExecutionLoopPlan with decision: CONTINUE, STOP, or ABORT. No IO, no state mutation, no time-based logic.

## Files

- **Module**: `orchestrator/modules/execution_loop_engine.js`
- **Tests**: `orchestrator/tests/execution_loop_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTION_LOOP_DECIDE_V1` intent

## Input Contract

```javascript
{
  "type": "EXECUTION_LOOP_DECIDE_V1",
  "payload": {
    "loop_context": {
      "loop_id": string,
      "iteration_index": number,
      "no_change_iterations": number,
      "last_run_result": object | null,      // Phase 22
      "last_drift_report": object | null,   // Phase 23
      "last_resolution": object | null,      // Phase 24
      "last_correction": object | null,      // Phase 25
      "last_connector_plan": object | null   // Phase 26 (reads connector_actions array)
    },
    "loop_config": {
      "max_iterations": number,              // default: 5
      "max_no_change_iterations": number,    // default: 2
      "treat_partial_as_retryable": boolean,
      "treat_timeout_as_retryable": boolean,
      "treat_failed_as_retryable": boolean
    }
  }
}
```

## Output Contract

```javascript
{
  ok: boolean,
  module: "execution_loop_engine",
  timestamp: string,
  payload: {
    loop_id: string,
    previous_iteration_index: number,
    next_iteration_index: number,
    decision: "CONTINUE" | "STOP" | "ABORT",
    reason: { code: string, message: string },
    control: {
      should_execute_connector_plan: boolean,
      is_terminal: boolean
    },
    diagnostics: {
      run_status: string,
      correction_action: string,
      has_drift: boolean,
      no_change_iterations: number,
      max_iterations: number
    }
  },
  error?: { code: string, message: string }
}
```

## Decision Rules (Priority Order)

### Derived Flags

**Connector Work Detection**:
```javascript
connectorHasWork = Array.isArray(last_connector_plan?.connector_actions)
                   && last_connector_plan.connector_actions.length > 0
```

Phase 27 reads `loop_context.last_connector_plan.connector_actions` as the source of connector jobs from Phase 26.

### 1. Hard ABORT
- Correction action is "ABORT_EXECUTION"
- Run failed and retries disabled
- Max iterations reached

### 2. No-Change Limit STOP
- No-change counter >= max_no_change_iterations

### 3. Clean Success STOP
- Run status is SUCCESS or NO_OP
- Correction action is NO_ACTION
- No drift detected

### 4. CONTINUE
- Connector actions exist (connector_actions array has items)
- Iteration index < max iterations

### 5. Defensive STOP
- No connector actions available

## No-Change Counter Rule

Increment when:
- Run status is SUCCESS
- Correction action is NO_ACTION
- No drift
- No connector actions

Reset when any condition above is false.

## Error Handling

Returns `INVALID_INPUT` for:
- Missing loop_id
- Missing or non-numeric iteration_index
- Missing loop_context

## Test Coverage

14 tests covering:
1-2. CONTINUE paths
3-5. ABORT conditions
6-8. No-change counter and STOP
9. Defensive STOP
10. Input immutability
11-13. Invalid inputs
14. Diagnostics

All tests run via:
```bash
node orchestrator/tests/execution_loop_engine.test.js
```
