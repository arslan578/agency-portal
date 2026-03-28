# PHASE 15 SPEC — EXECUTION VALIDATION ENGINE

## Objective
Add deterministic validation layer for ExecutionIndexedPlan:
- Validate structural invariants
- Validate numeric constraints (budgets, indexes)
- Produce machine-readable validation report
- Pure logic, no IO, input immutability preserved

## Files Modified/Created
- `orchestrator/modules/execution_validation_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_validation_engine.test.js` (new)

## Input
Phase 14 ExecutionIndexedPlan (read-only)

## Output
Envelope with:
- `payload.plan`: Original plan (unchanged)
- `payload.validation`: Validation report
  - `is_valid`: boolean
  - `errors[]`: Array of error objects
  - `warnings[]`: Array of warning objects

## Envelope
All outputs must follow the orchestrator envelope format:
{ ok, module: "execution_validation_engine", timestamp, payload: { plan, validation } | null, error? }

## Validation Rules
1. **Structure**: groups array, proper types, no index gaps
2. **Budgets**: sum(units) = stats.total_budget (epsilon 0.01), no negatives
3. **Indexes**: continuous 0..N-1, no duplicates, correct group indexes
4. **Stats**: by_venue totals match unit sums
5. **Empty cases**: empty groups valid, empty units = warning

## Error/Warning Codes
- `MISSING_FIELD`: Required field missing
- `INVALID_TYPE`: Wrong type
- `NEGATIVE_BUDGET`: Budget < 0
- `BUDGET_MISMATCH`: Sum mismatch (epsilon 0.01)
- `INDEX_GAP`: Missing index in sequence
- `INDEX_DUPLICATE`: Duplicate global index
- `EMPTY_GROUP`: Group with no units (warning)
- `STATS_MISMATCH`: Stats don't match actual data

## Test Coverage
10 tests covering:
- Happy path (valid plan)
- Budget mismatch
- Index gaps/duplicates
- Negative/non-numeric budgets
- Empty groups/units
- Invalid input
- Input immutability
