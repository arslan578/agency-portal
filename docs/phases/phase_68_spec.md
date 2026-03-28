# Phase 68: Safety Horizon Recalibration Engine Specification

**Status:** Canonical (v1)
**Feature Flag:** `FF_SAFETY_HORIZON_RECALIBRATION`

## 1. Overview

The **Safety Horizon Recalibration Engine** is a pure, deterministic logic component responsible for evolving the Global Safety Horizon based on real-time observations from previous phases. It adheres strictly to the **Forward-Hardening Framework**.

### Role
- **Input:** Current Safety Horizon, Connector Health, Capability Drift, Violations, Usage Patterns, Policy Constraints.
- **Output:** A deterministic `RECALIBRATED` Safety Horizon (or `NO_CHANGE`).
- **Nature:** Pure Logic. No side effects, no IO, no randomness. Observability via injected hooks.

## 2. Input Contract

The engine accepts a single `InputEnvelope` object. Verification is strict.

### Required Fields
- `execution_id`
- `phase`
- `feature_flags`
- `prior_safety_horizon`

### Optional Fields
- `health_evolution`
- `capability_drift`
- `violation_history`
- `usage_patterns`
- `policy_constraints`

*Note: Missing optional fields are treated as empty/neutral.*

### Hard Constraints
- **No `undefined` values** (even for optional fields, key should not exist or value must be null/valid, but explicit `undefined` is rejected).
- **No unknown top-level fields.**
- **No keys starting with `_debug` (deep check).**

## 3. Core Logic & Constants

The engine applies transformational logic using fixed, externalizable constants.

### 3.1 Health -> Risk Score
- **Logic:** `RiskScore` increases when Health Score drops below 100.
- **Formula:** `NewRisk = CurrentRisk + (HealthDelta * 0.05)`
- **Constant:** `COEFF_HEALTH_RISK_FACTOR = 0.05`

### 3.2 Usage Patterns -> Risk Bump (v1)
- **Signal:** `call_frequency` (Calls per Window).
- **Logic:** If `call_frequency > 1000`, add `+0.5` to Risk Score.
- **Constant:** `COEFF_USAGE_FREQ_RISK_BUMP = 0.5`

### 3.3 Drift -> Threshold Reduction
- **Target:** Affects `max_concurrency` ONLY in v1.
- **Logic:** Reduces threshold by percentage of severity.
- **Formula:** `Reduction = floor(Original * Severity * 0.1)`
- **Constant:** `COEFF_DRIFT_THRESHOLD_FACTOR = 0.1`

### 3.4 Policy Supremacy
- **Mandate:** Policy constraints are Hard Overrides.
- **Risk Cap:** Unconditionally clamps `RiskScore` to `policy.max_risk_score`.
- **Status Rule:** If the Policy intervention results in a final state identical to the start state, status remains `NO_CHANGE`.

### 3.5 Versioning
- **Semantic:** `vX` -> `v(X+1)` on any state change.
- **Fallback:** If non-standard version string, append `.1`.

## 4. Observability

The engine emits Forward-Hardening compliant telemetry:
- **Metrics:** `phase_68_recalibration_attempt` (Counter), `phase_68_risk_score` (Gauge).
- **Logs:** Structured log `PHASE_68_COMPLETE` with status, score, and blocked count.
- **Tracing:** Span `PHASE_68_RECALIBRATION` wraps execution.

## 5. Output Contract

```typescript
interface OutputEnvelope {
  ok: boolean;
  status: 'RECALIBRATED' | 'NO_CHANGE' | 'FEATURE_DISABLED' | 'ERROR';
  execution_id: string;
  recalibrated_safety_horizon: SafetyHorizon | null; // null if Error/Disabled
  reasons: string[]; // Deterministic grammatical explanation of changes
}
```

## 6. Forward-Hardening Compliance
- **Purity:** Pure function, deep-cloned inputs.
- **Determinism:** 100% replay-safe. Arrays sorted before comparison/output.
- **Strictness:** Rejects malformed input explicitly (Status ERROR).
