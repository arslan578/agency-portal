# Phase 65: Execution Archive Writer

## 1. Overview
The **Execution Archive Writer** is the final phase of the State Closure Layer. It consumes the sealed, canonical execution artifacts (Phase 61-64) and produces a deterministic **archive intent**. This intent describes exactly what should be persisted to long-term storage, including the logical archive key and the redacted payload.

This phase is **pure logic** and performs **no IO**. It acts as the contract boundary between the orchestrator and the physical storage layer.

## 2. Goals
- **Deterministic Archive Key**: Derive a unique, reproducible path for the archive.
- **Payload Packaging**: Assemble the sealed execution envelope, state snapshot, commit seal, and canonical form into a single payload.
- **Safety**: Enforce redaction of forbidden fields (`raw_pii`, `_debug`, etc.) via deep cloning.
- **Validation**: Ensure all upstream artifacts are present and internally consistent (hash checks).

## 3. Contracts

### 3.1 Input Contract (`input_contract_v1`)
```json
{
  "execution_id": "string",
  "phase": "65",
  "feature_flags": { "FF_EXECUTION_ARCHIVE_WRITER": boolean },
  "tenant_context": {
    "tenant_id": "string",
    "workspace_id": "string",
    "brand_id": "string",
    "environment": "string"
  },
  "closed_execution_envelope": { "...": "object" },
  "state_snapshot": { "...": "object" },
  "commit_seal": {
    "seal_type": "string",
    "seal_hex": "string",
    "inputs": {
      "envelope_sha256": "string",
      "state_sha256": "string"
    }
  },
  "canonical_execution_form": {
    "canonical_envelope_json": "string",
    "canonical_state_json": "string",
    "canonical_envelope_bytes_b64": "string",
    "canonical_state_bytes_b64": "string",
    "canonical_sha256": "string",
    "structure_sha256": "string"
  },
  "archive_hints": {
    "retention_class": "string",
    "priority": "string",
    "labels": { "...": "object" },
    "requested_by": "string"
  }
}
```

### 3.2 Output Contract (`output_contract_v1`)
```json
{
  "ok": boolean,
  "status": "string",
  "execution_id": "string",
  "phase": "65",
  "feature_flags": { ... },
  "archive_descriptor": {
    "archive_key": "string",
    "retention_class": "string",
    "priority": "string",
    "tenant_id": "string",
    "workspace_id": "string",
    "brand_id": "string",
    "environment": "string",
    "canonical_sha256": "string",
    "structure_sha256": "string",
    "commit_seal_type": "string",
    "commit_seal_hex": "string",
    "approx_payload_bytes": number
  },
  "archive_intent": {
    "archive_version": "archive_v1",
    "archive_key": "string",
    "payload": {
      "execution_id": "string",
      "tenant_context": { ... },
      "closed_execution_envelope": { ... },
      "state_snapshot": { ... },
      "commit_seal": { ... },
      "canonical_execution_form": { ... },
      "archive_metadata": { ... }
    }
  },
  "observability": {
    "metrics": { ... },
    "logs": { ... },
    "trace": { ... }
  }
}
```

## 4. Behavior Rules
1. **Feature Flag**: If `FF_EXECUTION_ARCHIVE_WRITER` is disabled, return `status: "FEATURE_DISABLED"` immediately.
2. **Forbidden Fields**: Reject `_debug`, `raw_pii`, `unredacted`, `internal_secret` in input. Redact them from output payload.
3. **Consistency**: Ensure `commit_seal.inputs.envelope_sha256` == `canonical_execution_form.canonical_sha256`. If not, return `HASH_MISMATCH`.
4. **Archive Key Derivation**:
   `{tenant_id}/{workspace_id}/{environment}/{execution_id}/commit_{short_commit}.json`
   - `short_commit`: first 12 chars of `commit_seal.seal_hex`
   - Segments lowercased, non-alphanumeric chars replaced with `_`.
5. **Determinism**: All output object keys must be sorted lexicographically.

## 5. Status Codes
- `OK`
- `FEATURE_DISABLED`
- `INVALID_INPUT`
- `FORBIDDEN_FIELD_PRESENT`
- `HASH_MISMATCH`
- `INTERNAL_ERROR`
