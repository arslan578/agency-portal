# Phase 59: Optimizer Safety Guard – Specification

## 1. Purpose and Role

**Phase 59: Optimizer Safety Guard** is a pure logic planning phase within the Safety Layer of Kaivo OS. It sits between:
- **Phase 58**: Safety Horizon Evaluator (computes safety limits)
- **Phase 59**: Optimizer Safety Guard (applies safety limits)
- **Phases 39/41**: Multi-round optimizer and budget

 adjustment engines (generate optimization plans)

**Core Question**: Given an optimization plan from the multi-round optimizer and the current global safety horizon, which optimization steps are safe, which must be clamped, and which must be blocked?

**Constraints**:
- **Pure logic**: No HTTP calls, database access, filesystem operations, or connector calls
- **Deterministic**: Identical input yields identical output
- **No policy invention**: All safety rules derive from `safety_horizon` and `connector_state`

---

## 2. Input Contract

### Contract Name
`optimizer_safety_guard_input_v1`

### Required Fields

```json
{
  "execution_id": "exec_123",
  "phase": "59",
  "feature_flags": {
    "FF_OPTIMIZER_SAFETY_GUARD": true
  },
  "context": {
    "tenant_id": "tenant_abc",
    "workspace_id": "workspace_xyz",
    "brand_id": "brand_123",
    "trace_domain": "string",
    "policy_version": "policy_vX"
  },
  "optimizer_plan": {
    "plan_contract_version": "multi_round_optimizer_plan_v1",
    "plan_id": "plan_001",
    "source_phase": "39",
    "steps": [
      {
        "step_id": "step_1",
        "connector_id": "meta_ads",
        "action_type": "BUDGET_REALLOCATE",
        "budget_delta": 250.0,
        "time_window": {
          "start": "2025-12-04T00:00:00Z",
          "end": "2025-12-05T00:00:00Z"
        },
        "tags": ["scale_up", "test_variant_A"],
        "metadata": {
          "objective_id": "obj_1",
          "round_index": 0
        }
      }
    ],
    "metadata": {
      "optimizer_run_id": "opt_run_123",
      "created_at": "2025-12-04T00:00:00Z"
    }
  },
  "budget_adjustments": {
    "contract_version": "budget_adjustment_plan_v1",
    "source_phase": "41",
    "entries": [
      {
        "entry_id": "entry_1",
        "connector_id": "meta_ads",
        "budget_delta": 250.0,
        "reason": "shift_from_underperforming_venue"
      }
    ]
  },
  "connector_state": {
    "contract_version": "global_connector_state_v1",
    "source_phase": "57",
    "connectors": {
      "meta_ads": {
        "health": "HEALTHY",
        "status": "READY",
        "capabilities": {
          "max_daily_spend": 5000.0,
          "max_parallel_campaigns": 50
        },
        "drift_markers": [],
        "retry_history": {
          "exhausted": false
        }
      }
    }
  },
  "safety_horizon": {
    "contract_version": "safety_horizon_v1",
    "source_phase": "58",
    "safety_zone": {
      "overall_risk_level": "LOW",
      "allowed_risk_bands": ["LOW", "MEDIUM"]
    },
    "safe_execution_horizon": {
      "max_budget_delta_total": 10000.0,
      "max_budget_delta_per_connector": 3000.0,
      "max_parallel_connectors": 5,
      "max_steps_per_plan": 100
    },
    "forbidden_actions": [
      {
        "connector_id": "tiktok_ads",
        "blocked_action_types": ["BUDGET_REALLOCATE", "NEW_CAMPAIGN"],
        "risk_level": "HIGH",
        "reasons": ["RECENT_HARD_FAIL", "POLICY_BLOCK"]
      }
    ],
    "redundancy_profile": {
      "connectors_with_redundancy": ["meta_ads", "google_ads"],
      "connectors_without_redundancy": ["tiktok_ads"]
    },
    "risk_ledger": [
      {
        "connector_id": "tiktok_ads",
        "risk_level": "HIGH",
        "reason": "RETRY_EXHAUSTED"
      }
    ]
  }
}
```

### Field Constraints
- **Required**: `execution_id`, `phase`, `feature_flags`, `context`, `optimizer_plan`, `connector_state`, `safety_horizon`
- **Optional**: `budget_adjustments`
- **Forbidden**: Unknown top-level fields → `INVALID_INPUT`

---

## 3. Output Contract

### Contract Name
`optimizer_safety_guard_output_v1`

### Schema

