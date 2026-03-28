# Phase 71: Agent-Time Execution Scheduler Specification

**Role:** Formal Execution Model Layer
**Contract Name:** `agent_time_execution_scheduler_v1`
**Mode:** Pure Logic (No IO, No Randomness, No Wall-Clock Time)
**Feature Flag:** `FF_AGENT_TIME_EXECUTION_SCHEDULER`

## 1. Overview
A deterministic time-scheduler that sequences agents in multi-tenant environments. It consumes a request queue and logical time window to produce a deterministic schedule of execution slots, enforcing fairness, priority, and rate limits.

## 2. Contracts

### 2.1 Input Contract (`input_contract_v1`)

```javascript
{
  "execution_id": "string (required, non-empty)",
  "phase": "71",
  "feature_flags": {
    "FF_AGENT_TIME_EXECUTION_SCHEDULER": true // Required true
  },
  "rate_limit_snapshot": "object (required)", // Top-level
  "tenant_context": {
    "tenant_id": {
      "priority": "integer (optional, default 1)",
      "weight": "number (optional, default 1.0)",
      "max_concurrent_agents": "integer (optional, default 1)",
      "max_slices_per_window": "integer (optional, default max_total_slices)",
      "rate_limits": {
        "per_minute": "integer (optional)",
        "per_hour": "integer (optional)"
      }
    }
  },
  "agent_queue": {
    "req_id": {
      "tenant_id": "string (required, must exist in tenant_context)",
      "agent_id": "string (required)",
      "requested_at": "string (ISO timestamp)",
      "deadline_at": "string (ISO timestamp, optional)",
      "priority": "integer (optional, default 1)",
      "requested_connectors": ["array of strings"],
      "estimated_cost_units": "number (optional, default 0)"
    }
  },
  "time_window": {
    "start_logical_time": "number (required)",
    "end_logical_time": "number (required, > start)",
    "slice_ms": "integer (required, > 0)"
  },
  "scheduler_config": {
    "fairness_mode": "WEIGHTED_ROUND_ROBIN | STRICT_PRIORITY",
    "max_slices_per_agent": "integer",
    "max_total_slices": "integer (required, > 0)",
    "max_slices_per_request": "integer"
  },
  "prior_schedule_state": { // Optional
    "tenant_slices": { "tenant_id": "integer" },
    "request_slices": { "req_id": "integer" }
  },
  "_debug": "object (optional)"
}
```

### 2.2 Output Contract (`output_contract_v1`)

```javascript
{
  "ok": "boolean",
  "status": "OK | FEATURE_DISABLED | VALIDATION_FAILED | NO_ELIGIBLE_AGENTS | NO_SLOTS_AVAILABLE",
  "execution_id": "string",
  "phase": "71",
  "feature_flags": { ... },
  "scheduler_version": "agent_time_execution_scheduler_v1",
  "time_window": {
    "start_logical_time": "number",
    "end_logical_time": "number",
    "slice_ms": "number",
    "total_slices": "number"
  },
  "scheduled_slots": [
    {
      "slot_index": "integer",
      "start_logical_time": "number",
      "end_logical_time": "number",
      "tenant_id": "string",
      "agent_id": "string",
      "agent_request_id": "string",
      "priority": "integer",
      "reason_codes": ["SCHEDULED_OK"]
    }
  ],
  "unscheduled_requests": [
    {
      "agent_request_id": "string",
      "tenant_id": "string",
      "reason_code": "RATE_LIMIT_EXCEEDED | MAX_SLICES_PER_REQUEST_REACHED | NO_TENANT_WEIGHT | TENANT_QUOTA_EXHAUSTED | NO_SLOTS_AVAILABLE",
      "next_eligible_time": "number"
    }
  ],
  "fairness_summary": {
    "mode": "string",
    "tenants": {
      "tenant_id": {
        "weight": "number",
        "priority": "integer",
        "requested_slices": "integer (ideal_quota)",
        "allocated_slices": "integer",
        "violated_limits": ["array of strings"]
      }
    },
    "global": { "total_slots": "number", "total_scheduled_requests": "number" }
  },
  "rate_limit_snapshot_out": "object" // Updated usage counts
}
```

## 3. Algorithm

### 3.1 Logical Time
- `total_slices` = `(end - start) / slice_ms` (clamped to `max_total_slices`).
- Each slot `i`: `start + i*slice_ms` to `start + (i+1)*slice_ms`.
- If `total_slices` is 0 and queue is not empty, return `NO_SLOTS_AVAILABLE`.

### 3.2 Tenant Quotas
- `effective_weight` = `tenant.weight` (default `scheduler_config.default`).
- `ideal_quota` = `floor(total_slices * weight / sum_weights)`.
- `remaining_quota` = `min(max_slices_per_window, ideal_quota) - prior_usage`.

### 3.3 Modes
1. **WEIGHTED_ROUND_ROBIN**:
   - Sort tenants by `priority` desc, then `id` asc.
   - Iterate slices. Round-robin through tenants.
   - **Queue Scanning**: For the selected tenant, iterate through their request queue.
     - If request is maxed -> unscheduled, try next.
     - If request fails concurrency/rate -> push back, try next.
     - If success -> Schedule, break tenant loop.
2. **STRICT_PRIORITY**:
   - Sort ALL requests logic-wide by `tenant.priority` -> `req.priority` -> `requested_at` -> `tenant_id` -> `req_id`.
   - Fill slices sequentially.

### 3.4 Rate Limits & Concurrency
- `per_minute` / `per_hour` rolling limits checked against `rate_limit_snapshot`.
- `max_concurrent_agents` checked per slot per tenant.

## 4. Forward-Hardening
- **Validation**: Strict. No Undefined/Date/Function types. `execution_id` non-empty string.
- **Determinism**: Sort inputs before processing. Stable sorts. Input must be immutable (engine must not mutate).
- **Observability**: Metrics, Spans, Structured Logs.
- **Purity**: No side effects.
- **Activation**: Requires BOTH `process.env.FF_AGENT_TIME_EXECUTION_SCHEDULER` AND `input.feature_flags.FF_AGENT_TIME_EXECUTION_SCHEDULER`.
