# Phase 9B — Budget Constraints Engine

## Purpose

Phase 9B evaluates and enforces policy-driven, cross-venue, and objective-driven budget constraints before any budget allocation or venue plan is created. It ensures the spending envelope is:

- **Feasible:** Budget meets minimum viable execution thresholds
- **Policy-safe:** Complies with all tenant, domain, and platform rules
- **Objective-aligned:** Adequate spend for normalized objectives
- **Connector-compliant:** Respects platform-specific minimums/maximums
- **Consistent:** Constraints applied deterministically across all rules

This phase acts as the **budget correctness firewall**, preventing invalid or unsafe budget configurations from moving downstream.

## Overview

**Phase:** 9B  
**Contract:** `budget_constraints_output_v1`  
**Feature Flag:** `FF_BUDGET_CONSTRAINTS_ENGINE`  
**Hardening Origin:** Forward-Hardening Framework + Engineering Implementation Plan 12.03.25  
**Placement:** After Phase 8B (Objective Normalization) and before Phase 9A (Baseline Budgeting)

## Input Contract

### `budget_constraints_input_v1`

```json
{
  "execution_id": "string",
  "tenant_id": "string",
  "brand_id": "string",
  
  "total_budget": "number",
  "venues": ["string"],
  
  "objective_normalization": "object",
  "creative_compliance": "object",
  
  "historical_signals": "object (optional)",
  "policy_ruleset_version": "string (optional)",
  "knowledge_ts": "string (optional)"
}
```

### Required Fields

- `execution_id` (string)
- `tenant_id` (string)
- `brand_id` (string)
- `total_budget` (number, in cents)
- `venues` (array of platform keys: `["google", "meta", "tiktok", "youtube", "reddit"]`)
- `objective_normalization` (Phase 8B output)
- `creative_compliance` (Phase 6B output)

### Optional Fields

- `historical_signals` (Phase 36 Learning Signals)
- `policy_ruleset_version` (Phase 32 Policy Mirror version)
- `knowledge_ts` (Knowledge Graph timestamp)

### Forbidden Fields

