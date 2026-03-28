# Phase 74 Spec: Cost/Spend Predictive Model Writer

**Phase ID:** 74  
**Name:** Cost/Spend Predictive Model Writer  
**Layer:** Formal Execution Model Layer (70–74)  
**Role:** Deterministic cost expectation engine for downstream billing and finance systems.  
**Contract name:** `cost_spend_predictive_model_writer_v1`

## 1. Purpose

Phase 74 takes the long-horizon rate limit forecast from Phase 73 plus explicit pricing and rate plan inputs, then produces a deterministic cost expectation model for the entire execution horizon.

It does not perform any billing, account mutation, or IO. It only writes expectations:
- Expected media spend
- Expected platform or service fees
- Expected total spend, by connector and in aggregate
- Time bucketed burn profiles suitable for billing and finance reconciliation

All pricing logic comes from versioned inputs, not from hardcoded values inside this phase.

## 2. Position in the pipeline

- **Upstream:**
    - Phase 71: Agent-Time Execution Scheduler
    - Phase 72: Multi-Agent Conflict Arbitration Layer
    - Phase 73: Long-Horizon Rate Limit Forecaster (projects future consumption ceilings)
- **This phase:**
    - Consumes rate limit forecasts and pricing models
    - Produces a deterministic spend expectation snapshot
- **Downstream:**
    - Phase 75: Deterministic Replay Engine uses this model as a target when reconstructing execution and validating spend behavior.
    - Later billing and finance services (outside the orchestrator) consume this model to drive invoices, accruals, revenue recognition, and anomaly detection.

## 3. Contracts

Forward-Hardening rules apply: explicit `input_contract_vX`, `output_contract_vX`, required fields, forbidden fields, stable shapes, no unversioned shape drift.

### 3.1 Input contract (`input_contract_v1`)

```json
{
  "execution_id": "exec_123",
  "phase": "74",
  "feature_flags": {
    "FF_COST_SPEND_PREDICTIVE_MODEL_WRITER": true
  },
  "tenant_context": {
    "tenant_id": "tenant_a",
    "currency": "USD",
    "billing_region": "NA",
    "rate_plan_id": "tier_2_growth_v3",
    "custom_pricing_overrides": {
      "connector_overrides": {},
      "global_adjustments": {}
    }
  },
  "rate_limit_forecast": {
    "forecast_horizon": {
      "start_iso": "2025-01-01T00:00:00Z",
      "end_iso": "2025-01-31T23:59:59Z",
      "granularity": "DAY"
    },
    "per_connector": {
      "meta_ads": {
        "units": "IMPRESSIONS",
        "forecast_buckets": [
          {
            "bucket_start_iso": "2025-01-01T00:00:00Z",
            "bucket_end_iso": "2025-01-01T23:59:59Z",
            "max_impressions": 120000
          }
        ]
      }
    },
    "forecast_version": "rate_limit_forecast_v1"
  },
  "pricing_model": {
    "pricing_model_id": "pm_kaivo_std_v5",
    "version": "5",
    "currency": "USD",
    "effective_from_iso": "2024-12-01T00:00:00Z",
    "component_definitions": {
      "media_spend": {
        "basis": "CPM",
        "per_connector": {
          "meta_ads": {
            "unit_price": 6.12,
            "unit_type": "CPM"
          }
        }
      },
      "platform_fee": {
        "basis": "PERCENT_OF_MEDIA",
        "default_rate_percent": 33.0
      },
      "fixed_monthly_fees": [
        {
          "charge_code": "platform_subscription",
          "amount": 99.0,
          "applies_to_rate_plans": ["tier_1", "tier_2"]
        }
      ]
    }
  },
  "historical_spend_snapshot": {
    "reference_period": {
      "start_iso": "2024-12-01T00:00:00Z",
      "end_iso": "2024-12-31T23:59:59Z"
    },
    "actual_media_spend": 12000.0,
    "actual_platform_fees": 4000.0,
    "variance_annotations": []
  },
  "policy_adjustments": {
    "credits": [
      {
        "credit_code": "promo_new_tenant",
        "amount": 200.0,
        "currency": "USD",
        "applied_scope": "TOTAL"
      }
    ],
    "surcharges": [],
    "constraints": {
      "max_total_spend": 25000.0,
      "max_daily_spend": 2000.0
    }
  },
  "metadata": {
    "input_contract_version": "input_contract_v1"
  }
}
```

