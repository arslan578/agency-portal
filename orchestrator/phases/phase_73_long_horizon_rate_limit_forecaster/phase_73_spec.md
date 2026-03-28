# Phase 73: Long-Horizon Rate Limit Forecaster - Specification

## 1. Overview
Phase 73 is a pure-logic, forward-hardened orchestrator phase that consumes the post-arbitration execution envelope and current rate-limit ledger to produce a deterministic forecast of future rate-limit consumption. It provides adjusted envelope ceilings for downstream cost modeling and replay behavior.

## 2. Goals
- **Forecast Consumption**: Predict usage for next 1-N windows based on history, arbitration, and profiles.
- **Adjust Ceilings**: Calculate `projected_connector_ceiling` and other limits.
- **Risk Classification**: Deterministically classify risk (LOW, MEDIUM, HIGH, CRITICAL).
- **Forward Hardening**: Ensure full determinism, no mutation, no side effects, and strict type safety.

## 3. Data Structures

### 3.1 Input Contract
```typescript
interface Phase73Input {
  execution_id: string;
  phase: "73";
  feature_flags: {
    FF_LONG_HORIZON_RATE_LIMIT_FORECASTER: boolean;
  };
  arbitration_output: {
     rate_limit_offsets?: {
        connector?: { [connector_id: string]: number };
        tenant?: { [tenant_id: string]: number };
        agent?: { [agent_id: string]: number };
     };
     // other fields ignored
  };
  rate_limit_ledger: {
     [connector_id: string]: Array<{
        window_start: number;
        window_end: number;
        usage: number;
     }>;
  };
  connector_profiles: {
     [connector_id: string]: {
        max_rate_per_window: number;
        window_size_ms: number;
     };
  };
  tenant_context: {
     [tenant_id: string]: {
        hard_cap_usage: number;
     };
  };
  agent_context: {
     [agent_id: string]: {
        priority: number;
     };
  };
  knowledge_maps: {
     rate_limits: {
        risk_thresholds: {
           low: number;
           medium: number;
           high: number;
           critical: number;
        };
        decay_curves: {
           [connector_type: string]: number; // scaling factor/default
        };
        forecast_horizon: number;             // integer >= 1
        future_window_decay_base: number;     // float (0, 1]
        confidence_decay_base: number;        // float (0, 1]
        agent_default_ceiling: number;        // number > 0
     };
  };
  tenant_connector_map?: {
     [tenant_id: string]: string[]; // List of connector IDs
  };
}
```

### 3.2 Output Contract
```typescript
interface Phase73Output {
  execution_id: string;
  phase: "73";
  feature_flags: {
    FF_LONG_HORIZON_RATE_LIMIT_FORECASTER: boolean;
  };
  rate_limit_forecast: {
    projected_connector_ceiling: { [connector_id: string]: number };
    projected_agent_ceiling: { [agent_id: string]: number };
    projected_tenant_ceiling: { [tenant_id: string]: number };
    future_windows: Array<{
        window_index: number;
        predicted_units: number;
        confidence_score: number;
    }>;
    risk_classification: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
  passthrough: {
    arbitration_output: any; // Preserved from input
  };
}
```

## 4. Logic & Rules

### 4.1 Forecasting
- **Algorithm**: Weighted Moving Average (WMA) on the last N windows from `rate_limit_ledger`.
- **Adjustment**: Apply connector-specific decay/growth curves from `knowledge_maps`.
- **Horizon**: Predict `knowledge_maps.rate_limits.forecast_horizon` windows.
- **Decay**: Use `future_window_decay_base` and `confidence_decay_base` from knowledge map. No hardcoded constants.

### 4.2 Ceiling Calculation
`new_ceiling = max(0, base_ceiling - projected_consumption + arbitration_offset)`

- **Arbitration Offsets**: Extracted from `arbitration_output.rate_limit_offsets`.
- **Agent Ceilings**: Use `knowledge_maps.rate_limits.agent_default_ceiling`.
- **Tenant Ceilings**:
  - If `tenant_connector_map` provided: `hard_cap - sum(projected_usage_of_mapped_connectors)`.
  - Otherwise: `hard_cap`.
  - Clamped to 0.

### 4.3 Risk Classification
Based on `projected_consumption / hard_cap` using `knowledge_maps.rate_limits.risk_thresholds`.

## 5. Forward Hardening & Observability
- **Strict Validation**: Specific error messages for missing fields and forbidden types (function, symbol, bigint, Date, `_debug`).
- **Observability**: Metrics (`phase_73_invocations`, `phase_73_max_ratio`, `phase_73_forecast_window_count`), Logs, and Tracing.
- **Determinism**: Logic is purely deterministic and replay-safe.


## 6. Testing
- **18 Tests Total**:
  - 6 Happy Path
  - 6 Negative Path
  - 4 Edge Cases
  - 1 Regression Guard (100 iterations)
  - 1 Determinism Guard (Hash check)
