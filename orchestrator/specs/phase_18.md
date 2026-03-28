# PHASE 18 SPEC — EXECUTION PLAN SERIALIZER

## Objective
Serialize execution plan + reports into platform-neutral submission bundle:
- Global and per-venue launch decisions
- Serialized groups and units ready for connector mapping
- Deterministic ordering (venue_key, group_index, unit_index)
- Pure logic, no IO, input immutability preserved

## Files Modified/Created
- `orchestrator/modules/execution_plan_serializer.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_plan_serializer.test.js` (new)

## Input
- `plan`: Phase 14 ExecutionIndexedPlan
- `validation`: Phase 15 validation report
- `policy`: Phase 16 policy report
- `readiness`: Phase 17 readiness report

## Output
`ExecutionSubmissionBundle` with:
- Global launch decision (`can_submit`, `global_status`)
- Reasons (validation_is_valid, policy_is_clean, readiness_can_launch)
- Summary counts (validation errors, policy errors, readiness blocks/warnings)
- Per-venue serialized payloads

## Envelope
All outputs must follow the orchestrator envelope format:
{ ok, module: "execution_plan_serializer", timestamp, payload: ExecutionSubmissionBundle | null, error? }

## Global Decision Rules
- `can_submit = validation.is_valid && policy.is_policy_clean && readiness.can_launch`
- `global_status`: "BLOCKED" (ERROR), "RISKY" (WARNING), or "READY" (NONE)

## Venue Serialization
Each venue includes:
- `can_submit`: Global can_submit AND venue has no blocks
- `status`: "BLOCKED", "RISKY", or "READY"
- `issues`: Blocks and warnings for this venue
- `payload`: Meta, budget, and groups/units

## Deterministic Ordering
- Venues sorted by `venue_key` (ascending)
- Groups sorted by `group_index` (ascending)
- Units sorted by `unit_index` (ascending)

## Test Coverage
10 tests covering:
- Happy path (launchable)
- Global/venue blocks
- Validation/policy failures
- Missing plan/readiness
- Null schedule/tracking
- Input immutability
- Deterministic ordering
