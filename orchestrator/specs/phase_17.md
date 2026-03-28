# PHASE 17 SPEC — EXECUTION READINESS ENGINE

## Objective
Aggregate validation and policy reports to compute launch readiness:
- Single is_launchable verdict
- Blocking issues vs non-blocking warnings
- Worst severity level
- Pure logic, no IO, input immutability preserved

## Files Modified/Created
- `orchestrator/modules/execution_readiness_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_readiness_engine.test.js` (new)

## Input
- `plan`: Phase 14 ExecutionIndexedPlan
- `validation`: Phase 15 validation report
- `policy`: Phase 16 policy report

## Output
Envelope with:
- `payload.plan`: Original plan
- `payload.validation`: Original validation
- `payload.policy`: Original policy
- `payload.readiness`: Readiness report

## Envelope
All outputs must follow the orchestrator envelope format:
{ ok, module: "execution_readiness_engine", timestamp, payload: { plan, validation, policy, readiness } | null, error? }

## Readiness Rules
- **is_launchable**: `true` only if no validation errors AND no policy errors
- **has_validation_errors**: `validation.errors.length > 0`
- **has_policy_errors**: Any policy issue with `level === "ERROR"`
- **worst_level**: ERROR > WARNING > INFO > NONE

## Counts
- `validation_errors`: Count of validation errors
- `policy_errors`: Count of policy ERROR issues
- `policy_warnings`: Count of policy WARNING issues
- `policy_infos`: Count of policy INFO issues
- `total_blocking`: validation_errors + policy_errors
- `total_non_blocking`: policy_warnings + policy_infos

## Issue Aggregation
- **blocks[]**: All VALIDATION errors first, then POLICY errors (preserve order)
- **warnings[]**: POLICY warnings only (preserve order)
- **infos[]**: POLICY infos only (preserve order)

## Fix Field Handling
The readiness engine normalizes fix fields into a stable, predictable shape.

Rules:
1. **Validation errors**: Always `fix: null` (validation modules must not provide fix suggestions)
2. **Policy errors, warnings, infos**: Accept fix as either:
   - a string, or
   - an object with a `description` field
   - Normalize to: the string if present, the description if present, otherwise null
3. **All fix fields in readiness output MUST be either**: `string` or `null`
4. **No other object shapes are allowed in readiness output**

Rationale: Ensures Phase 17 output contract is stable while allowing Phase 16 to evolve internally.

## Test Coverage
10 tests covering:
- Launchable (no errors)
- Blocked by validation/policy/both
- Warnings and infos only
- Worst level derivation
- Input immutability
- Invalid input handling
- Determinism
