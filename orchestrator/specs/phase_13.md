# PHASE 13 SPEC — EXECUTION SPLIT ENGINE

## Objective
Expand Phase 12 GROUP-level execution units into UNIT-level splits with:
- Audience x Creative cross-products
- Cardinality limit (MAX_UNITS_PER_GROUP = 12)
- Deterministic budget allocation with penny-perfect rounding
- Pure logic, no IO

## Files Modified/Created
- `orchestrator/modules/execution_split_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_split_engine.test.js` (new)

## Input
Phase 12 ExecutionAssemblyPlan payload with:
- `venues[]` containing `execution_units[]`
- Each unit has: `unit_kind: "GROUP"`, `audience_ref`, `creative_refs[]`

## Output
ExecutionSplitPlan with:
- `unit_kind: "UNIT"`
- `source_group_kind: "GROUP"`
- `groups[]` containing expanded `units[]`

## Core Logic
1. **Cross-Product**: Generate audience x creative combinations
2. **Cardinality Limit**: Truncate deterministically if > MAX_UNITS_PER_GROUP (12)
3. **Budget Allocation**: Even split with deterministic penny rounding
4. **Deterministic IDs**: `${groupId}::${aud}::${cre}::${sequence}`

## Split Strategies
- `SINGLE_UNIT`: 1 audience, 1 creative
- `EVEN_CROSS_PRODUCT`: Multiple combinations
- `NO_BUDGET`: Zero budget

## Budget Allocation Algorithm
```javascript
base = floor((totalBudget / unitCount) * 100) / 100
remainder = totalBudget - (base * unitCount)
remainderCents = round(remainder * 100)
// Distribute remainder pennies to first units
```

## Test Coverage
11 tests covering:
- 1x1, 1xN, Nx1, NxM scenarios
- Cardinality limit
- Zero budget
- Missing audience/creative
- Input immutability
- Error handling
