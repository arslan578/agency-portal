# Phase 36: Learning Signal Aggregator (LSA)

**Intent**: `PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1`

**Purpose**: Convert Phase 35's deterministic optimization output into normalized, replay-safe learning signals for subsequent optimization rounds (Phase 37+).

This phase performs pure aggregation, introduces no reinterpretation of upstream scores, and ensures deterministic, reproducible signals for multi-round optimization.

---

## 1. Position in the Pipeline

**Consumes:**
- `WorldAwareOptimizerResponseV1` from Phase 35

**Produces:**
- `LearningSignalBundleV1`

**Used by:**
- Phase 37 (Budget Rebalancer v1)
- Phase 38 (Cross-Venue Optimizer)
- Phase 39–40 (Multi-Round reinforcement)

Phase 36 is the hinge between decision (Phase 35) and learning (Phase 37+).

---

## 2. Governing Standards

Phase 36 must comply with the Kaivo Forward-Hardening Framework:
- Deterministic contract + version tag
- Pure logic, no IO
- Replayable behavior
- No hardcoded knowledge
- Observability (metrics, structured logs, trace span)
- Atomic test bundle (18 tests)
- Backward compatibility with Phase 35 output shape

---

## 3. Input Contract (input_contract_v1)

Envelope must satisfy:

```typescript
{
  execution_id: string,
  intent: "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1",
  payload: {
    recommended: Array<{
      venue_key: string,
      raw_score: number,
      role: string,
      allocated_budget?: number,
      recommended_budget?: number,
      rank: number
    }>,

    excluded: Array<{
      venue_key: string,
      reason: string
    }>,

    global_score: number,
    constraint_tightness: number,
    coverage_score?: number,
    required_venues?: string[]
  }
}
```

**Required fields:**
- `recommended` array
- `excluded` array
- `global_score`
- `constraint_tightness`

**Optional fields:**
- `coverage_score` (defaults to 1.0)
- `required_venues` (defaults to [])

**Invalid Input**

Return error:

```typescript
{
  ok: false,
  phase: "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1",
  error: { code, message }
}
```

**Codes used:**
- `MALFORMED_PHASE_35_OUTPUT`
- `PHASE_36_ERROR`

---

## 4. Output Contract (output_contract_v1)

Successful response:

```typescript
{
  ok: true,
  phase: "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1",
  timestamp: string,
  payload: {
    recommended_signals: Array<RecommendedSignal>,
    exclusion_signals: Array<ExclusionSignal>,
    global_signals: GlobalSignals
  }
}
```

### 4.1 RecommendedSignal

```typescript
{
  venue_key: string,
  allocated_budget: number,
  role: "PRIMARY" | "SUPPORTING" | "REMARKETING",
  raw_score: number,
  normalized_score: number,     // 0–1
  selection_rank: number,
  constraint_tightness: number,
  was_required: boolean
}
```

### 4.2 ExclusionSignal

```typescript
{
  venue_key: string,
  exclusion_reason: string,
  suitability: null,
  reliability: null,
  learning_score: null
}
```

**Strict rule:**
Phase 36 must not generate its own suitability/reliability fields.
All reinterpretation is forbidden.

### 4.3 GlobalSignals

```typescript
{
  global_score: number,
  coverage_score: number,
  constraint_tightness: number,
  optimization_pressure: number   // 0–1
}
```

---

## 5. Core Logic

### 5.1 Normalized Score

```
normalized_score =
    max_raw_score === 0
    ? 1.0
    : v.raw_score / max_raw_score
```

Clamped:

```
normalized_score = clamp01(normalized_score)
```

Where:

```
max_raw_score = max over all recommended.raw_score
```

### 5.2 Optimization Pressure Formula

```
coverage_penalty = 1 - coverage_score

optimization_pressure = clamp01(
    (1 - global_score)*0.5 +
    constraint_tightness*0.3 +
    coverage_penalty*0.2
)
```

### 5.3 Deterministic Sorting

- **recommended_signals:**
  sort by `selection_rank`, then `venue_key`
- **exclusion_signals:**
  sort by `venue_key`

No hash-map iteration order allowed.

