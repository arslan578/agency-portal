# Phase 42: Optimization Trace Reconstruction Engine - Specification

## 1. Objective

Phase 42: Optimization Trace Reconstruction Engine reconstructs delta information from optimization trace snapshots. It performs pure mathematical transformations on budget state changes without any business logic or policy inference.

**Purpose**: Convert snapshot-based trace data (budget before/after) into delta-based analytics (change magnitude, direction, global movement).

**Position**: Phase 42 operates on trace data independently and can be called after any optimization phase produces trace snapshots.

## 2. Feature Flag

**Flag**: `FF_OPTIMIZATION_TRACE_RECON_V1`

**Default**: `false` (disabled)

**Behavior when disabled**:
```javascript
{
  ok: true,
  reconstruction: {},
  diagnostics: { feature_disabled: true }
}
```

## 3. Input Contract (input_contract_v1)

Phase 42 accepts:

```javascript
{
  execution_id: string,              // Required
  feature_flags: object,             // Optional
  trace: {
    rounds: Array<{
      round_index: number,           // Non-negative integer
      venue_states: Array<{
        venue_key: string,           // Non-empty string
        budget_before: number,       // Finite number >= 0
        budget_after: number         // Finite number >= 0
      }>
    }>
  }
}
```

### Validation Rules

**Trace Structure**:
- `trace` must be an object
- `trace.rounds` must be an array
- Empty `rounds` array is valid (returns empty reconstruction)

**Round Validation**:
- Each round must be an object
- `round_index` must be a non-negative integer
- No duplicate `round_index` values allowed
- `venue_states` must be an array

**Venue State Validation**:
- Each state must be an object
- `venue_key` must be a non-empty string
- `budget_before` must be a finite number >= 0
- `budget_after` must be a finite number >= 0

### Error Codes

- `MISSING_TRACE`: trace object missing or invalid
- `INVALID_ROUNDS_STRUCTURE`: rounds is not an array
- `INVALID_ROUND_STRUCTURE`: round is not an object
- `INVALID_ROUND_INDEX`: round_index missing, not integer, or negative
- `DUPLICATE_ROUND_INDEX`: multiple rounds with same index
- `INVALID_VENUE_STATES`: venue_states is not an array
- `INVALID_VENUE_STATE`: venue state is not an object
- `INVALID_VENUE_KEY`: venue_key missing or empty
- `INVALID_BUDGET_BEFORE`: budget_before invalid
- `INVALID_BUDGET_AFTER`: budget_after invalid
- `RECONSTRUCTION_ERROR`: unexpected error during processing

## 4. Output Contract (output_contract_v1)

Phase 42 produces:

```javascript
{
  ok: boolean,
  reconstruction: {
    rounds: Array<{
      round_index: number,
      deltas: Array<{
        venue_key: string,
        delta: number,
        sign: "POS" | "NEG" | "ZERO"
      }>,
      global_delta: number
    }>
  },
  diagnostics: object
}
```

### Output Guarantees

**Sorting**:
- `rounds` sorted ascending by `round_index`
- `deltas` sorted lexicographically by `venue_key`

**Delta Calculation**:
```javascript
delta = budget_after - budget_before
```

**Sign Determination**:
- `delta > 0` → `"POS"`
- `delta < 0` → `"NEG"`
- `delta === 0` → `"ZERO"`

**Global Delta**:
```javascript
global_delta = sum(abs(delta) for all deltas in round)
```

## 5. Invariants

1. **No Mutation**: Input is never modified
2. **Determinism**: Identical inputs produce identical outputs
3. **Pure Math**: Only mathematical operations, no inference
4. **Idempotence**: Can be called multiple times safely
5. **Replay Safety**: Compatible with snapshot/replay systems

## 6. Processing Logic

### Step 1: Validation
Validate input structure and all constraints. Return error immediately if validation fails.

### Step 2: Round Sorting
Sort rounds by `round_index` (ascending).

