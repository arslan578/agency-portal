# Phase 60: Agent Execution Plan Adapter Spec

Contract name: `agent_execution_plan_adapter_v1`
Phase: "60"
Feature flag: `FF_AGENT_EXECUTION_PLAN_ADAPTER` (env based, off by default)
Mode: Pure logic, no IO, fully deterministic and replayable

## 1.1 Purpose

Phase 60 is the agent-facing adapter at the top of the Safety Layer (58–60).

It receives:
*   A raw agent request that describes what the agent wants to do.
*   A safety and policy constrained state from Phases 58 and 59.
*   Capability and rate limit snapshots for the current tenant and workspace.

It produces:
*   A sanitized, policy and safety constrained execution plan that Kaivo can execute.
*   Or a structured, deterministic rejection with machine readable reasons and an agent safe explanation.

This phase never calls external systems. It consumes snapshots from:
*   Safety Horizon Evaluator (Phase 58).
*   Optimizer Safety Guard (Phase 59).
*   Policy Mirror, Capability Index, Rate Limits, Connector Backplane.

It is the “agent native OS interface” for Kaivo, while remaining fully aligned with the Forward Hardening Framework.

## 1.2 Inputs (input_contract_v1)

Phase 60 accepts a single input object:

```json
{
  "execution_id": "exec_123",
  "phase": "60",
  "feature_flags": {
    "FF_AGENT_EXECUTION_PLAN_ADAPTER": true
  },
  "context": {
    "tenant_id": "tenant_1",
    "workspace_id": "ws_1",
    "brand_id": "brand_1",
    "trace_domain": "agent_api.v1",
    "locale": "en-US",
    "timezone": "America/Los_Angeles",
    "request_source": "chatgpt_plugin" 
  },
  "agent_request": {
    "agent_id": "agent_abc",
    "agent_session_id": "sess_123",
    "agent_version": "1.2.0",
    "intent_type": "CREATE_OR_UPDATE_CAMPAIGN",
    "raw_instructions": "Spend $5k this month on YouTube and TikTok to drive website signups.",
    "requested_actions": [
      {
        "action_id": "a1",
        "venue": "YOUTUBE",
        "objective": "CONVERSIONS",
        "budget": {
          "currency": "USD",
          "amount": 5000
        },
        "time_window": {
          "start": "2025-01-01T00:00:00Z",
          "end": "2025-01-31T23:59:59Z"
        },
        "constraints": {
          "max_cpm": 15.0,
          "target_country_codes": ["US"],
          "max_daily_spend": 300
        }
      }
    ],
    "client_hints": {
      "creative_assets_present": true,
      "first_party_tracking_ready": false
    }
  },
  "safety_snapshot": {
    "safety_zone": {
      "max_parallel_connectors": 4,
      "max_budget_per_venue": {
        "YOUTUBE": 10000,
        "META": 8000
      }
    },
    "forbidden_actions": [
      {
        "reason_code": "CONNECTOR_SUSPENDED",
        "venue": "TIKTOK",
        "connector_id": "conn_tiktok_1"
      }
    ],
    "redundancy_profile": {
      "required_redundant_paths": ["YOUTUBE", "META"]
    },
    "safe_execution_horizon": {
      "max_run_hours": 720
    },
    "risk_ledger": [
      {
        "code": "RECENT_OUTAGE",
        "venue": "META",
        "severity": "MEDIUM"
      }
    ]
  },
  "optimizer_guard_snapshot": {
    "optimizer_plan": {
      "plan_id": "opt_plan_123",
      "allowed_connectors": ["conn_youtube_1", "conn_meta_1"],
      "venue_budgets": {
        "YOUTUBE": 5000,
        "META": 0
      },
      "constraints_applied": [
        "BUDGET_POLICY_ENFORCED",
        "REDUNDANCY_OPTION_AVAILABLE"
      ]
    }
  },
  "policy_snapshot": {
    "policy_version": "pol_v5",
    "ruleset_id": "rs_2025_01",
    "hard_blocks": [
      {
        "code": "DISALLOWED_VENUE",
        "venue": "TIKTOK",
        "reason": "TENANT_POLICY"
      }
    ],
    "soft_limits": [
      {
        "code": "MAX_CAMPAIGN_BUDGET",
        "value": 20000,
        "currency": "USD"
      }
    ]
  },
  "capability_index_snapshot": {
    "connectors": {
      "conn_youtube_1": {
        "venue": "YOUTUBE",
        "capabilities": {
          "supports_conversions": true,
          "supports_frequency_capping": true
        },
        "status": "HEALTHY"
      },
      "conn_meta_1": {
        "venue": "META",
        "capabilities": {
          "supports_conversions": true
        },
        "status": "DEGRADED"
      }
    }
  },
  "rate_limit_snapshot": {
    "tenant_bucket": {
      "remaining_requests": 90,
      "reset_at": "2025-01-02T00:00:00Z"
    },
    "agent_bucket": {
      "remaining_requests": 10,
      "reset_at": "2025-01-01T12:00:00Z"
    },
    "per_venue_budgets": {
      "YOUTUBE": {
        "remaining_monthly_spend": 15000,
        "currency": "USD"
      }
    }
  }
}
```

