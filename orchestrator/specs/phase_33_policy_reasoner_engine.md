# Phase 33: Policy Reasoner Engine

## 0. Objective

Phase 33 is a deterministic, pure logic engine that consumes:

- Execution Snapshot (Phase 28)
- Policy Mirror payload (Phase 32)

and produces a `PolicyReasoningReportV1` inside a standard orchestrator envelope.

This engine applies policy rules without IO, without connector calls, and without inventing rules. All policy knowledge comes from the Phase 32 mirror.

---

## 1. Position In The System

**Upstream**

- Phase 28: Execution Snapshot Engine
- Phase 32: Policy Mirror Engine

**Downstream**

- Phases that need a structured view of policy status and constraints, such as:
  - connector readiness
  - execution readiness
  - incident and health analysis

Phase 33 does not modify snapshots or rules. It only reads them and produces a reasoning report.

---

## 2. Files

- `orchestrator/phase_33_policy_reasoner/index.js`
- `orchestrator/phase_33_policy_reasoner/policy_reasoner_engine.js`
- `orchestrator/phase_33_policy_reasoner/validators.js`
- `orchestrator/phase_33_policy_reasoner/helpers.js`
- `orchestrator/phase_33_policy_reasoner/__tests__/policy_reasoner_engine.test.js`
- `orchestrator/phase_33_policy_reasoner/__tests__/fixtures/*.json`

---

## 3. Feature Flag

**Flag**

- `FF_POLICY_REASONER_V1`

**Behavior**

- When disabled:
  - Envelope is still validated
  - The engine returns a success envelope with `payload: null`
  - Diagnostics include `{ disabled: true }`
  - No policy reasoning runs

- When enabled:
  - Full Phase 33 reasoning runs through `reasonPolicy`

Feature flag handling is implemented in `index.js`. Core logic in `policy_reasoner_engine.js` assumes the flag has already passed.

---

## 4. Contracts

### 4.1 Input Envelope

Intent:

- `POLICY_REASONING_V1`

Input envelope shape:

```ts
{
  ok: true,
  module: "orchestrator",
  execution_id: string,
  intent: "POLICY_REASONING_V1",
  timestamp: string, // ISO 8601
  payload: {
    execution_snapshot: ExecutionSnapshotV1,
    policy_mirror: PolicyMirrorPayloadV1,
    options?: {
      strict_mode?: boolean,
      tenant_policy_overrides?: object
    }
  },
  source: {
    phase: number,
    name: string
  }
}
```

Validation rules:
- envelope must be an object
- execution_id must exist and be a non-empty string
- module must be "orchestrator"
- intent must be exactly "POLICY_REASONING_V1"
- payload must exist and be an object
- payload.execution_snapshot must exist and be an object
- payload.policy_mirror must exist and be an object

validateEnvelope returns null on success or a human-readable error string on failure.
On validation failure, Phase 33 returns an error envelope with code `MALFORMED_POLICY_REASONER_CONTRACT`.

### 4.2 Output Envelope

Phase 33 always returns:

```ts
{
  ok: boolean,
  module: "policy_reasoner_engine",
  execution_id: string | null,
  timestamp: string, // ISO 8601
  payload: PolicyReasoningReportV1 | null,
  error: null | {
    code: string,
    message: string,
    details?: object
  },
  diagnostics?: {
    disabled?: boolean
  }
}
```

Rules:
- execution_id matches the input when available
- If ok === true then payload is a complete report and error is null
- If ok === false then payload is null and error is populated

### 4.3 PolicyReasoningReportV1

```ts
{
  version: "V1",
  snapshot_version: string | null,
  policy_mirror_version: string | null,

  overall: {
    status: "ALLOWED" | "BLOCKED" | "CONDITIONAL",
    primary_blocking_reason?: string,
    summary_tags: string[]
  },

  objectives: {
    requested_objective: string,
    resolved_objective: string | null,
    allowed_venues: string[],
    blocked_venues: { venue_key: string, reason_code: string }[],
    legality_flags: {
      compliant: boolean,
      jurisdiction_conflicts: string[]
    }
  },

  budget_constraints: {
    total_budget: number,
    currency: string | null,
    within_policy_bounds: boolean,
    violations: {
      rule_key: string,
      severity: "INFO" | "WARN" | "ERROR",
      message_code: string
    }[]
  },

  creative_requirements: {
    required_types: string[],
    missing_types: string[],
    disallowed_types: string[],
    venue_findings: {
      venue_key: string,
      status: "OK" | "MISSING" | "INCOMPATIBLE",
      required_creative_types: string[],
      missing_creative_types: string[],
      incompatible_creative_types: string[]
    }[]
  },

  audience_requirements: {
    required_types: string[],
    missing_types: string[],
    disallowed_types: string[],
    venue_findings: {
      venue_key: string,
      status: "OK" | "MISSING" | "INCOMPATIBLE",
      required_audience_types: string[],
      missing_audience_types: string[],
      incompatible_audience_types: string[]
    }[]
  },

  sequencing_and_roles: {
    roles_allowed: string[],
    violations: {
      venue_key: string,
      unit_role: string,
      reason_code: string
    }[]
  },

  connector_readiness_summary: {
    venues_blocked_by_policy: string[],
    venues_allowed_with_conditions: string[],
    venues_unconstrained: string[]
  },

  diagnostics: {
    strict_mode: boolean,
    missing_policy_entries: string[],
    evaluation_warnings: string[]
  }
}
```

