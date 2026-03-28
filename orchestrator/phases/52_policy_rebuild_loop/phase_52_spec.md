# Phase 52: Policy-Aware Rebuild Loop Engine Specification

**Contract:** `policy_rebuild_input_v1` → `policy_rebuild_output_v1`  
**Feature Flag:** `FF_POLICY_AWARE_REBUILD_LOOP`  
**IO:** No (Pure planning engine)  
**Mode:** LIVE and REPLAY

---

## Purpose

Phase 52 implements the **Policy-Aware Rebuild Loop Engine**, the second stage of autonomous recovery. It inspects Phase 51 outcomes, consults policy rules, and generates deterministic rebuild plans without executing them.

Key responsibilities:
- Inspect Phase 51 execution outcomes
- Consult policy rules via policy resolver
- Generate deterministic rebuild action plans
- Ensure snapshot-safe, replay-safe outputs
- Never mutate Phase 50/51 envelopes

---

## Inputs

### PolicyRebuildInputV1

```javascript
{
  execution_id: string,           // Globally unique, non-empty
  tenant: string,                  // Non-empty
  workspace_id: string,            // Non-empty
  brand_id: string,                // Non-empty
  
  requested_at?: string,           // ISO 8601, passed through if present
  
  phase_51: {
    status: string,                // 'SUCCESS' | 'RETRY_EXHAUSTED' | 'HARD_FAIL' | etc.
    status_code: string,           // From Phase 51
    stop_reason: string,           // Machine-readable reason
    attempts: Array,               // Attempt history from Phase 51
    connector_request: object,     // Original connector request
    connector_output: object       // Connector response/error
  },
  
  policy_ruleset_id: string,       // Non-empty
  snapshot_id: string              // Non-empty
}
```

**Forbidden:**
- Direct connector IO
- Mutation of Phase 50/51 envelopes
- Reinterpretation of connector statuses

---

## Outputs

### PolicyRebuildOutputV1

```javascript
{
  ok: boolean,                     // Execution success flag
  code: string,                    // 'OK' or error code
  message: string | null,
  
  execution_id: string,
  requested_at: string | null,     // Passed through
  
  phase_52: {
    status: 'NO_REBUILD' | 'FULL_REBUILD' | 'PARTIAL_REBUILD',
    reason: string,                // Machine-readable reason code
    
    actions: [
      {
        action_type: string,       // 'REBUILD_REQUEST' | 'REBUILD_FIELDS' | 'NONE'
        target: string,            // 'CONNECTOR_REQUEST' | 'FIELDS' | 'NONE'
        parameters: {
          fields?: string[],       // For PARTIAL_REBUILD
          constraints?: object     // Optional policy constraints
        },
        invariants: {
          preserve_execution_id: boolean,
          preserve_connector_contract: boolean
        }
      }
    ],
    
    meta: {
      feature_flag_enabled: boolean,
      stop_reason: string,         // 'FEATURE_DISABLED' | 'NO_REBUILD_REQUIRED' | etc.
      rebuild_policy_version: string
    },
    
    snapshot: {
      decision_inputs: object,     // Summarized inputs
      policy_rule_id: string | null,
      final_status: string,
      actions_summary: string
    }
  }
}
```

**Requirements:**
- Entire payload JSON serializable
- No new connector status enums
- Deterministic snapshot for identical inputs

---

## Behavior

### Decision Model

#### 1. Feature Flag Disabled
When `FF_POLICY_AWARE_REBUILD_LOOP !== 'true'`:
- `status`: `NO_REBUILD`
- `meta.feature_flag_enabled`: `false`
- `meta.stop_reason`: `FEATURE_DISABLED`
- `actions`: `[]`

#### 2. Phase 51 SUCCESS
When Phase 51 indicates clean success:
- `status`: `NO_REBUILD`
- `meta.stop_reason`: `NO_REBUILD_REQUIRED`
- `actions`: `[]`

#### 3. Phase 51 PARTIAL_SUCCESS
Consult policy resolver:
```javascript
const decision = policyResolver.resolve({
  execution_id,
  policy_ruleset_id,
  phase_51_status,
  phase_51_stop_reason,
  connector_response_shape,
  tenant,
  workspace_id,
  brand_id
});
```

Policy resolver returns:
```javascript
{
  decision: 'NO_REBUILD' | 'FULL_REBUILD' | 'PARTIAL_REBUILD',
  reason: string,
  details: object,
  policy_version: string
}
```

#### 4. Phase 51 HARD_FAIL
Default: `FULL_REBUILD` unless policy explicitly forbids rebuild for the failure class.

Policy can override to `NO_REBUILD` or `PARTIAL_REBUILD` in specific scenarios.

### Determinism Guarantee
- No randomization
- No new timestamps (only pass through `requested_at`)
- Identical inputs → identical outputs

---

## Policy Integration

### Policy Resolver Interface

```javascript
{
  resolve(input) {
    // Returns:
    // {
    //   decision: 'NO_REBUILD' | 'FULL_REBUILD' | 'PARTIAL_REBUILD',
    //   reason: string,
    //   details: {...},
    //   policy_version: string
    // }
  }
}
```

### Default Policy Resolver
Implements deterministic, in-memory rules:
- Clean success → `NO_REBUILD`
- Partial success with recoverable conditions → `PARTIAL_REBUILD`
- Hard fail with recoverable patterns → `FULL_REBUILD`
- Policy-forbidden cases → `NO_REBUILD` with `POLICY_FORBIDS_REBUILD`

**No external IO**. Purely deterministic.

Replaceable via `_internal.setPolicyResolver(customResolver)` for testing.

---

## Invariants

Phase 52 enforces:
- **Never mutate** Phase 50/51 envelopes
- **Never invent** new connector statuses
- **All decisions** from policy rules, not ad hoc logic
- **Snapshot-safe** outputs (same inputs → same snapshot)
- **No IO** except observability

---

## Observability

- **Structured Log**: Per execution with `execution_id`, `phase_51.status`, `phase_52.status`, `policy_ruleset_id`
- **Trace Span**: `phase_52_policy_rebuild_loop`
- **Metrics**:
  - `phase_52_rebuild_invoked`
  - `phase_52_rebuild_full`
  - `phase_52_rebuild_partial`
  - `phase_52_rebuild_none`
  - `phase_52_rebuild_error`

---

## Error Handling

All validation failures return structured error output:
```javascript
{
  ok: false,
  code: 'INVALID_INPUT',
  message: 'Descriptive error',
  execution_id,
  requested_at,
  phase_52: {
    status: 'NO_REBUILD',
    reason: 'VALIDATION_ERROR',
    actions: [],
    meta: {...},
    snapshot: {...}
  }
}
```

**No uncaught exceptions.**
