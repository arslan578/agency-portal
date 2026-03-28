# PHASE 14 SPEC — EXECUTION INDEXING & STATS ENGINE

## Objective
Add deterministic indexes and aggregate stats to Phase 13 ExecutionSplitPlan:
- Deterministic indexes (global, group, venue) for every unit
- Aggregate stats by venue and overall
- Pure logic, no IO, input immutability preserved

## Files Modified/Created
- `orchestrator/modules/execution_index_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/execution_index_engine.test.js` (new)

## Input
Phase 13 ExecutionSplitPlan with `groups[]` containing `units[]`

## Output
ExecutionIndexedPlan with:
- All original fields preserved
- Added indexes: `group_index`, `index.{global, group, venue}`, `group_index`, `venue_index`
- Stats: `group_count`, `unit_count`, `total_budget`, `by_venue`

## Envelope
All outputs must follow the orchestrator envelope format:
{ ok, module: "execution_index_engine", timestamp, payload: ExecutionIndexedPlan | null, error? }

## Indexing Rules
1. **Group Index**: Sequential 0-based per group
2. **Global Unit Index**: Sequential across all groups and units
3. **Group Unit Index**: Sequential within each group (0-based)
4. **Venue Unit Index**: Sequential per venue across all groups
5. **Convenience Fields**: `group_index`, `venue_index` on each unit

## Stats Computation
```javascript
group_count = groups.length
unit_count = sum(groups[i].units.length)
total_budget = sum(all unit.budget.allocated)
by_venue[vk] = {
  groups: Set<group_index>.size,
  units: count,
  budget: sum
}
```

## Test Coverage
8 tests covering:
- Single group happy path
- Multiple groups and venues
- Empty groups
- Groups with empty units
- Invalid payload handling
- Input immutability
- Determinism
