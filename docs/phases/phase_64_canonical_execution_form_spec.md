# Phase 64: Canonical Execution Form Generator

## 1. Purpose
Phase 64 takes the sealed envelope and deterministic snapshot from Phase 63 and produces a canonical execution form.
The canonical form must:
- Be byte-for-byte identical across replays.
- Use a deterministic field ordering.
- Normalize values (e.g., dates, numbers, arrays).
- Remove any vestigial debugging or non-contract fields.
- Produce a cryptographic-safe canonical string or structure that can feed downstream phases (Phase 65 Archive Writer).

## 2. Position in the Pipeline
- Phase 61: Envelope Closure
- Phase 62: State Recorder
- Phase 63: Commit Seal Engine
- **Phase 64: Canonical Execution Form Generator**
- Phase 65: Archive Writer

Phase 64 is pure logic. No IO, no timestamps, no mutations.

## 3. Contracts

### 3.1 Input Contract (`input_contract_v1`)
```json
{
  "execution_id": "exec_123",
  "phase": "64",
  "feature_flags": {
    "FF_CANONICAL_EXECUTION_FORM_GENERATOR": true
  },
  "sealed_envelope": {
    "closure_envelope": { "...": "deterministic" },
    "state_snapshot": { "...": "deterministic" },
    "commit_seal": {
      "algorithm": "sha256",
      "value": "abcdef123456",
      "inputs": {
        "envelope_hash": "string",
        "snapshot_hash": "string"
      }
    }
  }
}
```
**Required Fields**: `execution_id`, `phase` ("64"), `feature_flags`, `sealed_envelope` (closure, snapshot, seal).

**Forbidden Fields**: `_debug`, symbols, functions, undefined, unnormalized timestamps, non-deterministic objects.

### 3.2 Output Contract (`output_contract_v1`)
```json
{
  "execution_id": "exec_123",
  "phase": "64",
  "feature_flags": {
    "FF_CANONICAL_EXECUTION_FORM_GENERATOR": true
  },
  "canonical_form": {
    "version": "1",
    "canonical_bytes": "base64-string",
    "canonical_json": { "...": "strictly sorted, normalized form" },
    "hashes": {
      "canonical_sha256": "string",
      "structure_sha256": "string"
    }
  },
  "status": "OK"
}
```
**Status Values**:
- `OK`: Success.
- `FEATURE_DISABLED`: Flag off.
- `ERROR_MISSING_FIELD`: Missing required input.
- `ERROR_UNSERIALIZABLE_TYPE`: Input contains unsupported types.
- `ERROR_NON_DETERMINISTIC`: Non-deterministic values detection (guard).

## 4. Behavior

### 4.1 Canonicalization Rules
- **Keys**: Deep sorted lexicographically.
- **Arrays**:
  - If order meaningful: Preserved.
  - If order not meaningful: Sorted deterministically (default to preservation if ambiguous, assuming upstream phases handled order). *Clarification*: Since ordering in arrays is generally significant in execution envelopes, we preserve array order but recurse into elements.
- **Numbers**: Converted to strict JSON format.
- **Dates**: ISO 8601 strings.
- **Booleans**: Unchanged.
- **Forbidden**: `undefined`, `symbol`, `function`.

### 4.2 Hashing
- `canonical_sha256`: SHA-256 of `canonical_bytes` (UTF-8 encoded canonical JSON string, base64). *Wait, spec says "UTF-8 encoded bytes of the canonical JSON string, then base64 encoded" for canonical_bytes. And canonical_sha256 is hash(canonical_bytes).*
- `structure_sha256`: SHA-256 of `canonical_json` with whitespace removed.

## 5. Invariants
1. No IO.
2. No timestamps introduced.
3. No mutations to input.
4. Perfectly replayable.
5. Feature-flag controlled.

## 6. Observability
- **Log**: `canonical_execution_form_generated` ({execution_id, phase, canonical_bytes_length, status})
- **Metrics**: `canonical_form_generated`, `canonical_form_failures`
- **Trace**: `canonical_execution_form`

## 7. Test Plan
- 6 Happy Paths
- 6 Negative Paths
- 4 Edge Cases
- 1 Regression Guard
- 1 Determinism Guard