---

## 6. Invariants

Phase 36 must guarantee:

1. No reinterpretation of suitability, reliability, objective support, or cost.
2. `normalized_score` is deterministic.
3. Missing `coverage_score` defaults to 1.0.
4. Missing `required_venues` defaults to empty array.
5. `allocated_budget` resolved from upstream without mutation.
6. `selection_rank` is passed through exactly (no recomputation).
7. No venue ordering changes except deterministic sorting rules.
8. No IO: no DB, no network, no filesystem.
9. Output is snapshot-safe.

---

## 7. Error Conditions

Return `ok: false` for:
- missing payload
- missing recommended/excluded arrays
- NaN or invalid scores
- missing global_score or constraint_tightness
- empty recommended array
- invalid venue_key types
- internal errors (caught by try/catch)

---

## 8. Observability Requirements

On every valid invocation:

- **Metric emitted:**
  `"kaivo.phase36.learning_signal_aggregator.invoked"`
- **Structured log:**
  must include `execution_id`, `recommended_count`, `excluded_count`
- **Trace span:**
  `"PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1"`

No-op stub allowed during pure-logic unit testing.

---

## 9. Atomic Test Bundle

The test suite must include:

**Happy Paths (6)**
1. Standard recommended + excluded
2. No excluded
3. Missing coverage_score defaults correctly
4. Small budgets and low scores
5. Different raw_score distribution
6. Required venues flagged correctly

**Negative Paths (6)**
7. Missing recommended array
8. Missing excluded array
9. NaN raw_score
10. Missing global_score
11. Invalid venue_key
12. Null coverage_score

**Edge Cases (4)**
13. All venues required
14. All venues excluded
15. max_raw_score = 0 → all normalized_score=1
16. constraint_tightness = 1.0

**Guards (2)**
17. Regression guard (canonical fixture)
18. Determinism guard (unsorted input → identical output)

---

## 10. Example Input

```json
{
  "execution_id": "abc123",
  "payload": {
    "recommended": [
      { "venue_key": "META", "raw_score": 0.92, "role": "PRIMARY", "allocated_budget": 400, "rank": 1 },
      { "venue_key": "TIKTOK", "raw_score": 0.74, "role": "SUPPORTING", "allocated_budget": 200, "rank": 2 }
    ],
    "excluded": [
      { "venue_key": "REDDIT", "reason": "NO_SUPPORTED_OBJECTIVE" }
    ],
    "global_score": 0.81,
    "constraint_tightness": 0.5,
    "coverage_score": 0.9,
    "required_venues": ["META"]
  }
}
```

---

## 11. Example Output

```json
{
  "ok": true,
  "phase": "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1",
  "payload": {
    "recommended_signals": [
      {
        "venue_key": "META",
        "allocated_budget": 400,
        "role": "PRIMARY",
        "raw_score": 0.92,
        "normalized_score": 1.0,
        "selection_rank": 1,
        "constraint_tightness": 0.5,
        "was_required": true
      },
      {
        "venue_key": "TIKTOK",
        "allocated_budget": 200,
        "role": "SUPPORTING",
        "raw_score": 0.74,
        "normalized_score": 0.804,
        "selection_rank": 2,
        "constraint_tightness": 0.5,
        "was_required": false
      }
    ],
    "exclusion_signals": [
      {
        "venue_key": "REDDIT",
        "exclusion_reason": "NO_SUPPORTED_OBJECTIVE",
        "suitability": null,
        "reliability": null,
        "learning_score": null
      }
    ],
    "global_signals": {
      "global_score": 0.81,
      "coverage_score": 0.9,
      "constraint_tightness": 0.5,
      "optimization_pressure": 0.235
    }
  }
}
```

*(All numeric examples rounded for readability.)*

---

## 12. Summary

Phase 36 transforms Phase 35's optimized plan into:
- deterministic venue learning signals
- normalized round-level metrics
- optimization pressure for future rebalancing
- safe exclusion reasoning
- replay-safe global signals

It performs no policy, no scoring, and no optimization—only aggregation.

This spec completes the lower half of the optimization loop and prepares the system for Phase 37.