**Required fields:**
- `execution_id` (non empty string)
- `phase` (string "74")
- `feature_flags` (object containing `FF_COST_SPEND_PREDICTIVE_MODEL_WRITER`)
- `tenant_context.tenant_id`
- `tenant_context.currency`
- `rate_limit_forecast` (must contain `forecast_horizon` and `per_connector`)
- `pricing_model.pricing_model_id`
- `pricing_model.version`
- `pricing_model.currency`
- `pricing_model.component_definitions`

**Optional fields:**
- `tenant_context.billing_region`
- `tenant_context.rate_plan_id`
- `tenant_context.custom_pricing_overrides`
- `historical_spend_snapshot`
- `policy_adjustments`
- `metadata`

**Forbidden fields:**
To preserve contract stability and avoid hidden coupling:
- Any top level `_debug`, `debug_info`, or `internal_only` property
- Any `Date` instances; timestamps must be ISO 8601 strings
- Any functions, symbols, bigint values anywhere in the input
- Direct connector credentials, secrets, or PII

If such fields appear, the phase returns a validation error instead of attempting recovery.

### 3.2 Output contract (`output_contract_v1`)

```json
{
  "execution_id": "exec_123",
  "phase": "74",
  "feature_flags": {
    "FF_COST_SPEND_PREDICTIVE_MODEL_WRITER": true
  },
  "status": "OK",
  "cost_expectation_model": {
    "model_version": "cost_expectation_v1",
    "currency": "USD",
    "assumptions": {
      "pricing_model_id": "pm_kaivo_std_v5",
      "pricing_model_version": "5",
      "rate_limit_forecast_version": "rate_limit_forecast_v1",
      "forecast_horizon": {
        "start_iso": "2025-01-01T00:00:00Z",
        "end_iso": "2025-01-31T23:59:59Z",
        "granularity": "DAY"
      },
      "safety_margin_factor": 1.0
    },
    "per_connector": {
      "meta_ads": {
        "connector_key": "meta_ads",
        "expected_impressions": 3100000,
        "expected_media_spend": 19068.0,
        "expected_platform_fees": 6292.4,
        "expected_fixed_fees": 99.0,
        "expected_total_spend": 25459.4,
        "time_buckets": [
          {
            "bucket_start_iso": "2025-01-01T00:00:00Z",
            "bucket_end_iso": "2025-01-01T23:59:59Z",
            "expected_impressions": 120000,
            "expected_media_spend": 734.4,
            "expected_platform_fees": 242.35,
            "expected_total_spend": 976.75
          }
        ]
      }
    },
### 4. Totals Aggregation
**Function**: `computeTotals(perConnectorResults, policy)`

**Logic**:
1.  Sum `expected_media_spend` from all connectors.
2.  Sum `expected_platform_fees` from all connectors.
3.  Sum `expected_fixed_fees` from all connectors (which includes allocated global fees).
4.  Sum `expected_impressions` from all connectors.
5.  Calculate `expected_total_spend` = media + platform + fixed.
6.  Apply `credits` from `policy.adjustments` (if any).
    *   Subtract from total spend (allow negative result? NO, keep total >= 0, or handle credits as payment method? Spec says "Credit Line Item").
    *   Actually, `expected_total_spend` usually reflects the cost *before* credits in some systems, but here we likely want the final billable.
    *   **CORRECTION**: Credits are a separate line item. `expected_credits` field in totals.
    *   `expected_total_spend` should be the sum of costs. Credits might be applied to the final invoice balance, but for the "Cost Expectation Model", we track them.
    *   `expected_total_spend` is the gross spend.
7.  Check `max_total_spend` constraint.
    *   `upper_bound_spend` = `max_total_spend` (if present) or `null`.
    *   `bounded_by_constraints` = true if total > upper_bound (and we clip? No, usually we clip *during* allocation or flag it. The prompt says "Clip computed spends at constraint thresholds").
    *   **CORRECTION**: If `max_daily_spend` exists, we clip at the bucket level. If `max_total_spend` exists, we clip the final total.
    *   `expected_total_spend` must not exceed `upper_bound_spend` if it exists.

**Output**:
```json
"totals": {
  "expected_impressions": 150000,
  "expected_media_spend": 500.00,
  "expected_platform_fees": 50.00,
  "expected_fixed_fees": 99.00,
  "expected_credits": 20.00,
  "expected_surcharges": 0.00,
  "expected_total_spend": 629.00,
  "upper_bound_spend": 1000.00,
  "bounded_by_constraints": false
}
```
  },
  "billing_projection": {
    "projection_version": "billing_projection_v1",
    "line_items": [
      {
        "line_item_id": "li_1",
        "tenant_id": "tenant_a",
        "connector_key": "meta_ads",
        "charge_type": "MEDIA",
        "amount": 19068.0,
        "currency": "USD",
        "period_start_iso": "2025-01-01T00:00:00Z",
        "period_end_iso": "2025-01-31T23:59:59Z",
        "pricing_model_id": "pm_kaivo_std_v5",
        "rate_plan_id": "tier_2_growth_v3",
        "reference_execution_id": "exec_123"
      }
    ]
  },
  "warnings": [
    {
      "code": "SPEND_CEILING_TRUNCATED",
      "message": "Expected total spend exceeds max_total_spend constraint; totals clipped to constraint.",
      "connector_key": null
    }
  ],
  "annotations": {
    "output_contract_version": "output_contract_v1"
  }
}
```

