# Phase 51: Autonomous Retry Loop Engine Specification

**Contract:** `autonomous_retry_loop_v1`  
**Feature Flag:** `FF_AUTONOMOUS_RETRY_LOOP`  
**IO:** No (Delegates IO to wrapped connector)  
**Mode:** LIVE and REPLAY

---

## Purpose

Phase 51 implements the **Autonomous Retry Loop Engine**, the first layer of self-healing infrastructure. It wraps a connector engine (starting with Phase 50) and executes it within a policy-aware retry loop. It ensures that transient failures are retried up to a specified limit, while hard errors and policy violations terminate execution immediately.

Key responsibilities:
- Validate input against `autonomous_retry_loop_v1` contract.
- Execute the target connector engine.
- Evaluate execution results against retry policy.
- Manage retry state (attempts, backoff).
- Capture comprehensive execution history (snapshots).
- Emit observability events for each attempt and the final outcome.

---

## Inputs

### AutonomousRetryLoopEnvelope

```javascript
{
  execution_id: string,                 // globally unique, stable
  connector_key: string,                // e.g., 'tiktok_ads'
  attempt_limit?: number,               // default: 3
  requested_at?: string,                // ISO 8601, preserved from upstream
  tenant: {
    workspace_id: string,
    brand_id: string
  },
  context: {
    trace_domain?: string,
    locale?: string
  },
  connector_request: object             // The opaque request payload for the connector
}
```

---

## Outputs

### AutonomousRetryLoopResponse

```javascript
{
  execution_id: string,
  connector_key: string,
  status: 'SUCCESS' | 'RETRY_EXHAUSTED' | 'HARD_FAIL' | 'DISABLED',
  attempts: RetryAttempt[],
  final_response: object | null,        // The final connector response (if any)
  meta: {
    contract_version: 'autonomous_retry_loop_v1',
    total_attempts: number,
    stop_reason: string,                // e.g., 'SUCCESS', 'LIMIT_REACHED', 'HARD_ERROR'
    feature_flag_enabled: boolean,
    requested_at: string
  }
}
```

### RetryAttempt

```javascript
{
  attempt_number: number,               // 1-based index
  timestamp: string,                    // ISO 8601
  status: 'SUCCESS' | 'FAILED',
  error_code?: string,                  // From connector response if failed
  retryable: boolean,
  latency_ms: number
}
```

---

## Behavior

### Feature Flag
- When `FF_AUTONOMOUS_RETRY_LOOP` is false:
  - Engine acts as a pass-through.
  - Executes the connector exactly once (no retries).
  - Still returns an `AutonomousRetryLoopResponse` envelope.
  - `status` mirrors connector outcome:
    - `SUCCESS` for successful or partial executions.
    - `HARD_FAIL` when the connector reports a hard failure or throws.
    - `DISABLED` only when the connector itself returns `DISABLED`.
  - `meta.feature_flag_enabled` is `false`.
  - `meta.stop_reason` is `FEATURE_DISABLED`.
  - `meta.total_attempts` is `1`.

### Retry Logic
- **Policy**: Matches Phase 50's `shouldRetry` semantics.
  - HTTP 429
  - HTTP 5xx
  - Network transient errors (ECONNRESET, ECONNABORTED, ENOTFOUND, ETIMEDOUT, timeout messages)
- **Stop Conditions**:
  - **Success**: Connector returns `SUCCESS`.
  - **Hard Failure**: Connector returns `FAILED` with non-retryable error code (e.g., `AUTH_ERROR`, `INVALID_REQUEST`).
  - **Exhaustion**: `attempt_limit` reached.
  - **Disabled**: Feature flag is off.

### Partial Failure
- Connector `PARTIAL_FAILURE` is treated as terminal and non-retryable.
- The loop returns `status: 'SUCCESS'` with `meta.stop_reason: 'PARTIAL_SUCCESS'`.
- The last attempt in `attempts` will have `status: 'FAILED'` and `retryable: false`,
  preserving the partial nature of the outcome.

### Attempt Limits
- Default `attempt_limit`: 3.
- Enforced strictly.

### Determinism & Replay
- Execution must be deterministic given the same inputs and connector responses.
- Snapshots must capture all attempts and the final outcome to support exact replay.

---

## Observability

- **Trace Span**: `autonomous_retry_loop`
- **Logs**: Structured log per attempt.
- **Metrics**:
  - `retry_count`
  - `terminal_status`
  - `per_attempt_latency`