### 1.2.1 Required fields
At the top level:
*   `execution_id` (string, non empty).
*   `phase` (string, must equal "60").
*   `feature_flags` (object).
*   `context` (object with tenant_id, trace_domain).
*   `agent_request` (object with agent_id, intent_type, raw_instructions).
*   `safety_snapshot` (object).
*   `policy_snapshot` (object).
*   `capability_index_snapshot` (object).
*   `rate_limit_snapshot` (object).

`optimizer_guard_snapshot` is required for execution adaptation, but may be an empty object with `optimizer_plan: null` when this phase is invoked for “preflight only”.

### 1.2.2 Forbidden fields
Top level:
*   `direct_connector_calls`
*   `raw_credentials`
*   `pii_payload`
*   `sidecar_io`

Any presence of these fields must cause an `INVALID_REQUEST` error.

## 1.3 Outputs (output_contract_v1)

Phase 60 returns:

```json
{
  "execution_id": "exec_123",
  "phase": "60",
  "feature_flags": {
    "FF_AGENT_EXECUTION_PLAN_ADAPTER": true
  },
  "ok": true,
  "status": "ADAPTED",
  "adapter_decision": {
    "decision_code": "PLAN_ACCEPTED",
    "reasons": [
      "REQUEST_WITHIN_POLICY",
      "REQUEST_WITHIN_SAFETY_ZONE",
      "REQUEST_WITHIN_RATE_LIMITS"
    ]
  },
  "agent_request_projection": {
    "intent_type": "CREATE_OR_UPDATE_CAMPAIGN",
    "normalized_objectives": {
      "reach": 0.4,
      "conversions": 0.5,
      "value": 0.1
    },
    "requested_budget": {
      "currency": "USD",
      "amount": 5000
    },
    "requested_venues": ["YOUTUBE"]
  },
  "adapted_execution_plan": {
    "plan_id": "agent_exec_123",
    "source": "AGENT_REQUEST",
    "trace_domain": "agent_api.v1",
    "actions": [
      {
        "action_id": "a1_youtube",
        "connector_id": "conn_youtube_1",
        "venue": "YOUTUBE",
        "objective": "CONVERSIONS",
        "budget": {
          "currency": "USD",
          "amount": 5000
        },
        "time_window": {
          "start": "2025-01-01T00:00:00Z",
          "end": "2025-01-31T23:59:59Z"
        },
        "constraints": {
          "max_cpm": 15.0,
          "target_country_codes": ["US"],
          "max_daily_spend": 300
        },
        "safety_tags": [
          "WITHIN_SAFETY_ZONE",
          "NOT_FORBIDDEN"
        ],
        "policy_tags": [
          "VENUE_ALLOWED",
          "BUDGET_UNDER_HARD_LIMIT"
        ]
      }
    ],
    "safety_binding": {
      "safety_zone_id": "hz_123",
      "forbidden_actions_applied": ["DROP_TIKTOK"],
      "max_parallel_connectors": 4
    },
    "policy_binding": {
      "policy_version": "pol_v5",
      "ruleset_id": "rs_2025_01"
    },
    "rate_limit_binding": {
      "tenant_bucket_consumed": 1,
      "agent_bucket_consumed": 1
    }
  },
  "rejections": [],
  "agent_safe_response": {
    "message_type": "EXECUTION_PLAN_ACCEPTED",
    "summary": "Your plan will run on YouTube only. TikTok is unavailable for this account.",
    "details": {
      "accepted_venues": ["YOUTUBE"],
      "dropped_venues": [
        {
          "venue": "TIKTOK",
          "reason_code": "DISALLOWED_VENUE"
        }
      ]
    }
  },
  "observability": {
    "log_event_type": "PHASE_60_AGENT_ADAPTER",
    "trace_span_name": "phase_60_agent_execution_plan_adapter",
    "metrics": {
      "adapted_plans": 1,
      "rejected_plans": 0,
      "forbidden_actions_removed": 1
    }
  }
}
```

