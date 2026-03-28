# Phase 66: Connector Health Evolution Engine
**Role:** State Evolution Layer ("The Physiologist")  
**Contract:** `connector_health_evolution_engine_v1`  
**Status:** CANONICAL

## 1. Overview
The **Connector Health Evolution Engine** is the first component of the **State Evolution Layer**. It is responsible for the homeostatic regulation of connector health. It consumes the previous sealed state of a connector along with execution deltas (success/failure, latency, penalties, drift) and deterministically computes the next health state.

It implements a **Hybrid Health Model**:
- **Internal:** Continuous Score (0-100) for granular drift tracking.
- **External:** Discrete Tiers for binary routing decisions.

## 2. Purity & Determinism
This engine is **pure logic**.
- **No I/O**: It never reads from disk or network.
- **No Timestamps**: It does not access system time.
- **No Randomness**: It is bit-identical across runs.
- **No Mutation**: It strictly returns a new state object.

## 3. Contract

### Input
```typescript
interface Phase66Input {
  execution_id: string;
  connector_id: string;
  previous_profile: {
    health_score: number;      // 0.00 - 100.00
    health_tier: HealthTier;   // HEALTHY | WARNING | ...
    consecutive_perfect_runs: number;
    high_integrity: boolean;
  };
  execution_delta: {
    execution_result: 'SUCCESS' | 'HARD_ERROR' | 'TIMEOUT' | 'SOFT_ERROR';
    latency_ms?: number;
    budget_ms?: number;
    retries_used?: number;
    drift_markers?: Array<{ code: string; severity: number }>;
  };
  policy_context: {
    penalties: PolicyPenaltyCode[];
  };
}
```

### Output
```typescript
interface Phase66Output {
  ok: true;
  health_update: {
    health_score: number;
    health_tier: HealthTier;
    evolution_vector: 'RECOVERING' | 'DECAYING' | 'STABLE' | 'PENALIZED';
    consecutive_perfect_runs: number;
    high_integrity: boolean;
  };
  reasoning_trace: TraceStep[];
}
```

## 4. Health Model

### 4.1 Internal Health Score
Continuous float, rounded to 2 decimals.
- **Baseline**: 100.00
- **Recovery Rate**: +1.00 per clean success (no drift, no penalties, no degradation).
- **Penalties**:
  - `LATENCY_VIOLATION`: -1.00
  - `RETRY_USED`: -2.00
  - `SOFT_ERROR`: -2.00
  - `TIMEOUT`: -10.00
  - `HARD_ERROR`: -15.00
  - `Drift`: -(severity * 5.00)

### 4.2 External Health Tiers
Strict mapping from Score:
- **90.00 - 100.00** -> `HEALTHY`
- **75.00 - 89.99** -> `WARNING`
- **50.00 - 74.99** -> `DEGRADED`
- **10.00 - 49.99** -> `CRITICAL`
- **0.00 - 9.99** -> `DISABLED`

### 4.3 Penalty Overrides (Hard Clamps)
Policy penalties act as **Circuit Breakers**. They ignore the score and force the **Tier** to a specific ceiling.
- `POLICY_VIOLATION_BLOCK` -> Forces `DISABLED`
- `CONNECTOR_BANNED` -> Forces `DISABLED`
- `BUDGET_EXHAUSTED_HARD` -> Forces `CRITICAL`
- `BUDGET_WARN` -> Forces `DEGRADED`

*Note: Penalties do NOT modify the score, preserving the "physiological" history.*

## 5. Trace Semantics
The engine emits a strictly ordered, machine-readable trace of all state mutations:
1. `BASE_EVOLUTION`: Score changes due to execution results.
2. `DRIFT_ADJUSTMENT`: Score drops due to schema/capability drift.
3. `PENALTY_OVERRIDE`: Tier clamped by policy.
4. `TIER_MAPPING`: Tier changes due to score threshold crossing.
5. `INTEGRITY_CHECK`: Changes to streak or high-integrity status.

## 6. Integrity Streak
A connector is promoted to **High Integrity** (`high_integrity = true`) if it achieves **10 consecutive perfect runs**.
 **Perfect Run Criteria**:
- `score === 100.00`
- `result === SUCCESS`
- `penalties` is empty
- `drift_markers` is empty
