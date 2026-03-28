# Phase 54: Autonomous Drift Repair Engine Specification

**Input Contract:** `connector_drift_repair_input_v1`  
**Output Contract:** `connector_drift_repair_plan_v1`  
**Feature Flag:** `FF_AUTONOMOUS_DRIFT_REPAIR`  
**IO:** No (Pure planning engine)  
**Mode:** LIVE and REPLAY

---

## Purpose

Phase 54 implements the **Autonomous Drift Repair Engine**, the executor phase that translates escalation plans into deterministic repair blueprints. It consumes drift reports, rebuild plans, escalation plans, connector capabilities, and policy constraints, then generates complete connector-ready repair plans.

Key responsibilities:
- Translate Phase 53 strategies into concrete actions
- Integrate rebuild plans from Phase 52
- Apply drift severity prioritization
- Enforce policy supremacy absolutely
- Generate deterministic, ordered action plans
- Produce replay-safe snapshots
- NO IO, NO connector calls, NO side effects

---

## Input Contract

### ConnectorDriftRepairInputV1

```javascript
{
  execution_id: string,              // Globally unique, non-empty
  
  drift_report: {
    has_drift: boolean,
    drift_types: string[],
    connector_states: [{
      connector_key: string,
      expected_state: object,
      observed_state: object,
      severity: 'LOW' | 'MEDIUM' | 'HIGH'
    }]
  },
  
  rebuild_plan: {
    rebuild_type: 'NO_REBUILD' | 'PARTIAL_REBUILD' | 'FULL_REBUILD',
    targets: string[] | null
  },
  
  escalation_plan: {
    strategy: string,
    details: object | null,
    snapshot: object
  },
  
  connector_capabilities: {
    [connector_key: string]: {
      can_retry: boolean,
      can_rebuild: boolean,
      can_upgrade_version: boolean,
      can_rotate_credentials: boolean,
      can_retry_sandbox: boolean
    }
  },
  
  policy: {
    forbid_repair: boolean,
    allow_full_rebuild: boolean,
    allow_partial_rebuild: boolean,
    forbid_credential_rotation: boolean
  },
  
  requested_at: string | null,
  snapshot: object | null
}
```

**Forbidden Fields:**
- Any fields not explicitly listed above
- Unknown or extraneous fields → INVALID_INPUT error

---

## Output Contract

### ConnectorDriftRepairPlanV1

```javascript
{
  status: 'SUCCESS' | 'ERROR',
  status_code: string,
  
  repair_plan: {
    actions: [{
      action_type: string,
      connector_key: string,
      params: object | null
    }] | null,
    
    snapshot: {
      feature_enabled: boolean,
      rebuild_type: string,
      escalation_strategy: string,
      drift_types: string[],
      drift_severities: [{
        connector_key: string,
        severity: string
      }],
      rebuild_targets: string[] | null,
      ordered_actions: string[],
      policy_flags: object,
      connector_capabilities: object
    }
  }
}
```

---

## Feature Flag Behavior

When `FF_AUTONOMOUS_DRIFT_REPAIR !== 'true'`:

```javascript
{
  status: 'SUCCESS',
  status_code: 'FEATURE_DISABLED',
  repair_plan: {
    actions: null,
    snapshot: {
      feature_enabled: false
    }
  }
}
```

No downstream execution should occur when disabled.

---

## Policy Supremacy (Absolute Override)

If `policy.forbid_repair === true`:

```javascript
{
  status: 'SUCCESS',
  status_code: 'POLICY_FORBID_REPAIR',
  repair_plan: {
    actions: [],
    snapshot: {
      feature_enabled: true,
      reason: 'POLICY_SUPREMACY',
      rebuild_type: rebuild_plan.rebuild_type,
      escalation_strategy: escalation_plan.strategy,
      drift_types: drift_report.drift_types,
      drift_severities: [...],
      ordered_actions: [],
      policy_flags: policy,
      connector_capabilities: connector_capabilities
    }
  }
}
```

**No evaluation of strategies. No partial plans. Policy wins absolutely.**

---

## Strategy Translation

### 1. NO_ESCALATION
Generate only safe repairs:
- No credential rotation
- No API upgrades
- Only rebuilds allowed by policy + capability
- Retry only if safe and supported

### 2. FALLBACK_CONNECTOR
Create `SWITCH_CONNECTOR` action:
```javascript
{
  action_type: 'SWITCH_CONNECTOR',
  connector_key: details.from,
  params: { to: details.to }
}
```
Validate both connectors exist in capabilities.

### 3. CREDENTIAL_ROTATION
Allowed only if:
- `capabilities[connector_key].can_rotate_credentials === true`
- `policy.forbid_credential_rotation === false`

Otherwise → POLICY_CONFLICT or CAPABILITY_CONFLICT

### 4. API_VERSION_UPGRADE
Allowed only if:
- `capabilities[connector_key].can_upgrade_version === true`

### 5. SANDBOX_RETRY
Allowed only if:
- `capabilities[connector_key].can_retry_sandbox === true`

### 6. COMPOSITE
For composite strategies:
1. Expand sequence from `details.actions`
2. For each action:
   - Verify capability compatibility
   - Verify policy compatibility
   - Build action using standard schema