```json
{
  "execution_id": "exec_123",
  "phase": "59",
  "status": "OK",
  "feature_flag_enabled": true,
  "stop_reason": null,
  "input_contract_version": "optimizer_safety_guard_input_v1",
  "output_contract_version": "optimizer_safety_guard_output_v1",
  "optimizer_plan_original": {},
  "optimizer_plan_sanitized": {
    "plan_id": "plan_001",
    "steps": [],
    "metadata": {
      "optimizer_run_id": "opt_run_123",
      "created_at": "2025-12-04T00:00:00Z",
      "safety_guard_annotation": {
        "total_steps_input": 10,
        "total_steps_sanitized": 9,
        "total_steps_blocked": 1
      }
    }
  },
  "budget_adjustments_sanitized": {
    "entries": [],
    "summary": {
      "total_budget_delta_input": 10000.0,
      "total_budget_delta_after_guard": 9500.0
    }
  },
  "violations": [],
  "summary": {
    "status": "OK",
    "total_steps_input": 10,
    "total_steps_sanitized": 9,
    "total_steps_blocked": 1,
    "total_budget_delta_input": 10000.0,
    "total_budget_delta_after_guard": 9500.0,
    "has_safety_violations": true
  },
  "snapshot_overlay": {
    "contract_version": "optimizer_safety_snapshot_v1",
    "plan_id": "plan_001",
    "per_step_decisions": {
      "step_1": {
        "decision": "SAFE",
        "reason_codes": []
      }
    }
  },
  "error": null
}
```

### Status Values
- `OK`: Processing succeeded
- `FEATURE_DISABLED`: Feature flag off
- `INVALID_INPUT`: Contract violation
- `SAFETY_VIOLATION`: Safety limits exceeded
- `INTERNAL_ERROR`: Unexpected exception

### Stop Reason Values
- `null`: Status is `OK`
- `FEATURE_DISABLED`: Flag off
- `CONTRACT_VIOLATION`: Input errors
- `SAFETY_LIMIT_EXCEEDED`: Violations exist
- `UNEXPECTED_EXCEPTION`: Internal errors

### Invariants
1. When `status === "OK"` and `feature_flag_enabled === true`, every step in `optimizer_plan_sanitized.steps` respects `safety_horizon` constraints
2. Steps violating forbidden actions or exceeding limits are clamped or removed and mirrored in `violations`
3. Input objects never mutated; `optimizer_plan_original` is deep clone at entry
4. Deterministic ordering: `optimizer_plan_sanitized.steps` preserves original step order
5. When `FF_OPTIMIZER_SAFETY_GUARD === false`: status `FEATURE_DISABLED`, no violations, sanitized plan identical to original

---

## 4. Decision Logic

### 4.1 Feature Flag Check
- If `process.env.FF_OPTIMIZER_SAFETY_GUARD !== "true"`: Return pass-through with `FEATURE_DISABLED`

### 4.2 Input Validation
- Enforce required fields and type checks
- Unknown top-level fields → `INVALID_INPUT` with `CONTRACT_VIOLATION`

### 4.3 Step Classification
For each optimizer step, classify as:
- **SAFE**: Respects all limits
- **CLAMPED**: Adjusted to fit within limits
- **BLOCKED**: Cannot proceed

### 4.4 Forbidden Action Enforcement
- Any step matching `(connector_id, action_type)` in `forbidden_actions` → `BLOCKED`
- Create violation entry with original step and source rule reference

### 4.5 Horizon Limit Enforcement
- Respect:
  - `max_budget_delta_total`
  - `max_budget_delta_per_connector`
  - `max_parallel_connectors`
  - `max_steps_per_plan`
- Clamp `budget_delta` when possible
- Tag clamped steps with `safety_guard_decision: "CLAMPED"`
- Record in `snapshot_overlay`

### 4.6 Risk Ledger Integration
- For connectors in `risk_ledger` with `risk_level` outside `allowed_risk_bands`: Block or clamp according to safety zone
- Fully deterministic, no heuristics

### 4.7 Summary Fields
- Compute counts and totals from sanitized plan and violations

---

## 5. Observability

### 5.1 Metrics
```javascript
metrics.count('optimizer_safety.steps_total', value, tags);
metrics.count('optimizer_safety.steps_blocked', value, tags);
metrics.count('optimizer_safety.steps_clamped', value, tags);
metrics.count('optimizer_safety.violations_total', value, tags);
metrics.count('optimizer_safety.feature_disabled', value, tags);
```

**Tags**: `tenant_id`, `workspace_id`, `brand_id`, `policy_version`, `status`

### 5.2 Structured Log
```javascript
{
  "event_type": "optimizer_safety_guard_evaluated",
  "execution_id": "exec_123",
  "plan_id": "plan_001",
  "status": "OK",
  "counts": {
    "safe": 8,
    "clamped": 1,
    "blocked": 1
  },
  "violations_summary": []
}
```

### 5.3 Trace Span
- **Name**: `phase_59_optimizer_safety_guard`
- **Attributes**: `execution_id`, `tenant_id`, `workspace_id`, `plan_id`, `status`

---

## 6. Determinism and Replay

- **Bit-identical output** for identical input
- **Idempotent**: Pure function of input and environment flag
- **No hidden state**: All decisions derive from input metadata
- **Schema evolution**: Explicit version fields for future compatibility

---

## 7. Forward-Hardening Compliance

✅ **Deterministic contracts**: Explicit input/output schemas  
✅ **Idempotent behavior**: No side effects  
✅ **Explicit observability**: Metrics, logs, traces  
✅ **Versioned schemas**: Room for future evolution  
✅ **No hardcoded policy**: All limits from `safety_horizon`
