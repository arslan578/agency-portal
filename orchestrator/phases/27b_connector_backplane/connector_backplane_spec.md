# Phase 27B — Connector Backplane Specification Layer

## 1. Purpose

Phase 27B creates the universal, versioned, deterministic connector contract that governs every connector in Kaivo OS.

This includes the definitive schemas for:
*   connector request surface
*   connector response surface
*   error surfaces
*   capability exposure
*   routing flags
*   policy-binding sites
*   reconciliation and snapshot metadata
*   readiness rules

27B is the substrate required by Phases 53–57 and 58–60. It is the authoritative schema referenced by the entire OS.

No connector may load, execute, or be included in planning unless it conforms to this backplane.

## 2. Contracts

Phase 27B produces a deterministic object:

```javascript
connector_backplane_v1: {
  request_contract: {...},
  response_contract: {...},
  capabilities: {...},
  error_surface: {...},
  routing_flags: {...},
  metadata_fields: {...},
  readiness_rules: {...},
  reconciliation_shape: {...},
  snapshot_shape: {...},
  policy_bindings: {...}
}
```

This object is stored in `modules/connector_backplane/connector_backplane_spec.js`.

No dynamic fields. No inference. No connector-specific exceptions.

### 2.1 request_contract

`request_contract_v1` must define:
*   **required fields:**
    *   `connector_key`: `{ type: 'string', required: true }`
    *   `request_id`: `{ type: 'string', required: true }`
    *   `execution_context`: `{ type: 'object', required: true }`
    *   `account`: `{ type: 'object', required: true }`
    *   `campaign`: `{ type: 'object', required: true }`
    *   `adsets`: `{ type: 'array', items: 'object', required: true }`
    *   `creatives`: `{ type: 'array', items: 'object', required: true }`
    *   `budget`: `{ type: 'object', required: true }`
*   **forbidden fields:**
    *   any connector-specific extension not declared in this layer
*   **type constraints:**
    *   every field explicitly typed and versioned

### 2.2 response_contract

`response_contract_v1` defines the only allowed success and error shapes.

**Success shape:**

```javascript
{
  status: 'SUCCESS',
  status_code: 'OK',
  response_body: { type: 'object', required: true },
  latency_ms: { type: 'number', required: true },
  connector_metadata: { type: 'object', required: true },
  origin_timestamp: { type: 'string', format: 'iso8601', required: true },
  request_classification: { type: 'string', required: true },
  dry_run: { type: 'boolean', required: false }
}
```

**Failure shape:**

```javascript
{
  status: 'FAILURE',
  status_code: <ERROR_CODE>,
  error_message: { type: 'string', required: true },
  latency_ms: { type: 'number', required: true },
  connector_metadata: { type: 'object', required: true },
  origin_timestamp: { type: 'string', format: 'iso8601', required: true },
  request_classification: { type: 'string', required: true },
  dry_run: { type: 'boolean', required: false }
}
```

### 2.3 error_surface

Must include the complete canonical error families:

*   `AUTH_ERROR`
*   `INVALID_REQUEST`
*   `POLICY_FORBIDDEN`
*   `CAPABILITY_CONFLICT`
*   `UNSUPPORTED_OPERATION`
*   `RATE_LIMIT`
*   `PLATFORM_INTERNAL`
*   `NETWORK_FAILURE`
*   `TIMEOUT`
*   `UNKNOWN`

No connector may define new codes.
No code may be omitted.

### 2.4 capabilities

Capabilities must include:
*   `min_budget`: `{ type: 'number', min: 0, required: true }`
*   `max_budget`: `{ type: 'number', min: 0, required: true }`
*   `supported_objectives`: `{ type: 'array', items: 'string', required: true }`
*   `supported_regions`: `{ type: 'array', items: 'string', required: true }`
*   `optimization_goals`: `{ type: 'array', items: 'string', required: true }`
*   `retry_feasibility`: `{ type: 'boolean', required: true }`
*   `can_batch`: `{ type: 'boolean', required: true }`

All capability shapes must match Phase 34.

### 2.5 routing_flags

All connectors must expose deterministic routing flags:

*   `SAFE_TO_RETRY`: `{ type: 'string', required: true }`
*   `SKIP_RETRY`: `{ type: 'string', required: true }`
*   `HARD_STOP`: `{ type: 'string', required: true }`
*   `REQUIRES_ESCALATION`: `{ type: 'string', required: true }`
*   `SANDBOX_ONLY`: `{ type: 'string', required: true }`

No additional flags allowed.

### 2.6 metadata_fields

Connector metadata must contain:

*   `campaign_id`: `{ type: 'string', required: true }`
*   `adset_id`: `{ type: 'string', required: true }`
*   `creative_id`: `{ type: 'string', required: true }`
*   `connector_key`: `{ type: 'string', required: true }`
*   `version`: `{ type: 'string', required: true }`
*   `lineage_token`: `{ type: 'string', required: true }`

