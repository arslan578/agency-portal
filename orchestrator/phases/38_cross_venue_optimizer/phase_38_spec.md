# Phase 38: Cross Venue Optimizer - Specification

## 1. Objective

Phase 38 is the final venue-level optimization step in a single optimization loop. It produces a globally optimized, cross-venue budget plan that:

1. **Conserves total budget** exactly to Phase 37's total
2. **Respects per-venue min/max limits** from Policy Mirror
3. **Respects policy blocks** from Phase 33 Reasoner
4. **Applies strict bounded movement** per venue: `Δ(budget) / budget_before ≤ max_allowed_delta_ratio`
5. **Remains deterministic**, replayable, pure logic (no IO, no randomness)
6. **Fails safely** using exact error codes

## 2. Input Contract

### Required Inputs

Phase 38 consumes the following phase outputs:

```javascript
{
  payload: {
    phase_35: { world_aware_optimization: {...} },
    phase_36: { learning_signal_aggregate: {...} },
    phase_37: { budget_rebalancer: {...} },
    phase_32: { policy_mirror: {...} },
    phase_33: { policy_reasoner: {...} },
    phase_34: { capabilities_resolver: {...} }
  }
}
```

### Phase 35 (World Aware Optimization)
- `recommended_venues[]`: Array of venue recommendations
  - `venue_key: string`
  - `raw_score: number` (performance score, 0-1)
  - `recommended_budget: number`
  - `role: string`

### Phase 36 (Learning Signal Aggregate)
- `recommended_signals[]`: Array of learning signals
  - `venue_key: string`
  - `normalized_score: number` (learning score, 0-1)
  - `constraint_tightness: number` (0-1)

### Phase 37 (Budget Rebalancer)
- `venues[]`: Array of rebalanced budgets
  - `venue_key: string`
  - `new_spend: number`
  - `previous_spend: number`
- `total_budget: number`

### Phase 32 (Policy Mirror)
- `venue_budget_limits: { [venue_key]: { min_budget, max_budget } }`
- `max_allowed_delta_ratio: number` (default 0.25)

### Phase 33 (Policy Reasoner)
- `venue_assessments[]`: Array of policy assessments
  - `venue_key: string`
  - `is_legal: boolean`
  - `policy_blocks: string[]`

### Phase 34 (Capabilities Resolver)
- `venues[]`: Array of venue capabilities
  - `venue_key: string`
  - `currency_code: string`

## 3. Output Contract

### Success Envelope

```javascript
{
  ok: true,
  timestamp: string (ISO 8601),
  payload: {
    phase_38: {
      cross_venue_optimizer: {
        total_budget_before: number,
        total_budget_after: number,
        venue_plans: VenuePlan[],
        diagnostics: Diagnostics,
        stability: Stability,
        status: Status
      }
    }
  }
}
```

### VenuePlan Schema

```javascript
{
  venue_key: string,
  currency_code: string,
  budget_before: number,
  budget_after: number,
  delta: number,
  delta_ratio: number,
  cross_venue_score: number,
  decision: Decision,
  rationale_tags: string[],
  constraint_tightness: number,
  exploration_weight: number,
  exploitation_weight: number
}
```

### Decision Vocabulary

Only these values allowed:
- `"KEEP"` - No change
- `"INCREASE"` - Budget increased
- `"DECREASE"` - Budget decreased
- `"CAP_AT_MIN"` - Clamped to minimum
- `"CAP_AT_MAX"` - Clamped to maximum
- `"ZEROED"` - Set to zero (rare edge case)

### Rationale Tags Vocabulary

Only these tags allowed:
- `"HIGH_PERF"` - High performance score
- `"LOW_PERF"` - Low performance score
- `"CONSTRAINT_HIT"` - Hit min or max limit
- `"POLICY_BLOCK"` - Blocked by policy
- `"DELTA_CLAMPED"` - Delta ratio limit enforced

### Diagnostics Schema

