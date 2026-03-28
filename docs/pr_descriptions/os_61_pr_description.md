# OS-61: Kaivo Manifest Engine

## Overview
OS-61 is the first kernel module of the Kaivo OS Subsystem. It provides the trusted entry point for "Campaign-as-Code" by strictly validating, normalizing, and hashing **Kaivo Manifests**. It operates distinctly from the orchestrator pipeline, residing in `kaivo_os/`.

## Changes
- **New Directory**: `kaivo_os/os_61_manifest_engine/`
- **New Module**: `os_61_manifest_engine.js`
    - Pure logic execution (no IO, no timestamps).
    - Strict input contract validation.
    - Deterministic normalization (sorted keys, defaults injection).
    - Content (`manifest_sha256`) and Structure (`structure_sha256`) hashing.
- **New Dispatcher**: `kaivo_os/os_dispatcher.js` registered with OS-61.
- **Test Suite**: `os_61_manifest_engine.test.js`
    - 18 tests (FH Atomic Bundle): 6 Happy, 6 Negative, 4 Edge, 1 Regression, 1 Determinism.
    - 100% Pass Rate.

## Verification
- **Automated Tests**: 18/18 passed.
- **Forward-Hardening**: Verified determinism loop (DG1) and byte stability (RG1).
- **Compliance**: Adheres to strict "Pure Logic" and "Deterministic Contract" rules of the new OS Subsystem.

## Deliverables
- `kaivo_os/os_61_manifest_engine/os_61_manifest_engine.js`
- `kaivo_os/os_61_manifest_engine/os_61_manifest_engine.test.js`
- `kaivo_os/os_dispatcher.js`
- `docs/pr_descriptions/os_61_pr_description.md`
