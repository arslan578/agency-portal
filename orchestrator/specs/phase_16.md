# PHASE 16 SPEC — EXECUTION POLICY GUARD ENGINE

## Objective
Add deterministic policy guard layer for ExecutionIndexedPlan:
- Evaluate policy rules (budgets, venues)
- Produce machine-readable policy report
- Pure logic, no IO, input immutability preserved

## Files Modified/Created
- `orchestrator/modules/execution_policy_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_policy_engine.test.js` (new)

## Input
- `plan`: Phase 14 ExecutionIndexedPlan (read-only)
- `policy_config`: Optional configuration with caps and restrictions

## Output
Envelope with:
- `payload.plan`: Original plan (unchanged)
- `payload.policy`: Policy report
  - `summary`: is_policy_clean, error/warning/info counts
  - `issues[]`: Array of policy issues

## Envelope
All outputs must follow the orchestrator envelope format:
{ ok, module: "execution_policy_engine", timestamp, payload: { plan, policy } | null, error? }

## Policy Rules (v0.1)
1. **P01**: Campaign budget cap (ERROR if exceeded)
2. **P02**: Min budget per venue (WARNING if below)
3. **P03**: Max units per venue (ERROR if exceeded)
4. **P04**: Forbidden venues (ERROR if present)

## Default Policy Config
```javascript
{
  max_campaign_budget: null,
  min_budget_per_venue: null,
  max_units_per_venue: null,
  forbidden_venues: []
}
```

## Issue Structure
- `level`: ERROR | WARNING | INFO
- `code`: Machine-readable code
- `message`: Human-readable description
- `path`: JSON pointer to affected element
- `details`: Threshold values, actual values
- `fix`: Suggested fix (AUTO_FIX | MANUAL_REQUIRED)

## Issue Sorting
1. Severity (ERROR, WARNING, INFO)
2. venue_key (lexicographic, null last)
3. group_id (lexicographic, null last)
4. unit_id (lexicographic, null last)
5. code (lexicographic)

## Test Coverage
10 tests covering:
- Happy path (no violations)
- Each policy rule
- Issue ordering
- Invalid input
- Input immutability
