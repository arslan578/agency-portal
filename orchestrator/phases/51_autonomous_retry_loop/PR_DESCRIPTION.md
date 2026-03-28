# Phase 51: Autonomous Retry Loop Engine

## Summary
Implements the **Autonomous Retry Loop Engine**, the first self-healing infrastructure layer that wraps connector execution in a policy-aware retry loop. This phase ensures transient failures are automatically retried while preserving determinism and observability.

## Changes

### New Files
- `orchestrator/phases/51_autonomous_retry_loop/autonomous_retry_loop_engine.js` - Core retry loop engine
- `orchestrator/phases/51_autonomous_retry_loop/phase_51_spec.md` - Contract and behavior specification
- `orchestrator/phases/51_autonomous_retry_loop/phase_51_test.js` - Comprehensive test suite (18 tests)

### Key Features
- **Contract**: `autonomous_retry_loop_v1`
- **Feature Flag**: `FF_AUTONOMOUS_RETRY_LOOP` (defaults to false for safe deployment)
- **Wraps Phase 50**: Pure wrapper around connector engines, starting with TikTok Ads
- **Retry Policy**: Matches Phase 50 semantics exactly (429, 5xx, transient network errors)
- **Attempt Limits**: Configurable retry limit (default: 3)
- **Full Observability**: Spans, structured logs, metrics for every attempt

### Implementation Details

**Retry Logic:**
- Retries only on transient failures (RATE_LIMITED, UPSTREAM_SERVICE_FAILURE, NETWORK_ERROR/TIMEOUT)
- Hard failures (AUTH_ERROR, INVALID_REQUEST) terminate immediately
- PARTIAL_FAILURE is terminal and non-retryable, returns `SUCCESS` with `stop_reason: 'PARTIAL_SUCCESS'`

**Pass-Through Mode (FF disabled):**
- Executes connector exactly once
- Returns proper `AutonomousRetryLoopResponse` envelope
- Status mirrors connector outcome (SUCCESS, HARD_FAIL, or DISABLED)
- Marks loop as disabled via `feature_flag_enabled: false` and `stop_reason: 'FEATURE_DISABLED'`

**Observability:**
- Span: `autonomous_retry_loop` with guaranteed lifecycle
- Logs: Structured log per attempt
- Metrics: retry count, terminal status, per-attempt latency

## Testing
- **18 tests**: 6 happy path, 6 negative path, 4 edge cases, 1 regression, 1 determinism
- **All passing**: Verified retry behavior, pass-through mode, error handling
- Run with: `node orchestrator/phases/51_autonomous_retry_loop/phase_51_test.js`

## Dependencies
- Wraps Phase 50 (TikTok Ads Connector IO Engine)
- Uses shared observability utilities (`logging`, `tracing`, `metrics`)

## Deployment Notes
1. Deploy with `FF_AUTONOMOUS_RETRY_LOOP=false` initially
2. Verify in staging environment
3. Enable flag gradually to activate retry loop
4. Monitor metrics for retry counts and terminal statuses

## Breaking Changes
None. This is a new phase that wraps existing connectors without modifying them.

## Related Issues
- Foundation for Recovery layer (Phases 51-55)
- Enables self-healing connector execution
- Prepares for autonomous failure recovery

---

**Review checklist:**
- [ ] All 18 tests pass
- [ ] Retry semantics match Phase 50 exactly
- [ ] Pass-through mode preserves connector outcomes
- [ ] Observability is complete and guaranteed
- [ ] Feature flag is properly wired
