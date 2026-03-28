# Phase 34: Capabilities Resolver Engine

## Objective

Produce a deterministic, normalized capabilities report from:

- The Execution Snapshot (Phase 28)
- The Policy Mirror payload (Phase 32)

The engine answers a single question:

> Given the current world rules and this execution snapshot, what can Kaivo **actually** do, per venue and objective, without guessing?

Phase 34 never changes execution plans, never mutates policy, and never talks to connectors. It aggregates and normalizes capabilities for downstream phases that need a single source of truth.

---

## Position in the System

Upstream:

- Phase 28: Execution Snapshot Engine
- Phase 29: Execution Replay Engine
- Phase 30: Execution Incident Engine
- Phase 31: Execution Health Engine
- Phase 32: Policy Mirror Engine
- Phase 33: Policy Reasoner Engine

Phase 34 reads:

- `snapshot.execution_snapshot_v1`
- `policy_mirror.policy_mirror_v1`

Downstream consumers (present and future):

- Phase 15, 16, 17 for consistent validation and policy views
- Phase 19 Connector Contracts Engine
- Phase 25 Corrective Action Engine
- Future optimization phases (35–40) that require an accurate capability graph

Phase 34 replaces any temptation to sprinkle "what a venue can do" logic in multiple places. It centralizes that logic into a single deterministic report, derived from the Policy Mirror.

---

## Contracts

### Input Contract

`input_contract_v1: CapabilitiesResolverInputV1`

Phase 34 is invoked with the standard orchestrator envelope:

```ts
type CapabilitiesResolverInputV1 = {
  execution_id: string;
  intent: "RESOLVE_CAPABILITIES_V1";
  timestamp: string; // ISO
  payload: {
    snapshot?: {
      execution_snapshot_v1?: ExecutionSnapshotV1;
    };
    policy_mirror?: {
      policy_mirror_v1?: PolicyMirrorV1;
    };
    flags?: {
      strict_mode?: boolean;
    };
  };
};
```

Requirements:
- `execution_id` is a non-empty string
- `payload.snapshot.execution_snapshot_v1` must be present and already validated by Phase 28 and Phase 30
- `payload.policy_mirror.policy_mirror_v1` must be present and already validated by Phase 32
- No IO is allowed. No environment access. No network.

On violation, Phase 34 returns an error envelope and does not attempt partial reasoning.

### Output Contract

`output_contract_v1: CapabilitiesResolverOutputV1`

Successful envelope:

```ts
type CapabilitiesResolverOutputV1 = {
  ok: true;
  execution_id: string;
  intent: "RESOLVE_CAPABILITIES_V1";
  timestamp: string; // ISO
  payload: {
    capabilities_report_v1: {
      version: string; // "CAPABILITIES_V1"
      snapshot_version: string | null;
      policy_mirror_version: string | null;

      global_capabilities: {
        objectives_supported: string[];
        creative_types_supported: string[];
        audience_types_supported: string[];
        sequencing_roles_supported: string[];
        venues_supported: string[];
      };

      venues: Array<{
        venue_key: string;
        enabled: boolean;
        objectives_supported: string[];
        objectives_blocked: string[];
        creative_types_supported: string[];
        audience_types_supported: string[];
        sequencing_roles_supported: string[];
        budget_constraints: {
          has_constraints: boolean;
          min_total?: number | null;
          max_total?: number | null;
        };
        connector_capabilities: {
          has_connector_rules: boolean;
          readiness_level: "UNKNOWN" | "BASIC" | "RICH";
          required_fields: string[];
        };
        status: "ENABLED" | "DISABLED" | "PARTIAL" | "UNKNOWN";
      }>;

      missing_policy_entries: string[];
      evaluation_warnings: string[];
      summary_tags: string[];
      capabilities_complete: boolean;
      capabilities_partial: boolean;
      capabilities_unknown: boolean;
    };
  };
};
```

Error envelope:

```ts
type CapabilitiesResolverErrorOutputV1 = {
  ok: false;
  execution_id: string | null;
  intent: "RESOLVE_CAPABILITIES_V1";
  timestamp: string;
  error: {
    code:
      | "MALFORMED_CAPABILITIES_RESOLVER_CONTRACT"
      | "INVALID_EXECUTION_SNAPSHOT"
      | "INVALID_POLICY_MIRROR_PAYLOAD"
      | "CAPABILITIES_STRICT_MODE_FAILURE"
      | "CAPABILITIES_UNEXPECTED_ERROR";
    message: string;
    details?: any;
  };
};
```

---

## Invariants

1. **Determinism**: Same envelope yields byte-identical payloads (all arrays sorted, all keys sorted)
2. **No Hardcoded Knowledge**: All decisions from policy_mirror_v1 rules
3. **No Side Effects**: No IO, no env reads, no mutations
4. **Backward Compatibility**: New fields are optional with sensible defaults
5. **Single Source of Truth**: Centralized capability logic

---

## Behavior

### 1. Envelope Validation
- Validate top-level envelope and intent
- If wrong shape: return `MALFORMED_CAPABILITIES_RESOLVER_CONTRACT`
- Validate presence of execution_snapshot_v1 and policy_mirror_v1
- If snapshot missing/invalid: return `INVALID_EXECUTION_SNAPSHOT`
- If mirror missing/invalid: return `INVALID_POLICY_MIRROR_PAYLOAD`

### 2. Extract World State
From policy_mirror_v1, extract:
- budget_rules
- venue_rules
- compatibility_matrix
- connector_rules

Track missing rule sets in `missing_policy_entries`.

### 3. Venue Set Construction
Union venues from:
- Execution snapshot plan
- Venue rules keys
- Compatibility matrix values

Dedupe and sort.

### 4. Per-Venue Capability Resolution
For each venue_key:
1. **Enabled flag**: From venue_rules[venue_key]?.enabled
2. **Objectives**: Invert compatibility_matrix.objective_to_venue
3. **Creative/Audience types**: From venue_rules
4. **Sequencing roles**: From venue_rules.allowed_roles
5. **Budget constraints**: From budget_rules
6. **Connector capabilities**: From connector_rules
7. **Status**: ENABLED/DISABLED/PARTIAL/UNKNOWN

### 5. Global Capability View
Union all venue capabilities into global sets.

### 6. Diagnostics and Tags
- missing_policy_entries
- evaluation_warnings
- capabilities_complete/partial/unknown flags
- summary_tags

### 7. Strict Mode
If strict_mode and missing_policy_entries.length > 0:
- Return error: `CAPABILITIES_STRICT_MODE_FAILURE`

### 8. Error Handling
Unexpected exceptions return `CAPABILITIES_UNEXPECTED_ERROR`.

---

## Determinism Requirements
- All collections sorted
- Stable iteration order on venue keys
- No input mutation
- Determinism test: run twice, assert deep equality

---

## Test Plan

**Happy Path (6)**:
1. Basic world, one venue, full rules
2. Multiple venues, shared objectives
3. Venue disabled in rules
4. Complete matrix with connector rules
5. Budget rules mapped correctly
6. Snapshot objective matches matrix

**Negative (6)**:
7. Missing snapshot payload
8. Missing mirror payload
9. Invalid envelope shape
10. Strict mode + missing budget_rules
11. Strict mode + venue absent from rules
12. Invalid types in mirror

**Edge Cases (4)**:
13. Snapshot with zero venues
14. Mirror venues not in snapshot
15. Matrix objective with no venues
16. Connector rules for disabled venue

**Guards (2)**:
17. Regression guard (stored fixture)
18. Determinism guard (deep clone, run twice)