---

## 5. Core Logic

The core logic lives in `reasonPolicy(envelope)`.

### 5.1 High-Level Pipeline

1. Validate envelope shape
2. Validate snapshot and mirror shape
3. Initialize PolicyReasoningReportV1 structure
4. Extract context from snapshot and rules from mirror
5. Objective gating using compatibility matrix
6. Budget constraint evaluation
7. Venue-level reasoning:
   - allowed and blocked venues
   - creative requirements
   - audience requirements
   - allowed roles
8. Connector readiness summary
9. Legality flags
10. Diagnostics and strict mode
11. Final overall status derivation
12. Summary tag derivation
13. Deterministic sorting and key ordering
14. Return final envelope

### 5.2 Objective Gating

- Reads `context.campaign_goal.type` from snapshot
- Uses `rules.compatibility_matrix.objective_to_venue[objective]` from mirror
- If the objective key is missing in the map, records a missing policy entry:
  - `compatibility_matrix.objective_to_venue.<objective>`
- If there are no compatible venues, sets:
  - `overall.status = "BLOCKED"`
  - `overall.primary_blocking_reason = "OBJECTIVE_NOT_SUPPORTED"`
  - Adds a warning to `diagnostics.evaluation_warnings`

Compatible venues are later intersected with enabled venues to produce `allowed_venues` and `blocked_venues`.

### 5.3 Budget Constraints

- Reads `total_budget` and `currency` from `request_context.budget_parameters`
- Applies `rules.budget.min_total` and `rules.budget.max_total` when defined and finite
- If budget is out of bounds:
  - Sets `within_policy_bounds = false`
  - Adds violations with severity "ERROR" and message codes:
    - "BUDGET_TOO_LOW"
    - "BUDGET_TOO_HIGH"

Final status is derived later by checking for any ERROR-level violations.

### 5.4 Venue-Level Reasoning

For each venue in `rules.venues`, iterated in sorted key order:

- If `venue.enabled` is false:
  - Adds `{ venue_key, reason_code: "VENUE_DISABLED" }` to `blocked_venues`
- If the venue is not in the compatible venue list:
  - Adds `{ venue_key, reason_code: "INCOMPATIBLE_OBJECTIVE" }` to `blocked_venues`
- Otherwise the venue is allowed:
  - Adds venue key to `allowed_venues`

**Creative requirements:**
- Uses `venue.required_creative_types` when present
- Builds a union set of all required creative types across allowed venues
- Adds venue findings with:
  - `status: "OK"`
  - sorted `required_creative_types`
  - empty `missing_creative_types`
  - empty `incompatible_creative_types`

**Audience requirements:**
- Uses `venue.required_audience_types` when present
- Builds a union set of all required audience types across allowed venues
- Adds venue findings with:
  - `status: "OK"`
  - sorted `required_audience_types`
  - empty `missing_audience_types`
  - empty `incompatible_audience_types`

**Sequencing and roles:**
- Uses `venue.sequencing.allowed_roles` when present
- Builds a union set of allowed roles across all allowed venues
- Populates `sequencing_and_roles.roles_allowed` with a sorted array
- `sequencing_and_roles.violations` remains empty since Phase 33 does not infer role violations from snapshot content

### 5.5 Connector Readiness Summary

For blocked venues:
- Adds their keys to `connector_readiness_summary.venues_blocked_by_policy`

For allowed venues:
- If `rules.connector_rules[venueKey]` exists and contains non-empty `min_payload_fields` or `readiness_requirements`:
  - Adds venue key to `venues_allowed_with_conditions`
- Otherwise:
  - Adds venue key to `venues_unconstrained`

Each list is later deduplicated and sorted.

