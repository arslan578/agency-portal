# Phase 22: Execution Run Engine v1

## Objective

Implement a pure orchestrator wrapper around the connector IO layer that:
- Takes a Phase-20-style payload + injected connector config
- Calls `connector_io_engine.run`
- Returns a run-level envelope with summary counts

This is **Execution Run Engine v1** (connector-focused). It does not depend on any missing phases or modules.

## Files

- **Module**: `orchestrator/modules/execution_run_engine.js`
- **Tests**: `orchestrator/tests/execution_run_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTE_RUN_V1` intent

## Input Contract

```javascript
{
  run_id?: string,          // optional, auto-generated if missing
  plan?: object,            // optional, Phase 14+ ExecutionIndexedPlan
  connector_payload: {      // REQUIRED: Phase 20-ish payload
    plan: object,
    readiness: object,
    validation: object,
    policy: object,
    connector_contracts: object,
    connector_requests: {
      venues: Array<any>
    }
  }
}
```

**injectedConfig** (Phase 21C-style):
```javascript
{
  global_connector_config?: {
    META?: object,
    GOOGLE_ADS?: object,
    TIKTOK?: object
  },
  http_client?: function(url, options): Promise<HttpResponse>
}
```

## Output Contract

```javascript
{
  ok: boolean,
  module: "execution_run_engine",
  timestamp: string,
  payload: {
    run_id: string,
    plan: object | null,
    connector_io: {
      venues: Array<ConnectorIOResult>
    },
    summary: {
      total_venues: number,
      skipped: number,
      success: number,
      failed: number
    }
  } | null,
  error?: {
    code: string,
    message: string
  }
}
```

## Core Logic

1. **Validate Input**: Ensures `connector_payload` and `connector_requests.venues` are present and valid.
2. **Determine run_id**: Uses provided `run_id` or generates `run_${timestamp}`.
3. **Call Connector IO**: Invokes `connector_io_engine.run(connector_payload, injectedConfig)`.
4. **Handle Errors**: If connector IO fails, returns `CONNECTOR_IO_ERROR`.
5. **Compute Summary**: Counts venues by status:
   - **skipped**: `status === "SKIPPED"`
   - **failed**: `status === "FAILED"` OR (`status === "READY"` AND `errors.length > 0`)
   - **success**: `status !== "SKIPPED"` AND `errors.length === 0` AND `http_status` 200-299

## Dispatcher Wiring

Added to `orchestrator/dispatcher.js`:

```javascript
if (type === "EXECUTE_RUN_V1") {
    return await execution_run_engine.run(payload, normalizedIntent.injectedConfig);
}
```

## Validation Rules

- `INVALID_INPUT` if:
  - `input` is null/undefined or not an object
  - `input.connector_payload` is missing or not an object
  - `connector_payload.connector_requests.venues` is missing or not an array

## Test Coverage

1. **Test 1**: Invalid Input - Verifies `null` input returns `INVALID_INPUT`.
2. **Test 2**: Missing connector_payload - Verifies empty object returns `INVALID_INPUT`.
3. **Test 3**: Happy Path - Mocks connector_io_engine to return 3 venues (1 skipped, 1 success, 1 failed), verifies summary counts.
4. **Test 4**: Propagate Connector IO Error - Mocks connector_io_engine to fail, verifies `CONNECTOR_IO_ERROR` propagation.
5. **Test 5**: Auto-generated run_id - Verifies `run_${timestamp}` format when no `run_id` provided.

All tests run via:
```bash
node orchestrator/tests/execution_run_engine.test.js
```
