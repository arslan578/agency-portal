# Phase 56: Autonomous State Reconciliation Engine Specification

**Input Contract:** `connector_state_reconciliation_input_v1`  
**Output Contract:** `connector_state_reconciliation_output_v1`  
**Feature Flag:** `FF_STATE_RECONCILIATION_ENGINE`  
**IO:** None (Pure observation/reconciliation)  
**Mode:** LIVE and REPLAY compatible

---

## Purpose

Phase 56 implements the **Autonomous State Reconciliation Engine**, which converts Phase 55's execution truth into an authoritative, deterministic connector-state snapshot.

**Core Principle:** Observes only. Never executes, never retries, never rewrites history.

**Answers:** "Given what Phase 55 did, what is the actual state of each connector now?"

---

## Input Contract

### ConnectorStateReconciliationInputV1

```javascript
{
  execution_id: string,              // Required
  phase_55_snapshot: {
    actions: [...],                  // All actions from Phase 55
    per_action: {                    // Results keyed by action_id
      [action_id]: {
        status: 'SUCCESS' | 'ERROR',
        error_code: string | null
      }
    },
    failures: [...],                 // Normalized error records
    connector_metadata: {            // Auth, versions, routing info
      [connector_key]: {
        auth_state: string,
        api_version: string,
        needs_rebuild: boolean,
        active_connector: string,
        fallback_connector: string
      }
    },
    capability_matrix: {             // From Knowledge Graph
      [connector_key]: {
        can_rotate_credentials: boolean,
        can_rebuild: boolean,
        supports_sandbox: boolean,
        ...
      }
    },
    policy_flags: {                  // Policy constraints
      allow_rebuild: boolean,
      forbid_rebuild: boolean,
      ...
    }
  },
  timestamp: string                  // ISO date string
}
```

**Required Fields:**
- `execution_id`
- `phase_55_snapshot.per_action`
- `phase_55_snapshot.capability_matrix`

**Forbidden Fields:**
- Raw IO responses
- Mutable references to upstream objects

---

## Output Contract

### ConnectorStateReconciliationOutputV1

```javascript
{
  execution_id: string,
  connector_state: {
    [connector_key]: {
      auth_state: "VALID" | "INVALID" | "EXPIRED" | "ROTATED" | "UNKNOWN",
      
      api_version_state: {
        current_version: string,
        target_version: string | null,
        upgrade_attempted: boolean,
        upgrade_success: boolean
      },
      
      structural_state: {
        rebuilt: boolean,
        partial_rebuild: boolean,
        needs_rebuild: boolean,
        sandbox_verified: boolean
      },
      
      routing_state: {
        active: string,
        fallback: string | null,
        switched: boolean,
        switch_attempted: boolean
      },
      
      health_state: "OK" | "DEGRADED" | "BROKEN",
      drift_status: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED"
    }
  },
  reconciliation_timestamp: string,
  determinism_hash: string,
  
  // Optional fields
  feature_flag_enabled?: boolean,
  stop_reason?: string,
  status?: "OK" | "ERROR",
  error?: string
}
```

---

## Feature Flag Behavior

**Behavior:**
If `false`: Returns empty `connector_state`, `feature_flag_enabled: false`, and `stop_reason: 'FEATURE_DISABLED'`.

```javascript
{
  execution_id: string,
  connector_state: {},
  reconciliation_timestamp: string,
  determinism_hash: string,
  feature_flag_enabled: false,
  stop_reason: "FEATURE_DISABLED",
  status: "OK",
  error: null
}
```

When Phase 56 is disabled via feature flag, it returns an empty `connector_state` and a status of "OK" with error set to null, indicating that the engine did not run but did not fail.

**Contract Compliance:** Feature disabled response MUST conform to output contract.

**Replay Equivalence:** For Phase 56, replay equivalence is defined as equality of `connector_state` and `determinism_hash`. The `reconciliation_timestamp` is metadata and is not part of the deterministic state.

---

## State Dimensions

### 1. Auth State
- **VALID**: Auth is working (from metadata)
- **INVALID**: Auth failed or is broken
- **EXPIRED**: Auth expired (error_code indicates)
- **ROTATED**: Credentials successfully rotated
- **UNKNOWN**: No information available