These are used by Phases 55–57.

### 2.7 readiness_rules

Map directly into Readiness (Phase 17):

*   `requires_account_link`: `{ type: 'boolean', required: true }`
*   `requires_policy_check`: `{ type: 'boolean', required: true }`
*   `requires_capability_lookup`: `{ type: 'boolean', required: true }`
*   `connector_disabled`: `{ type: 'boolean', required: true }`

### 2.8 reconciliation_shape

The subset of fields required by Phase 56 state reconciliation:

```javascript
{
  connector_key: { type: 'string', required: true },
  execution_status: { type: 'string', required: true },
  last_success_timestamp: { type: 'string', format: 'iso8601', required: true },
  last_failure_timestamp: { type: 'string', format: 'iso8601', required: true },
  error_code: { type: 'string', required: true },
  drift_flag: { type: 'boolean', required: true },
  capabilities_hash: { type: 'string', pattern: '/^[a-f0-9]{64}$/', required: true }
}
```

### 2.9 snapshot_shape

The surface serialized by Phase 28:

```javascript
{
  connector_key: { type: 'string', required: true },
  request_id: { type: 'string', required: true },
  status_code: { type: 'string', required: true },
  response_body: { type: 'object', required: true },
  error_code: { type: 'string', required: true },
  metadata: { type: 'object', required: true }
}
```

### 2.10 policy_bindings

Explicit mapping sites for Policy Mirror (Phase 32):

```javascript
{
  min_spend_policy_ref: { type: 'string', pattern: '/^policy\\./', required: true },
  forbidden_objectives_policy_ref: { type: 'string', pattern: '/^policy\\./', required: true },
  rate_limit_policy_ref: { type: 'string', pattern: '/^policy\\./', required: true },
  platform_restriction_policy_ref: { type: 'string', pattern: '/^policy\\./', required: true }
}
```

## 3. Behavioral Invariants

Phase 27B must guarantee:

1.  **Deterministic shape enforcement**
    No connector may introduce or remove fields outside the schema.
2.  **No missing error surfaces**
    Every connector must report from the canonical `error_surface`.
3.  **Replay safety**
    Backplane shapes must be replay-safe under Phase 28/29 reconstruction.
4.  **Capability consistency**
    All connectors expose identical schemas for min/max budgets, objectives, regions.
5.  **Cross-connector normalization**
    Metadata, flags, and capabilities must be comparable between connectors.
6.  **Policy bindings must resolve**
    If any policy reference is missing, return `POLICY_MIRROR_RESOLUTION_FAILURE`.

## 4. Failure Modes

Phase 27B may return:

*   `INVALID_BACKPLANE_SPEC`
*   `CAPABILITY_INCONSISTENCY`
*   `POLICY_MIRROR_RESOLUTION_FAILURE`
*   `MISSING_ERROR_SURFACE`
*   `UNSUPPORTED_CONNECTOR_SHAPE`

These failures prevent connector loading.

## 5. Feature Flag

`FF_CONNECTOR_BACKPLANE_SPEC`

Default: `'true'`.

If `'false'`: phase returns pass-through object `{ feature_flag_enabled: false }`.

## 6. Observability Requirements

Must emit:
*   structured log: `connector_backplane_specification_built`
*   metric: `kaivo.connector_backplane_spec.load`
*   trace span: `phase_27b_connector_backplane_spec`

(Required by Forward-Hardening Framework Rules 3 & 9.)

## 7. Backplane Consumers

List explicitly:
*   **Phase 45–50 – Connector engines**
    *   use `request_contract`, `response_contract`, `capabilities`, `routing_flags`, `error_surface`, `metadata_fields`
*   **Phase 53 – Connector Escalation Logic Engine**
    *   consumes `routing_flags`, `error_surface`, `capabilities.retry_feasibility`
*   **Phase 54 – Drift Repair Execution**
    *   consumes `metadata_fields`, `snapshot_shape`, `error_surface`
*   **Phase 55 – Snapshot Error-Code Alignment**
    *   consumes `snapshot_shape`, `error_surface`
*   **Phase 56 – State Reconciliation**
    *   consumes `reconciliation_shape`, `metadata_fields`, `error_surface`
*   **Phase 56B – Connector Profile Harmonizer**
    *   consumes `reconciliation_shape`, `capabilities`, `metadata_fields`
*   **Phase 57 – Global State Merger**
    *   consumes `reconciliation_shape`, `metadata_fields`
*   **Phase 58 – Safety Horizon Evaluator**
    *   consumes `capabilities`, `routing_flags`, `policy_bindings`, `error_surface`