### Step 3: Delta Calculation
For each round:
1. Calculate `delta = budget_after - budget_before` for each venue
2. Determine sign based on delta value
3. Sort deltas by `venue_key` (lexicographic)
4. Calculate `global_delta` as sum of absolute deltas

### Step 4: Return
Return reconstruction with sorted rounds and diagnostics.

## 7. Error Handling

All errors return:

```javascript
{
  ok: false,
  reconstruction: {},
  diagnostics: { error: "<ERROR_CODE>" }
}
```

No exceptions are thrown - all errors are caught and returned as structured responses.

## 8. Observability

**Structured Log**: `OPTIMIZATION_TRACE_RECON_V1`

**Included Fields**:
- `execution_id`: From input
- `rounds_processed`: Number of rounds reconstructed
- Redacted venue references (no PII)

**Excluded**:
- Personal identifiable information
- Connector-specific data
- Raw budget values

## 9. Test Coverage

### Happy Path (6 tests)
1. Single round, single venue
2. Multi-round, multi-venue
3. All positive deltas
4. All negative deltas
5. Mixed deltas
6. Stable ordering across rounds and venues

### Negative Path (6 tests)
7. Missing round_index
8. Duplicate round_index
9. Non-number budgets
10. Negative budgets
11. Missing venue_key
12. Inconsistent venue lists across rounds

### Edge Cases (4 tests)
13. Empty rounds array
14. Zero deltas everywhere
15. One venue only
16. High precision floats

### Regression (1 test)
17. Previously malformed snapshot returns deterministic error

### Determinism (1 test)
18. Identical inputs → identical outputs

## 10. Examples

### Example 1: Basic Reconstruction

**Input**:
```javascript
{
  execution_id: "exec-123",
  trace: {
    rounds: [{
      round_index: 0,
      venue_states: [
        { venue_key: "A", budget_before: 100, budget_after: 110 },
        { venue_key: "B", budget_before: 200, budget_after: 190 }
      ]
    }]
  }
}
```

**Output**:
```javascript
{
  ok: true,
  reconstruction: {
    rounds: [{
      round_index: 0,
      deltas: [
        { venue_key: "A", delta: 10, sign: "POS" },
        { venue_key: "B", delta: -10, sign: "NEG" }
      ],
      global_delta: 20
    }]
  },
  diagnostics: {
    execution_id: "exec-123",
    rounds_processed: 1
  }
}
```

### Example 2: Empty Trace

**Input**:
```javascript
{
  execution_id: "exec-456",
  trace: { rounds: [] }
}
```

**Output**:
```javascript
{
  ok: true,
  reconstruction: { rounds: [] },
  diagnostics: { empty_trace: true }
}
```

### Example 3: Validation Error

**Input**:
```javascript
{
  execution_id: "exec-789",
  trace: {
    rounds: [{
      round_index: "not-a-number",
      venue_states: []
    }]
  }
}
```

**Output**:
```javascript
{
  ok: false,
  reconstruction: {},
  diagnostics: { error: "INVALID_ROUND_INDEX" }
}
```

## 11. Prohibitions

Phase 42 **MUST NOT**:
- Modify upstream phases
- Change existing data structures
- Import business rule modules
- Mutate input envelope
- Add extra fields beyond spec
- Infer missing data
- Use policy logic
- Use capabilities logic
- Use constraint logic
- Perform connector reasoning
- Reorder or rename anything
- Include IO operations
- Use non-deterministic code

## 12. Module Exports

```javascript
module.exports = {
    reconstructTrace
};
```

## 13. Integration

Phase 42 can be integrated after any phase that produces trace snapshots:

```javascript
const traceReconEngine = require('./phases/42_trace_reconstruction/trace_reconstruction_engine');

const result = traceReconEngine.reconstructTrace({
    execution_id: envelope.execution_id,
    trace: envelope.optimization_trace
});

if (result.ok) {
    envelope.trace_reconstruction = result.reconstruction;
}
```