### 2. API Version State
- **current_version**: Active API version
- **target_version**: Intended upgrade version
- **upgrade_attempted**: Upgrade action was taken
- **upgrade_success**: Upgrade succeeded

### 3. Structural State
- **rebuilt**: Full rebuild succeeded
- **partial_rebuild**: Partial rebuild succeeded
- **needs_rebuild**: Rebuild needed but failed/blocked
- **sandbox_verified**: Sandbox testing passed

### 4. Routing State
- **active**: Currently active connector
- **fallback**: Fallback connector if any
- **switched**: Switch operation succeeded
- **switch_attempted**: Switch was attempted

### 5. Health State
- **OK**: All systems operational
- **DEGRADED**: Partial functionality
- **BROKEN**: Critical failures

### 6. Drift Status
- **RESOLVED**: All drift issues fixed
- **PARTIALLY_RESOLVED**: Some issues remain
- **UNRESOLVED**: Drift not fixed

---

## Reconciliation Rules

### Truth Over Optimism
Success is NEVER assumed, only inferred from execution results.

**Example:** If no rotation action occurred, auth_state comes from metadata, NOT defaulted to 'VALID'.

### Capability Supremacy
Missing capability = cannot infer success for that dimension.

**Example:** If `can_rebuild === false` and rebuild was attempted, result is INVALID, not assumed success.

**API Version Upgrades:** If a connector lacks `can_upgrade_api_version` capability, success CANNOT be inferred, even if the Phase 55 action result is SUCCESS. The `upgrade_success` field must be `false` and `current_version` must remain unchanged from metadata.

### Policy Integration
Policy constraints reflected in drift_status and structural_state.

**Example:** If policy forbids rebuild and rebuild was needed, drift_status = 'UNRESOLVED'.

---

## Invariants

1. **IO Forbidden** - No network calls, no file IO
2. **No Mutation** - Phase 55 inputs unchanged
3. **Deterministic Output** - Identical inputs = identical outputs + hash
4. **Capability Supremacy** - Missing capability = cannot infer success
5. **Snapshot Safe** - All fields replayable
6. **Hash Stability** - Same state = same hash

---

## Error Handling

**Input Validation Errors:**
- Missing required fields → return error response
- Invalid phase_55_snapshot structure → return error response

**State Reconciliation:**
- Missing metadata → health_state = 'BROKEN'
- Empty per_action → drift_status = 'UNRESOLVED'
- Missing capabilities → cannot infer success for affected dimensions

---

## Example Input

```javascript
{
  "execution_id": "exec_123",
  "phase_55_snapshot": {
    "actions": [
      {
        "action_id": "a1",
        "action_type": "ROTATE_CREDENTIALS",
        "connector_key": "google_ads"
      }
    ],
    "per_action": {
      "a1": {
        "status": "SUCCESS",
        "error_code": null
      }
    },
    "connector_metadata": {
      "google_ads": {
        "auth_state": "VALID",
        "api_version": "v12"
      }
    },
    "capability_matrix": {
      "google_ads": {
        "can_rotate_credentials": true
      }
    },
    "policy_flags": {
      "allow_rebuild": true
    }
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

---

## Example Output

```javascript
{
  "execution_id": "exec_123",
  "connector_state": {
    "google_ads": {
      "auth_state": "ROTATED",
      "api_version_state": {
        "current_version": "v12",
        "target_version": null,
        "upgrade_attempted": false,
        "upgrade_success": false
      },
      "structural_state": {
        "rebuilt": false,
        "partial_rebuild": false,
        "needs_rebuild": false,
        "sandbox_verified": false
      },
      "routing_state": {
        "active": "primary",
        "fallback": null,
        "switched": false,
        "switch_attempted": false
      },
      "health_state": "OK",
      "drift_status": "RESOLVED"
    }
  },
  "reconciliation_timestamp": "2025-01-01T00:01:00Z",
  "determinism_hash": "abc123..."
}
```

## 13. Backplane Integration

*   Phase 56 produces state objects that strictly conform to `connector_backplane_v1.snapshot_shape`.
*   It validates `auth_state`, `health_state`, and `drift_status` against the enums defined in Phase 27B.
*   It uses `connector_backplane_v1.metadata_fields` to normalize connector identity and versioning info.
