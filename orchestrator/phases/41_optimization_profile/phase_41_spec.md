# Phase 41: Optimization Loop Profiling Engine - Specification

## 1. Phase Objective

Phase 41: Optimization Loop Profiling Engine is a deterministic measurement layer that consumes the full optimization trace produced by Phase 39/40 and emits `OptimizationProfileV1`.

**Purpose**: Pure telemetry and measurement—does not modify optimization behavior.

**Position**: Phase 41 sits after Phase 40 in the orchestrator chain:
```
35 → 36 → 37 → 38 → (round) → 39 → 40 → 41
```

## 2. Input Contract (input_contract_v1)

Phase 41 consumes:

```javascript
{
  optimization_trace: Array<{
      round_index: number,          // 0-based round index
      initial_budgets: Record<string, number>,
      final_budgets: Record<string, number>,
      delta_by_venue: Record<string, number>,
      global_delta: number,
      brakes: Array<string>,
      diagnostics: any
  }>,
  initial_budgets: Record<string, number>,  // Optional
  final_budgets: Record<string, number>,    // Optional
  diagnostics: any,                         // Optional
  config: any                               // Optional
}
```

**All fields are optional-by-contract but must be validated.**

### Validation Rules

1. `optimization_trace` must be a non-empty array
2. Each round must be an object with `round_index` (number)
3. Missing or malformed fields produce negative-path response (no throws)

## 3. Output Contract (output_contract_v1)

Phase 41 produces exactly this shape:

```javascript
OptimizationProfileV1 = {
  per_round: Array<{
    round_index: number,
    absolute_delta: number,
    per_venue_delta: Record<string, number>,
    global_delta: number,
    brake_events: Array<string>,
    oscillation_detected: boolean
  }>,
  convergence_score: number,              // [-1, 1]
  drift_sensitivity: number,              // >= 0
  oscillation_flag: boolean,
  brake_events: Array<{ 
    round_index: number, 
    brake: string 
  }>,
  stability_tag: "STABLE" | "OSCILLATORY" | "DAMPED" | "UNSTABLE",
  termination_reason: string              // Normalized value
}
```

**No omissions. No additions.**

## 4. Profiling Logic (Deterministic Only)

### 4.1 Per-Round Delta Vector

For each round `r`:

```javascript
absolute_delta = sum of |delta_by_venue[v]|
per_venue_delta = exact copy of delta_by_venue
global_delta = global_delta from trace
brake_events = brakes array
oscillation_detected = true if ANY delta sign flips relative to previous round
```

**Sign Flip Detection**: A venue's delta sign flips if:
- Previous round: `delta > 0`, current round: `delta < 0`, OR
- Previous round: `delta < 0`, current round: `delta > 0`

### 4.2 Convergence Score

```javascript
convergence_score = 1 - (mean_absolute_delta_final / mean_absolute_delta_initial)
```

**Clamped to [-1, 1]**

**Edge Cases**:
- Single round: `convergence_score = 0`
- Initial delta is zero: Return `1` if final is also zero, else `-1`

### 4.3 Drift Sensitivity Index

```javascript
drift_sensitivity = (variance of absolute_delta) / (mean of absolute_delta + epsilon)
```

Where `epsilon = 1e-10` to prevent division by zero.

### 4.4 Oscillation Flag

Set `oscillation_flag = true` if:
- **≥ 2 rounds** show `oscillation_detected = true`, OR
- **global_delta** exhibits **two or more sign-oscillations**

### 4.5 Brake Event Log

Flatten all brakes from all rounds:

```javascript
[{ round_index, brake }]
```

**Sorted deterministically by**:
1. `round_index` (ascending)
2. `brake` (alphabetical)

### 4.6 Stability Tag

Classification logic:

```javascript
if (oscillation_flag && convergence_score < 0) {
    return "UNSTABLE";
} else if (oscillation_flag && convergence_score >= 0) {
    return "OSCILLATORY";
} else if (!oscillation_flag && convergence_score < 0.5) {
    return "DAMPED";
} else {
    return "STABLE";
}
```

### 4.7 Termination Reason

Normalize to one of these permitted values:
- `"CONVERGED"`
- `"MAX_ROUNDS"`
- `"BRAKE_TRIGGERED"`
- `"OSCILLATION_DAMP"`
- `"PLATEAU"`
- `"INFEASIBLE"`
- `"UNKNOWN"`

**Source**: `diagnostics.termination_reason` or `diagnostics.exit_reason`

