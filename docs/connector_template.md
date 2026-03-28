# 🔒 Kaivo Connector Template — Canonical OS Specification

**Permanent Standard for All Kaivo Platform Connectors**

**Version**: `connector_v1` · **Status**: Constitutional

---

## 🔐 0. Connector Guarantees (Non-Negotiable, Constitutional)

Every Kaivo connector must uphold these **permanent architectural guarantees**:

### 1. Determinism
Identical input produces identical output, byte-for-byte, across all modes.

### 2. Envelope Immutability
Input envelopes are never mutated. All returns are additive overlays.

### 3. Replay Fidelity
Replay mode must reproduce request structures with zero drift. Comparison uses strict `stableStringify` equality.

### 4. Multi-Tenant Isolation
All connector IO must respect `execution_id` and `trace_domain_key`. No connector may perform actions without these identifiers.

### 5. No Inference or Guessing
The connector must not make assumptions beyond explicit contract input or explicit platform responses.

### 6. Mode Purity
- **DRY_RUN**: No IO
- **RECORD_ONLY**: No IO
- **LIVE_SEND**: IO allowed

Under no circumstances may DRY_RUN or RECORD_ONLY call external APIs.

### 7. Idempotent Shape
All connectors return the same envelope shape every time, regardless of platform.

### 8. Execution Boundary Purity
A connector may never perform business logic, optimization, routing, scoring, prioritization, or internal Kaivo logic. **Connectors do IO. Nothing else.**

**These guarantees are permanent and cannot be modified without a new contract version.**

---

## 🚫 1. Red-Flag Anti-Patterns (Forbidden Forever)

To prevent drift, the following behaviors are **never allowed**:

- ❌ Mutating the envelope or any nested object inside it
- ❌ Inferring defaults from platform responses
- ❌ Performing IO when `mode ≠ LIVE_SEND`
- ❌ Reordering payloads
- ❌ Silent error swallowing
- ❌ Building platform requests with implicit behavior
- ❌ Introducing randomness anywhere
- ❌ Using platform response structure to alter request shape
- ❌ Adding connector-specific logic outside the client layer
- ❌ Allowing "best effort replay" — replay must be exact or fail
- ❌ Rejecting replay mismatches softly — replay mismatch must halt execution and return an error

**If any connector requires one of these anti-patterns, it must version-bump and go through the exception process.**

---

## 🗂 2. Versioning Rules (Permanent Governance)

**This section governs all Kaivo connectors permanently. It cannot be edited without a governance RFC and contract version bump.**

### ⭐ Canonical Rule

**Any future connector that deviates from Phase 45 must version-bump its `connector_v1` contract.**

### A version bump is required when:

- Changing any required input field
- Adding or modifying validation rules
- Altering the status derivation logic
- Modifying the `connector_result` structure
- Changing replay alignment rules
- Altering mapping logic semantics
- Changing error mapping behavior
- Adding platform-specific behavior outside the client
- Changing the semantics of any connector mode
- Introducing new required fields in payloads
- Changing the per-request output schema
- Changing client-side request schema in any non-backward-compatible way

### Version Family

Connectors must remain backward compatible unless explicitly versioned:

- `connector_v1` (current — Phase 45 pattern)
- `connector_v2` (future deviation)
- `connector_v3` (major architectural change)

**Phase 45 is therefore an immutable reference for the v1 family.**

---

## 📦 3. Required Input Envelope Shape

All connectors must accept:

```json
{
  "execution_id": "string (required, non-empty)",
  "trace_domain": {
    "trace_domain_key": "string (required when feature flag is ON)"
  },
  "connector_request": {
    "connector_key": "PLATFORM_NAME",
    "mode": "DRY_RUN | RECORD_ONLY | LIVE_SEND",
    "account": {
      "account_id": "string (required, non-empty)",
      "...": "platform-specific optional fields"
    },
    "payloads": [
      {
        "entity_type": "string (whitelisted)",
        "operation": "string (whitelisted)",
        "data": {}
      }
    ]
  },
  "replay_snapshot": {
    "raw_requests": []
  }
}
```

