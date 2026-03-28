# Phase 69: Policy Gradient Adjustment Engine Specification

**Status:** Canonical (v1, tightened)
**Feature Flag:** `FF_POLICY_GRADIENT_ADJUSTMENT`

## 1. Overview

The **Policy Gradient Adjustment Engine** sits on top of the State Evolution triplet (Phases 66-68). It converts observed safety signals (Risk, Drift, Violations) into bounded, deterministic numeric adjustments for policy coefficients. This enables adaptive tuning of the safety policy without ever mutating the underlying rules themselves.

### Role
- **Input:** Safety Horizon (Phase 68), Violation History, Connector Drift, Current Coefficients.
- **Output:** Updated Policy Coefficients and a Ledger of applied gradients.
- **Nature:** Pure Logic. No side effects, no IO, no randomness.

## 2. Input Contract

The engine accepts a single `InputEnvelope` object. Verification is strict.

### Required Fields
- `execution_id` (string)
- `phase`: "69"
- `feature_flags`: Record<string, boolean>
- `safety_horizon`: SafetyHorizon (Phase 68 Output)
- `policy_coefficients`: PolicyCoefficients (Current state)
- `violation_history`: ViolationHistory
- `drift_indicators`: DriftIndicators

### Optional Fields
- `policy_gradient_profile` (Object): Configuration for gradient factors.
    - `risk_to_weight` (number)
    - `drift_to_weight` (number)
    - `violation_to_weight` (number)
    *Note: If missing, factors default to 0 (no gradient applied).*

### Hard Constraints
- **No `undefined` values.**
- **No unknown top-level fields.**
- **No keys starting with `_debug` (deep check).**
- **No forbidden types** (Function, Symbol, BigInt).

## 3. Core Logic & Gradients

The engine calculates a proposed delta for each coefficient based on input signals multiplied by factors from the `policy_gradient_profile`.

### 3.1 Signal Resolution
- **Risk Signal:** `safety_horizon.risk_score` (if present/numeric) or 0.
- **Drift Signal:** Sum of `total_drift` and `severity_score` (if present/numeric). Missing fields = 0.
- **Violation Signal:** Sum of `violation_history.length` (if array) AND `violation_history.recent_violations.length` (if array). Non-array fields ignored.

### 3.2 Gradient Calculation
1. **Risk Gradient:** `delta += riskSignal * profile.risk_to_weight`
2. **Drift Gradient:** `delta += driftSignal * profile.drift_to_weight`
3. **Violation Gradient:** `delta += violationSignal * profile.violation_to_weight`

### 3.3 Bounding & Clamping
- **Step Cap:** Every individual coefficient update is clamped to `[-0.2, +0.2]` per execution cycle.

### 3.4 Neutrality
- If signals are neutral OR profile factors are 0, the applied gradient must be exactly `0`.

## 4. Observability

The engine emits Forward-Hardening compliant telemetry:
- **Metrics:** `phase_69_gradient_applied`, `phase_69_clamp_event`, `phase_69_noop`.
- **Logs:** Structured log `PHASE_69_COMPLETE` with `gradient_magnitude` and `clamp_count`.
- **Tracing:** Span `phase_69_policy_gradient_adjustment`.

## 5. Output Contract

```typescript
interface OutputEnvelope {
  execution_id: string;
  phase: "69";
  ok: boolean;
  status?: "FEATURE_DISABLED"; // If flag is off
  policy_coefficients_updated: PolicyCoefficients;
  gradient_applied: Record<string, number>; // The actual delta applied to each key
  clamp_events: string[]; // List of keys where delta was clamped
}
```

## 6. Forward-Hardening Compliance
- **Purity:** Pure function, deep-cloned inputs.
- **Determinism:** 100% replay-safe. Output keys lexicographically sorted.
- **Strictness:** Rejects malformed input explicitly (Status ERROR).
- **Immutability:** Never mutates input objects.
- **No Hardcoded Knowledge:** All coefficients externalized (via `policy_gradient_profile` or `policy_coefficients`).
