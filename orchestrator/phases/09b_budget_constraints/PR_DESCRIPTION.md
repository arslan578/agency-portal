# Phase 9B — Budget Constraints Engine (Spec-Aligned, Deterministic, Fully Tested)

## Overview

Phase 9B introduces the **Budget Constraints Engine**, the canonical firewall for budget correctness in the Kaivo Orchestrator. It evaluates policy-driven, cross-venue, and objective-driven constraints before any allocation occurs, ensuring that every budget passed downstream is feasible, safe, and compliant.

This phase sits between Phase 8B (Objective Normalization) and Phase 9A (Baseline Budgeting).

## Implementation Summary

### 1. Deterministic Constraint Resolution
- **Four-Layer Evaluation:**
  1. **Global:** Checks total budget against policy minimums/maximums and objective-driven floors.
  2. **Venue:** Enforces platform-specific minimums (e.g., TikTok $50, Google $20).
  3. **Policy:** Applies blocks from creative compliance and policy rules.
  4. **Objective:** Enforces higher minimums for high-reach/conversion goals.
- **Strict Status Precedence:** `POLICY_BLOCK` > `UNSUPPORTED_BUDGET` > `CONSTRAINTS_VIOLATION` > `OK`.

### 2. Specification Compliance
- **Contract:** `budget_constraints_output_v1`
- **Feature Flag:** `FF_BUDGET_CONSTRAINTS_ENGINE` (defaults to false)
- **Observability:** Full metrics, logs, and trace spans.
- **Invariants:** No mutation, replay-safe, no inline numbers (except fallbacks).

### 3. Surgical Fixes Applied
To align implementation with the strict Forward-Hardening Framework:
- **Status Precedence:** Replaced sequential overwrites with deterministic priority logic to ensure the most severe error is always returned.
- **Global Minimum Semantics:** Removed hardcoded `MIN_GLOBAL` in favor of dynamic calculation (`max(policy_min, objective_min, sum_venue_mins)`).
- **Constraint Reasoning:** Ensured all reasons are collected and sorted alphabetically for determinism.

## Determinism & Replay Safety

- **100% Deterministic:** Same inputs always produce identical outputs.
- **Replay Safe:** No side effects, no external IO (except allowed knowledge lookups).
- **Verified:** Determinism guard test (Test #18) confirms identical output across multiple runs.

## Tests (18/18 Passing)

Comprehensive suite covering all scenarios:

```bash
--- Happy Path (6) ---
✓ 1. Valid single-venue budget
✓ 2. Valid multi-venue budget
✓ 3. Budget meets global minimum
✓ 4. Budget meets venue minimums
✓ 5. Objective-driven feasibility (reach-heavy)
✓ 6. Objective-driven feasibility (conversion-heavy)

--- Negative Path (6) ---
✓ 7. Budget below global minimum
✓ 8. Budget below venue minimum
✓ 9. Budget violates policy cap
✓ 10. Creative compliance blocks venue
✓ 11. Objective conflict with spend
✓ 12. Missing required fields

--- Edge Cases (4) ---
✓ 13. Zero-budget request
✓ 14. Extremely large budget
✓ 15. One venue feasible, others not
✓ 16. All venues blocked by policy

--- Guards (2) ---
✓ 17. Constraint reasoning stability
✓ 18. Determinism guard
```

## Files Added/Updated

- `orchestrator/phases/09b_budget_constraints/phase_9b_budget_constraints_engine.js` (New)
- `orchestrator/phases/09b_budget_constraints/phase_9b_budget_constraints_spec.md` (New)
- `orchestrator/phases/09b_budget_constraints/__tests__/phase_9b_budget_constraints_engine.test.js` (New)

## Ready for Merge

Phase 9B is fully implemented, hardened, and verified. It is ready to serve as the budget correctness authority for the Kaivo Orchestrator.
