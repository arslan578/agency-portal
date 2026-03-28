# Phase 53: Connector Escalation Logic Engine Specification

**Input Contract:** `connector_escalation_input_v1`  
**Output Contract:** `connector_escalation_plan_v1`  
**Feature Flag:** `FF_CONNECTOR_ESCALATION_ENGINE`  
**IO:** No (Pure planning engine)  
**Mode:** LIVE and REPLAY

---

## Purpose

Phase 53 implements the **Connector Escalation Logic Engine**, the third autonomous recovery layer. It receives Phase 51 retry outcomes, Phase 52 rebuild plans, connector capabilities, and policy constraints, then generates deterministic escalation plans. This is a pure planning engine—it does not execute escalations.

Key responsibilities:
- Inspect Phase 51 and Phase 52 outcomes
- Consult connector capabilities and policy constraints
- Generate deterministic escalation strategy
- Produce replay-safe snapshot
- Enforce policy supremacy over all other logic

---

## Input Contract

### ConnectorEscalationInputV1

```javascript
{
  execution_id: string,              // Globally unique, non-empty
  trace_domain: string,              // Non-empty
  connector_key: string,             // Non-empty (e.g., 'tiktok_ads')
  tenant_id: string,                 // Non-empty
  workspace_id: string,              // Non-empty

  phase_51: {
    status: string,                  // 'SUCCESS' | 'RETRY_EXHAUSTED' | 'HARD_FAIL'
    stop_reason: string,             // e.g., 'AUTH_FAILURE', 'TRANSIENT_FAILURE'
    retries_attempted: number
  },

  phase_52: {
    rebuild_type: string,            // 'NO_REBUILD' | 'PARTIAL_REBUILD' | 'FULL_REBUILD'
    rebuild_targets: array | null,   // Deterministic list if applicable
    policy_notes: object | null
  },

  connector_capabilities: {
    fallback_connectors: array,      // Ordered list (deterministically ranked)
    credential_modes: array,         // e.g., ['primary', 'secondary', 'rotating']
    api_versions: array,             // e.g., ['v12', 'v13']
    sandbox_supported: boolean
  },

  policy_constraints: {
    allow_fallback: boolean,
    allow_credential_rotation: boolean,
    allow_api_upgrade: boolean,
    allow_sandbox_retry: boolean,
    allow_composite_strategies: boolean,
    escalation_hard_stops: array    // e.g., ['AUTH_HARD_FAIL']
  }
}
```

**Forbidden Fields:**
- Any fields not listed above
- Missing or unknown fields cause deterministic validation failures

---

## Output Contract

### ConnectorEscalationPlanV1

```javascript
{
  execution_id: string,
  trace_domain: string,
  connector_key: string,

  escalation_plan: {
    strategy: string,                // One of 7 canonical strategies
    details: object | null,          // Strategy-specific details
    snapshot: object                 // Deterministic, replay-safe
  },

  status: string,                    // 'SUCCESS' | 'HARD_STOP' | 'ERROR'
  status_code: string                // 'OK' | 'POLICY_BLOCKED' | 'INVALID_INPUT' | 'FEATURE_DISABLED'
}
```

---

## Escalation Strategies

Phase 53 outputs exactly one of these seven strategies:

### 1. NO_ESCALATION
No escalation needed or possible.
- **When**: Clean success or no viable escalation paths
- **Details**: `null`

### 2. FALLBACK_CONNECTOR
Switch to a backup connector.
- **When**: Policy allows fallback, capabilities exist, primary connector failed
- **Details**: `{ target_connector: string, reason: string }`

### 3. CREDENTIAL_ROTATION
Rotate to alternate credentials.
- **When**: Policy allows rotation, credential modes exist, auth-related failure
- **Details**: `{ credential_mode: string, reason: string }`

### 4. API_VERSION_UPGRADE
Upgrade to newer API version.
- **When**: Policy allows upgrade, newer versions exist, version-related issue
- **Details**: `{ target_version: string, reason: string }`

### 5. SANDBOX_RETRY
Retry in sandbox/test mode.
- **When**: Policy allows sandbox, connector supports it, safe to test
- **Details**: `{ sandbox_mode: boolean, reason: string }`

### 6. COMPOSITE
Combination of strategies.
- **When**: Policy allows composite, multiple strategies needed
- **Details**: `{ strategies: array, order: array, reason: string }`

### 7. HARD_STOP
Policy blocks all escalation.
- **When**: `phase_51.stop_reason` in `policy_constraints.escalation_hard_stops`
- **Details**: `{ blocked_reason: string, policy_rule: string }`

---

## Decision Model

### Strict Precedence

1. **Policy Hard Stops Override Everything**
   - If `phase_51.stop_reason` ∈ `policy_constraints.escalation_hard_stops`
   - Return: `strategy: 'HARD_STOP'`, `status: 'HARD_STOP'`, `status_code: 'POLICY_BLOCKED'`
   - This is absolute—overrides capabilities and rebuild type

2. **Feature Flag Disabled**
   - If `FF_CONNECTOR_ESCALATION_ENGINE !== 'true'`
   - Return bypass envelope (see below)

3. **Based on Phase 52 Rebuild Type**

#### NO_REBUILD
Escalation allowed only with viable paths and policy permissions.