**Required output fields:**
- `execution_id` (echo from input)
- `phase` ("74")
- `status` ("OK" or "ERROR")
- `feature_flags` (echo, sanitized)
- `cost_expectation_model` when status equals "OK"
- `billing_projection` when status equals "OK"

**Error output:**
If validation or computation fails:
```json
{
  "execution_id": "exec_123",
  "phase": "74",
  "feature_flags": {
    "FF_COST_SPEND_PREDICTIVE_MODEL_WRITER": true
  },
  "status": "ERROR",
  "error": {
    "code": "INVALID_INPUT_CONTRACT",
    "message": "Missing required field tenant_context.currency",
    "details": {
      "missing_field": "tenant_context.currency"
    }
  }
}
```

Downstream phases must treat any "ERROR" status as a hard stop unless explicitly configured to handle degraded behavior.

## 4. Core behavior

High level algorithm, all pure logic:

1.  **Feature flag check**
    - If `FF_COST_SPEND_PREDICTIVE_MODEL_WRITER` is false or missing, return a no-op style pass through (status "OK", empty models).

2.  **Validation**
    - Validate contract fields (required, forbidden, types).
    - ISO timestamp format validation.
    - Validate `per_connector` keys and `pricing_model` components.

3.  **Derive effective pricing**
    - Combine `component_definitions`, `rate_plan_id`, `custom_pricing_overrides`, `policy_adjustments`.
    - Produce deterministic `effective_pricing_profile`.

4.  **Compute per connector expectations**
    - Convert forecasted units to media spend.
    - Apply platform fees (percent/fixed).
    - Apply constraints (`max_total_spend`, `max_daily_spend`) with documented clipping.
    - Record time bucket details.

5.  **Compute totals**
    - Sum per connector values (impressions, media, platform, fixed).
    - Apply credits and surcharges.
    - Compute `expected_total_spend`, `upper_bound_spend`.
    - Mark `bounded_by_constraints`.

6.  **Build billing projection**
    - Map to billing line items.
    -   **Fixed Fee Allocation**: Global fixed fees are allocated deterministically (round2) across all connectors. If 0 connectors, they appear in totals but per_connector is empty.
-   **Daily Clipping**: `max_daily_spend` clips forecast buckets *before* aggregation.
-   **Upper Bound**: `null` if no constraint exists.
-   **Credits**: separate line item, positive value, global scope.
    - Deterministically sort by `tenant_id`, `connector_key`, `charge_type`, `period_start_iso`.

7.  **Warnings and annotations**
    - Emit warnings for constraint clipping, missing historical snapshot, currency mismatches.

## 5. Invariants and guarantees

- Pure logic, no IO.
- No source of randomness.
- No new timestamps created; only existing ISO strings used.
- Input immutable.
- Identical inputs produce identical outputs (key sorting).

## 6. Error handling

Classes: `INVALID_INPUT_CONTRACT`, `UNSUPPORTED_PRICING_COMPONENT`, `INCONSISTENT_CURRENCY`, `CONSTRAINT_CONFLICT`.
All return status "ERROR" with structured details.

## 7. Observability

- **Metrics:** `phase_74_invocations_total`, `phase_74_errors_total`, `phase_74_expected_total_spend`, `phase_74_bounded_by_constraints_total`.
- **Log:** Single structured log per execution.
- **Tracing:** Span `phase_74_cost_spend_predictive_model_writer`.

## 8. Test outline

- 6 happy path tests
- 6 negative tests
- 4 edge case tests
- 1 regression guard
- 1 determinism guard