### Validation Rules (when feature flag ON)

- `envelope` must be non-null object
- `execution_id` must be non-empty string
- `trace_domain.trace_domain_key` must be non-empty string
- `connector_request.connector_key` must match expected platform
- `connector_request.mode` must be one of: `DRY_RUN`, `RECORD_ONLY`, `LIVE_SEND`
- `connector_request.account` must contain required platform credentials
- `payloads` treated as empty array if missing/invalid

### Envelope Contract Must Be Fully Reproducible

Every field accepted by a connector must be reproducible verbatim in replay. **No ephemeral fields. No timestamps. No auto-generating IDs.**

### Validation Return on Error

```json
{
  "ok": false,
  "code": "INVALID_CONNECTOR_INPUT",
  "message": "Descriptive error message",
  "envelope": { "execution_id": "..." }
}
```

---

## 🏁 4. Feature Flag Behavior (Governed)

Every connector must have a feature flag: `FF_{PLATFORM}_CONNECTOR_IO`

### Feature Flag OFF

- **Zero validation except shape** - Not even entity_type or operation validation is allowed when FF is off
- **No IO** - never call external client
- **Return safe NOOP**:

```json
{
  ...safeEnvelope,
  "connector_result": {
    "status": "NOOP_FEATURE_FLAG_OFF",
    "requests": [],
    "summary_metrics": {
      "success_count": 0,
      "failure_count": 0
    },
    "observability": {
      "log_event_id": "log-{executionId}-phase-{N}",
      "trace_span_id": "span-{executionId}-phase-{N}"
    }
  }
}
```

- **Emit skip event**:

```json
{
  "event_type": "{PLATFORM}_CONNECTOR_SKIPPED",
  "execution_id": "...",
  "trace_domain_key": "... or null",
  "reason": "Feature flag off"
}
```

### Feature Flag ON

- **Strict validation** - enforce all input requirements
- **Entity type and operation whitelists** - reject unknown values
- **Replay alignment** - validate against snapshot if present
- **Mode-aware execution** - DRY_RUN/RECORD_ONLY/LIVE_SEND

---

## 🧩 5. connector_result Schema (Frozen Public Surface)

**This section is FROZEN. No changes allowed without `connector_vX` bump.**

All connectors must return:

```json
{
  ...originalEnvelope,
  "connector_result": {
    "status": "DRY_RUN_OK | RECORDED_NO_IO | SUCCESS | FAILED | PARTIAL_SUCCESS | NOOP_FEATURE_FLAG_OFF",
    "requests": [
      {
        "request_id": "req-{executionId}-{index}",
        "raw_request": {},
        "raw_response": null,
        "normalized_response": {
          "entity_type": "string",
          "entity_id": "string or null",
          "resource_name": "string or null",
          "status": "string",
          "metrics": {}
        },
        "error": {
          "code": "string",
          "original_code": "string",
          "message": "string",
          "retryable": "boolean"
        }
      }
    ],
    "summary_metrics": {
      "success_count": 0,
      "failure_count": 0
    },
    "observability": {
      "log_event_id": "string",
      "trace_span_id": "string"
    }
  }
}
```

### Status Values (Frozen)

| Status | Meaning |
|--------|---------|
| `NOOP_FEATURE_FLAG_OFF` | Feature flag disabled, no validation or IO |
| `DRY_RUN_OK` | Mode=DRY_RUN, requests built successfully |
| `RECORDED_NO_IO` | Mode=RECORD_ONLY, requests logged without IO |
| `SUCCESS` | Mode=LIVE_SEND, all requests succeeded |
| `FAILED` | Mode=LIVE_SEND, all requests failed |
| `PARTIAL_SUCCESS` | Mode=LIVE_SEND, mixed success/failure |

### Frozen Subkeys

