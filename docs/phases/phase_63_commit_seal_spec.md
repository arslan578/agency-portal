# Phase 63: Commit Seal Engine

## 1. Purpose
Phase 63 consumes the closed execution envelope and recorded state snapshot, then produces a deterministic commit seal that certifies the contents.
The commit seal creates a tamper-evident fingerprint over:
- The finalized execution envelope from Phase 61
- The deterministic state snapshot from Phase 62

This seal is used by later phases for replay verification, archive storage, and audit integrity.

## 2. Position in the pipeline
**State Closure Layer:**
- Phase 61: Execution Envelope Closure Engine
- Phase 62: Execution State Recorder
- **Phase 63: Commit Seal Engine**
- Phase 64: Canonical Execution Form Generator
- Phase 65: Execution Archive Writer

Phase 63 is pure logic. It performs no IO and introduces no new timestamps or randomness. All outputs are fully replayable.

## 3. Contracts

### 3.1 Input contract (`input_contract_v1`)
```json
{
  "execution_id": "exec_123",
  "phase": "63",
  "feature_flags": {
    "FF_COMMIT_SEAL_ENGINE": true
  },
  "execution_envelope": {
    "...": "Closed envelope from Phase 61"
  },
  "state_snapshot": {
    "...": "Deterministic snapshot from Phase 62"
  },
  "previous_commit_seal": {
    "algorithm": "SHA256_CANONICAL_JSON_V1",
    "hash": "abc123...",
    "scope": "EXECUTION_ENVELOPE_V1",
    "seal_version": "v1"
  }
}
```

**Required fields**:
- `execution_id` (string, non-empty)
- `phase` (string, must equal "63")
- `feature_flags` (object, present, may be empty)
- `execution_envelope` (object, validated and frozen by Phase 61)
- `state_snapshot` (object, written by Phase 62)

**Optional fields**:
- `previous_commit_seal` (object, optional, used for chained validation or continuity checks)

**Forbidden fields**:
Input must not contain these top-level fields:
- `commit_seal`
- `canonical_form`
- `archive_pointer`

Presence of any forbidden field must yield `ok: false` with `status: "FORBIDDEN_FIELD"`.

### 3.2 Output contract (`output_contract_v1`)
```json
{
  "execution_id": "exec_123",
  "phase": "63",
  "feature_flags": {
    "FF_COMMIT_SEAL_ENGINE": true
  },
  "ok": true,
  "status": "SEALED",
  "execution_envelope": {
    "...": "Unchanged from input"
  },
  "state_snapshot": {
    "...": "Unchanged from input"
  },
  "commit_seal": {
    "seal_version": "v1",
    "algorithm": "SHA256_CANONICAL_JSON_V1",
    "scope": "EXECUTION_ENVELOPE_AND_STATE_SNAPSHOT_V1",
    "hash": "4f9c7d80...",
    "input_fingerprint": {
      "execution_id": "exec_123",
      "phase": "63"
    },
    "previous_hash": "abc123...",
    "sealed_source": {
      "envelope_hash_v1": "fe12...",
      "state_hash_v1": "09aa..."
    }
  }
}
```

**Status values**:
- `SEALED`: Success. Seal computed.
- `FEATURE_DISABLED`: FF_COMMIT_SEAL_ENGINE false/missing. No seal created.
- `INVALID_INPUT`: Missing field, wrong type, or validation failure.
- `FORBIDDEN_FIELD`: Forbidden field present in input.
- `INTEGRITY_MISMATCH`: Seal recomputation failed self-check.

## 4. Feature flag
- **Name**: `FF_COMMIT_SEAL_ENGINE`
- **Default**: Off.
- **Runtime rules**:
  - Disabled: Copies inputs, status "FEATURE_DISABLED", no `commit_seal`.
  - Enabled: Validates, computes hashes, status "SEALED".
- **Normative Evaluation Order**: The feature flag is evaluated only after all contract and forbidden-field validation passes. Invalid inputs must never be masked by `FEATURE_DISABLED`.

## 5. Behavior

