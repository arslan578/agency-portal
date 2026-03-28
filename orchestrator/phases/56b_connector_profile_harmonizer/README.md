# Phase 56B: Connector Profile Harmonizer

## Overview
Phase 56B produces the authoritative, normalized, schema-harmonized connector profile set consumed by Phase 57. It ensures that every connector entering the global merge phase conforms to a deterministic, schema-aligned, capability-aware, and backplane-governed metadata profile.

## Key Features
*   **Schema Harmonization:** Validates against Backplane schema, normalizes fields, and strips forbidden data.
*   **Capability Expansion:** Resolves capabilities from external tables, strictly enforcing defined capabilities.
*   **Routing Normalization:** Deterministically computes readiness and redundancy groups.
*   **Determinism:** Enforces lexicographical sorting and deep normalization for replay safety.
*   **Observability:** Full structured logging, metrics, and tracing.

## Inputs
*   `from_phase_56.connector_states`: Raw connector states.
*   `capability_tables`: External capability definitions.
*   `backplane_schema`: Phase 27B schema definition.

## Outputs
*   `harmonized_profiles`: Normalized, schema-compliant profiles ready for Phase 57.

## Usage
```javascript
const { execute } = require('./connector_profile_harmonizer_engine');
const result = execute(input);
```
