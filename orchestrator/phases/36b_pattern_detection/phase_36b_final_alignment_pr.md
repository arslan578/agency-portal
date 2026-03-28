# Phase 36B: Final Alignment Patch (Engine ⇄ Spec)

## Overview
This patch applies the final tightening required to ensure the Phase 36B Pattern Detection Engine and the Phase 36B Specification are 100% aligned. It addresses discrepancies in labeling, dimension semantics, feature flag behavior, and pattern definitions.

## Mismatches Corrected
1.  **Neutral Labels:** Spec examples updated to use `cluster_0` instead of `High_ROAS_Low_Scale`.
2.  **Feature Flag Behavior:** Spec updated to reflect the actual `ok: false` and `status: 'FEATURE_DISABLED'` response shape.
3.  **Pattern Types:** Explicitly marked "Seasonality", "Policy Conflicts", and "Optimizer Patterns" as **v2 reserved** in the spec.
4.  **Dimension Resolver:** Added `dimension_resolver: 'DEFAULT_V1'` to the engine output and spec.
5.  **Stats/Explanations:** Updated spec examples to use neutral semantics.
6.  **Memory Graph Authority:** Added a defensive guard in the engine to strictly ignore `memory_graph.edges` when top-level `nodes`/`edges` are present, preventing split-brain logic.

## 1:1 Match Confirmation
*   **Engine Output:** Matches the `output_contract_v1` in `phase_36b_spec.md` exactly.
*   **Spec Examples:** Copy-paste compatible with actual engine output.
*   **Behavior:** Feature flag and input precedence rules are now identical in code and documentation.

## Versioning & Future Expansion
*   **v1 Scope:** Restricted to Venue/Creative clustering (neutral labels), Failure Patterns (Drift/Health), and minimal Temporal Patterns (Intervals).
*   **v2 Reserved:** Seasonality, Policy Conflicts, Optimizer Patterns, and Semantic Labeling are explicitly deferred to v2.

## Test Suite (26/26 Passing)
*   24 existing tests updated to match final spec.
*   **New Test A:** Verifies `dimension_resolver` field exists.
*   **New Test B:** Verifies `memory_graph.edges` is ignored for clustering when top-level inputs exist.
