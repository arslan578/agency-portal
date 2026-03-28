# Phase 73: Long-Horizon Rate Limit Forecaster

## Description
This PR implements **Phase 73**, a pure-logic forecasting engine that predicts future rate-limit consumption for connectors, agents, and tenants. It generates adjusted ceilings and risk classifications to deter downstream phases from over-scheduling.

## Scope
- **Engine**: `phase_73_long_horizon_rate_limit_forecaster.js`
- **Spec**: `phase_73_spec.md`
- **Tests**: `phase_73_long_horizon_rate_limit_forecaster.test.js` (18 tests)

## Behavior
1. **Forecasts**: Uses Weighted Moving Average (WMA) on `rate_limit_ledger` to predict next-window usage.
2. **Ceilings**: Calculates remaining capacity (`max - projected`).
3. **Risk**: Classifies risk as LOW, MEDIUM, HIGH, CRITICAL based on projected/limit ratio.
4. **Hardening**: Forward-hardened, deterministic, no side effects.

## Verification
- **Unit Tests**: 100% pass rate on the 18-test suite.
- **Determinism**: Verified via hash consistency checks.
- **Safety**: Feature flagged (`FF_LONG_HORIZON_RATE_LIMIT_FORECASTER`).

## Risks
- **Low**: Pure logic change behind a feature flag. No IO performed.

## Phase 73 Tightening Patch (TP1)

- Removed hardcoded decay and confidence constants.
- Removed hardcoded agent ceilings.
- Added strict validation for knowledge_maps.rate_limits fields.
- Added recursive forbidden type and _debug field detection.
- Wired standard metrics, logs, and tracing.
- Implemented optional tenant_connector_map based tenant ceiling adjustment.
- Preserved determinism and replay safety.

## Phase 73 Tightening Patch (TP1.1)

- Removed shadowed emitObservability implementation and dead computeMaxRatioFromOutput helper.
- Consolidated observability into a single canonical emitObservability + computeMaxRatio pair.
- Cleaned Date-instance comments for clarity without changing behavior.

## Forward-Hardened + TP1.1 Certified

Phase 73 is now complete and frozen.

Phase 74 may now consume:
- `projected_connector_ceiling`
- `projected_agent_ceiling`
- `projected_tenant_ceiling`
- `risk_classification`
- `future_windows`

Phase 74 must not:
- recalc WMA forecasts
- alter risk classification
- raise ceilings above Phase 73 outputs

This closes out Phase 73 formally in the orchestrator chain.
