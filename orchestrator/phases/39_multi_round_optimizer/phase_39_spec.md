# Phase 39: Multi Round Optimization Loop Engine - Specification

## 1. Objective

Phase 39 implements a deterministic multi-round optimization loop that wraps the Phase 35→36→37→38 chain inside a controlled iterative process.

The engine must:
1. Run multiple optimization rounds in one execution
2. Carry forward state between rounds deterministically
3. Integrate drift and incident brakes
4. Prevent oscillation
5. Produce connector-safe final budgets
6. Provide snapshot-ready optimization state for Phase 28

This phase serves as Kaivo's **inner control loop**.

## 2. Architectural Requirements

### 2.1 Entry Point

```javascript
function runMultiRoundOptimizer(envelope, roundFn)
```

- `roundFn` is **dependency-injected** and implements the 35→36→37→38 round function
- **No direct imports** of Phase 35–38 inside Phase 39
- Enables testing with mock roundFn

### 2.2 Determinism

- Identical inputs → identical outputs
- No randomness
- Stable ordering of venues (lexicographic by `venue_key`)
- No time-based branching (timestamp only for metadata)

### 2.3 Snapshot Safety

All state needed for replay must be returned in `optimization_state_v1`.

## 3. Internal Budget State Model

Phase 39 maintains two layers of budget state:

### 3.1 Round Zero Budgets (Immutable)

Captured **once** before looping:

```javascript
const roundZeroBudgets = { 
  [venue_key]: number  // budget at start of optimization
};
```

Used only for:
- Final deltas computation
- Execution history

### 3.2 Per-Round Working Plan

Each iteration operates on:

```javascript
currentPlan = {
  venues: [{
    venue_key: string,
    currency: string,
    round_budget: number,        // budget entering roundFn
    min_budget: number,
    max_budget: number,
    hard_delta_bound: number,
    constraint_tightness: number,
    cross_venue_score: number
  }]
};
```

### 3.3 Delta Definition

**Critical**: The only valid delta definition for this phase:

```javascript
delta = venue.new_budget - prevVenue.round_budget
```

Where:
- `new_budget` = output from roundFn for this round
- `prevVenue.round_budget` = budget that entered roundFn

## 4. Brake Mechanism

### 4.1 Inputs

- `global_drift_score` ∈ [0, 1] (from drift detection)
- `severity_score` ∈ [0, 1] (from incident aggregation)

### 4.2 Scaled Brake Function

```javascript
function scaledBrake(x, start, span) {
  if (x <= start) return 0;
  if (x >= start + span) return 1;
  return (x - start) / span;
}
```

### 4.3 Thresholds

**Drift Brake:**
- Start: 0.20
- Full: 0.80
- Span: 0.60

**Incident Brake:**
- Start: 0.10
- Full: 0.60
- Span: 0.50

### 4.4 Sensitivity Fields

```javascript
drift_sensitivity_v1: number     // default 1.0
incident_sensitivity_v1: number  // default 1.0
```

Apply by modifying span:

```javascript
effectiveDriftSpan = DRIFT_BRAKE_SPAN / drift_sensitivity_v1
effectiveIncidentSpan = INCIDENT_BRAKE_SPAN / incident_sensitivity_v1
```

### 4.5 Global Brake

```javascript
drift_brake_level = scaledBrake(
  global_drift_score, 
  DRIFT_BRAKE_START, 
  effectiveDriftSpan
);

incident_brake_level = scaledBrake(
  severity_score,
  INCIDENT_BRAKE_START,
  effectiveIncidentSpan
);

global_brake = Math.max(drift_brake_level, incident_brake_level);
```

### 4.6 Apply to Configuration

```javascript
effective_damping = clamp(
  base_damping + 0.3 * global_brake,
  0,
  1
);

effective_max_step = base_max_step * (1 - 0.5 * global_brake);

effective_exploration = exploration_weight * (1 - global_brake);

effective_exploitation = exploitation_weight + 
                         exploration_weight * global_brake;
```

## 5. Multi-Round Loop Logic

For up to `max_rounds`:

1. **Build roundContext**
2. **Run** `roundFn(roundContext)`
3. **Compute deltas** using previous round budgets
4. **Detect oscillation**
5. **Apply damping, min-step, max-step, and hard bounds**
6. **Apply policy guard** (Phase 33 references)
7. **Save round snapshot**
8. **Check convergence** on `global_delta`
9. **Update currentPlan** with adjusted budgets
10. **Move to next round**

