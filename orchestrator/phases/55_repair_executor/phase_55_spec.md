# Phase 55: Autonomous Drift Repair Executor Specification

**Input Contract:** `connector_drift_repair_execute_input_v1`  
**Output Contract:** `connector_drift_repair_execute_output_v1`  
**Feature Flag:** `FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR`  
**IO:** Yes (First IO-performing phase in recovery pipeline)  
**Mode:** LIVE only (no REPLAY for IO phases)

---

## Purpose

Phase 55 implements the **Autonomous Drift Repair Executor**, which executes the deterministic repair plan produced by Phase 54. This is the first IO-performing phase in the recovery pipeline.

**Core Mandate:**
- Execute connector-level recovery actions
- Preserve deterministic structure
- Enforce policy & capability constraints
- Emit full observability
- Produce replay-friendly execution snapshot

**Phase 54 decides what should happen. Phase 55 makes it happen exactly once, in order, and safely.**

---

## Input Contract

### ConnectorDriftRepairExecuteInputV1

```javascript
{
  execution_id: string,              // Globally unique
  tenant_id: string,
  workspace_id: string,
  brand_id: string,

  repair_plan: {
    actions: [{
      action_id: string,
      action_type: enum[
        "ROTATE_CREDENTIALS",
        "UPGRADE_API_VERSION", 
        "REBUILD_CONNECTOR",
        "SANDBOX_RETRY",
        "RETRY_CONNECTOR",
        "SWITCH_CONNECTOR"
      ],
      connector_key: string,
      payload: object
    }]
  },

  connector_capabilities: object,
  policy: object,

  requested_at: string,              // ISO date string

  execution_context: {
    credentials: object,
    api_config: object,
    sandbox_config: object,
    environment: object
  }
}
```

**Forbidden Fields:**
- `drift_report` (belongs to Phase 54)
- `escalation_plan` (belongs to Phase 54)
- `rebuild_plan` (belongs to Phase 52)
- Any Phase 54 planning metadata

---

## Output Contract

### ConnectorDriftRepairExecuteOutputV1

```javascript
{
  status: "SUCCESS" | "ERROR" | "PARTIAL",
  status_code: string,

  results: [{
    action_id: string,
    action_type: string,
    connector_key: string,
    status: "SUCCESS" | "ERROR",
    response: object | null,
    latency_ms: number
  }],

  failures: [{
    action_id: string,
    error_code: string,
    error_message: string
  }],

  execution_snapshot: {
    ordered_actions: string[],       // Action IDs in order
    per_action: object,
    total_latency_ms: number,
    policy_flags: object,
    capability_matrix: object
  },

  timing: {
    total_ms: number,
    per_action: object
  }
}
```

---

## Feature Flag Behavior

When `FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR !== 'true'`:

```javascript
{
  status: 'SUCCESS',
  status_code: 'FEATURE_DISABLED',
  results: [],
  failures: [],
  execution_snapshot: {
    ordered_actions: [],
    per_action: {},
    total_latency_ms: 0,
    policy_flags: {},
    capability_matrix: {}
  },
  timing: {
    total_ms: 0,
    per_action: {}
  }
}
```

No actions executed, no IO performed.

---

## Execution Rules

### 1. Deterministic Ordering
Actions MUST execute strictly in the order provided by Phase 54.  
**No dynamic reordering.**

### 2. Policy Supremacy
Before any IO:
- Policy service confirms action is permitted
- If blocked → action skipped, marked FAILED, no IO
- **Required by Forward-Hardening #3, #7**

### 3. Capability Supremacy
- Action must match connector capability map
- No connector may execute action it lacks capability for
- If missing → fail action deterministically

### 4. Safe IO Execution

Each action type maps to a connector call:

| Action Type | Execution |
|------------|-----------|
| ROTATE_CREDENTIALS | POST /rotate |
| UPGRADE_API_VERSION | POST /upgrade |
| REBUILD_CONNECTOR | POST /rebuild |
| SANDBOX_RETRY | POST /sandbox/test |
| RETRY_CONNECTOR | Replay last connector request |
| SWITCH_CONNECTOR | Update routing state |

Each call must:
- Classify errors into standard Kaivo error codes
- Measure latency
- Log structured telemetry
- Sanitize response for snapshot safety

