## Title
[OS-64] Implement Deterministic Package Manager (TP1 Hardened)

## Description
This PR implements **OS-64: Kaivo Package Manager**, a deterministic, pure-functional engine for resolving OS-level package dependencies. This implementation fulfills the TP1 tightening requirements, ensuring strict deterministic output, robust error handling, and policy enforcement.

### Key Features
*   **Deterministic Resolution**: Uses a custom constraint solver with cycle detection and memoization to produce stable dependency graphs.
*   **Canonical Fingerprinting**: Implements a `computeDeterministicFingerprint` function that hashes canonicalized inputs, plans, and lock states using SHA-256.
*   **Strict SemVer**: Custom implementation of SemVer logic supporting advanced ranges (e.g., `>=1.0 <2.0`), pre-releases, and `prefer_lowest` resolution.
*   **Policy Enforcement**:
    *   `forbidden_packages`: Prevents usage of specific packages.
    *   `forbidden_package_types`: Prevents usage of specific package types (e.g., "DAEMON").
    *   `version_pins`: Overrides requested ranges with strict versions.
    *   `allowed_version_ranges`: Restricts valid versions to a subset.
    *   `disallow_downgrades`: Explicitly errors on downgrade attempts.
*   **Lockfile Management**:
    *   **Drift Detection**: Errors if locked packages are missing from the registry.
    *   **Lock/Unlock**: explicit operations to pin/unpin packages.
    *   **Drift/Persistence**: Automatically preserves locked versions unless explicitly upgraded or removed.
*   **Contract Alignment**: Output structure strictly matches `os_64_package_manager_output_v1`, including sorted steps, `op_id` propagation, and specific reason codes.

### Safety & Error Model
The engine is "fail-safe" and "no-partial-success". Any error during resolution or planning results in a structured `ERROR` response with one of the following codes:
*   `INVALID_INPUT`, `MISSING_FIELD`, `INVALID_FIELD_TYPE`, `FORBIDDEN_FIELD`
*   `UNKNOWN_PACKAGE`, `UNKNOWN_VERSION`
*   `UNSATISFIABLE_VERSION_RANGE`, `CONFLICTING_CONSTRAINTS`
*   `CYCLIC_DEPENDENCY`
*   `LOCKFILE_DRIFT`
*   `POLICY_VIOLATION`
*   `UNSUPPORTED_OPERATION`

## Verification
A comprehensive test suite (`os_64_package_manager.test.js`) covers 18 scenarios:
1.  **Happy Path**: Simple install, Transitive deps, Upgrades, Peer deps, No-ops.
2.  **Negative**: Missing input, Drift, Forbidden fields, Cycles, Unsatisfiable ranges, Policy violations.
3.  **Edge Cases**: Advanced ranges, Lock/Unlock ops, Type safety.
4.  **Determinism**: 50-run stability check ensuring identical fingerprints.

run: `npm test kaivo_os/os_64_package_manager`

## Checklist
- [x] Engine Implementation (`os_64_package_manager.js`)
- [x] Test Suite (`os_64_package_manager.test.js`)
- [x] Documentation (`task.md`, `walkthrough.md`)
- [x] TP1 Tightening (Fingerprinting, Sorting, Drift, Validation)
