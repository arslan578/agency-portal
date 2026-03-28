# Phase 26: Execution Connector Action Engine (Pure Logic)

##Objective

Turn the Phase 25 CorrectionDecision into a concrete, machine-readable ConnectorActionPlan that tells the connector layer exactly what to do next, without performing any IO.

## Files

- **Module**: `orchestrator/modules/execution_connector_action_engine.js`
- **Tests**: `orchestrator/tests/execution_connector_action_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTION_CONNECTOR_ACTION_V1` intent

## Input Contract

```javascript
{
  "type": "EXECUTION_CONNECTOR_ACTION_V1",
  "payload": {
    "plan": { /* ExecutionIndexedPlan, read only */ },
    "connector_bundle": { /* Phase 20 ConnectorRequestBundle, read only */ },
    "correction": { /* Phase 25 CorrectionDecision */ }
  }
}
```

## Output Contract

```javascript
{
  ok: boolean,
  module: "execution_connector_action_engine",
  timestamp: string,
  payload: {
    plan: object,
    connector_bundle: object,
    correction: object,
    connector_actions: {
      action: string,
      is_terminal: boolean,
      requires_rebuild: boolean,
      requires_connector_io: boolean,
      summary: string,
      jobs: Array<{
        job_id: string,
        venue_key: string,
        connector_key: string,
        mode: "RETRY" | "REBUILD" | "NOOP" | "ABORT",
        scope: "GLOBAL" | "VENUE",
        request_ids: string[],
        reason: string
      }>
    }
  } | null,
  error?: { code: string, message: string }
}
```

## Core Logic

Deterministic mapping from correction.action to connector_actions.jobs:

1. **ABORT_EXECUTION**: Single ABORT job, global scope, terminal
2. **GLOBAL_REBUILD**: Single REBUILD job, global scope
3. **VENUE_REBUILD**: One REBUILD job per target venue, venue scope
4. **GLOBAL_RETRY**: RETRY job for each venue with retryable requests
5. **VENUE_RETRY**: RETRY job for each target venue with retryable requests
6. **NO_ACTION**: Single NOOP job

### Retryable Requests

A request is retryable if status is missing, "FAILED", or "TIMEOUT". Do not retry "SUCCESS" or "PENDING".

### Determinism

- Venue keys sorted alphabetically
- Request IDs preserve original order from connector_bundle
- No randomness or time-based branching

## Dispatcher Wiring

```javascript
if (type === "EXECUTION_CONNECTOR_ACTION_V1") {
    return execution_connector_action_engine.buildConnectorActions(payload || {});
}
```

## Error Handling

Returns `ok: false` and `payload: null` for:
- Invalid or missing inputs
- Unsupported actions
- Missing targets for venue-scoped actions

## Test Coverage

12 tests covering:
1. GLOBAL_RETRY happy path
2. VENUE_RETRY happy path
3. GLOBAL_REBUILD happy path
4. VENUE_REBUILD happy path
5. ABORT_EXECUTION happy path
6. NO_ACTION happy path
7. Venue missing in connector_bundle (NOOP fallback)
8. Invalid action (error)
9. Missing targets (error)
10. Input immutability
11. Deterministic ordering
12. Error envelope structure

All tests run via:
```bash
node orchestrator/tests/execution_connector_action_engine.test.js
```