**Normalization**: Convert to uppercase, replace non-alphanumeric with `_`, match against permitted list. Default to `"UNKNOWN"` if no match.

## 5. Hardening Requirements

Phase 41 follows the **Kaivo Forward-Hardening Framework**.

### 5.1 Deterministic Contract & Version Tag

- Input Contract: `input_contract_v1`
- Output Contract: `output_contract_v1`

### 5.2 Atomic Test Bundle

**Exactly 18 tests**:
- 6 happy-path tests
- 6 negative-path tests
- 4 edge-case tests
- 1 regression guard
- 1 determinism guard

### 5.3 Observability

- Structured log event
- Standard metrics
- Trace span: `"PHASE_41_OPTIMIZATION_PROFILE"`
- `execution_id` propagated

### 5.4 Idempotence & Replayability

- No mutation of input envelope
- No IO
- Identical outputs for identical traces

### 5.5 No Hardcoded Knowledge

All rules are pure math—no policy, no business logic.

### 5.6 Schema Evolution Softness

- New fields must be optional
- No breaking changes

### 5.7 Connector Safety

Phase 41 must not influence any connector-shaping fields.

### 5.8 Feature Flag

**Feature Flag**: `FF_OPTIMIZATION_PROFILE_V1`

**Default**: `false`

**Fallback Behavior**:
```javascript
{
  ok: true,
  profile: {},
  diagnostics: { feature_disabled: 'FF_OPTIMIZATION_PROFILE_V1' }
}
```

## 6. Error Handling

### Negative Path Responses

All errors must return:

```javascript
{
  ok: false,
  code: string,           // Error code
  message: string,        // Human-readable message
  diagnostics: object     // Additional context
}
```

### Error Codes

- `INVALID_INPUT`: Missing or invalid `optimization_trace`
- `MALFORMED_TRACE`: Trace structure validation failed
- `PROFILING_ERROR`: Unexpected error during profiling

**No throws allowed**—all errors must be caught and returned as structured responses.

## 7. Prohibitions

Phase 41 **MUST NOT**:
- Modify any upstream phase
- Reinterpret or alter `optimization_trace`
- Add fields not explicitly listed in `OptimizationProfileV1`
- Include inferred logic
- Add IO, randomness, async behavior, or nondeterministic code
- Change sorting or budget values
- Mutate envelopes
- Rely on external services

## 8. Integration

Phase 41 is called after Phase 40 in the dispatcher:

```javascript
if (type === "MULTI_ROUND_OPTIMIZER_V1") {
    // ... Phase 39 + 40 execution ...
    
    const FF_OPTIMIZATION_PROFILE_V1 = process.env.FF_OPTIMIZATION_PROFILE_V1 === 'true';
    
    if (FF_OPTIMIZATION_PROFILE_V1 && result.ok) {
        const profileResult = optimizationProfileEngine.generateOptimizationProfile({
            optimization_trace: result.optimization_trace,
            initial_budgets: result.initial_budgets,
            final_budgets: result.final_budgets,
            diagnostics: result.diagnostics,
            config: payload?.config
        });
        
        if (profileResult.ok) {
            result.profile = profileResult.profile;
        }
    }
    
    return result;
}
```

## 9. Module Exports

```javascript
module.exports = {
    generateOptimizationProfile
};
```

## 10. Test Coverage

**Test Categories**:

### Happy Path (6 tests)
1. Complete trace profiling
2. Convergence detection
3. Oscillation detection
4. Brake event logging
5. Stability classification
6. Termination reason extraction

### Negative Path (6 tests)
7. Missing optimization_trace
8. Malformed trace structure
9. Missing budgets (should succeed)
10. Invalid round data
11. Empty trace
12. NaN in deltas (graceful handling)

### Edge Cases (4 tests)
13. Single round trace
14. Zero deltas (perfect stability)
15. All venues oscillating
16. Extreme convergence score

### Regression (1 test)
17. Termination reason normalization

### Determinism (1 test)
18. Identical trace → identical profile

## 11. Completion Criteria

Phase 41 is complete when:
- [x] All 18 tests pass
- [x] Phase is fully deterministic
- [x] Contracts exactly match spec
- [x] Feature flag functions correctly
- [x] No mutation of inputs occurs
- [x] Replay produces identical results
- [x] No linting errors
- [x] No circular imports
- [x] Documentation is complete
- [x] Profiling output is machine-stable
