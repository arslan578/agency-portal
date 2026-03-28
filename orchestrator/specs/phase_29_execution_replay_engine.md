# Phase 29: Execution Replay Engine

## Overview

Phase 29 is a pure logic, deterministic, no-IO module that consumes an `ExecutionSnapshot_v1` from Phase 28 and produces a strict, non-inferential `ExecutionReplayPlan_v1`.

## Purpose

- Read snapshots from Phase 28 without changing their shape
- Decide if replay is allowed based only on the snapshot, no guessing or inference
- Build a stable, minimal `ExecutionReplayPlan_v1` object that can be used downstream to drive connector replay
- Expose a clear, stable contract for `snapshot.connector_responses`

## Files

- **Module**: `orchestrator/modules/execution_replay_engine.js`
- **Tests**: `orchestrator/tests/execution_replay_engine.test.js`
- **Spec**: `orchestrator/specs/phase_29_execution_replay_engine.md`

## Input Contract: ExecutionReplayInput_v1

```typescript
type ExecutionReplayInput_v1 = {
  intent: "REPLAY_EXECUTION_SNAPSHOT_V1";

  snapshot: ExecutionSnapshot_v1;  // exact shape produced by Phase 28

  // Optional filter for which connectors to replay
  connector_filter?: {
    include?: string[] | null;  // list of connector keys to replay
    exclude?: string[] | null;  // list of connector keys to skip
  } | null;

  // Optional flags for stricter behavior
  options?: {
    require_schema_compatible?: boolean | null;  // default true
    require_connector_responses?: boolean | null; // default false
  } | null;
};
```

### Important Notes

- `snapshot` is exactly the `ExecutionSnapshot_v1` Phase 28 produces.
- Phase 29 must not reinterpret or restructure the snapshot.
- Phase 29 can only read from snapshot, never mutate it.

## Output Contract: ExecutionReplayPlan_v1

```typescript
type ExecutionReplayPlan_v1 = {
  ok: boolean;

  // High level replay status
  replay_status: "READY" | "INCOMPATIBLE" | "UNSUPPORTED" | "NO_CONNECTOR_DATA";

  // Mirrors snapshot replay_key to keep referential integrity
  replay_key: {
    execution_id: string;
    iteration_index: number;
    snapshot_id: string;
  };

  // Copy of snapshot metadata that is safe and deterministic
  snapshot_meta: {
    created_at: string;
    run_status: "SUCCESS" | "FAILED" | "PARTIAL" | "NO_OP";
    correction_action: string;
    has_drift: boolean;
    termination_reason?: string | null;
    schema_compatible: boolean;
  };

  // If READY, Phase 29 populates this with connector responses and REPLAY mode
  connector_replay_snapshot: ReplayConnectorSnapshot_v1 | null;

  // Optional view of which connectors are included
  connectors: {
    available: string[];    // connector keys present in snapshot.connector_responses
    selected: string[];     // after include/exclude filter
  };

  // Reasoning for non-ready states
  incompatibility_reason?: string | null;
};
```

## Connector Replay Contract: ReplayConnectorSnapshot_v1

```typescript
type ReplayConnectorSnapshot_v1 = {
  replay_mode: "REPLAY";

  // Map of connector_key -> strict V1 connector result
  connector_responses: {
    [connector_key: string]: Phase47ConnectorResultV1; // or similar V1 for other connectors
  };
};
```

## Envelope Shape

```typescript
type ExecutionReplayEnvelope_v1 = {
  ok: boolean;
  module: "execution_replay_engine";
  timestamp: string;
  payload: ExecutionReplayPlan_v1 | null;
  error: { code: string; message: string } | null;
};
```

## Behavior

### 1. Input Validation

- `input` must be an object.
- `input.intent` must equal `"REPLAY_EXECUTION_SNAPSHOT_V1"`.
- `input.snapshot` must be a non-null object.
- `input.snapshot.replay` must exist and contain `replay_key`.
- If any of these fail, return `ok: false` with `error.code = "INVALID_INPUT"`.

### 2. Schema Compatibility and Replayability

- Read `snapshot.flags.schema_compatible`.
- Read `snapshot.replay.can_replay`.
- If `schema_compatible` is false or `can_replay` is false:
  - `replay_status = "INCOMPATIBLE"`
  - `ok = false`
  - `payload.replay_key` still populated from snapshot
  - `incompatibility_reason` copied from `snapshot.replay.incompatibility_reason` or a clear message.

### 3. Connector Responses Extraction

- Read `snapshot.connector_responses`.
- If `connector_responses` is null or undefined:
  - If `options.require_connector_responses` is true (default false):
    - `replay_status = "NO_CONNECTOR_DATA"`, `ok = false`.
  - Otherwise, allow `connector_replay_snapshot` to be null while still possibly READY.
- If `connector_responses` exists:
  - Must validate that it has `connector_responses` property that is an object.
  - Extract the keys: `Object.keys(snapshot.connector_responses.connector_responses || {})`.