- Any field not explicitly listed above
- Any payload that mutates upstream objects (Framework Rule #1)

## Output Contract

### `budget_constraints_output_v1`

```json
{
  "execution_id": "string",
  "status": "OK" | "CONSTRAINTS_VIOLATION" | "UNSUPPORTED_BUDGET" | "POLICY_BLOCK",
  "feasibility": {
    "global_minimum": "number",
    "global_maximum": "number",
    "per_venue_minimums": {
      "[venue]": "number"
    },
    "per_venue_maximums": {
      "[venue]": "number"
    }
  },
  "constraint_reasons": ["string"],
  "recommended_plan": {
    "safe_zone_min": "number",
    "safe_zone_max": "number",
    "recommended_start": "number"
  }
}
```

**All amounts in cents.**

### Status Codes

- **OK:** Budget passes all constraints
- **CONSTRAINTS_VIOLATION:** Budget violates one or more constraints
- **UNSUPPORTED_BUDGET:** Budget too low or too high for execution
- **POLICY_BLOCK:** Policy rules prevent this budget configuration

## Invariants

Phase 9B must enforce four layers of constraints:

### 1. Global Constraints

- **MIN_GLOBAL:** Minimum viable budget across all venues (e.g., $100 = 10,000 cents)
- **MAX_TENANT:** Maximum budget allowed by tenant rate plan
- **MIN_OBJECTIVE:** Minimum spend required for primary objective from Phase 8B

Formula:
```
global_minimum = max(MIN_GLOBAL, MIN_OBJECTIVE, sum(venue_minimums))
global_maximum = min(MAX_TENANT, sum(venue_maximums))
```

### 2. Venue Constraints

Each venue has platform-specific minimums and maximums:

| Venue | Minimum (USD) | Typical Min (cents) |
|-------|---------------|---------------------|
| Google | $20 | 2000 |
| Meta | $10 | 1000 |
| TikTok | $50 | 5000 |
| YouTube | $25 | 2500 |
| Reddit | $15 | 1500 |

**Rules:**
- Cannot allocate below venue minimum viable spend
- Cannot allocate above venue policy caps
- Cannot select venues blocked by Phase 6B creative compliance

### 3. Policy Constraints

Budget must comply with:

- **Special Ad Category Caps:** Housing, credit, employment ads have lower maximums
- **Regional Limits:** Some regions restrict total spend
- **Age/Location Constraints:** Demographic targeting affects budget floors
- **Frequency Constraints:** High-frequency objectives require higher minimums

These rules come from:
- Policy Mirror (Phase 32)
- Knowledge Graph policy tables
- Tenant-specific overrides

### 4. Objective Constraints

Objective normalization (Phase 8B) imposes spend requirements:

- **High "reach"** (>0.7): Multi-venue minimums enforced
- **High "conversions"** (>0.7): Minimum CPC/CPA budget floor
- **High "value"** (>0.6): Frequency and spend floors required
- **High "frequency"** (>0.5): Higher per-venue minimums

Formula:
```javascript
if (objectives.reach > 0.7) {
  min_venues = 3;
  venue_min_boost = 1.5x;
}

if (objectives.conversions > 0.7) {
  global_minimum = max(global_minimum, CPA_FLOOR * expected_conversions);
}
```

## Behavior Requirements

### 1. Deterministic Constraint Resolution

Budget constraints must be resolved solely from:

- Knowledge Graph (rules, tables)
- Policy Mirror (Phase 32)
- Objective Normalization signals (Phase 8B)
- Historical learning (Phase 36, optional)

**No inline numbers** except fallback minimums for when knowledge services fail.

### 2. No Mutation

- **Cannot modify input envelope**
- **Cannot adjust budget** — only compute constraints
- Deep clone all inputs before processing

### 3. Snapshot Safety

- **Output must be fully replayable**
- Same inputs → same constraints
- Sorted constraint_reasons for determinism

### 4. Safe Zone Recommendation

When status is `OK`, provide a recommended safe operating zone:

```javascript
safe_zone_min = global_minimum * 1.1;  // 10% buffer
safe_zone_max = global_maximum * 0.9;  // 10% safety margin
recommended_start = (safe_zone_min + safe_zone_max) / 2; // midpoint
```

This gives downstream allocators a conservative starting point.

## Error Semantics

Phase 9B **never throws**. It returns structured status codes with detailed constraint_reasons.

### Error Codes

- `CONSTRAINTS_VIOLATION`: Budget violates specific constraints
- `UNSUPPORTED_BUDGET`: Budget outside viable execution range
- `POLICY_BLOCK`: Policy rules prevent this configuration
- `KNOWLEDGE_RESOLUTION_FAILURE`: Cannot resolve constraints from knowledge services
- `INVALID_INPUT`: Input contract validation failed

### Error Handling

When constraints fail:
1. Set status to appropriate error code
2. Set feasibility with best-effort bounds
3. Populate constraint_reasons with sorted, deterministic messages
4. Set recommended_plan to null
5. Return full output contract

### Constraint Reasons Format

```javascript
constraint_reasons = [
  "Budget $50.00 below global minimum $100.00",
  "TikTok minimum $50.00 not met",
  "Reach objective requires minimum $200.00 across 3 venues"
].sort()
```

All reasons must be:
- Deterministic (same inputs → same messages)
- Sorted alphabetically
- Human-readable
- Include specific values in dollars (converted from cents)

## Feature Flag Behavior

**Environment Variable:** `FF_BUDGET_CONSTRAINTS_ENGINE`

- **Default:** `false` (safe rollout)
- **Enabled:** Full constraint evaluation pipeline (when set to `'true'`)
- **Disabled:** Returns pass-through with placeholder feasibility

When disabled, return:
```json
{
  "status": "OK",
  "feasibility": {
    "global_minimum": 0,
    "global_maximum": 999999999,
    "per_venue_minimums": {},
    "per_venue_maximums": {}
  },
  "constraint_reasons": ["Feature flag disabled, constraints not evaluated"],
  "recommended_plan": {
    "safe_zone_min": 0,
    "safe_zone_max": 999999999,
    "recommended_start": "total_budget"
  }
}
```

The flag is enabled when `FF_BUDGET_CONSTRAINTS_ENGINE` is set to the string `"true"` in the environment.

## Observability Requirements

### Metrics

```json
{
  "metric": "phase_9b_budget_constraints_evaluated",
  "execution_id": "...",
  "tenant_id": "...",
  "brand_id": "...",
  "total_budget_cents": "number",
  "venues_count": "number",
  "status": "OK | CONSTRAINTS_VIOLATION | ..."
}
```

### Log Events

```json
{
  "event": "budget_constraints_evaluation",
  "phase": "9B",
  "execution_id": "...",
  "tenant_id": "...",
  "brand_id": "...",
  "total_budget": "number",
  "venues": ["..."],
  "status": "...",
  "constraint_count": "number"
}
```

### Trace Spans

- Span name: `budget_constraints_evaluation`
- Attributes: `execution_id`, `tenant_id`, `status`, `constraint_count`

All observability hooks disabled in `test` environment.

## Integration Points

### Dependencies

- **Phase 6B:** Creative Compliance (determines venue viability)
- **Phase 8B:** Objective Normalization (determines objective-driven minimums)
- **Phase 16:** Policy Engine (provides policy rules)
- **Phase 32:** Policy Mirror (provides platform policies)
- **Phase 36:** Learning Signals (optional, historical performance)
- **Knowledge Graph:** Provides all constraint tables and rules

### Consumers

- **Phase 9A:** Baseline Budget Allocator (uses feasibility bounds)
- **Phase 35-41:** Budget Optimizers (respect constraints)
- **Phase 17:** Readiness Engine (validates budget feasibility before launch)
- **Connector Engines:** Use per-venue constraints for allocation

## Testing Requirements

Comprehensive test suite: **18 tests minimum**

- 6 happy path tests
- 6 negative path tests
- 4 edge case tests
- 1 regression guard test
- 1 determinism guard test

See `__tests__/phase_9b_budget_constraints_engine.test.js` for full implementation.

## Example Scenarios

### Scenario 1: Valid Single-Venue Budget

**Input:**
```javascript
{
  total_budget: 5000,  // $50.00
  venues: ["google"],
  objective_normalization: { 
    normalized_objectives: { reach: 0.3, conversions: 0.6 }
  }
}
```

**Output:**
```javascript
{
  status: "OK",
  feasibility: {
    global_minimum: 2000,  // $20.00
    global_maximum: 100000000,
    per_venue_minimums: { google: 2000 },
    per_venue_maximums: { google: 100000000 }
  },
  constraint_reasons: [],
  recommended_plan: {
    safe_zone_min: 2200,
    safe_zone_max: 90000000,
    recommended_start: 45001100
  }
}
```

### Scenario 2: Budget Below Minimum

**Input:**
```javascript
{
  total_budget: 500,  // $5.00
  venues: ["google", "meta"],
  objective_normalization: {
    normalized_objectives: { reach: 0.8, conversions: 0.2 }
  }
}
```

**Output:**
```javascript
{
  status: "UNSUPPORTED_BUDGET",
  feasibility: {
    global_minimum: 10000,  // $100.00 (MIN_GLOBAL)
    global_maximum: 100000000,
    per_venue_minimums: { google: 2000, meta: 1000 },
    per_venue_maximums: { google: 50000000, meta: 50000000 }
  },
  constraint_reasons: [
    "Budget $5.00 below global minimum $100.00",
    "High reach objective requires minimum $200.00 across 2+ venues"
  ],
  recommended_plan: null
}
```

## Version History

- **v1.0** (2025-12-04): Initial production-ready implementation