You must not add, remove, or rename keys in:
- `normalized_response`
- `error`
- `summary_metrics`
- `observability`

These are part of the public surface.

### Status Derivation Logic

```javascript
let baseStatus;
if (failureCount === 0) {
  baseStatus = mode === 'LIVE_SEND' ? 'SUCCESS' : 'DRY_RUN_OK';
} else if (successCount === 0) {
  baseStatus = 'FAILED';
} else {
  baseStatus = 'PARTIAL_SUCCESS';
}

const finalStatus = 
  mode === 'DRY_RUN' ? 'DRY_RUN_OK' :
  mode === 'RECORD_ONLY' ? 'RECORDED_NO_IO' :
  baseStatus;
```

---

## 🔍 6. Replay Alignment Requirements (Governed)

**Replay is no longer optional — it is a required safety gate.**

### Requirements

- Must use `stableStringify`
- Must compare full list equivalence
- Must fail fast with `INVALID_CONNECTOR_INPUT`
- Must reject partial matches or subset matches
- Must not reorder arrays
- **Replay is evaluated before IO** - A connector may never send any IO before validating replay alignment
- **Replay is all-or-nothing** - If any element fails, the entire connector fails

**Replay alignment is the difference between an orchestrator and a firehose.**

### Stable Stringify

```javascript
function stableStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {});
    }
    return value;
  });
}
```

### Replay Validation

```javascript
if (replay_snapshot && Array.isArray(replay_snapshot.raw_requests)) {
  const currentJson = stableStringify(rawRequests);
  const snapshotJson = stableStringify(replay_snapshot.raw_requests);
  
  if (currentJson !== snapshotJson) {
    return createErrorEnvelope(
      'INVALID_CONNECTOR_INPUT',
      'Replay snapshot raw_requests mismatch',
      executionId
    );
  }
}
```

---

## 🧪 7. Determinism Requirements (Explicit)

All connectors must ensure determinism across:

- `raw_request` construction
- Field-mapping order
- Error mapping
- `normalized_response` content
- `connector_result.status` derivation
- Observability event shape
- `duration_ms` calculation
- Mode behavior

### Allowed Sources of Truth

Connectors must rely solely on:

- Input envelope
- Static mapping JSON
- Platform responses (**LIVE_SEND only** - this is the only allowed entropy source)

**No other source of entropy allowed.**

---

## 📤 8. Per-Request Schema

Each entry in `connector_result.requests[]`:

```json
{
  "request_id": "req-{executionId}-{index}",
  "raw_request": {
    "...": "platform-specific request body"
  },
  "raw_response": null,
  "normalized_response": {
    "entity_type": "CAMPAIGN | AD_GROUP | AD | ...",
    "entity_id": "extracted from platform response",
    "resource_name": "platform resource identifier",
    "status": "NOT_SENT | ENABLED | PAUSED | ...",
    "metrics": {}
  },
  "error": {
    "code": "AUTH_FAILURE | TRANSIENT_ERROR | RATE_LIMIT_EXCEEDED | ...",
    "original_code": "platform error code",
    "message": "error message",
    "retryable": true
  }
}
```

### Mode-Specific Behavior

| Mode | raw_response | normalized_response.status | error |
|------|-------------|---------------------------|-------|
| DRY_RUN | `null` | `NOT_SENT` | `null` (unless validation fails) |
| RECORD_ONLY | `null` | `NOT_SENT` | `null` (unless validation fails) |
| LIVE_SEND | Full API response | Platform status | `null` or error object |

---

## ⏱ 9. Duration Measurement

All connectors must measure **IO-only time**:

```javascript
let ioStart = 0;
let ioEnd = 0;

for (let index = 0; index < normalizedPayloads.length; index++) {
  if (mode === 'LIVE_SEND') {
    ioStart = Date.now();
    const response = await client.send(...);
    ioEnd += (Date.now() - ioStart);
  }
}

const durationMs = ioEnd; // 0 for DRY_RUN/RECORD_ONLY
```

---