```javascript
{
  total_delta: number,
  max_single_venue_delta_ratio: number,
  venues_increased: number,
  venues_decreased: number,
  venues_unchanged: number,
  exploration_budget_share: number,
  exploitation_budget_share: number,
  policy_blocked_venues: string[],
  warnings: string[]
}
```

### Stability Schema

```javascript
{
  max_allowed_delta_ratio: number,
  applied_soft_cap: boolean
}
```

### Status Schema

```javascript
{
  ok: boolean,
  code: string | null,
  message: string | null
}
```

### Error Envelope

```javascript
{
  ok: false,
  timestamp: string (ISO 8601),
  error: {
    code: string,
    message: string
  }
}
```

## 4. Algorithm

### Step 1: Input Validation

Validate all 6 phase inputs:
- Phase 35: `world_aware_optimization.recommended_venues[]` exists
- Phase 36: `learning_signal_aggregate.recommended_signals[]` exists
- Phase 37: `budget_rebalancer.venues[]` exists
- Phase 32: `policy_mirror` exists
- Phase 33: `policy_reasoner.venue_assessments[]` exists
- Phase 34: `capabilities_resolver.venues[]` exists

### Step 2: Currency Validation

1. Extract `currency_code` from Phase 34 for each venue
2. Ensure all currency codes are identical
3. If not → return `"UNSUPPORTED_CURRENCY_COMBINATION"`

### Step 3: Cross-Venue Score Calculation

For each venue, compute:

```javascript
cross_venue_score =
  0.6 * performance_score +   // from Phase 35
  0.3 * learning_score +       // from Phase 36
  0.1 * (1 - constraint_tightness)  // from Phase 36
```

Defaults:
- Missing performance → 0.5
- Missing learning → 0.5
- Missing tightness → 0

Clamp final score to [0, 1].

### Step 4: Policy Compliance Check

For each venue:
1. Check Phase 33 policy blocks
2. If venue has `is_legal: false` or `policy_blocks.length > 0`:
   - Set `budget_after = budget_before`
   - Add to `diagnostics.policy_blocked_venues`
   - Set `decision = "KEEP"`
   - Add `"POLICY_BLOCK"` to rationale
   - Exclude from rebalancing

### Step 5: Ideal Budget Calculation

Based on cross-venue scores, compute ideal distribution:

```javascript
total_movable_budget = sum(budgets for non-blocked venues)
score_sum = sum(cross_venue_scores for non-blocked venues)

for each non-blocked venue:
  ideal_budget = (cross_venue_score / score_sum) * total_movable_budget
```

### Step 6: Bounded Movement Application

For each non-blocked venue:

```javascript
max_allowed_delta_ratio = policy_mirror.max_allowed_delta_ratio || 0.25
max_delta = budget_before * max_allowed_delta_ratio

// Blend towards ideal with hard bound
delta = clamp(ideal_budget - budget_before, -max_delta, +max_delta)
proposed_budget = budget_before + delta
```

### Step 7: Min/Max Enforcement

For each venue:

```javascript
min_budget = policy_mirror.venue_budget_limits[venue_key].min_budget || 0
max_budget = policy_mirror.venue_budget_limits[venue_key].max_budget || Infinity

budget_after = clamp(proposed_budget, min_budget, max_budget)
```

### Step 8: Budget Conservation

```javascript
total_before = sum(budget_before for all venues)
total_after = sum(budget_after for all venues)
diff = total_before - total_after
```

If `abs(diff) > 1e-4`:
1. Identify venues with headroom (not at limits, not blocked)
2. Distribute `diff` proportionally by cross-venue score
3. Re-apply delta bounds and limits
4. If still cannot conserve → return `"BUDGET_MISBALANCE"`

### Step 9: Decision & Rationale Generation

For each venue:

```javascript
if (budget_after == budget_before) {
  decision = "KEEP"
} else if (budget_after > budget_before) {
  decision = "INCREASE"
} else {
  decision = "DECREASE"
}

if (budget_after == min_budget && proposed_budget < min_budget) {
  decision = "CAP_AT_MIN"
}
if (budget_after == max_budget && proposed_budget > max_budget) {
  decision = "CAP_AT_MAX"
}

// Rationale tags
rationale_tags = []
if (cross_venue_score >= 0.7) rationale_tags.push("HIGH_PERF")
if (cross_venue_score < 0.4) rationale_tags.push("LOW_PERF")
if (decision == "CAP_AT_MIN" || decision == "CAP_AT_MAX") {
  rationale_tags.push("CONSTRAINT_HIT")
}
if (policy_blocked) rationale_tags.push("POLICY_BLOCK")
if (abs(delta) == max_delta) rationale_tags.push("DELTA_CLAMPED")
```

### Step 10: Exploration/Exploitation Weights

For each venue:

```javascript
exploration_weight = (1 - constraint_tightness) * 0.5 + learning_score * 0.5
exploitation_weight = performance_score
```

### Step 11: Global Diagnostics

```javascript
diagnostics = {
  total_delta: sum(abs(delta) for all venues),
  max_single_venue_delta_ratio: max(abs(delta_ratio) for all venues),
  venues_increased: count(budget_after > budget_before),
  venues_decreased: count(budget_after < budget_before),
  venues_unchanged: count(budget_after == budget_before),
  exploration_budget_share: sum(delta * exploration_weight) / total_delta,
  exploitation_budget_share: sum(delta * exploitation_weight) / total_delta,
  policy_blocked_venues: [...],
  warnings: [...]
}
```

## 5. Invariants

### Budget Conservation

```
abs(total_budget_after - total_budget_before) <= 1e-4
```

### Delta Bound

```
for all venues:
  abs(budget_after - budget_before) / max(budget_before, epsilon)
    <= max_allowed_delta_ratio
```

### Min/Max Limits

```
for all venues:
  min_budget <= budget_after <= max_budget
```

### Policy Compliance

```
for all venues with is_legal == false:
  budget_after == budget_before
```

### Currency Uniformity

```
all venues must have identical currency_code
```

## 6. Error Codes

Only these error codes may be returned:

- `"MALFORMED_PHASE_35_CONTRACT"` - Missing or invalid Phase 35 data
- `"MALFORMED_PHASE_36_CONTRACT"` - Missing or invalid Phase 36 data
- `"MALFORMED_PHASE_37_CONTRACT"` - Missing or invalid Phase 37 data
- `"MALFORMED_INPUT"` - Generic input validation failure
- `"BUDGET_MISBALANCE"` - Cannot conserve total budget
- `"UNSUPPORTED_CURRENCY_COMBINATION"` - Multiple currencies detected
- `"POLICY_BLOCK_VIOLATION"` - Attempted movement of blocked venue
- `"CROSS_VENUE_LOCKED"` - All venues blocked, cannot optimize
- `"UNEXPECTED_INTERNAL_ERROR"` - Catch-all for unforeseen errors

## 7. Feature Flag

`FF_CROSS_VENUE_OPTIMIZER` controls behavior:

- If `false`: Pass through Phase 37 budgets as Phase 38 output (no optimization)
- If `true`: Run full Phase 38 optimization logic

## 8. Determinism Requirements

Phase 38 must be:
- **Pure logic** - No side effects
- **No randomness** - No random number generation
- **No time-based branching** - Timestamp only for output metadata
- **Stable iteration order** - Deterministic object/array iteration
- **Replayable** - Same inputs always produce same outputs

## 9. Test Suite Requirements

Minimum 18 tests:

### Happy Path (6 tests)
1. Uniform no-movement scenario
2. Strong winner venue gets increase
3. Strong loser venue gets decrease
4. Exploration-focused scenario
5. Policy blocked venue stays unchanged
6. Min/max constrained set

### Negative Path (6 tests)
1. Missing Phase 35 → error
2. Missing Phase 36 → error
3. Missing Phase 37 → error
4. Invalid numeric values → error
5. Currency mismatch → error
6. Feature flag disabled → passthrough