3. Sort using deterministic ordering (Section below)
4. Deduplicate
5. Preserve composite intent while respecting policy supremacy

### 7. HARD_STOP
Return:
```javascript
{
  status_code: 'HARD_STOP',
  repair_plan: { actions: [] }
}
```
Short-circuit all logic.

---

## Rebuild Plan Integration

### FULL_REBUILD
Generate `REBUILD_CONNECTOR` for every connector_key, but only if:
- `policy.allow_full_rebuild === true`
- `capabilities[connector_key].can_rebuild === true`

Otherwise → conflict error

### PARTIAL_REBUILD
Generate REBUILD actions only for listed targets.
Each target must pass capability + policy checks.

### NO_REBUILD
No rebuild actions unless escalation strategy explicitly mandates one.

---

## Deterministic Action Ordering

After generating all candidate actions, sort using this exact algorithm:

### 1. Sort by action_type priority:
1. ROTATE_CREDENTIALS
2. UPGRADE_API_VERSION
3. REBUILD_CONNECTOR
4. RETRY_CONNECTOR
5. SANDBOX_RETRY
6. SWITCH_CONNECTOR

### 2. Within same type:
Sort alphabetically by `connector_key`

### 3. Apply severity modifier:
HIGH before MEDIUM before LOW
**(Never break rule #1)**

### 4. Stable sort:
Ordering must be identical across all runs

---

## Error Conditions

### INVALID_INPUT
Missing or malformed contract fields.
```javascript
{
  status: 'ERROR',
  status_code: 'INVALID_INPUT',
  repair_plan: null,
  error_message: string
}
```

### CAPABILITY_CONFLICT
Escalation/rebuild requires unsupported connector capabilities.

### POLICY_CONFLICT
Action is forbidden by policy.

### HARD_STOP
Propagate strategy-level hard stops exactly.

---

## Observability (Mandatory)

### Trace Span
- Name: `connector_drift_repair_engine_v1`
- Attributes: `execution_id`, `workspace_id`, `brand_id`, `tenant_id`

### Structured Log
Event: `connector_drift_repair_decision`

Must include:
- `execution_id`
- `workspace_id`
- `brand_id`
- `tenant_id`
- `strategy`
- `action_count`

### Metrics
- `drift_repair_invoked` (counter)
- `drift_repair_actions_count` (gauge)
- `drift_repair_strategy_used_*` (counter per strategy)

---

## Snapshot Schema (Required)

```javascript
{
  feature_enabled: boolean,
  rebuild_type: string,
  escalation_strategy: string,
  drift_types: string[],
  drift_severities: [{
    connector_key: string,
    severity: string
  }],
  rebuild_targets: string[] | null,
  ordered_actions: string[],        // Action types in order
  policy_flags: object,
  connector_capabilities: object
}
```

Snapshot must be **deep-cloned** and deterministic.

---

## Formal Invariants

### 1. Policy Supremacy
**Policy overrides all logic.**
- If `forbid_repair === true`, no actions generated
- If `forbid_credential_rotation === true`, no ROTATE_CREDENTIALS

### 2. No Hardcoded Rules
**All decisions from inputs.**
- No require() of static files
- No embedded business logic

### 3. Determinism
**Same inputs → same output.**
- No randomization
- No timestamps in snapshot
- Stable ordering algorithm

### 4. No IO
**Zero network/file access.**
- Pure function execution

### 5. No Upstream Mutation
**Never modify input envelope.**
- Deep clone where needed

---

## Examples

### Example 1: Policy Forbids Repair
**Input:**
```javascript
{
  policy: { forbid_repair: true },
  escalation_plan: { strategy: 'COMPOSITE' }
}
```
**Output:**
```javascript
{
  status: 'SUCCESS',
  status_code: 'POLICY_FORBID_REPAIR',
  repair_plan: { actions: [] }
}
```

### Example 2: Credential Rotation
**Input:**
```javascript
{
  escalation_plan: { strategy: 'CREDENTIAL_ROTATION' },
  connector_capabilities: {
    'connector_a': { can_rotate_credentials: true }
  },
  policy: { forbid_credential_rotation: false }
}
```
**Output:**
```javascript
{
  status: 'SUCCESS',
  status_code: 'OK',
  repair_plan: {
    actions: [{
      action_type: 'ROTATE_CREDENTIALS',
      connector_key: 'connector_a',
      params: { mode: 'secondary' }
    }]
  }
}
```

### Example 3: Mixed Severity Ordering
**Input:**
```javascript
{
  drift_report: {
    connector_states: [
      { connector_key: 'b', severity: 'HIGH' },
      { connector_key: 'a', severity: 'HIGH' }
    ]
  }
}
```
**Actions ordered:**
1. `REBUILD_CONNECTOR` for 'a' (alphabetical within HIGH)
2. `REBUILD_CONNECTOR` for 'b'

## 13. Backplane Integration

*   Phase 54 consumes `connector_backplane_v1.snapshot_shape`, `connector_backplane_v1.metadata_fields`, and `connector_backplane_v1.error_surface` to:
    *   interpret drifted connector snapshots
    *   align repaired executions back into the snapshot model