### 4. Connector Filter Application

- Build `available` as list of connector keys from snapshot.
- Apply `connector_filter.include` if provided:
  - `selected = available.filter(k => include.includes(k))`.
- Apply `connector_filter.exclude` if provided:
  - `selected = selected.filter(k => !exclude.includes(k))`.
- If no filter, `selected = available`.

### 5. Replay Snapshot Construction

- If `schema_compatible` and `snapshot.replay.can_replay` are true:
  - Set `replay_status = "READY"`.
  - Build `connector_replay_snapshot`:
    ```javascript
    {
      replay_mode: "REPLAY",
      connector_responses: {
        [key]: snapshot.connector_responses.connector_responses[key]
        // Only for keys in selected[]
      }
    }
    ```
  - Do not mutate the original snapshot.
  - Do not change any inner connector result fields.

### 6. Snapshot Meta

Populate `snapshot_meta` from snapshot:
- `created_at = snapshot.created_at`
- `run_status = snapshot.loop.run_status`
- `correction_action = snapshot.loop.correction_action`
- `has_drift = snapshot.loop.has_drift`
- `termination_reason = snapshot.loop.termination_reason || null`
- `schema_compatible = snapshot.flags.schema_compatible`

### 7. Replay Key

Copy from `snapshot.replay.replay_key`:
- `execution_id`
- `iteration_index`
- `snapshot_id`

### 8. Determinism

- No random, no Date calls except a single module-level timestamp for the envelope.
- The `ExecutionReplayPlan_v1` must be completely deterministic given the same input object.

## Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_INPUT` | Input validation failed |
| `INCOMPATIBLE` | Snapshot is not replayable (schema_compatible or can_replay is false) |
| `NO_CONNECTOR_DATA` | No connector responses available and required |
| `INTERNAL_ERROR` | Unexpected error during execution |

## Test Coverage

20 tests covering:

### A. Happy Path (6 tests)
1. Minimal compatible snapshot → READY
2. Snapshot with single connector, no filter
3. Snapshot with multiple connectors, include filter
4. Snapshot with multiple connectors, exclude filter
5. Include and exclude combined
6. READY with connector data and schema_compatible true

### B. Negative Path (6 tests)
7. Null input → INVALID_INPUT
8. Missing intent → INVALID_INPUT
9. Missing snapshot → INVALID_INPUT
10. Schema incompatible snapshot
11. Snapshot can_replay false
12. Required connector data missing with require_connector_responses true

### C. Edge Cases (4 tests)
13. Empty connector_responses map
14. Connector filter includes non-existing key
15. Snapshot with drift and termination_reason preserved
16. Null connector_filter and null options

### D. Regression and Shape Guards (4 tests)
17. Regression guard: stable replay_key shape
18. Regression guard: connector_replay_snapshot shape
19. Determinism guard
20. Input immutability guard

## Regression Fixtures

### Test 17: Stable replay_key Shape

```javascript
// Input fixture
const fixtureSnapshot = {
  snapshot_id: "snap_123",
  execution_id: "exec_1",
  // ... standard snapshot fields ...
  replay: {
    can_replay: true,
    replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
    replay_key: {
      execution_id: "exec_1",
      iteration_index: 0,
      snapshot_id: "snap_123"
    }
  }
};

// Expected replay_key
const expectedReplayKey = {
  execution_id: "exec_1",
  iteration_index: 0,
  snapshot_id: "snap_123"
};
```

Any future change to `replay_key` shape is a breaking change and requires a new contract version.

### Test 18: connector_replay_snapshot Shape

```javascript
// Expected shape (exactly)
{
  replay_mode: "REPLAY",
  connector_responses: {
    [connector_key]: <full V1 connector result>
  }
}
```

Any change to this structure is breaking and requires a new contract version.

## Design Principles

1. **No IO**: Pure logic only, no file system, no network, no database.
2. **No Mutation**: Input snapshot is never modified.
3. **Deterministic**: Same input always produces same output.
4. **Strict Contracts**: All types are explicit and validated.
5. **No Inference**: Only read what Phase 28 writes, never guess or infer.
6. **Read-Only Snapshot**: Phase 29 treats Phase 28 snapshots as immutable, canonical state.

## Integration with Other Phases

- **Phase 28**: Consumes `ExecutionSnapshot_v1` produced by Phase 28.
- **Phase 47** (and future connectors): Provides `ReplayConnectorSnapshot_v1` for connector replay.
- **Dispatcher**: Will route `REPLAY_EXECUTION_SNAPSHOT_V1` intent to this module when feature flag is enabled.

## Schema Evolution

Breaking changes require new contract versions:
- `ExecutionReplayPlan_v2`
- New intent: `REPLAY_EXECUTION_SNAPSHOT_V2`

All new fields must be optional to maintain backward compatibility within the same version.

## Run Tests

```bash
node orchestrator/tests/execution_replay_engine.test.js
```

Expected output:
```
✅ All 20 Phase 29 tests passed.
```
