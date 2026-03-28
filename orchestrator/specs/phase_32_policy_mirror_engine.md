# Phase 32 Spec: Policy Mirror Engine

## 0. Objective
Create a deterministic, read-only, central rule mirror of all Kaivo operational rules and constraints. This module mirrors the "laws of the world" from static definitions without inference or mutation.

## 1. Files
- `orchestrator/modules/policy_mirror_engine.js` (new)
- `orchestrator/policy/rules/budget_rules.json` (new)
- `orchestrator/policy/rules/venue_rules.json` (new)
- `orchestrator/policy/rules/compatibility_matrix.json` (new)
- `orchestrator/policy/rules/connector_rules.json` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/policy_mirror_engine.test.js` (new)

## 2. Contracts

### 2.1 Input Envelope
- **Intent**: `POLICY_MIRROR_V1`
- **Module**: `dispatcher` (or upstream caller)
- **Payload**: `PolicyMirrorRequestV1`

### 2.2 Input Contract V1
```typescript
type PolicyMirrorRequestV1 = {
  execution_id: string;
  request_context: {
    brand_id: string;
    campaign_goal?: { type: string };
  };
};
```

### 2.3 Output Envelope
- **Module**: `policy_mirror_engine`
- **Payload**: `PolicyMirrorResponseV1`

### 2.4 Output Contract V1
```typescript
type PolicyMirrorResponseV1 = {
  execution_id: string;
  policy_version: string;
  timestamp: string;
  rules: {
    budget: {
      min_total: number;
      max_total: number;
      min_per_venue: number;
    };
    venues: {
      [venue_key: string]: {
        enabled: boolean;
        compatible_objectives: string[];
        required_creative_types: string[];
        required_audience_types: string[];
        pacing_allowed: boolean;
        capability_profile: {
          supports_multilingual: boolean;
          supports_variants: boolean;
          supports_tracking: boolean;
          supports_custom_objectives: boolean;
        };
        sequencing: {
          requires_primary?: boolean;
          allowed_roles: string[];
        };
      };
    };
    compatibility_matrix: {
      objective_to_venue: { [objective: string]: string[] };
      creative_to_venue: { [creative_type: string]: string[] };
      audience_to_venue: { [audience_type: string]: string[] };
    };
    connector_rules: {
      [venue_key: string]: {
        min_payload_fields: string[];
        forbidden_fields: string[];
        readiness_requirements: string[];
      };
    };
  };
};
```

## 3. Logic
- **Pure Read-Only**: No inference, guessing, or mutation.
- **No Hardcoded Knowledge**: Load from static JSON files in `orchestrator/policy/rules/`.
- **Deterministic Ordering**: All collections sorted lexicographically by key.
- **Schema Stability**: Deprecated rules remain with `enabled: false`.
- **Replay Identical Output**: Identical inputs produce identical outputs.
- **No IO**: No network, file reads (runtime), or env lookups (except feature flag).

## 4. Error Handling
- `KG_MISSING_RULES`: Static rule files missing or malformed.
- `INVALID_COMPATIBILITY_TABLE`: Tables missing required keys.
- `UNKNOWN_VENUE_KEY`: Venue referenced but not in registry.
- `MALFORMED_POLICY_CONTRACT`: Input shape mismatch.

## 5. Feature Flag
- `FF_POLICY_MIRROR_V1`: Default enabled. If disabled, returns empty rule set with `ok: true`.
