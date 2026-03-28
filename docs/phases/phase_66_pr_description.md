# Phase 66: Connector Health Evolution Engine ("The Physiologist")

## 🚀 Overview
Phase 66 introduces the **Connector Health Evolution Engine**, the core component of the new **State Evolution Layer**. This engine transitions the orchestrator from a passive historian to an active physiologist, capable of deterministically evolving connector health based on execution outcomes, drift, and policy mandates.

## 🔑 Key Features
- **Hybrid Health Model**: Matches internal granular tracking (Continuous Score) with external binary routing reliability (Discrete Tiers).
- **Deterministic Evolution**: purely functional logic with no I/O or side effects.
- **Hard Penalty Clamps**: Policy violations (e.g., bans, budget exhaustion) act as circuit breakers, instantly forcing `DISABLED` or `CRITICAL` states regardless of technical performance.
- **Strict Traceability**: Emits a canonical, ordered reason trace for every state mutation, enabling perfect audit replay.

## 🛠 Technical Details
- **Location**: `orchestrator/phases/phase_66_connector_health_evolution_engine`
- **Contract**: `connector_health_evolution_engine_v1`
- **Purity**: Zero dependencies, timestamp-free, float-drift resistant (strict 2-decimal rounding).

## 🧪 Verification
- **Test Suite**: 18 canonical test cases covering:
    - Baseline Recovery & Degradation
    - Hard/Soft Errors & Timeouts
    - Drastic Drift Penalties
    - Hard Penalty Overrides
    - Integrity Streak Promotion
- **PASS**: All 18 tests passing.

## 📜 Trace Example
```json
[
  { "step": "BASE_EVOLUTION", "from": 100.00, "to": 90.00, "delta": -10.00, "reason": "TIMEOUT" },
  { "step": "DRIFT_ADJUSTMENT", "from": 90.00, "to": 85.00, "delta": -5.00, "reason": "DRIFT_SEVERITY_SUM:1" },
  { "step": "TIER_MAPPING", "from": "HEALTHY", "to": "WARNING", "delta": 0, "reason": "TIER:HEALTHY->WARNING" }
]
```