### 5. Partial Failure Semantics
- Execution continues after a failure
- Status escalates to PARTIAL
- **Phase 55 performs no retries** (retries belong to Phase 51)

### 6. Observability

**Required by Forward-Hardening #3:**
- Trace span: `phase_55_repair_executor`
- Structured logs per action
- Metrics: latency, error_code, action_type
- Propagate execution_id, tenant/workspace/brand IDs

### 7. Idempotence & Snapshot Safety
- Decision path is deterministic
- IO results may vary, but output shape must always conform
- Snapshot must always be reproducible from execution path

**Required by Forward-Hardening #5, #9**

---

## Error Codes

- `POLICY_FORBIDDEN` - Policy blocked the action
- `CAPABILITY_MISSING` - Connector lacks capability for action
- `CONNECTOR_IO_ERROR` - IO operation failed
- `CONNECTOR_TIMEOUT` - IO operation timed out
- `INVALID_ACTION_TYPE` - Unknown action type
- `INVALID_PAYLOAD` - Action payload is malformed
- `INTERNAL_EXECUTOR_FAILURE` - Unexpected internal error

---

## Status Code Derivation

```javascript
if (failures.length === 0) {
  status = 'SUCCESS'
  status_code = 'ALL_ACTIONS_SUCCEEDED'
} else if (results.some(r => r.status === 'SUCCESS')) {
  status = 'PARTIAL'
  status_code = 'SOME_ACTIONS_FAILED'
} else {
  status = 'ERROR'
  status_code = 'ALL_ACTIONS_FAILED'
}
```

---

## Invariants

1. **No mutation of inputs** - Deep freeze/compare envelope
2. **Ordered action execution** - Sequential, no reordering
3. **No dynamic action addition/removal** - Fixed action list
4. **Snapshot always produced** - Even on ERROR status
5. **Connector-safe response shapes** - Sanitized for snapshot
6. **Deterministic structure** - Independent of IO randomness

---

## Non-Goals

- ❌ No planning
- ❌ No drift interpretation
- ❌ No retries (belongs to Phase 51)
- ❌ No rebuild logic (belongs to Phase 52)
- ❌ No escalation logic (belongs to Phase 53)
- ❌ No capability recalculation

**Phase 55 only executes.**

---

## Example Input

```javascript
{
  "execution_id": "exec_123",
  "tenant_id": "t1",
  "workspace_id": "w1",
  "brand_id": "b1",
  "repair_plan": {
    "actions": [{
      "action_id": "a1",
      "action_type": "ROTATE_CREDENTIALS",
      "connector_key": "google_ads",
      "payload": {}
    }]
  },
  "connector_capabilities": {
    "google_ads": {
      "ROTATE_CREDENTIALS": true
    }
  },
  "policy": {
    "allow_credential_rotation": true
  },
  "requested_at": "2025-01-01T00:00:00Z",
  "execution_context": {
    "credentials": {},
    "api_config": {},
    "sandbox_config": {},
    "environment": {}
  }
}
```

---

## Example Output

```javascript
{
  "status": "SUCCESS",
  "status_code": "ALL_ACTIONS_SUCCEEDED",
  "results": [{
    "action_id": "a1",
    "action_type": "ROTATE_CREDENTIALS",
    "connector_key": "google_ads",
    "status": "SUCCESS",
    "response": { "rotated": true },
    "latency_ms": 42
  }],
  "failures": [],
  "execution_snapshot": {
    "ordered_actions": ["a1"],
    "per_action": {
      "a1": { "status": "SUCCESS", "error_code": null }
    },
    "total_latency_ms": 42,
    "policy_flags": { "allow_credential_rotation": true },
    "capability_matrix": {
      "google_ads": { "ROTATE_CREDENTIALS": true }
    }
  },
  "timing": {
    "total_ms": 42,
    "per_action": { "a1": 42 }
  }
}
```

## 13. Backplane Integration

*   Phase 55 executes actions that must conform to `connector_backplane_v1.capabilities`.
*   It classifies IO errors into the `connector_backplane_v1.error_surface` taxonomy.
*   It ensures all executed actions map to valid `connector_backplane_v1` operations.
