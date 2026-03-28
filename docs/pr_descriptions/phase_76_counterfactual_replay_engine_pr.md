# Phase 76: Counterfactual Replay Engine

## 🎯 Purpose
Implements **Phase 76**, the **Counterfactual Replay Engine**, which enables deterministic "what-if" analysis by replaying sealed executions with modified inputs (deltas/envelopes) without altering the original history.

## 🛠 Features
- **Pure Logic Analysis**: Evaluates multiple scenarios deterministically against a readonly baseline.
- **Scenario Simulation**:
  - `DELTA_MUTATION` & `ENVELOPE_MUTATION` modes.
  - Integration with **Phase 75 (Deterministic Replay Engine)** for ground-truth reconstruction.
- **Comparative Metrics**: Auto-calculates `spend_delta`, `impressions_delta`, and `cost_index` vs baseline.
- **Forward-Hardening**:
  - Strict Commit Seal verification.
  - Deterministic processing and sorting of parallel scenarios.
  - Error-as-value handling and exhaustive validation.

## ✅ Verification
- **Automated Tests**: 20 tests passed.
  - **Happy Path (6)**: Delta/Envelope overrides, multi-scenario sorting, constraint checks.
  - **Negative Path (6)**: Forbidden fields, invalid phases, seal mismatches.
  - **Edge Cases (4)**: Duplicate IDs, known warnings, empty deltas.
  - **Guards (2)**: 50-run Stability, Insertion Order Independence.

## 📦 Changes
- `[NEW] phase_76_counterfactual_replay_engine.js`
- `[NEW] phase_76_counterfactual_replay_engine.test.js`
- `[NEW] phase_76_spec.md`

## ⚠️ Notes for Reviewer
- This phase **must never** mutate the input baseline object. Tests verify strict immutability.
- Scenarios are evaluated sequentially (logically) but are pure, so they can be parallelized in future versions if needed.
- Uses `Phase 75` as a library dependency for the core replay mechanics.
