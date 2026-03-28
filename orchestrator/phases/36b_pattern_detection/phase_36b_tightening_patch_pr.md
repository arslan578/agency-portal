# Phase 36B Tightening Patch (Forward-Hardening Compliance)

## Overview
This patch brings Phase 36B (Pattern Detection Engine) into full compliance with the Kaivo Forward-Hardening Framework. It addresses violations related to hardcoded semantic labels, non-deterministic logic, and missing observability.

## Violations Addressed
1.  **Hardcoded Semantic Labels:** Removed logic like `if (roas > 2.0) label = "High_ROAS"` in favor of neutral structural labels (`cluster_0`, `cluster_1`).
2.  **Hardcoded Dimension Extractors:** Replaced ad-hoc property access with a deterministic `resolvePatternDimensions` function.
3.  **Loose Input Contract:** Added strict validation to reject forbidden top-level fields.
4.  **Missing Observability:** Added integration with `logging.js`, `metrics.js`, and `tracing.js`.
5.  **Incorrect Feature Flag Response:** Updated disabled response to match the strict contract.
6.  **Missing Temporal Patterns:** Added minimal deterministic temporal pattern extraction (interval detection).

## Added Invariants
*   **Neutral Labeling:** Clusters are labeled strictly by their index after sorting.
*   **Strict Input Validation:** Any unknown field in the input object triggers an `INVALID_FIELD` error.
*   **Deterministic Dimensions:** Dimensions are resolved using a stable, schema-agnostic approach.
*   **Observability:** Every execution emits a structured log, metrics, and a trace span.

## Test Suite (24/24 Passing)
All existing tests pass, plus 6 new tests covering the tightening requirements:
*   Forbidden field rejection
*   Invalid dimension values
*   Null memory_graph.metadata
*   Deterministic dimension resolver
*   Semantic-neutral labeling stability
*   Temporal pattern extraction

## Contract Stability
*   The output shape remains compatible with `pattern_detection_engine_v1`.
*   `pattern_clusters` and `pattern_vectors` are guaranteed to be present (or null if disabled).
*   `stop_reason` is provided when the feature flag is off.

## Determinism Guarantees
*   **Clustering:** Uses deterministic K-means with sorted initialization.
*   **Sorting:** All outputs (clusters, signatures, explanations) are sorted by ID or content.
*   **No Randomness:** No random seeds or heuristic logic.

## Observability Compliance
*   **Logs:** `pattern_detection_engine_event_v1`
*   **Metrics:** `pattern_detection_clusters_total`, `pattern_detection_failure_signatures`
*   **Tracing:** `phase_36b_pattern_detection` span wrapping execution.
