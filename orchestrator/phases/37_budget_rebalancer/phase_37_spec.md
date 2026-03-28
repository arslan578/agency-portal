# Phase 37: Budget Rebalancer v1 — Final Specification

## Objective

Phase 37 consumes:
- `learning_signals_v1` (Phase 36 output)
- `budget_plan_v1` (Phase 35 output)
- `policy_mirror_v1` (limits + adjustment rate)

It returns:
- `rebalance_plan_v1` containing a deterministic redistribution of venue-level budgets.

Phase 37:
- Never changes the total budget.
- Never violates min or max limits from policy.
- Applies a bounded, versioned adjustment rate.
- Produces fully deterministic outputs with no IO or external knowledge.
- Ignores capabilities_index_v1 entirely (reserved for future phases).

This specification exactly matches the implemented and test-validated behavior.

---

## Input Contract

`input_contract_v1`

Envelope shape:

```ts
{
  execution_id?: string,
  payload: {
    learning_signals_v1: { venues: LearningVenueSignal[] },
    budget_plan_v1: { venues: BudgetVenue[] },
    policy_mirror_v1: PolicyMirrorFragment,
    flags?: {
      FF_BUDGET_REBALANCER_V1?: boolean
    }
  }
}
```

**Required fields**
- `payload.learning_signals_v1`
- `payload.budget_plan_v1`
- `payload.policy_mirror_v1`

**Optional fields**
- `payload.flags`
- `execution_id`

**Unused / Ignored fields**
- `capabilities_index_v1` (if present, ignored and not validated)
- `brand_id`
- `timestamp`

These are intentionally ignored in v1 because Phase 37 performs only numerical redistribution, not feasibility or capability analysis.

**Types**

```ts
type LearningVenueSignal = {
  venue_key: string;
  global_score: number;
  constraint_tightness: number;
  coverage_penalty: number;
};

type BudgetVenue = {
  venue_key: string;
  allocated: number;
};

type PolicyMirrorFragment = {
  optimizer_adjustment_rate?: number;
  venue_budget_limits?: {
    [venue_key: string]: {
      min_budget?: number;
      max_budget?: number | null;
    };
  };
};
```

**Forbidden fields**
- Any connector-shaped objects
- Any platform-specific payloads
- Any IO handles
- Anything affecting external connectors

---

## Output Contract

```ts
type RebalancePlanV1 = {
  version: "V1",
  total_budget: number,
  venues: Array<{
    venue_key: string,
    previous_spend: number,
    new_spend: number,
    delta: number,
    reason: {
      global_signal: number,
      constraint_tightness: number,
      coverage_penalty: number
    }
  }>
}
```

Envelope:

```ts
{
  ok: boolean,
  code: string,
  message: string,
  timestamp: string,
  execution_id?: string,
  payload: {
    rebalance_plan_v1?: RebalancePlanV1
  }
}
```

Success code:

`BUDGET_REBALANCER_V1_OK`


---

## Feature Flag

Name:

`FF_BUDGET_REBALANCER_V1`

Behavior:
- If explicitly `false` → Phase returns a pass-through plan:
  - `new_spend = previous_spend`
  - `delta = 0`
  - dummy reason values `{0,0,0}`

Default:
- Missing or `true` → enabled.

---

## Algorithm

### 1. Validate envelope and payload

Reject malformed input:
- Missing envelope
- Missing payload
- Missing `learning_signals_v1.venues`
- Missing `budget_plan_v1.venues`
- Non-finite numeric fields
- Negative allocated budgets
- Negative or invalid scores

Errors return:

```ts
ok: false
payload: {}
```

### 2. Join learning signals with budget venues by venue_key

Missing learning → default `{0,0,0}` signals.

### 3. Compute pressure per venue

```
g = clamp01(global_score)
c = clamp01(constraint_tightness)
p = clamp01(coverage_penalty)

pressure = max(g - p + c * 0.25, 0)
```

### 4. Normalize pressures into weights

```
w_i = pressure_i
W = sum(w_i)
```

If `W == 0`: return no-op plan.

### 5. Compute ideal distribution

```
ideal_i = (w_i / W) * total_budget
```

### 6. Blend previous toward ideal

Use adjustment rate from policy:

```
r = optimizer_adjustment_rate ∈ (0,1], default 0.10
new_i = prev_i + r * (ideal_i - prev_i)
```

### 7. Apply min/max limits

Clamp:

```
new_i = min(max(new_i, min_i), max_i)
```

### 8. Correct diff to preserve total

If clamped totals differ from `total_budget`:
- Distribute positive/negative diff across feasible venues
- Use pressures as redistribution weights
- If impossible → `INFEASIBLE_REALLOCATION`

### 9. Output plan

For each venue include:
- `previous_spend`
- `new_spend`
- `delta`
- `reason` (raw learning values)

---

## Invariants

On success:
1. `sum(new_spend) == total_budget` within 1e-4
2. All `new_spend >= min_budget`
3. All `new_spend <= max_budget` (if finite)
4. No mutation of input envelope
5. Deterministic operation, no randomness
6. Replay identical inputs → identical outputs

---

## Error Codes
- `MALFORMED_INPUT`
- `MALFORMED_LEARNING_SIGNALS`
- `MALFORMED_BUDGET_PLAN`
- `INVALID_SCORE_VALUE`
- `INVALID_BUDGET_VALUE`
- `INFEASIBLE_REALLOCATION`

---

## Test Suite Requirements

Phase 37 must include:
- 6 happy-path tests
- 6 negative-path tests
- 4 edge-case tests
- 1 regression guard
- 1 determinism guard

Test file:

`orchestrator/phases/37_budget_rebalancer/tests/budget_rebalancer_engine.test.js`

This is the canonical Phase 37 specification and replaces all prior drafts.