### 5.1 Round Context Structure

```javascript
roundContext = {
  round_number: number,
  venues: currentPlan.venues.map(v => ({
    venue_key: v.venue_key,
    budget: v.round_budget,
    min_budget: v.min_budget,
    max_budget: v.max_budget,
    currency: v.currency
  })),
  config: {
    damping: effective_damping,
    max_step_fraction: effective_max_step,
    exploration_weight: effective_exploration,
    exploitation_weight: effective_exploitation
  },
  policy_view_ref_v1: envelope.policy_view_ref_v1,
  drift_score: envelope.global_drift_score,
  incident_severity: envelope.severity_score
};
```

## 6. Oscillation Detection

### 6.1 Per-Venue Oscillation

A venue oscillates if:
- Delta sign flips between rounds
- Both magnitudes < 1% of total budget

```javascript
const prevDelta = round > 1 ? history[round-2].delta : 0;
const currDelta = newBudget - prevBudget;

const signFlip = (prevDelta > 0 && currDelta < 0) || 
                 (prevDelta < 0 && currDelta > 0);

const bothSmall = Math.abs(prevDelta) < 0.01 * totalBudget &&
                  Math.abs(currDelta) < 0.01 * totalBudget;

venue.is_oscillating = signFlip && bothSmall;
```

### 6.2 Global Oscillation

Triggers if:
- At least 50% of venues oscillate
- `global_delta <= 0.05`

### 6.3 Oscillation Damping

For oscillating venues:

```javascript
delta *= 0.5
```

## 7. Step Limit Logic

### 7.1 Min Step

```javascript
minStep = per_venue_min_step_fraction * totalBudget
```

Default `per_venue_min_step_fraction = 0.001` (0.1%)

### 7.2 Max Step

```javascript
maxStep = effective_max_step * totalBudget
```

### 7.3 Application Rules

1. **If** `|delta| > maxStep`: Clamp to `±maxStep`
2. **If** `|delta| < minStep`:
   - Set `delta = 0`
   - **Unless** this delta moves the venue toward resolving a constraint:
     - Below `min_budget` and `delta > 0`
     - Above `max_budget` and `delta < 0`
3. **Apply** `effective_damping`:
   ```javascript
   delta *= (1 - effective_damping)
   ```
4. **Apply** `hard_delta_bound`:
   ```javascript
   delta = clamp(delta, -hard_delta_bound, +hard_delta_bound)
   ```

## 8. Policy Guard

### 8.1 Input

Use `policy_view_ref_v1` from envelope.

### 8.2 Check

If **every venue** in this round is blocked:

```javascript
termination_reason = "ALL_VENUES_BLOCKED"
```

### 8.3 Block Detection Skeleton

```javascript
const blocked = new Set(
  policyView.venues
    .filter(v => v.blocked_reason)
    .map(v => v.venue_key)
);

return venues.every(v => blocked.has(v.venue_key));
```

## 9. Convergence Detection

### 9.1 Global Delta

```javascript
global_delta = sum(|delta|) / totalBudget
```

### 9.2 Convergence Threshold

Default: `convergence_threshold = 0.01` (1%)

### 9.3 Convergence Condition

```javascript
if (global_delta <= convergence_threshold) {
  termination_reason = "CONVERGED";
  break;
}
```

## 10. Finalization

### 10.1 Final Plan

- Sort venues lexicographically by `venue_key`
- Compute for each venue:

```javascript
final_budget = lastRoundBudget
total_delta_from_round_zero = final_budget - roundZeroBudgets[venue_key]
```

### 10.2 Output Contract

Must strictly match `OptimizationLoopResultV1`:

```javascript
{
  ok: true,
  timestamp: string (ISO 8601),
  payload: {
    phase_39: {
      multi_round_optimizer: {
        final_venue_plan_v1: FinalVenuePlan[],
        round_history_v1: RoundSnapshot[],
        optimization_summary_v1: OptimizationSummary,
        optimization_state_v1: OptimizationState
      }
    }
  }
}
```

#### FinalVenuePlan Schema

```javascript
{
  venue_key: string,
  currency_code: string,
  final_budget: number,
  round_zero_budget: number,
  total_delta: number,
  rounds_active: number,
  final_cross_venue_score: number,
  final_constraint_tightness: number
}
```

