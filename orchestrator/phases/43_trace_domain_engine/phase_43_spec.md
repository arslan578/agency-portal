# Phase 43: Multi-Tenant Trace Domain Engine - Specification

## 1. Objective

Phase 43: Multi-Tenant Trace Domain Engine is a deterministic, immutable, workspace-scoped isolation layer that produces stable trace domain keys for multi-tenant execution environments.

**Purpose**: Given an orchestrator envelope with tenant metadata, produce a stable trace domain key and attach it without mutating upstream fields. This domain key serves as the universal prefix for all snapshotting, replay, optimization logs, drift diagnostics, and historical trace lookup.

**Position**: Phase 43 becomes the root namespace for all future multi-tenant execution environments (Phases 44-50+).

## 2. Contract Version

**Contract Version**: `trace_domain_v1`

## 3. Feature Flag

**Flag**: `FF_MULTI_TENANT_TRACE_DOMAINS`

**Default**: `false` (disabled)

**Behavior when disabled**:
- Engine returns the envelope unchanged
- No domain computed
- No observability event emitted

**Behavior when enabled**:
- Full Phase 43 logic executes
- Domain key produced and appended
- Observability event emitted

**Rollback**: Trivial (flag off)

## 4. Input Contract (input_contract_v1)

Required envelope fields:

```javascript
{
  execution_id: string,              // Required, non-empty
  tenant: {
    tenant_id: string,               // Required, non-empty
    workspace_id?: string,           // Optional
    brand_id?: string                // Optional
  },
  metadata: {
    requested_at?: string            // Optional ISO timestamp
  }
}

**Note**: `requested_at` is optional and is passed through without validation. If missing or null, the value in `trace_domain.components.requested_at` must be undefined.
```

### Validation Rules

**ID Constraints**:
- All IDs must be non-empty strings
- Missing optional IDs treated as `null`, not `undefined`
- No upstream mutation allowed
- No fallback to random or nondeterministic values

**Forbidden Operations**:
- No hashing
- No UUID generation
- No inference of missing IDs
- No cross-field rewriting

### Error Handling

If fields fail validation, return Phase-native error envelope:

```javascript
{
  ok: false,
  code: "TRACE_DOMAIN_ERROR_<CATEGORY>",
  message: string,
  envelope: { execution_id }
}
```

### Error Categories

- `TRACE_DOMAIN_ERROR_MALFORMED_TENANT_OBJECT`: tenant object missing or invalid
- `TRACE_DOMAIN_ERROR_INVALID_TENANT_ID`: tenant_id missing, empty, or not string
- `TRACE_DOMAIN_ERROR_INVALID_WORKSPACE_ID`: workspace_id present but not string
- `TRACE_DOMAIN_ERROR_INVALID_BRAND_ID`: brand_id present but not string
- `TRACE_DOMAIN_ERROR_MISSING_EXECUTION_ID`: execution_id missing or invalid

**Regression Rule**: All error shapes must remain bit-for-bit stable across releases.

## 5. Output Contract (output_contract_v1)

Adds a single field to the envelope:

```javascript
envelope.trace_domain = {
  version: "trace_domain_v1",
  domain_key: string,                // Deterministic composite key
  components: {
    tenant_id: string,
    workspace_id: string | null,
    brand_id: string | null,
    requested_at: string             // Passthrough
  }
}
```

**No other fields are added, changed, removed, normalized, or reinterpreted.**

### Domain Key Formula (Strict, Immutable)

```javascript
domain_key = `TENANT:${tenant_id}::WS:${workspace_id || "null"}::BRAND:${brand_id || "null"}`
```

**Constraints**:
- Ordering is fixed
- Separators are fixed (`::`  between components, `:` within)
- Null behavior is fixed (literal string `"null"`)
- No alternate forms allowed

## 6. Deterministic Guarantees

Phase 43 guarantees:

1. **Identical Input → Identical Output**: Byte-for-byte determinism
2. **No Mutation**: No mutation of upstream objects
3. **No Reinterpretation**: No cross-field reinterpretation
4. **No Nondeterminism**: No nondeterministic sources
5. **No IO**: Pure computation only
6. **No Timestamp Generation**: No timestamps generated within the engine
7. **Stable Sorting**: Sorting stable and trivial (this phase does not sort)
8. **Replay Identical**: Replay identical under equal snapshots

**This is a "strict math only" phase in the hierarchy.**

## 7. Observability Event

Phase 43 **MUST** emit a single structured event:

```json
{
  "event_type": "TRACE_DOMAIN_COMPUTED",
  "execution_id": "<execution_id>",
  "trace_domain_key": "<domain_key>",
  "tenant_id": "<tenant_id>",
  "workspace_id": "<workspace_id>",
  "brand_id": "<brand_id>",
  "timestamp": "<requested_at>"
}
```

**Fields**:
- `event_type`: Always `"TRACE_DOMAIN_COMPUTED"`
- `execution_id`: From input envelope
- `trace_domain_key`: Computed domain key
- `tenant_id`: From tenant object
- `workspace_id`: From tenant object (null if not present)
- `brand_id`: From tenant object (null if not present)
- `timestamp`: From metadata.requested_at

**No additional fields. No inference.**

