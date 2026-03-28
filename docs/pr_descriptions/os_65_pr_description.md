## Title
[OS-65] Implement Connector Registry (Forward-Hardened)

## Description
This PR implements **OS-65: Connector Registry**, a core OS module responsible for validating and storing the canonical definitions of all system connectors. This module is built strictly according to the Forward-Hardening Framework.

### Key Features
*   **Deterministic Registry**: Guarantees byte-for-byte reproducible output by enforcing lexicographical sorting of entries and deep key sorting of internal objects (capabilities/constraints).
*   **Strict Validation**:
    *   Enforces semantic versioning (`x.y.z`).
    *   Rejects unknown or forbidden fields.
    *   Requires pure-data structures for capabilities.
*   **Observability**: Fully instrumented with structured logs, metrics, and tracing spans.
*   **Safety**:
    *   Error-as-Value: No thrown exceptions; errors are returned as structured objects.
    *   Atomic Failure: Any validation failure rejects the entire batch.
    *   No Partial Success.

### Verification
A comprehensive **18-test suite** (`os_65_connector_registry.test.js`) verifies all contract requirements:
1.  **Happy Path**: Single/Multiple connectors, Version ordering, Deterministic sorting.
2.  **Negative Path**: Missing ID/Version, Invalid types, Forbidden fields, Feature flagged off.
3.  **Edge Cases**: Empty registry, Nested capabilities, Adjacent IDs.
4.  **Guards**: Determinism loop (100x), Regression checks.

Run tests via: `npm test kaivo_os/os_65_connector_registry`

## Checklist
- [x] Engine (`os_65_connector_registry.js`)
- [x] Test Suite (`os_65_connector_registry.test.js`)
- [x] Specification (`os_65_connector_registry_spec.md`)
- [x] Documentation (`task.md`, `walkthrough.md`)