## ⚠️ 10. Error Mapping (Governed)

**Error mapping must be:**

- 1-to-1 deterministic rewrite
- Using JSON-driven mapping
- With retryable logic driven solely by static config

**If a platform introduces new errors, the connector must update the JSON — not the connector code.**

### Error Mapping Function

```javascript
function mapError(error) {
  const rawCode = error && error.code ? error.code : 'INTERNAL_ERROR';
  const mappedCode = errorMappings.mappings[rawCode] || 'TRANSIENT_ERROR';
  const retryable = Array.isArray(errorMappings.retryable_codes)
    ? errorMappings.retryable_codes.includes(rawCode)
    : false;

  return {
    code: mappedCode,
    original_code: rawCode,
    message: error && error.message ? error.message : '',
    retryable
  };
}
```

### Standard Error Codes

| Normalized Code | Meaning | Retryable |
|----------------|---------|-----------|
| `AUTH_FAILURE` | Authentication/authorization error | No |
| `TRANSIENT_ERROR` | Temporary platform issue | Yes |
| `RATE_LIMIT_EXCEEDED` | Rate limit hit | Yes |
| `INVALID_REQUEST` | Malformed request | No |
| `POLICY_VIOLATION` | Platform policy rejection | No |

---

## 🔲 11. Boundaries of the Connector Client

To prevent future drift:

### Connector Engine Rules

- Pure logic only
- No platform-specific branching
- No SDK calls outside the client
- No retries inside connector (retryable flag is metadata only)

### Client Rules

The client is the **only** place where:

- Platform SDK calls live
- Request translation to platform schema happens
- Platform errors originate
- Authentication/headers/configuration is managed

### Connector Rule

**The connector never shapes platform requests — it only consumes the already-shaped payload produced by the request builder and mapping layer.**

### Client Isolation Rule

The connector engine may not:
- Load SDKs
- Generate headers
- Generate platform IDs
- Interpret platform errors beyond mapping

This boundary ensures every platform connector follows an identical structure.

---

## 🛰 12. Observability Events (Frozen)

Event names and shapes are **frozen** across all connectors:

### CONNECTOR_EXECUTED Event

Emit once per connector run:

```json
{
  "event_type": "{PLATFORM}_CONNECTOR_EXECUTED",
  "execution_id": "...",
  "trace_domain_key": "...",
  "mode": "DRY_RUN | RECORD_ONLY | LIVE_SEND",
  "request_count": 0,
  "success_count": 0,
  "failure_count": 0,
  "duration_ms": 0,
  "trace_span": "phase_{N}_{platform}_connector_io"
}
```

### CONNECTOR_RECORDED Event (RECORD_ONLY only)

```json
{
  "event_type": "{PLATFORM}_CONNECTOR_RECORDED",
  "execution_id": "...",
  "trace_domain_key": "...",
  "request_count": 0
}
```

### CONNECTOR_SKIPPED Event (Feature flag OFF)

```json
{
  "event_type": "{PLATFORM}_CONNECTOR_SKIPPED",
  "execution_id": "...",
  "trace_domain_key": "... or null",
  "reason": "Feature flag off"
}
```

**These names must not change without versioning.**

### Timestamps Forbidden

**Timestamps are forbidden in connector logs.** Logging must not introduce entropy, because logs are part of replay.

---

## 🧪 13. Test Matrix Enforcement

**The 28-test matrix is now mandated at governance level.**

Every connector PR must include tests labeled:

- **Happy 1–6**
- **Negative 1–8**
- **Edge 1–4**
- **Guard 1–2**
- **Connector 1–8**

### Happy Path (6)
1. DRY_RUN with single entity
2. DRY_RUN with mixed payloads
3. LIVE_SEND success
4. RECORD_ONLY mode
5. Replay alignment (no snapshot)
6. LIVE_SEND with metrics extraction

### Negative (8)
1. Null envelope
2. Missing execution_id
3. Missing connector_request
4. Unsupported connector_key
5. Invalid mode
6. Invalid account credentials
7. Invalid entity_type
8. Invalid operation

