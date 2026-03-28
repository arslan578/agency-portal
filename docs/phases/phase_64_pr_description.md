# Phase 64: Canonical Execution Form Generator

## 🎯 Goal
Implement **Phase 64: Canonical Execution Form Generator** to convert the sealed execution envelope and state snapshot into a **canonical, byte-for-byte reproducible form**. This phase is the normalization layer (Merkle-ready) that ensures identical inputs produce identical byte streams, regardless of runtime environment, essential for the subsequent Archive Writer (Phase 65).

## 🛠 Key Changes
- **New Engine**: `orchestrator/phases/phase_64_canonical_execution_form_generator/phase_64_canonical_execution_form_generator.js`
    - **Deterministic Canonicalization**:
        - Recursively sorts object keys.
        - Normalizes Dates to ISO 8601 strings.
        - Strict JSON number handling.
        - Preserves array order (semantically meaningful).
    - **Hashing**:
        - Computes `canonical_sha256` (hash of base64-encoded canonical bytes).
        - Computes `structure_sha256` (hash of canonical JSON string without whitespace).
    - **Validation**:
        - Rejects `undefined`, `function`, `symbol`, `_debug`.
        - Enforces strict input contract (`sealed_envelope` presence).
    - **Feature Flag**: `FF_CANONICAL_EXECUTION_FORM_GENERATOR` (Default: OFF).
    - **Observability**: Metrics (`canonical_form_generated`), Logs, Tracing.
    - **Spec-Alignment Patch**:
        - Updated internal comments and error messages to match spec strictly.
        - Enforced strict Feature Flag evaluation order (Contract > Flag).
        - Updated output object key ordering for determinism.
        - Renamed regression guard for clarity.

- **New Test Suite**: `orchestrator/phases/phase_64_canonical_execution_form_generator/__tests__/phase_64_canonical_execution_form_generator.test.js`
    - **18 Tests Covering**:
        - Happy Paths (Basic, Nested, Arrays, Dates, Hashing, Base64).
        - Negative Paths (Missing fields, Forbidden types, Flag disabled).
        - Edge Cases (Empty objects, Deep nesting, Large arrays, Infinity).
        - Guards (Regression sorting, 100-run Determinism).

- **Dispatcher Integration**:
    - Wired `CANONICAL_EXECUTION_FORM_GENERATOR_V1` into `orchestrator/dispatcher.js`.

- **Documentation**:
    - Added `docs/phases/phase_64_canonical_execution_form_spec.md`.

## 🧪 Verification
- **Automated Tests**:
    - `npx jest orchestrator/phases/phase_64_canonical_execution_form_generator/__tests__/phase_64_canonical_execution_form_generator.test.js`
    - Result: **18/18 Passed**.
    - Verified strict immutability and stable hashing.

## artifacts
- [Spec](docs/phases/phase_64_canonical_execution_form_spec.md)
- [Engine](orchestrator/phases/phase_64_canonical_execution_form_generator/phase_64_canonical_execution_form_generator.js)
- [Tests](orchestrator/phases/phase_64_canonical_execution_form_generator/__tests__/phase_64_canonical_execution_form_generator.test.js)
