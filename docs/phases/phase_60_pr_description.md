# Phase 60 — Agent Execution Plan Adapter

## Summary

Implements Phase 60 of the Kaivo Orchestrator: an agent safe adapter that converts raw agent requests into policy and safety constrained execution plans.

This phase:

- Validates agent requests for required fields and forbidden content.
- Applies policy, safety, rate limit, and capability guards using existing snapshots.
- Produces a deterministic `adapted_execution_plan` suitable for execution.
- Returns structured rejections with agent safe explanations when adaptation is not possible.
- Emits standardized logs, metrics, and trace spans for observability.

## Technical Details

- Contract name: `agent_execution_plan_adapter_v1`
- Input contract: `input_contract_v1` as defined in `phase_60_spec.md`
- Output contract: `output_contract_v1` as defined in `phase_60_spec.md`
- Feature flag: `FF_AGENT_EXECUTION_PLAN_ADAPTER` (`process.env.FF_AGENT_EXECUTION_PLAN_ADAPTER === 'true'`)
- Mode: pure logic, no IO, replay safe

Key implementation points:

- Validation of `agent_request`, `safety_snapshot`, `policy_snapshot`, `capability_index_snapshot`, and `rate_limit_snapshot`.
- Status precedence: `POLICY_BLOCKED` > `SAFETY_BLOCKED` > `RATE_LIMIT_BLOCKED` > `CAPABILITY_BLOCKED` > `INVALID_REQUEST` > `FEATURE_DISABLED`.
- Deterministic ordering for actions and rejections.
- Deep clone of input to ensure immutability.

## Tests

- File: `orchestrator/phases/phase_60/agent_execution_plan_adapter_engine.test.js`
- Total tests: 20
  - 6 happy path
  - 6 negative path
  - 4 edge cases
  - 2 regression guards
  - 2 determinism tests

All tests must pass:

```bash
npm test -- agent_execution_plan_adapter_engine.test.js
```

## Observability

- Structured log event type: `PHASE_60_AGENT_ADAPTER`
- Trace span: `phase_60_agent_execution_plan_adapter`
- Metrics:
  - `phase_60_plans_adapted`
  - `phase_60_plans_rejected`
  - `phase_60_forbidden_actions_removed`
  - `phase_60_rate_limit_blocked`