### Edge Cases (4 tests)
1. Single venue only
2. All venues at min budget
3. All venues at max budget
4. Tiny total budget (< 1.0)

### Regression (1 test)
1. Full complex multi-venue snapshot

### Determinism (1 test)
1. Multiple runs match bit-for-bit

## 10. Integration Notes

Phase 38 sits between Phase 37 and the final execution plan. It is the **last optimization phase** before budgets are locked for execution.

The dispatcher must:
1. Run Phase 38 immediately after Phase 37
2. Respect the feature flag strictly
3. Write output to `payload.phase_38.cross_venue_optimizer`
4. Pass the full payload downstream with Phase 38 results attached

## 11. Example

### Input (abbreviated)

```javascript
{
  payload: {
    phase_35: {
      world_aware_optimization: {
        recommended_venues: [
          { venue_key: "GOOGLE", raw_score: 0.85, recommended_budget: 600 },
          { venue_key: "META", raw_score: 0.65, recommended_budget: 400 }
        ]
      }
    },
    phase_36: {
      learning_signal_aggregate: {
        recommended_signals: [
          { venue_key: "GOOGLE", normalized_score: 0.9, constraint_tightness: 0.2 },
          { venue_key: "META", normalized_score: 0.7, constraint_tightness: 0.5 }
        ]
      }
    },
    phase_37: {
      budget_rebalancer: {
        total_budget: 1000,
        venues: [
          { venue_key: "GOOGLE", new_spend: 600, previous_spend: 550 },
          { venue_key: "META", new_spend: 400, previous_spend: 450 }
        ]
      }
    },
    phase_32: {
      policy_mirror: {
        max_allowed_delta_ratio: 0.25,
        venue_budget_limits: {
          "GOOGLE": { min_budget: 100, max_budget: 800 },
          "META": { min_budget: 100, max_budget: 500 }
        }
      }
    },
    phase_33: {
      policy_reasoner: {
        venue_assessments: [
          { venue_key: "GOOGLE", is_legal: true, policy_blocks: [] },
          { venue_key: "META", is_legal: true, policy_blocks: [] }
        ]
      }
    },
    phase_34: {
      capabilities_resolver: {
        venues: [
          { venue_key: "GOOGLE", currency_code: "USD" },
          { venue_key: "META", currency_code: "USD" }
        ]
      }
    }
  }
}
```

### Output (abbreviated)

```javascript
{
  ok: true,
  timestamp: "2025-11-30T12:00:00.000Z",
  payload: {
    phase_38: {
      cross_venue_optimizer: {
        total_budget_before: 1000,
        total_budget_after: 1000,
        venue_plans: [
          {
            venue_key: "GOOGLE",
            currency_code: "USD",
            budget_before: 600,
            budget_after: 650,
            delta: 50,
            delta_ratio: 0.083,
            cross_venue_score: 0.81,
            decision: "INCREASE",
            rationale_tags: ["HIGH_PERF"],
            constraint_tightness: 0.2,
            exploration_weight: 0.85,
            exploitation_weight: 0.85
          },
          {
            venue_key: "META",
            currency_code: "USD",
            budget_before: 400,
            budget_after: 350,
            delta: -50,
            delta_ratio: -0.125,
            cross_venue_score: 0.59,
            decision: "DECREASE",
            rationale_tags: [],
            constraint_tightness: 0.5,
            exploration_weight: 0.60,
            exploitation_weight: 0.65
          }
        ],
        diagnostics: {
          total_delta: 100,
          max_single_venue_delta_ratio: 0.125,
          venues_increased: 1,
          venues_decreased: 1,
          venues_unchanged: 0,
          exploration_budget_share: 0.55,
          exploitation_budget_share: 0.45,
          policy_blocked_venues: [],
          warnings: []
        },
        stability: {
          max_allowed_delta_ratio: 0.25,
          applied_soft_cap: false
        },
        status: {
          ok: true,
          code: null,
          message: null
        }
      }
    }
  }
}
```
