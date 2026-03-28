# Phase 28: Execution Snapshot Engine

## Overview

Phase 28 creates deterministic, replayable snapshots of execution loop state. It operates as pure logic with no IO, handling secret redaction, schema compatibility checking, and observability hooks.

## Position in the System

After Phase 27 produces a loop decision, Phase 28:
- Consumes the current loop state (execution id, iteration index, decisions, artifacts from phases 8–27)
- Produces a normalized `ExecutionSnapshot_v1` object
- Guarantees replayability and observability for each iteration
- Does not change upstream or downstream behavior—only structures and redacts data

## Files

- **Module**: `orchestrator/modules/execution_snapshot_engine.js`
- **Tests**: `orchestrator/tests/execution_snapshot_engine.test.js`
- **Dispatcher**: Updated to route `BUILD_EXECUTION_SNAPSHOT_V1` intent
- **Feature Flag**: `FF_PHASE_28_EXECUTION_SNAPSHOT_V1`

## Input Contract: ExecutionSnapshotInput_v1

```typescript
type ExecutionSnapshotInput_v1 = {
  execution_id: string;          // required
  run_id?: string | null;
  campaign_id?: string | null;
  brand_id?: string | null;

  iteration_index: number;       // required, integer >= 0
  max_iterations: number;        // required, integer >= 1

  loop_status: {
    run_status: "SUCCESS" | "FAILED" | "PARTIAL" | "NO_OP";
    correction_action: string;
    has_drift: boolean;
    termination_reason?: string | null;
  };

  artifacts: {
    venue_execution_plan?: unknown;
    execution_indexed_plan?: unknown;
    readiness_envelope?: unknown;
    serialized_plan_envelope?: unknown;
    connector_contracts_envelope?: unknown;
    connector_requests_envelope?: unknown;
    connector_io_envelope?: unknown;
    connector_responses_envelope?: unknown;
    normalized_responses_envelope?: unknown;
    diagnosis_envelope?: unknown;
    corrective_plan_envelope?: unknown;
    connector_action_plan_envelope?: unknown;
    revised_payload_envelope?: unknown;
  };

  observability: {
    trace_id?: string | null;
    parent_span_id?: string | null;
    metrics_context?: Record<string, unknown> | null;
  } | null;

  meta: {
    input_contract_version: "ExecutionSnapshotInput_v1";
    orchestrator_version?: string | null;
    schema_version?: string | null;
    extra?: Record<string, unknown> | null;
  };
};
```

### Required Fields
- `execution_id`
- `iteration_index`
- `max_iterations`
- `loop_status.run_status`
- `loop_status.correction_action`
- `loop_status.has_drift`
- `meta.input_contract_version`

### Forbidden Fields
Top-level secrets are forbidden and cause `INVALID_INPUT`:
- `access_token`
- `refresh_token`
- `client_secret`
- `api_key`

Secrets may exist in nested artifacts; they will be redacted in output.

## Output Contract: ExecutionSnapshot_v1

```typescript
type ExecutionSnapshot_v1 = {
  snapshot_id: string;           // deterministic SHA256 hash
  execution_id: string;
  run_id?: string | null;

  contract: {
    input_contract: "ExecutionSnapshotInput_v1";
    output_contract: "ExecutionSnapshot_v1";
    orchestrator_version?: string | null;
    schema_version?: string | null;
  };

  created_at: string;            // ISO-8601

  loop: {
    iteration_index: number;
    max_iterations: number;
    is_terminal_iteration: boolean; // iteration_index >= max_iterations - 1
    run_status: "SUCCESS" | "FAILED" | "PARTIAL" | "NO_OP";
    correction_action: string;
    has_drift: boolean;
    termination_reason?: string | null;
  };

  ids: {
    campaign_id?: string | null;
    brand_id?: string | null;
  };

  artifacts: {
    // Redacted versions of input artifacts
  };

  connector_responses?: {
    replay_mode: "LIVE" | "REPLAY";
    connector_responses: Record<string, unknown>; // Map of connector_key -> full V1 connector result
  };

  replay: {
    can_replay: boolean;
    replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1";
    replay_key: {
      execution_id: string;
      iteration_index: number;
      snapshot_id: string;
    };
    incompatibility_reason?: string | null;
  };

  observability: {
    trace_id?: string | null;
    parent_span_id?: string | null;
    span_name: "execution_snapshot_engine";
    metrics: {
      snapshot_bytes?: number;
      artifacts_count: number;
    };
  };

  flags: {
    has_redactions: boolean;
    schema_compatible: boolean;
  };
};
```

## Core Logic

### 1. Input Validation
- Check required fields
- Validate types and ranges
- Reject forbidden top-level secrets
- Return `INVALID_INPUT` on failure

### 2. Deterministic Snapshot ID
```javascript
snapshot_id = sha256(JSON.stringify({
  execution_id,
  iteration_index,
  input_contract_version
})).slice(0, 32)
```

