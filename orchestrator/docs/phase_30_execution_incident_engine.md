# Phase 30: Execution Incident & Drift Engine (Strict Hardened)

## Objective

Pure-logic incident analyst consuming Phase 28 snapshots (and optional Phase 29 replay results) to produce incident summaries, timelines, drift metrics, and training views for Kaivo Intelligence.

**Governing Standard**: Kaivo Forward-Hardening Framework

## Position in the System

After Phases 28-29 create snapshots and replay plans, Phase 30:
- Analyzes execution history across iterations
- Detects incidents (validation, policy, connector, readiness)
- Computes drift vectors between iterations
- Generates human-readable summaries
- Creates ML training data

## Files

- **Module**: `orchestrator/modules/execution_incident_engine.js`
- **Tests**: `orchestrator/tests/execution_incident_engine.test.js`
- **Dispatcher**: Updated to route `EXECUTION_INCIDENT_V1` intent
- **Feature Flag**: `FF_EXECUTION_INCIDENT_V1`

## Input Contract: ExecutionIncidentRequestV1

Strictly validated. Any violation returns `INVALID_INPUT`.

```typescript
type ExecutionIncidentRequestV1 = {
  execution_id: string; // Required, non-empty
  snapshots: ExecutionSnapshotV1[]; // Required, non-empty array
  replay_results?: ExecutionReplayResultV1[]; // Optional array
  config?: {
    incident_rules_v1?: {
      drift_thresholds?: {
        max_budget_rel_delta?: number;      // Default: 0.15
        max_venue_share_rel_delta?: number; // Default: 0.10
        max_readiness_level_delta?: number; // Default: 1
      };
      severity_rules?: {
        high_budget_drift_multiplier?: number; // Default: 0.5
        low_budget_drift_floor?: number;       // Default: 0.01
      };
      cause_map?: Record<string, string>; // EventKind -> CauseCode
      status_severity_map?: Record<string, string>; // RunStatus -> Severity
      max_timeline_events?: number; // Default: 100
    };
    outcome_classifier_v1?: {
      rules: Array<{
        outcome: string;
        condition: {
          has_incident?: boolean;
          final_status?: string[];
        };
      }>;
      default_outcome: string;
    };
  };
};
```

## Output Contract: ExecutionIncidentReportV1

Guaranteed shape. No missing fields (nulls used where applicable).

```typescript
type ExecutionIncidentReportV1 = {
  execution_id: string;
  
  incident_summary: {
    has_incident: boolean;
    severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    primary_cause_codes: string[]; // Sorted, unique
    first_failure_iteration?: number;
    last_recovery_iteration?: number;
    iteration_count: number;
  };
  
  timeline: IncidentEventV1[];
  
  drift_report: {
    baseline_iteration: number;
    iterations: IterationSummaryV1[];
    drift_vectors: DriftVectorV1[];
  };
  
  training_view: {
    features: ExecutionIncidentFeaturesV1;
    label: ExecutionIncidentLabelV1;
  };
};
```

## Hardening Invariants

1.  **Zero Hardcoded Knowledge**: All thresholds, mappings, and rules are derived from `DEFAULT_CONFIG` or input config.
2.  **Deterministic Grammar**:
    *   Snapshots sorted by `(iteration_index, created_at)`.
    *   Event IDs generated via stable string template.
    *   Cause codes sorted alphabetically.
    *   Venue keys sorted in drift vectors.
3.  **Null-Safe Math**: Drift computation handles missing stats gracefully (returns `UNKNOWN` severity if thresholds exist but data missing).
4.  **Immutability**: Input is deep-cloned upon entry.
5.  **Observability**: Metrics, logs, and traces emitted for every execution.

## Incident Detection Grammar

| Event Kind | Trigger Condition | Severity |
| :--- | :--- | :--- |
| `VALIDATION` | `validation_error_count > 0` (new or increased) | `ERROR` |
| `POLICY` | `policy_error_count > 0` (increased) | `ERROR` |
| `READINESS` | `readiness_status` changed | `WARNING` if blocked, else `INFO` |
| `CONNECTOR` | Responses disappeared | `ERROR` |
| `CORRECTIVE_ACTION` | Actions applied (increased) | `INFO` |
| `STATUS_TRANSITION` | `run_status` changed | `ERROR` if FAILED, else `INFO` |
| `SYSTEM` | `is_incomplete` (missing fields) | `INFO` |

## Drift Severity Rules (Configurable)

| Severity | Condition |
| :--- | :--- |
| `HIGH` | `budget_drift > max_threshold` (0.15) |
| `MEDIUM` | `budget_drift > max_threshold * 0.5` |
| `LOW` | `budget_drift > 1%` OR readiness changed OR connector flip |
| `NONE` | No significant change |
| `UNKNOWN` | Thresholds present but stats missing |

## Outcome Classifier Rules (Configurable)

1.  **SUCCESS**: No incident + (SUCCESS or COMPLETED)
2.  **RECOVERED**: Incident + (SUCCESS or COMPLETED)
3.  **FAILED**: Incident + FAILED
4.  **PARTIAL**: PARTIAL status
5.  **UNKNOWN**: Default fallback

## Timeline Capping

If events > `max_timeline_events` (100):
1.  Keep first `N/2` events.
2.  Keep last `N/2` events.
3.  Insert synthetic `TIMELINE_TRUNCATED` event in the middle.

## Backward Compatibility

*   **Phase 28/29 Snapshots**: Fully supported.
*   **Missing Fields**: Gracefully handled via null-safe extraction.
*   **Incomplete Snapshots**: Emits `INCOMPLETE_SNAPSHOT` event but continues analysis.

## Test Coverage

**20 Tests (Hardened Bundle)**:
*   6 Happy Paths (Success, Recovery, Failure, Connector, Action, Drift)
*   6 Negative Paths (Validation, Empty, Mismatch, Duplicates, Invalid, Flag)
*   4 Edge Cases (Single, Truncation, No Stats, Empty Replay)
*   1 Regression Guard (Fixture)
*   1 Determinism Guard (Sort stability)
*   2 Hardening Tests (Missing stats -> UNKNOWN, Mixed severity -> HIGH)

Run tests:
```bash
node orchestrator/tests/execution_incident_engine.test.js
```
