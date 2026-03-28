# Phase 47 v3: Connector Execution Engine

## Overview

Phase 47 v3 is the canonical, deterministic, replay-native connector execution layer. It executes LIVE mode connector actions and converts replay plans into REPLAY mode execution, producing a strict `Phase47ConnectorResultV1` object.

## Purpose

- Execute LIVE mode connector actions (real execution via stub)
- Convert Phase 29 replay plans into REPLAY mode execution
- Produce strict `Phase47ConnectorResultV1` output
- Guarantee identical output for REPLAY vs LIVE for the same canonical input
- Provide a stable base that all Phase 48+ connectors inherit

## Position in the System

Phase 47 sits after Phase 29 (Execution Replay Engine) and before Phase 48+ per-platform connectors (Meta, TikTok, Google, Roku, etc.).

## Files

- **Module**: `orchestrator/modules/connector_execution_engine.js`
- **Tests**: `orchestrator/tests/connector_execution_engine.test.js`
- **Spec**: `orchestrator/specs/phase_47_connector_execution_engine.md`

## Input Contract: Phase47ConnectorInputV1

```typescript
type Phase47ConnectorInputV1 = {
  mode: "LIVE" | "REPLAY";

  connector_key: string; // e.g. "meta_ads"
  execution_id: string;
  iteration_index: number;

  // LIVE only:
  request?: {
    raw_request: unknown;
    normalized_request: unknown;
  } | null;

  // REPLAY only (output of Phase 29):
  replay_snapshot?: ReplayConnectorSnapshot_v1 | null;

  // Observability / tracing
  observability?: {
    trace_id?: string | null;
    parent_span_id?: string | null;
  } | null;

  meta: {
    input_contract_version: "Phase47ConnectorInputV1";
    schema_version?: string | null;
    orchestrator_version?: string | null;
  };
};
```

### Rules
- In LIVE mode, `request` must exist and `replay_snapshot` must be null.
- In REPLAY mode, `replay_snapshot` must exist and `request` must be null.
- Both modes must be validated strictly.

## Output Contract: Phase47ConnectorResultV1

```typescript
type Phase47ConnectorResultV1 = {
  ok: boolean;

  connector_key: string;
  execution_id: string;

  mode: "LIVE" | "REPLAY";
  replay_source: "LIVE_EXECUTION" | "REPLAY_SNAPSHOT";

  status: "SUCCESS" | "FAILED";    // REQUIRED
  connector: string;                // REQUIRED (same as connector_key)

  request: {
    raw: unknown | null;
    normalized: unknown | null;
  };

  response: {
    raw: unknown | null;
    normalized: unknown | null;
  };

  error: {
    code: string | null;
    message: string | null;
  };

  metrics: {
    duration_ms: number;
    started_at: string;
    finished_at: string;
  };

  logs: string[];

  started_at: string;     // ISO
  finished_at: string;    // ISO
};
```

### Non-Negotiable
- Phase 28 requires this field structure exactly.
- Phase 29 uses this structure in replay.
- Phase 47 must not add, remove, or rename fields.

## Behavior Specification

### 1. Input Validation

Returns error envelope:
```javascript
{
  "ok": false,
  "error": { "code": "INVALID_INPUT", "message": "..." }
}
```

For any invalid shape:
- Missing `meta`
- Missing `mode`
- Invalid combination of LIVE/REPLAY fields
- Missing `connector_key`, `execution_id`, `iteration_index`
- Wrong `input_contract_version`

Zero mutation of user input.

### 2. Deterministic Timing

Uses injected timestamp functions:
```javascript
options = {
  now?: () => string,
  hrtime?: () => number   // milliseconds
}
```

If not provided:
- `now()` uses `new Date().toISOString()`
- `hrtime()` uses `Date.now()` as ms

Duration calculation:
```javascript
duration_ms = hr_end - hr_start
```

### 3. LIVE Mode Execution

LIVE mode invokes a stub execution layer:
```javascript
const executor = options.executor || (() => ({ raw: null, normalized: null }));
```

The stub must be:
- Deterministic
- Synchronous
- Safe: no external IO
- MUST NEVER call real APIs
- ALWAYS return deterministic testing values unless overridden