### 3. Terminal Iteration Flag
```javascript
is_terminal_iteration = iteration_index >= max_iterations - 1
```

### 4. Schema Compatibility
- `schema_compatible = true` if `input.meta.input_contract_version === "ExecutionSnapshotInput_v1"`
- Otherwise `schema_compatible = false`, `can_replay = false`
- Set `incompatibility_reason` when incompatible

### 5. Secret Redaction
Recursively traverse artifacts and replace these keys:
- `access_token` → `"REDACTED"`
- `refresh_token` → `"REDACTED"`
- `client_secret` → `"REDACTED"`
- `api_key` → `"REDACTED"`

Deep clone artifacts to ensure input immutability.

### 6. Artifacts Count
Count non-undefined fields in `input.artifacts`.

### 7. Connector Responses Handling
If `input.artifacts.connector_responses_envelope` is present (from Phase 46):
- Extract connector results.
- Store as `connector_responses` in snapshot payload:
  ```javascript
  {
    replay_mode: "LIVE", // Default
    connector_responses: {
      [connector_key]: <full V1 connector result>
    }
  }
  ```
- **Constraint**: Must store the full V1 connector result object (metrics, logs, etc.) without stripping fields.

### 8. Observability Hooks
- **Metrics**: `kaivo.execution_snapshot.count`, `kaivo.execution_snapshot.artifacts_count`
- **Log**: Structured event `execution_snapshot_created`
- **Trace**: Span `execution_snapshot_engine` with execution metadata

## Feature Flag

**Flag**: `FF_PHASE_28_EXECUTION_SNAPSHOT_V1`

**Enabled** (default): Dispatcher routes to engine
**Disabled**: Dispatcher returns neutral envelope:
```javascript
{
  ok: true,
  module: "dispatcher",
  timestamp,
  payload: { feature_disabled: "FF_PHASE_28_EXECUTION_SNAPSHOT_V1" },
  error: null
}
```

## Example

### Input
```json
{
  "execution_id": "exec_123",
  "run_id": "run_001",
  "campaign_id": "camp_42",
  "brand_id": "brand_9",
  "iteration_index": 0,
  "max_iterations": 3,
  "loop_status": {
    "run_status": "SUCCESS",
    "correction_action": "NO_ACTION",
    "has_drift": false
  },
  "artifacts": {
    "venue_execution_plan": { "dummy": true }
  },
  "observability": {
    "trace_id": "trace_abc",
    "parent_span_id": "span_root"
  },
  "meta": {
    "input_contract_version": "ExecutionSnapshotInput_v1",
    "orchestrator_version": "2025.11.29"
  }
}
```

### Output
```json
{
  "ok": true,
  "module": "execution_snapshot_engine",
  "timestamp": "2025-11-29T10:00:00.000Z",
  "payload": {
    "snapshot_id": "abc123...hash",
    "execution_id": "exec_123",
    "run_id": "run_001",
    "contract": {
      "input_contract": "ExecutionSnapshotInput_v1",
      "output_contract": "ExecutionSnapshot_v1",
      "orchestrator_version": "2025.11.29"
    },
    "created_at": "2025-11-29T10:00:00.000Z",
    "loop": {
      "iteration_index": 0,
      "max_iterations": 3,
      "is_terminal_iteration": false,
      "run_status": "SUCCESS",
      "correction_action": "NO_ACTION",
      "has_drift": false
    },
    "ids": {
      "campaign_id": "camp_42",
      "brand_id": "brand_9"
    },
    "artifacts": {
      "venue_execution_plan": { "dummy": true }
    },
    "replay": {
      "can_replay": true,
      "replay_intent": "REPLAY_EXECUTION_SNAPSHOT_V1",
      "replay_key": {
        "execution_id": "exec_123",
        "iteration_index": 0,
        "snapshot_id": "abc123...hash"
      }
    },
    "observability": {
      "trace_id": "trace_abc",
      "parent_span_id": "span_root",
      "span_name": "execution_snapshot_engine",
      "metrics": {
        "artifacts_count": 1
      }
    },
    "flags": {
      "has_redactions": false,
      "schema_compatible": true
    }
  }
}
```

## Test Coverage

18 tests covering:
1. **Happy paths (6)**: Minimal input, full artifacts, terminal iteration, drift, termination reason, secret redactions
2. **Negative paths (6)**: Missing execution_id, negative iteration_index, zero max_iterations, invalid run_status, forbidden secrets, null loop_status
3. **Edge cases (4)**: Complex artifacts immutability, null observability, missing meta.extra, contract version mismatch
4. **Regression guard (1)**: Fixture comparison
5. **Determinism guard (1)**: Identical inputs produce identical outputs

Run tests:
```bash
node orchestrator/tests/execution_snapshot_engine.test.js
```

## Schema Evolution

Breaking changes require new contract versions:
- `ExecutionSnapshot_v2`
- New intent: `BUILD_EXECUTION_SNAPSHOT_V2`

All new fields must be optional to maintain backward compatibility.
