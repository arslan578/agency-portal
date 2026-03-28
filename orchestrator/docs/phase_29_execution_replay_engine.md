# Phase 29: Execution Replay Engine

## Objective

Pure-logic replay engine that consumes Phase 28 snapshots and produces canonical, replayable execution plans. Supports time-machine style debugging, drift analysis, and training data generation without side effects.

## Position in the System

After Phase 28 creates deterministic snapshots, Phase 29:
- Reconstructs coherent views of loop state at specific iterations
- Enables safe "time machine" replay planning
- Supports drift analysis and post-mortem debugging
- Generates training data for Kaivo Intelligence
- Plans replay without calling connectors or mutating storage

## Files

- **Module**: `orchestrator/modules/execution_replay_engine.js`
- **Tests**: `orchestrator/tests/execution_replay_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTION_REPLAY_V1` intent
- **Feature Flag**: `FF_EXECUTION_REPLAY_V1`

## Input Contract: Execute onReplayInput_v1

```typescript
type ExecutionReplayInput_v1 = {
  execution_snapshot: Phase28SnapshotEnvelope;  // Phase 28 output
  
  replay_options: {
    mode: "DRY_RUN" | "REHYDRATE_PLAN" | "REBUILD_CONNECTOR_REQUESTS";
    target_iteration: number;  // Must match snapshot.iteration_index in v1
    baseline_iteration?: number;
    include_training_view?: boolean;
    feature_flag_overrides?: Record<string, boolean>;
  };
  
  baseline_snapshot?: Phase28SnapshotEnvelope;  // For diff computation
  knowledge_snapshot?: unknown;  // Optional, future use
  tenant_context?: unknown;  // Optional, for observability
};
```

### Required Fields
- `execution_snapshot`
  - Must contain: `execution_id`, `loop.iteration_index`
- `replay_options.mode`
- `replay_options.target_iteration`

### Forbidden Fields
- `live_connector_handle`
- `database_client`
- `file_handle`
- Any IO references

## Output Contract: ExecutionReplayResult_v1

```typescript
type ExecutionReplayResult_v1 = {
  execution_id: string;
  snapshot_version: string;
  target_iteration: number;
  baseline_iteration?: number;
  replay_mode: "DRY_RUN" | "REHYDRATE_PLAN" | "REBUILD_CONNECTOR_REQUESTS";
  
  canonical_state: {
    loop_state: object;
    plan_view: object | null;
    validation_view: object | null;
    policy_view: object | null;
    readiness_view: object | null;
    connector_contracts_view: object | null;
    connector_requests_view: object | null;
    connector_responses_view: object | null;
    corrective_actions_view: object | null;
  };
  
  diff_summary: {
    has_baseline: boolean;
    plan_changed: boolean;
    validation_changed: boolean;
    policy_changed: boolean;
    readiness_changed: boolean;
    connector_contracts_changed: boolean;
    connector_requests_changed: boolean;
    connector_responses_changed: boolean;
    corrective_actions_changed: boolean;
    change_count: number;
  };
  
  diffs: {
    [component]_diff?: {
      before: unknown;
      after: unknown;
      changes: Array<{
        type: "added" | "removed" | "modified";
        path: string;
        value?: unknown;
        before?: unknown;
        after?: unknown;
      }>;
    };
  };
  
  analysis: {
    is_replayable: boolean;
    blocking_issues: ReplayIssue_v1[];
    warnings: ReplayIssue_v1[];
    infos: ReplayIssue_v1[];
  };
  
  training_example?: {
    features: object;
    label?: object;
    metadata: {
      execution_id: string;
      iteration_index: number;
      mode: string;
    };
  };
  
  replay_cursor: {
    execution_id: string;
    iteration_index: number;
    previous_iteration_index: number | null;
    next_iteration_index: number | null;
  };
  
  feature_flags_effective: {
    FF_EXECUTION_REPLAY_V1: boolean;
    [key: string]: boolean;
  };
};

type ReplayIssue_v1 = {
  code: string;
  level: "ERROR" | "WARNING" | "INFO";
  message: string;
  path?: string;
};
```

## Replay Modes

### DRY_RUN
- Returns canonical state, diff, and analysis only
- Fills replay_cursor
- No transformations beyond normalization
- Suitable for inspection and debugging

### REHYDRATE_PLAN
- Reconstructs ExecutionIndexedPlan from canonical views
- Validates structural invariants
- Adds rehydration metadata
- Suitable for plan reconstruction

### REBUILD_CONNECTOR_REQUESTS
- Rebuilds connector request shapes from plan + contracts
- Follows Phase 20 contract
- Does NOT call connectors
- Stores rebuilt requests separately for comparison
- Suitable for replay preparation

## Core Logic