**Note**: Connector-specific logic will live in Phase 48+.

### 4. REPLAY Mode Execution

In REPLAY mode:
1. Extract preserved response from:
   ```javascript
   input.replay_snapshot.connector_responses[connector_key]
   ```
2. Validate strict `Phase47ConnectorResultV1` structure
3. Copy it EXACTLY
4. Set:
   ```javascript
   mode = "REPLAY"
   replay_source = "REPLAY_SNAPSHOT"
   ```
5. Keep all timestamps, metrics, `response.raw`, `response.normalized` EXACTLY as stored

No inference. No modification. No recomputation.

### 5. Connector Result Assembly

#### LIVE:
```javascript
{
  ok: true,
  connector_key,
  execution_id,

  mode: "LIVE",
  replay_source: "LIVE_EXECUTION",
  
  status: "SUCCESS",  // or "FAILED" on error
  connector: connector_key,

  request: { raw, normalized },
  response: { raw, normalized },

  error: { code: null, message: null },

  metrics: {
    duration_ms: <computed>,
    started_at,
    finished_at
  },

  logs: [],
  started_at,
  finished_at
}
```

#### REPLAY:
Copy entire connector snapshot:
```javascript
{
  ...snapshot_result,
  mode: "REPLAY",
  replay_source: "REPLAY_SNAPSHOT"
}
```

Validation ensures:
- All required V1 fields exist
- All required nested fields exist
- `logs` is an array
- `metrics` is an object

## Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_INPUT` | Input validation failed |
| `EXECUTION_ERROR` | Executor threw an error during LIVE execution |
| `INTERNAL_ERROR` | Unexpected error during execution |

## Test Coverage

20 tests covering:

### Happy Path (6 tests)
1. Minimal LIVE input executes stub
2. LIVE input with provided executor returns deterministic output
3. REPLAY: exact passthrough of snapshot
4. REPLAY: connector not found → error
5. LIVE: duration computed deterministically
6. REPLAY: complex nested normalized payload preserved

### Negative Path (6 tests)
7. Missing mode
8. Invalid mode
9. Providing both request + replay_snapshot
10. Missing meta.input_contract_version
11. Missing connector_key
12. Malformed replay_snapshot (missing fields)

### Edge Cases (4 tests)
13. Empty logs array
14. executor throws → ok=false with error.code="EXECUTION_ERROR"
15. Determinism: identical inputs produce identical output
16. Immutability: input not mutated

### Regression Guards (4 tests)
17. V1 contract field list guard
18. Nested structure guard for response.normalized
19. metrics structure guard
20. replay passthrough timestamp guard (no timestamp changes)

## Envelope Shape

```typescript
type ConnectorExecutionEnvelope = {
  ok: boolean;
  module: "connector_execution_engine";
  timestamp: string;
  payload: Phase47ConnectorResultV1 | null;
  error: { code: string, message: string } | null;
};
```

## Integration with Other Phases

- **Phase 28**: Accepts `Phase47ConnectorResultV1` in snapshot artifacts
- **Phase 29**: Produces `ReplayConnectorSnapshot_v1` that Phase 47 consumes
- **Phase 48+**: Per-platform connectors (Meta, TikTok, Google, etc.) will inject custom executors

## Design Principles

1. **No IO**: Pure logic only, no file system, no network, no database.
2. **No Mutation**: Input is never modified.
3. **Deterministic**: Same input always produces same output (with same options).
4. **Strict Contracts**: All types are explicit and validated.
5. **Replay Fidelity**: REPLAY mode preserves timestamps and responses exactly.

## Schema Evolution

Breaking changes require new contract versions:
- `Phase47ConnectorInputV2`
- `Phase47ConnectorResultV2`

All new fields must be optional to maintain backward compatibility within the same version.

## Run Tests

```bash
node orchestrator/tests/connector_execution_engine.test.js
```

Expected output:
```
✅ All 20 Phase 47 v3 tests passed.
```

## Future Extensibility

Phase 48+ connectors will:
- Inject platform-specific executors (Meta Ads API, Google Ads API, etc.)
- Inherit the same contract structure
- Benefit from the replay infrastructure
- Maintain determinism and immutability guarantees