### 5.1 High-level behavior
The commit seal is a pure function of the canonicalized execution envelope, canonicalized state snapshot, and the previous hash sentinel or inherited previous seal hash.

1.  **Validation**:
    - Validates contract shape (execution_id, phase, envelope/snapshot types).
    - Verifies absence of forbidden fields.
    - Validates `previous_commit_seal` is an object if present.
    - **Note**: Validation occurs *before* feature flag resolution.
2.  **Feature Flag Resolution**:
    - If disabled: Returns `FEATURE_DISABLED` with strict output shape (no `commit_seal`, no passed-through extra fields).
3.  **Canonicalization & Hashing**:
    - Computes `envelope_hash_v1` and `state_hash_v1`.
    - Uses `PREVIOUS_HASH_SENTINEL` ("NONE") if previous hash missing.
4.  **Seal Construction**:
    - computes combined hash.
5.  **Integrity Check**:
    - Recomputes combined hash to verify determinism. Returns `INTEGRITY_MISMATCH` if hashes differ.
6.  **Output**:
    - Returns `SEALED` with `commit_seal` and explicit `contract: 'commit_seal_engine_v1'`.

### 5.2 Canonicalization rules
- Uses `PREVIOUS_HASH_SENTINEL = 'NONE'`.
- Recursively sorts object keys lexicographically.
- Converts Date instances to ISO 8601 strings.
- Rejects `undefined`, `function`, `symbol`, and `bigint` with `INVALID_INPUT`.

### 5.3 Hash algorithm
- `SHA256_CANONICAL_JSON_V1`: `crypto.createHash('sha256')` over canonical JSON string.

### 5.4 Commit seal structure
(Unchanged)

## 6. Invariants
1. **Immutability**: Input envelope/snapshot must deep equal output.
2. **Hash determinism**: Identical inputs yield identical hashes. Double-checked at runtime.
3. **Isolation**: No IO, timers, or RNG.
4. **Schema stability**: Seal shape must be stable.
5. **Strict Outputs**:
   - Always include `contract: 'commit_seal_engine_v1'`.
   - `FEATURE_DISABLED` returns strict subset of fields.
   - Diagnostics live under `debug.diagnostics`.

### 5.4 Commit seal structure
- `seal_version`: "v1"
- `algorithm`: "SHA256_CANONICAL_JSON_V1"
- `scope`: "EXECUTION_ENVELOPE_AND_STATE_SNAPSHOT_V1"
- `hash`: SHA-256 over combined object.
- `input_fingerprint`: execution_id + phase.
- `previous_hash`: matches previous seal or "NONE".
- `sealed_source`: component hashes.

## 6. Invariants
1. **Immutability**: Input envelope/snapshot must deep equal output.
2. **Hash determinism**: Identical inputs yield identical hashes.
3. **Isolation**: No IO, timers, or RNG.
4. **Schema stability**: Seal shape must be stable.
5. **Feature flag safety**: Disabled = no seal.
6. **Forward compatibility**: New fields optional.

## 7. Observability
- **Metrics**:
    - `phase_63_invocations_total`
    - `phase_63_sealed_total`
    - `phase_63_feature_disabled_total`
    - `phase_63_invalid_input_total`
    - `phase_63_commit_seal_hash_length`
- **Structured Log**: `phase_63_commit_seal` event.
- **Tracing**: `phase_63_commit_seal` span.

## 8. Error handling
- Contract violations -> `ok: false`, status set.
- Never throw uncaught errors. Catch and map to `INVALID_INPUT`.

## 9. Test plan
- **6 Happy Paths**: Valid/sealed, Chained seal, Nested, Dates, Large payload, Feature disabled.
- **6 Negative**: Missing ID, Wrong phase, Missing envelope, Forbidden field, Forbidden types (undefined/func), Non-object snapshot.
- **4 Edge Cases**: Empty valid objects, Previous seal missing hash, Exotic valid JSON, Long strings.
- **1 Regression Guard**: Test key sorting recursion.
- **1 Determinism Guard**: 100x run stability check.