### 1. Input Validation
- Validate snapshot structure and version
- Validate mode is supported
- Validate target_iteration matches snapshot (v1)
- Check for forbidden IO handles
- Return `INVALID_INPUT` on failure

### 2. Canonical State Extraction
- Deep clone artifacts to ensure immutability
- Map artifacts to canonical views:
  - `venue_execution_plan` → `plan_view`
  - `readiness_envelope` → `validation_view` & `readiness_view`
  - `connector_contracts_envelope` → `connector_contracts_view`
  - `connector_requests_envelope` → `connector_requests_view`
  - `connector_responses_envelope` → `connector_responses_view`
  - `corrective_plan_envelope` → `corrective_actions_view`
- Strip lingering secrets (belt & suspenders)

### 3. Baseline Diff Computation
```javascript
if (baseline_iteration !== undefined && baseline_snapshot) {
  // Extract baseline canonical state
  // Compare each component
  // Generate diff_summary with change flags
  // Detect: additions, removals, modifications
}
```

### 4. Replayability Analysis
- Check for essential components (plan_view required)
- Mode-specific requirements:
  - `REBUILD_CONNECTOR_REQUESTS` requires `connector_contracts_view`
  - `REHYDRATE_PLAN` requires `plan_view`
- Populate blocking_issues, warnings, infos
- Set `is_replayable` flag

### 5. Training View Generation
When `include_training_view` is true:
```javascript
features = {
  execution_id, iteration_index, run_status,
  correction_action, has_drift,
  has_plan, has_validation, has_connector_contracts,
  venue_count, unit_count
};

label = {
  outcome: run_status,
  is_terminal
};
```
All features are secret-safe and anonymized.

### 6. Replay Cursor
```javascript
replay_cursor = {
  execution_id,
  iteration_index: target_iteration,
  previous_iteration_index: iteration > 0 ? iteration - 1 : null,
  next_iteration_index: iteration < max - 1 ? iteration + 1 : null
};
```

## Feature Flag

**Flag**: `FF_EXECUTION_REPLAY_V1`

**Enabled** (default): Dispatcher routes to engine  
**Disabled**: Returns error envelope:
```javascript
{
  ok: false,
  module: "execution_replay_engine",
  error: { code: "FEATURE_DISABLED", message: "..." }
}
```

## Error Codes

- **INVALID_INPUT** - Missing/malformed snapshot or options
- **UNSUPPORTED_MODE** - Mode not in allowed list
- **SNAPSHOT_CORRUPT** - Snapshot missing required fields
- **FEATURE_DISABLED** - Feature flag turned off
- **REPLAY_NOT_POSSIBLE** - Structural checks pass but mode requirements not met
- **INTERNAL_ERROR** - Unexpected error during processing

## Example Usage

### DRY_RUN with Baseline
```javascript
const input = {
  execution_snapshot: phase28Snapshot,
  baseline_snapshot: earlierSnapshot,
  replay_options: {
    mode: "DRY_RUN",
    target_iteration: 3,
    baseline_iteration: 0,
    include_training_view: true
  }
};

const result = replayExecution(input);
// result.payload.diff_summary shows changes
// result.payload.training_example contains ML features
```

### REHYDRATE_PLAN
```javascript
const input = {
  execution_snapshot: phase28Snapshot,
  replay_options: {
    mode: "REHYDRATE_PLAN",
    target_iteration: 2
  }
};

const result = replayExecution(input);
// result.payload.canonical_state.plan_view contains rehydrated plan
// result.payload.canonical_state.plan_view._rehydrated === true
```

## Test Coverage

18 tests (atomic bundle):
1. **Happy paths (6)**: DRY_RUN variants, REHYDRATE_PLAN, REBUILD_CONNECTOR_REQUESTS, training view, feature flags
2. **Negative paths (6)**: Missing snapshot, unsupported mode, corrupt snapshot, mismatched iteration, feature disabled, missing requirements
3. **Edge cases (4)**: Minimal components, older contract version, empty diffs, many venues/stable ordering
4. **Regression guard (1)**: Canonical fixture comparison
5. **Determinism guard (1)**: Identical inputs produce identical outputs

Run tests:
```bash
node orchestrator/tests/execution_replay_engine.test.js
```

## Determinism Guarantee

The engine guarantees:
- Same input → same output (bit-for-bit)
- Explicit ordering where meaningful
- No wall-clock dependence (except envelope timestamp)
- No randomization
- Input immutability via deep cloning

## Integration with Phase 28

Phase 29 consumes Phase 28 snapshots directly:
```javascript
const snapshot = buildExecutionSnapshot(snapshotInput);
const replay = replayExecution({ 
  execution_snapshot: snapshot,
  replay_options: { mode: "DRY_RUN", target_iteration: 0 }
});
```

This creates a complete audit trail from execution → snapshot → replay analysis.