**Priority ordering (strict):**
1. Credential rotation (if `allow_credential_rotation` and modes exist)
2. Fallback connector (if `allow_fallback` and fallbacks exist)
3. API upgrade (if `allow_api_upgrade` and versions exist)
4. Sandbox retry (if `allow_sandbox_retry` and supported)

#### PARTIAL_REBUILD
Limited escalation options:
- Credential rotation: only if policy permits
- Fallback: only if policy permits partial fallback
- API upgrade: only if Phase 51 indicates version issues
- Sandbox: only if supported AND policy allows
- Composite: only if `allow_composite_strategies === true`

#### FULL_REBUILD
All escalation pathways eligible except policy-forbidden.

**Priority ordering:**
1. Fallback connector
2. Credential rotation
3. API upgrade
4. Sandbox retry
5. Composite (only if allowed)

---

## Snapshot Structure

Exact schema required for `escalation_plan.snapshot`:

```javascript
{
  execution_id: string,
  connector_key: string,
  rebuild_type: string,
  phase_51_stop_reason: string,
  chosen_strategy: string,
  ordered_capabilities: {
    fallback_connectors: string[],
    credential_modes: string[],
    api_versions: string[]
  },
  policy_flags: {
    allow_fallback: boolean,
    allow_credential_rotation: boolean,
    allow_api_upgrade: boolean,
    allow_sandbox_retry: boolean,
    allow_composite_strategies: boolean
  }
}
```

This ensures Phase 54 can deterministically replay the entire escalation chain.

---

## Feature Flag Behavior

When `FF_CONNECTOR_ESCALATION_ENGINE !== 'true'`:

```javascript
{
  execution_id,
  trace_domain,
  connector_key,
  status: 'SUCCESS',
  status_code: 'FEATURE_DISABLED',
  escalation_plan: {
    strategy: 'NO_ESCALATION',
    details: null,
    snapshot: {
      feature_enabled: false
    }
  }
}
```

No downstream phases should attempt escalation when disabled.

---

## Error Cases

### Validation Failures

Return for:
- Missing required fields
- Malformed capability arrays
- Empty escalation decision space when required
- Contradictory policy/rebuild constraints

**Error Envelope:**
```javascript
{
  execution_id,
  trace_domain,
  connector_key,
  status: 'ERROR',
  status_code: 'INVALID_INPUT',
  escalation_plan: null,
  error_message: string
}
```

---

## Formal Invariants

### 1. Policy Supremacy
**Policy rules override all other logic.**
- If `allow_fallback === false`, NEVER produce `FALLBACK_CONNECTOR`
- If `escalation_hard_stops` contains `phase_51.stop_reason`, ONLY return `HARD_STOP`

### 2. No Hardcoded Rules
**All rules from envelope inputs only.**
- No `require()` of static policy files
- No hardcoded capability mappings
- No embedded business logic outside inputs

### 3. Determinism
**Same inputs → same output.**
- No randomization
- No timestamps (use `execution_id` for identity)
- Stable capability sorting

### 4. No IO
**Zero network calls or file reads.**
- All data from envelope
- Pure function execution

### 5. Capability Ranking
**Deterministic ordering.**
- Preserve input order OR
- Stable lexicographic sort
- Document chosen rule in code

---

## Observability

### Trace Span
- Name: `connector_escalation_engine_v1`
- Attributes: `execution_id`, `connector_key`, `strategy`

### Structured Log
Per execution, include:
- `execution_id`
- `trace_domain`
- `connector_key`
- `chosen_strategy`
- `status`
- `status_code`

### Metrics
- `escalation_invoked` (counter)
- `strategy_chosen` (counter per strategy)
- `policy_blocked` (counter)

---

## Examples

### Example 1: Clean Success
**Input:**
```javascript
{
  phase_51: { status: 'SUCCESS', stop_reason: 'SUCCESS' },
  phase_52: { rebuild_type: 'NO_REBUILD' },
  policy_constraints: { allow_fallback: true }
}
```
**Output:**
```javascript
{
  status: 'SUCCESS',
  status_code: 'OK',
  escalation_plan: { strategy: 'NO_ESCALATION' }
}
```

### Example 2: Policy Hard Stop
**Input:**
```javascript
{
  phase_51: { stop_reason: 'AUTH_HARD_FAIL' },
  policy_constraints: { escalation_hard_stops: ['AUTH_HARD_FAIL'] }
}
```
**Output:**
```javascript
{
  status: 'HARD_STOP',
  status_code: 'POLICY_BLOCKED',
  escalation_plan: { strategy: 'HARD_STOP' }
}
```

### Example 3: Fallback Connector
**Input:**
```javascript
{
  phase_51: { status: 'HARD_FAIL' },
  phase_52: { rebuild_type: 'FULL_REBUILD' },
  connector_capabilities: { fallback_connectors: ['backup_connector'] },
  policy_constraints: { allow_fallback: true }
}
```
**Output:**
```javascript
{
  status: 'SUCCESS',
  status_code: 'OK',
  escalation_plan: {
    strategy: 'FALLBACK_CONNECTOR',
    details: { target_connector: 'backup_connector' }
  }
}
```

## 13. Backplane Integration

*   Phase 53 reads `routing_flags` from `connector_backplane_v1.routing_flags`.
*   It interprets error families from `connector_backplane_v1.error_surface`.
*   It may consult `capabilities.retry_feasibility` and `capabilities.can_batch` from `connector_backplane_v1.capabilities` when planning escalation.
