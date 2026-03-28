# Phase 59: Optimizer Safety Guard Engine (Forward-Hardening complete)

## Summary
Adds Phase 59 pure-logic Optimizer Safety Guard Engine that enforces Safety Horizon constraints on optimizer plans and budget adjustments.

## Key Features / Guarantees

### Contract Compliance
- **Strict input whitelist**: 8 allowed top-level fields
- **7 Required fields**: `execution_id`, `phase`, `feature_flags`, `context`, `optimizer_plan`, `connector_state`, `safety_horizon`
- **Output whitelist**: Enforces contract boundary with explicit field enumeration
- **Contract versions**: `optimizer_safety_guard_input_v1` and `optimizer_safety_guard_output_v1`

### Safety Horizon Enforcement
- **Global budget limits**: `max_budget_delta_total` with `GLOBAL_BUDGET_EXCEEDED` violations when exceeded
- **Per-connector budget limits**: `max_budget_delta_per_connector` with clamping
- **Max steps per plan**: `max_steps_per_plan` with `MAX_STEPS_EXCEEDED` violations
- **Max parallel connectors**: `max_parallel_connectors` with `MAX_PARALLEL_CONNECTORS_EXCEEDED` violations
- **Forbidden actions**: Complete blocking with `FORBIDDEN_ACTION` violations
- **Risk ledger + redundancy semantics**:
  - No redundancy + HIGH risk → step BLOCKED with `HIGH_RISK` violation
  - With redundancy + HIGH risk → step CLAMPED to 0 with `REDUNDANCY_SOFTENED_HIGH_RISK` reason code

### Determinism & Forward-Hardening
- **Pure logic**: No IO, no external service calls, no side effects
- **Deterministic**: Identical input → identical output
- **Idempotent**: Can be replayed safely
- **Snapshot overlay**: Per-step decisions with sorted keys for replay and audit
- **Observability**: Explicit metrics, structured logs, trace spans

### Feature Flag Behavior
- **Dual-gate activation**: Requires both `process.env.FF_OPTIMIZER_SAFETY_GUARD === 'true'` AND envelope flag
- **Pass-through when disabled**: 
  - Status: `FEATURE_DISABLED`
  - Stop reason: `FEATURE_DISABLED`  
  - Plan passed through unchanged with explicit `safety_guard_annotation.guard_applied = false`

### Budget Adjustment Guarding
- Budget adjustments undergo same safety checks as optimizer steps
- Forbidden actions, risk checks, and clamping applied consistently
- Violations recorded with same structure

## Tests
**19 Jest tests** - all passing ✅

- **6 Happy Path tests**:
  - All steps safe
  - Single clamped step
  - Mix of safe and blocked by forbidden_actions
  - Budget adjustments clamped
  - Redundancy profile used
  - Feature flag disabled pass through

- **6 Negative tests**:
  - Missing required field
  - Unknown top level field
  - Invalid type in steps (non-numeric budget_delta)
  - Conflicting safety horizon values (global zero horizon → GLOBAL_BUDGET_EXCEEDED)
  - Risk band violation (no redundancy + HIGH risk)
  - Internal exception protection

- **5 Edge Case tests**:
  - Empty plan
  - Max steps at boundary passes
  - Max steps boundary exceeded
  - Zero budgets
  - Multiple connectors, shared limits

- **1 Regression Guard**:
  - Forbidden actions never slip through

- **1 Determinism Guard**:
  - Repeated invocations identical (100 runs, deep JSON comparison)

## Implementation Details

### Status Values
- `OK`: Plan processed successfully
- `FEATURE_DISABLED`: Feature flag off, pass-through mode
- `INVALID_INPUT`: Contract violation
- `SAFETY_VIOLATION`: Safety limits exceeded (when violations.length > 0)
- `INTERNAL_ERROR`: Unexpected exception

### Stop Reasons
- `null`: Normal completion
- `FEATURE_DISABLED`: Feature flag not enabled
- `CONTRACT_VIOLATION`: Input validation failed
- `SAFETY_LIMIT_EXCEEDED`: Safety violations present
- `UNEXPECTED_EXCEPTION`: Internal error

### Violation Types
- `FORBIDDEN_ACTION`: Step matches forbidden action list  
- `GLOBAL_BUDGET_EXCEEDED`: Exceeds global budget horizon
- `HIGH_RISK`: Connector risk level not in allowed bands (no redundancy)
- `MAX_STEPS_EXCEEDED`: Too many steps in plan
- `MAX_PARALLEL_CONNECTORS_EXCEEDED`: Too many parallel connectors

### Decision Types
- `SAFE`: Step passed all checks
- `CLAMPED`: Budget reduced to fit within limits
- `BLOCKED`: Step removed due to violation

## Observability

### Metrics
- `optimizer_safety.steps_total`: Total steps processed
- `optimizer_safety.steps_blocked`: Steps removed
- `optimizer_safety.steps_clamped`: Steps with reduced budgets
- `optimizer_safety.violations_total`: Total violations
- `optimizer_safety.feature_disabled`: Feature flag disabled invocations
- `optimizer_safety.internal_error`: Exception count

### Logs
- `optimizer_safety_guard_evaluated`: Successful evaluation with counts and summary
- `optimizer_safety_guard_error`: Exception details

### Trace
- Span name: `phase_59_optimizer_safety_guard`
- Contains execution context and timing

## Forward-Hardening Alignment

✅ **Deterministic**: Identical input → identical output  
✅ **Explicit error codes**: All failure modes have distinct status and stop_reason  
✅ **No hidden state**: Pure function, no side-effects  
✅ **Output whitelist**: Contract boundary enforced  
✅ **Structural validation**: Input types and shapes validated  
✅ **Numeric safety**: Strict `Number.isFinite()` checks prevent NaN/Infinity  
✅ **Zero horizon behavior**: Explicit violations, no silent acceptance  
✅ **Feature flag semantics**: Explicit unguarded annotation when disabled

## Integration

Phase 59 integrates with:
- **Phase 58 (Safety Horizon Evaluator)**: Consumes `safety_horizon` output
- **Phases 39/41 (Optimizer)**: Consumes `optimizer_plan` and `budget_adjustments`
- **Phase 60+**: Provides sanitized plans and snapshot overlay for downstream phases

## Files Changed
- `orchestrator/phases/59_optimizer_safety_guard/optimizer_safety_guard_engine.js` (new)
- `orchestrator/phases/59_optimizer_safety_guard/__tests__/optimizer_safety_guard_engine.test.js` (new)
- `orchestrator/phases/59_optimizer_safety_guard/phase_59_optimizer_safety_guard_spec.md` (new)

## Patches Applied
- **8 Tightening patches**: Safety violation status, numeric validation, budget guards, redundancy semantics, observability, input validation, snapshot assertions
- **3 Conformance fixes**: Global zero horizon blocking, feature-disabled annotation, edge boundary coverage
- **2 Final alignments**: Required fields expansion, test count accuracy

---

**Ready for**: Integration with Safety Layer (Phases 57-59) and Phase 60+ foundation.
