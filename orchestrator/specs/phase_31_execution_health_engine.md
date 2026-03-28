# Phase 31 Spec: Execution Health Score Engine

## 0. Objective
Create a deterministic Execution Health Score Engine that consumes Phase 30 outputs and produces a scalar health score, health category, and tagged diagnostics for a single execution.

## 1. Files
- `orchestrator/modules/execution_health_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_health_engine.test.js` (new)

## 2. Contracts

### 2.1 Input Envelope
- **Intent**: `EXECUTION_HEALTH_SCORE_V1`
- **Module**: `execution_incident_engine` (Phase 30)
- **Payload**: `ExecutionIncidentReportV1`

### 2.2 Input Contract V1
```typescript
type ExecutionIncidentReportV1 = {
  execution_id: string;
  incident_summary: {
    severity_score: number; // 0.0 - 1.0
    severity_level: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    incident_tags: string[];
    counts: {
      total_incidents: number;
      validation_errors: number;
      policy_blocks: number;
      readiness_failures: number;
      connector_failures: number;
      drift_events: number;
    };
  };
  drift_report?: {
    drift_score: number; // 0.0 - 1.0
    drift_tags: string[];
    counts: {
      total_drifts: number;
    };
  } | null;
  policy_findings?: {
    policy_burden_score: number; // 0.0 - 1.0
    policy_tags: string[];
  } | null;
  connector_findings?: {
    connector_flake_score: number; // 0.0 - 1.0
    connector_tags: string[];
    failure_rate?: number; // 0.0 - 1.0
  } | null;
  health_scoring_config?: HealthScoringConfigV1 | null;
};
```

### 2.3 Output Envelope
- **Module**: `execution_health_engine`
- **Payload**: `ExecutionHealthReportV1`

### 2.4 Output Contract V1
```typescript
type ExecutionHealthReportV1 = {
  execution_id: string;
  health_score: number; // 0-100
  health_category: "GOOD" | "WARN" | "CRITICAL";
  health_tags: string[];
  dimensions: {
    stability: { score: number; weight: number; tags: string[] };
    policy: { score: number; weight: number; tags: string[] };
    budget: { score: number; weight: number; tags: string[] };
    connectors: { score: number; weight: number; tags: string[] };
    drift: { score: number; weight: number; tags: string[] };
  };
  metrics: {
    incident_severity_score: number;
    drift_score: number;
    policy_burden_score: number;
    connector_flake_score: number;
    connector_failure_rate: number;
    total_incidents: number;
    total_drifts: number;
  };
  source: {
    incident_module: string;
    incident_contract_version: string;
    health_contract_version: "ExecutionHealthReportV1";
    scoring_config_version: string;
  };
};
```

## 3. Configuration (`HealthScoringConfigV1`)
```typescript
type HealthScoringConfigV1 = {
  version: string;
  dimension_weights: {
    stability: number;
    policy: number;
    budget: number;
    connectors: number;
    drift: number;
  };
  category_thresholds: {
    good_min: number;
    warn_min: number;
    critical_min: number;
  };
  penalties: {
    stability: { max_penalty: number };
    policy: { max_penalty: number };
    budget: { max_penalty: number };
    connectors: { max_penalty: number };
    drift: { max_penalty: number };
  };
  tag_dimension_overrides?: {
    [tag: string]: {
      dimension: string;
      severity: number;
    };
  };
};
```

## 4. Logic
- **Metric Extraction**: Clamp inputs 0-1.
- **Dimension Scoring**: `100 - (metric * penalty)`.
- **Aggregation**: Weighted sum.
- **Categorization**: Threshold based.
- **Tagging**: Derived from inputs + internal logic (e.g., `HEALTH_CONFIG_MISSING`).

## 5. Observability
- Metrics: `execution_health_score`, `execution_health_category`.
- Logs: Structured event.
- Traces: `EXECUTION_HEALTH_SCORE_V1`.