## 8. Invariants

1. **Domain key must never be empty**
2. **Domain key must never contain whitespace**
3. **Null placeholders must be literal `"null"` strings**
4. **Field ordering is permanent**
5. **Engine must never modify tenant fields**
6. **Engine must remain pure, side-effect-free, idempotent**
7. **Output must not include any execution plan, snapshot, replay, connector, or optimization logic**

## 9. Processing Logic

### Step 1: Feature Flag Check
If `FF_MULTI_TENANT_TRACE_DOMAINS` is not `'true'`, return envelope unchanged.

### Step 2: Validation
Validate envelope structure and all required fields. Return error immediately if validation fails.

### Step 3: Extract Components
Extract `tenant_id`, `workspace_id`, `brand_id`, and `requested_at` from envelope.

### Step 4: Build Domain Key
Apply strict formula:
```javascript
TENANT:${tenant_id}::WS:${workspace_id || "null"}::BRAND:${brand_id || "null"}
```

### Step 5: Create Trace Domain Object
Build `trace_domain` object with `version`, `domain_key`, and `components`.

### Step 6: Emit Observability Event
Emit `TRACE_DOMAIN_COMPUTED` event with all required fields.

### Step 7: Return Envelope
Return new envelope object with `trace_domain` attached (no mutation of original).

## 10. Test Coverage

### Happy Path (6 tests)
1. Full tenant set
2. Tenant only
3. Tenant + workspace
4. Tenant + brand
5. All optional IDs null
6. Stable domain key prediction

### Negative Path (6 tests)
7. Missing tenant
8. Tenant ID empty
9. Workspace ID invalid type
10. Brand ID invalid type
11. Missing execution_id
12. Malformed metadata.requested_at

### Edge Cases (4 tests)
13. Extremely long tenant_id
14. Unicode tenant_id
15. Null-only metadata
16. Fields explicitly set to null vs undefined

### Regression (1 test)
17. Domain key identical to previous version for equal inputs

### Determinism (1 test)
18. 10,000 identical inputs → identical outputs, byte-for-byte

## 11. Examples

### Example 1: Full Tenant Set

**Input**:
```javascript
{
  execution_id: "exec-123",
  tenant: {
    tenant_id: "acme",
    workspace_id: "marketing",
    brand_id: "summer-campaign"
  },
  metadata: {
    requested_at: "2025-07-29T15:41:00Z"
  }
}
```

**Output Domain Key**:
```
TENANT:acme::WS:marketing::BRAND:summer-campaign
```

**Output Envelope**:
```javascript
{
  ...envelope,
  trace_domain: {
    version: "trace_domain_v1",
    domain_key: "TENANT:acme::WS:marketing::BRAND:summer-campaign",
    components: {
      tenant_id: "acme",
      workspace_id: "marketing",
      brand_id: "summer-campaign",
      requested_at: "2025-07-29T15:41:00Z"
    }
  }
}
```

### Example 2: Tenant Only

**Input**:
```javascript
{
  execution_id: "exec-456",
  tenant: {
    tenant_id: "solo-tenant"
  },
  metadata: {
    requested_at: "2025-07-29T15:41:00Z"
  }
}
```

**Output Domain Key**:
```
TENANT:solo-tenant::WS:null::BRAND:null
```

### Example 3: Validation Error

**Input**:
```javascript
{
  execution_id: "exec-789",
  tenant: {
    tenant_id: "   "  // Empty after trim
  },
  metadata: {
    requested_at: "2025-07-29T15:41:00Z"
  }
}
```

**Output**:
```javascript
{
  ok: false,
  code: "TRACE_DOMAIN_ERROR_INVALID_TENANT_ID",
  message: "tenant.tenant_id must be a non-empty string",
  envelope: { execution_id: "exec-789" }
}
```

## 12. Hardening Framework Alignment

Phase 43 aligns with all Forward-Hardening rules:

- ✅ **Deterministic Contracts**: input_contract_v1, output_contract_v1
- ✅ **Atomic 18-Test Bundle**: Exactly 18 tests (6+6+4+1+1)
- ✅ **Observability Signals**: `TRACE_DOMAIN_COMPUTED` event
- ✅ **No Hardcoded Domain Logic**: Pure math only
- ✅ **Idempotent Behavior**: No side effects
- ✅ **Backward Compatibility**: Optional fields, stable error codes
- ✅ **Feature-Flag Controlled**: `FF_MULTI_TENANT_TRACE_DOMAINS`
- ✅ **Documentation + Spec Alignment**: This document

## 13. Integration

Phase 43 is inserted after Phase 42 (Trace Reconstruction Engine) and before any Phase 44 multi-tenant routing.

### Dispatcher Rule

```javascript
if (FF_MULTI_TENANT_TRACE_DOMAINS) {
    envelope = computeTraceDomain(envelope);
}
```

**No other behavior permitted.**

## 14. Module Exports

```javascript
module.exports = {
    computeTraceDomain
};
```

## 15. Prohibitions

Phase 43 does **NOT**:
- Perform IO
- Execute policy checks
- Resolve capabilities
- Include connector logic
- Perform inference
- Generate random values
- Hash or encrypt data
- Modify tenant fields
- Include execution logic