### Edge (4)
1. Empty payloads array
2. Unmapped fields ignored
3. Large payload batch
4. Mixed success/failure (PARTIAL_SUCCESS)

### Guards (2)
1. Regression: golden raw_request snapshot
2. Determinism: identical input → identical output

### Connector-Specific (8)
1. Error mapping for transient error
2. Retryable flag true for transient
3. Policy error mapping non-retryable
4. Connector-level FAILED status
5. Trace domain validation
6. Feature flag OFF path
7. Non-mutation of input envelope
8. Replay snapshot mismatch

**The harness must reject merges that do not match required naming, count, and structure.**

### Test Determinism Requirement

**All tests must run in strict deterministic mode.** No randomized mocks, no async race assumptions, no timing tests outside IO.

---

## 🔧 14. Field Mapping Pattern (Governed)

All connectors should use external JSON mapping files:

### Field Mappings JSON
```json
{
  "mappings": {
    "ENTITY_TYPE": {
      "kaivo_field": "platform.field",
      "nested_field": "platform.nested.path"
    }
  }
}
```

### Mapping Requirements

The mapping JSON is required to:

- Never infer missing fields
- Never rename fields internally
- Never emit dynamic keys
- Only transform flat → nested via dot-path notation
- **Must fail loudly** if field mappings reference an invalid dot-path (e.g., missing intermediate nodes)

**Strictness prevents connector divergence.**

### Mapping Function
```javascript
function mapFields(entityType, data) {
  const mapping = fieldMappings.mappings[entityType];
  if (!mapping) return data || {};

  const result = {};
  const safeData = data || {};

  for (const [kaivoField, platformField] of Object.entries(mapping)) {
    if (safeData[kaivoField] !== undefined) {
      // Handle dot-path nesting
      const parts = platformField.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = safeData[kaivoField];
    }
  }

  return result;
}
```

---

## 🔌 15. Client Interface Pattern

All connectors must use this client interface:

```javascript
// Constructor
new PlatformClient({
  accountId: 'string',
  accessToken: 'string',
  // ... platform-specific config
});

// Send method
async send({
  account_id: 'string',
  payloads: [
    { entity_type, operation, data }
  ]
}) {
  return {
    results: [
      { resource_name, status, metrics }
    ]
  };
}
```

---

## 🔒 16. Public Surface (Frozen)

The following are **contract stable** and should not change without versioning:

### Error Codes
- `INVALID_CONNECTOR_INPUT`

### Error Envelope Shape
```json
{
  "ok": false,
  "code": "string",
  "message": "string",
  "envelope": { "execution_id": "string" }
}
```

### Status Enum (Frozen)
- `NOOP_FEATURE_FLAG_OFF`
- `DRY_RUN_OK`
- `RECORDED_NO_IO`
- `SUCCESS`
- `FAILED`
- `PARTIAL_SUCCESS`

### Per-Request Keys (Frozen)
- `request_id`
- `raw_request`
- `raw_response`
- `normalized_response`
- `error`

### Timing Semantics (Frozen)
- `duration_ms = 0` for DRY_RUN/RECORD_ONLY
- `duration_ms = accumulated IO time` for LIVE_SEND

---

## 🔺 Constitutional Clause: Connector v1 Family

**Phase 45 is the canonical, immutable, contract-driven template for all connectors inside Kaivo.**

The architecture, semantics, error model, replay system, and envelope shapes defined herein form the **permanent boundary layer of the Kaivo OS**.

No connector may alter any governed behavior, shape, or semantics without:

1. **Formal RFC submission**
2. **Explicit governance approval**
3. **A connector contract version bump** (`connector_vX`)
4. **Updated canonical template documentation**
5. **Updated full test matrix**
6. **Replay compatibility notes**

**Phase 45 is no longer an implementation. It is the constitutional law of the Kaivo multi-tenant execution fabric.**