When the plan cannot be adapted, `ok` is false, `status` is one of the error states, `adapted_execution_plan` is null, and `agent_safe_response` explains what the agent should change.

### 1.3.1 Status codes
*   `"ADAPTED"`
    Plan adapted to a safe execution plan.
*   `"FEATURE_DISABLED"`
    Feature flag is off. Phase returns a pass through response:
    ```json
    { "ok": false, "status": "FEATURE_DISABLED" }
    ```
*   `"INVALID_REQUEST"`
    Missing required fields, forbidden fields present, or malformed shapes.
*   `"POLICY_BLOCKED"`
    Request violates a hard policy rule in `policy_snapshot`.
*   `"SAFETY_BLOCKED"`
    Request tries to use forbidden actions, venues, or exceeds the safety zone.
*   `"RATE_LIMIT_BLOCKED"`
    Plan would exceed rate limit or spend bucket constraints.
*   `"CAPABILITY_BLOCKED"`
    Requested actions cannot be mapped to any healthy connector.

Only one terminal status is allowed per output. When several conditions exist, precedence is:

`POLICY_BLOCKED` > `SAFETY_BLOCKED` > `RATE_LIMIT_BLOCKED` > `CAPABILITY_BLOCKED` > `INVALID_REQUEST` > `FEATURE_DISABLED`.

## 1.4 Invariants
1.  No action in `adapted_execution_plan.actions` may reference a connector that is not present and status: "HEALTHY" or "DEGRADED" in `capability_index_snapshot`.
2.  No action may target a venue that appears in `safety_snapshot.forbidden_actions` or `policy_snapshot.hard_blocks`.
3.  Sum of `adapted_execution_plan.actions[*].budget.amount` per venue must not exceed:
    *   `safety_snapshot.safety_zone.max_budget_per_venue[venue]` when present.
    *   `rate_limit_snapshot.per_venue_budgets[venue].remaining_monthly_spend`.
    *   Any relevant `policy_snapshot.soft_limits` with budget semantics.
4.  Outputs are deterministic for the same input, including ordering:
    *   `adapted_execution_plan.actions` sorted lexicographically by `action_id`.
    *   `rejections` sorted by code then field.
    *   `agent_safe_response.details.accepted_venues` sorted ascending.
5.  The phase never introduces a new venue that did not appear in either:
    *   `agent_request.requested_actions[].venue`, or
    *   `optimizer_guard_snapshot.optimizer_plan.venue_budgets` keys.
6.  The phase never mutates the input object. Internal logic must work on deep clones.
7.  All outputs include the original `execution_id`, phase: "60", and `feature_flags`.

## 1.5 Feature flag behavior
*   Environment variable: `FF_AGENT_EXECUTION_PLAN_ADAPTER`
*   Effective boolean:
    ```javascript
    const FF_AGENT_EXECUTION_PLAN_ADAPTER =
      process.env.FF_AGENT_EXECUTION_PLAN_ADAPTER === 'true';
    ```
*   When the flag is false or unset, the phase returns:
    ```json
    {
      "execution_id": "...",
      "phase": "60",
      "feature_flags": { "FF_AGENT_EXECUTION_PLAN_ADAPTER": false },
      "ok": false,
      "status": "FEATURE_DISABLED",
      "adapter_decision": {
        "decision_code": "FEATURE_DISABLED",
        "reasons": ["FLAG_OFF"]
      }
    }
    ```
    No other processing occurs in that case.

## 1.6 Observability

Following the Forward Hardening requirements:
*   Emit a structured log with:
    *   `execution_id`
    *   `tenant_id`, `workspace_id`, `brand_id`
    *   `agent_id`, `agent_session_id`
    *   `status`, `adapter_decision.decision_code`
    *   counts of accepted and rejected actions
    *   any active safety or policy bindings
*   Emit standard metrics:
    *   `phase_60_plans_adapted` (counter)
    *   `phase_60_plans_rejected` (counter, labeled by status)
    *   `phase_60_forbidden_actions_removed` (counter)
    *   `phase_60_rate_limit_blocked` (counter)
*   Start a trace span named `phase_60_agent_execution_plan_adapter` with tags:
    *   `execution_id`
    *   `tenant_id`, `workspace_id`
    *   `agent_id`
    *   `status`

The observability module must use the shared logging, metrics, and tracing utilities already used by Phases 56–59.