#### RoundSnapshot Schema

```javascript
{
  round_number: number,
  global_delta: number,
  global_brake: number,
  drift_brake_level: number,
  incident_brake_level: number,
  oscillating_venue_count: number,
  venue_deltas: VenueDelta[]
}
```

#### VenueDelta Schema

```javascript
{
  venue_key: string,
  budget_before: number,
  budget_after: number,
  delta: number,
  is_oscillating: boolean,
  applied_damping: number
}
```

#### OptimizationSummary Schema

```javascript
{
  total_rounds: number,
  termination_reason: string,  // "CONVERGED" | "MAX_ROUNDS" | "ALL_VENUES_BLOCKED"
  final_global_delta: number,
  total_budget: number,
  convergence_achieved: boolean
}
```

#### OptimizationState Schema

```javascript
{
  round_zero_budgets: { [venue_key]: number },
  final_budgets: { [venue_key]: number },
  brake_config: {
    drift_sensitivity: number,
    incident_sensitivity: number,
    effective_damping: number,
    effective_max_step: number
  }
}
```

## 11. Invariants

### Budget Conservation

```
abs(sum(final_budgets) - sum(round_zero_budgets)) <= EPSILON
```

### Min/Max Budgets

```
for all venues:
  min_budget <= final_budget <= max_budget
```

### Hard Delta Bound

```
for all rounds, all venues:
  abs(delta) <= hard_delta_bound
```

### Deterministic Ordering

All venue arrays sorted by `venue_key`.

### No Mutation

- No mutation of input `envelope`
- No mutation of `roundFn` context
- `roundFn` must not reorder venues

## 12. Error Codes

- `"MALFORMED_INPUT"` - Missing required fields
- `"INVALID_CONFIG"` - Invalid configuration values
- `"MULTIPLE_CURRENCIES"` - Non-uniform currency codes
- `"ROUND_FN_ERROR"` - Upstream error in roundFn
- `"ALL_VENUES_BLOCKED"` - Policy blocks all venues
- `"BUDGET_CONSERVATION_FAILED"` - Cannot conserve budget
- `"UNEXPECTED_ERROR"` - Catch-all

## 13. Test Suite Requirements

### 13.1 Happy Path (6 tests)

1. 1-round convergence
2. 3-round convergence
3. High drift brakes optimization
4. High incidents force slow convergence
5. Mixed policy-blocked venues
6. Healthy system with strong learning signal

### 13.2 Negative Path (6 tests)

1. Missing fields
2. Multiple currencies
3. Invalid config
4. NaN weights
5. Upstream error in roundFn
6. Policy blocks all venues

### 13.3 Edge Cases (4 tests)

1. Zero budget
2. Single venue
3. Hard delta bound zero
4. max_rounds=1 behaves like Phase 38

### 13.4 Regression (1 test)

1. Oscillation scenario

### 13.5 Determinism (1 test)

1. Byte-for-byte identical outputs

## 14. Example

### Input (abbreviated)

```javascript
{
  envelope: {
    total_budget: 1000,
    round_zero_venues: [
      { venue_key: "GOOGLE", budget: 600, min: 400, max: 800 },
      { venue_key: "META", budget: 400, min: 200, max: 600 }
    ],
    config: {
      max_rounds: 5,
      convergence_threshold: 0.01,
      base_damping: 0.2,
      base_max_step: 0.15
    },
    global_drift_score: 0.3,
    severity_score: 0.15
  },
  roundFn: (ctx) => {
    // Mock Phase 35→36→37→38 chain
    return {
      ok: true,
      venues: [
        { venue_key: "GOOGLE", new_budget: 620 },
        { venue_key: "META", new_budget: 380 }
      ]
    };
  }
}
```

### Output (abbreviated)

```javascript
{
  ok: true,
  timestamp: "2025-11-30T23:33:42.000Z",
  payload: {
    phase_39: {
      multi_round_optimizer: {
        final_venue_plan_v1: [
          {
            venue_key: "GOOGLE",
            final_budget: 615,
            total_delta: 15,
            rounds_active: 2
          },
          {
            venue_key: "META",
            final_budget: 385,
            total_delta: -15,
            rounds_active: 2
          }
        ],
        optimization_summary_v1: {
          total_rounds: 2,
          termination_reason: "CONVERGED",
          convergence_achieved: true
        }
      }
    }
  }
}
```