### 5.6 Legality Flags

Currently:
- `legality_flags.compliant` is derived from overall status and primary blocking reason
- `jurisdiction_conflicts` is left as an empty array

Phase 33 does not apply jurisdiction-aware logic. That can be added in later versions without changing the core contract.

### 5.7 Diagnostics and Strict Mode

Diagnostics fields:
- `strict_mode` reflects `options.strict_mode`
- `missing_policy_entries` captures missing rule keys, such as nonexistent objective entries in the compatibility matrix
- `evaluation_warnings` contains human-readable warning strings

Strict mode behavior:
- If `strict_mode` is true and `missing_policy_entries` is non-empty:
  - Phase 33 returns an error envelope with:
    - code `INVALID_POLICY_MIRROR_PAYLOAD`
    - message "Missing policy entries in strict mode"
    - details containing the missing entries

This allows tenants to choose between permissive and strict policy validation.

### 5.8 Final Status Derivation

Phase 33 supports three statuses:
- "ALLOWED"
- "BLOCKED"
- "CONDITIONAL"

Logic:
1. If any budget violation has severity "ERROR":
   - `overall.status = "BLOCKED"`
   - `overall.primary_blocking_reason = "BUDGET_VIOLATION"`
2. Else if there are no allowed venues and there are blocked venues:
   - `overall.status = "BLOCKED"`
   - If no primary reason yet, use "NO_COMPATIBLE_VENUES"
3. Else if there are both allowed and blocked venues:
   - `overall.status = "CONDITIONAL"`
   - If no primary reason yet, use "PARTIAL_POLICY_RESTRICTION"
4. Otherwise:
   - Keep "ALLOWED" with no primary reason

### 5.9 Summary Tags

Phase 33 adds machine-friendly tags to `overall.summary_tags`:

Examples:
- `policy_allowed` when status is "ALLOWED"
- `policy_blocked` when status is "BLOCKED"
- `policy_conditional` when status is "CONDITIONAL"
- `budget_out_of_bounds` when there is a budget error
- `objective_not_supported` when the objective has no compatible venues
- `venue_disabled` when any venue is blocked due to VENUE_DISABLED
- `venue_objective_incompatible` when any venue is blocked due to INCOMPATIBLE_OBJECTIVE

Tags are deduplicated and sorted alphabetically.

---

## 6. Determinism

Phase 33 is fully deterministic:
- No IO of any kind
- No connector calls
- No randomness
- All venue iterations are over sorted keys
- All arrays are explicitly sorted before finalization:
  - `allowed_venues`
  - `blocked_venues`
  - `budget_constraints.violations`
  - creative and audience venue findings
  - connector readiness arrays
  - diagnostics arrays
  - summary tags

`sortKeys(report)` is used to return a new object with lexicographically sorted keys, which ensures a stable JSON shape for replay and testing.

Same input envelope produces identical output, except for timestamp.

---

## 7. Error Handling

All errors use `createErrorEnvelope(execution_id, code, message, details?)`.

Error codes:
- `MALFORMED_POLICY_REASONER_CONTRACT`
- `INVALID_POLICY_MIRROR_PAYLOAD`
- `INVALID_EXECUTION_SNAPSHOT`
- `POLICY_REASONER_UNEXPECTED_ERROR`

In all error cases:
- `ok` is false
- `payload` is null
- `error` is populated with code and message

Unexpected runtime errors are caught and returned as `POLICY_REASONER_UNEXPECTED_ERROR`.

---

## 8. Test Suite

Tests live in:
- `orchestrator/phase_33_policy_reasoner/__tests__/policy_reasoner_engine.test.js`
- `orchestrator/phase_33_policy_reasoner/__tests__/fixtures/*.json`

Coverage:
- **Happy paths:**
  - fully allowed venue
  - conditional allowed and blocked venues
  - budget out of bounds
  - feature flag disabled behavior
- **Negative and edge cases:**
  - malformed envelope
  - invalid mirror
  - invalid snapshot
  - strict mode with missing policy entries
  - unknown objective
- **Determinism:**
  - repeated runs with the same input produce deeply equal results

---

## 9. Integration Notes

- Dispatcher must route `POLICY_REASONING_V1` to the Phase 33 entry point exported by `index.js`.
- Feature flag `FF_POLICY_REASONER_V1` controls runtime activation.
- Phase 33 expects Phase 32 mirrors to be valid. It does not reload JSON rules and does not read from disk.
- Downstream modules can rely on `PolicyReasoningReportV1` for policy status, venue-level readiness, and safe connector preparation.
