# Phase 8B — Objective Normalization Engine (Spec + Implementation + Tests)

## Summary

Phase 8B is complete and production-ready.

This phase introduces Kaivo's **canonical translator between human/agent intent and machine-executable objective space**. It converts vague, high-level campaign intents ("grow my brand", "increase signups") into structured, multi-objective performance vectors that downstream planners can optimize against.

## What Was Built

### 1. Complete Specification (`phase_8b_spec.md`)
- Full contract definitions (input/output)
- Deterministic behavior requirements
- Intent phrase resolution rules
- Error semantics and observability hooks
- Integration points with Phase 3, 6B, 8, 9B, 16, 32, 36

### 2. Deterministic Normalization Engine (`objective_normalization_engine.js`)
- **Intent Normalization:** Token-level matching with ≥2 token overlap or ordered subsequence
- **Multi-objective Vector:** Reach, conversions, frequency, value (0-1 normalized)
- **Policy Integration:** Constraint resolution via Phase 16 + Policy Mirror
- **Feasibility Computation:** Per-platform support analysis (SUPPORTED/LIMITED/UNSUPPORTED)
- **Learning Signal Integration:** Historical performance boost/reduction
- **Priority Ordering:** Deterministic sorting by weight + alphabetic ties
- **Feature Flag:** `FF_OBJECTIVE_NORMALIZATION` (defaults to false, safe rollout)

### 3. Comprehensive Test Suite (`objective_normalization_engine.test.js`)
- **18/18 tests passing** ✅
- 6 happy path tests
- 6 negative path tests
- 4 edge case tests
- 1 regression guard test
- 1 determinism guard test (100 runs)

## Correctness Patch Applied

Two surgical fixes were applied to ensure full spec compliance:

### Fix #1: Empty Intent Fallback
**Problem:** Empty `raw_intent` had ambiguous behavior  
**Solution:** Added deterministic fallback returning uniform distribution (0.25 each objective) with clear explanation  
**Test:** #13 now passes

### Fix #2: Intent Matching Algorithm
**Problem:** "grow my brand" failed to match "grow brand" (too strict)  
**Solution:** Improved matching with token-overlap (≥2 tokens) and ordered subsequence with stopword removal  
**Spec Update:** Added "Intent Phrase Resolution Rules" section  
**Test:** #17 now passes

## Key Features

✅ **No Inline Knowledge:** All mappings come from `knowledge_mappings` input (Knowledge Graph)  
✅ **Deterministic Behavior:** 100-run test confirms identical outputs  
✅ **No Mutation:** Deep clone prevents upstream object modification (Framework Rule #1)  
✅ **Policy-Aware:** Integrates with Phase 16 + Policy Mirror for constraint resolution  
✅ **Replay Stable:** Sorted outputs, stable rounding, no timestamps in payload  
✅ **Full Observability:** Metrics, logs, trace spans (disabled in test env)  
✅ **Feature Flag Gated:** Safe rollout with uniform fallback when disabled

## Contract

### Input: `objective_normalization_input_v1`
```javascript
{
  execution_id: string,
  raw_intent: string | object,
  creative_compliance: {...},  // Phase 6B
  learning_signals: {...},     // Phase 36
  policy_rules: {...},         // Phase 16 + 32
  knowledge_mappings: {...}    // Knowledge Graph
}
```

### Output: `objective_normalization_v1`
```javascript
{
  execution_id: string,
  normalized_objectives: {reach, conversions, frequency, value},
  priority_order: [...],
  feasibility: {google, meta, tiktok, youtube, reddit},
  policy_constraints: [...],
  recommended_modes: [...],
  explanations: [...]
}
```

## Test Results

```bash
=== Phase 8B: Objective Normalization Engine - Test Suite ===

--- Happy Path Tests (6) ---
✓ 1. Brand awareness → reach high
✓ 2. Increase signups → conversions high
✓ 3. Multi-objective resolution
✓ 4. Learning signals adjustment
✓ 5. Policy rule trimming
✓ 6. Feasibility across 3 venues

--- Negative Path Tests (6) ---
✓ 7. OBJECTIVE_UNRECOGNIZED
✓ 8. OBJECTIVE_CONFLICT (graceful handling)
✓ 9. POLICY_BLOCKED_OBJECTIVE
✓ 10. Missing knowledge mapping
✓ 11. Invalid input contract
✓ 12. Missing creative_compliance

--- Edge Case Tests (4) ---
✓ 13. Empty raw intent
✓ 14. Contradictory learning signals
✓ 15. Partial mappings
✓ 16. All venues UNSUPPORTED

--- Regression Guard Test (1) ---
✓ 17. Regression snapshot verification

--- Determinism Guard Test (1) ---
✓ 18. Determinism guard (100 runs)

=== Test Results: 18/18 passed ===
```

## Integration

Phase 8B sits between:
- **Upstream:** Phase 3 (Intent Understanding), Phase 6B (Creative Compliance)
- **Downstream:** Phase 8 (Venue Ranking), Phase 9B (Budget Allocation), Phases 35-41 (Optimizers)

## Compliance with Forward-Hardening Framework

✅ **Rule #1:** No mutation  
✅ **Rule #2:** Structured errors (OBJECTIVE_UNRECOGNIZED, POLICY_BLOCKED_OBJECTIVE, etc.)  
✅ **Rule #3:** Full observability  
✅ **Rule #4:** Knowledge resolution via injected mappings  
✅ **Rule #5:** Deterministic behavior (100-run test)  
✅ **Rule #6:** Feature flag with safe fallback  
✅ **Rule #7:** Comprehensive 18-test suite  
✅ **Rule #8:** Complete specification

## Files Changed

- `orchestrator/phases/08b_objective_normalization/phase_8b_spec.md` (new)
- `orchestrator/phases/08b_objective_normalization/objective_normalization_engine.js` (new)
- `orchestrator/phases/08b_objective_normalization/__tests__/objective_normalization_engine.test.js` (new)

## Commits

1. `feat(phase-8B): implement Objective Normalization Engine` - Initial implementation
2. `fix(phase-8B): deterministic intent matching + empty intent fallback` - Spec-aligned fixes

Phase 8B is now hardened, aligned with the Forward-Hardening Framework, and ready for integration as the canonical intent→objective translator for Kaivo's planning pipeline.
