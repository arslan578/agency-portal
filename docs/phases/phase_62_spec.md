# Phase 62 – Execution State Recorder Specification

**Contract name**: `execution_state_recorder_v1`
**Feature flag**: `FF_EXECUTION_STATE_RECORDER`
**Mode**: Pure logic, no external IO, replay-safe.
**Position**: ... → 61 (Execution Envelope Closure Engine) → **62 (Execution State Recorder)** → 63+

---

## 1. Purpose

Phase 62 takes the closed execution envelope from Phase 61 and produces a single, canonical, JSON-serializable snapshot that:
*   Can be persisted by later phases without further massaging.
*   Is stable under replay (same input, byte-identical snapshot).
*   Is safe for multi-tenant diagnostics (no PII resurrection, no connector secrets).
*   Becomes the core “state atom” used by the later replay / time travel phases.

"Write" here means: construct the snapshot object and prove it can be serialized. The actual write to storage happens in later phases.

## 2. Inputs – `input_contract_v1`

The engine accepts a single input object:

```json
{
  "execution_id": "exec_123",
  "phase": "62",
  "feature_flags": {
    "FF_EXECUTION_STATE_RECORDER": true
  },
  "closed_envelope": {
    "...": "output from Phase 61"
  },
  "snapshot_hints": {
    "max_bytes": 1048576,
    "include_debug_traces": false
  }
}
```

### Required Fields
*   `execution_id`: string, non empty.
*   `phase`: must equal the string "62".
*   `feature_flags`: object, may be empty but must exist.
*   `closed_envelope`: object, the Phase 61 output envelope, already sanitized and key-sorted.

### Optional Fields
*   `snapshot_hints`: optional tuning hints:
    *   `max_bytes`: soft maximum size in bytes for the snapshot, default 1,048,576 (1 MB).
    *   `include_debug_traces`: boolean, default false.

### Forbidden Fields
To keep the contract tight and prevent “mystery backdoors,” these keys at the top level are forbidden:
*   `snapshot`
*   `raw_request`
*   `raw_response`

If present, the engine must reject input with `ok: false, status: "INVALID_INPUT_FORBIDDEN_FIELDS"`.

## 3. Outputs – `output_contract_v1`

### On Success

```json
{
  "ok": true,
  "status": "OK",
  "execution_id": "exec_123",
  "phase": "62",
  "snapshot_contract": "execution_state_snapshot_v1",
  "snapshot": {
    "header": {
      "execution_id": "exec_123",
      "snapshot_version": 1,
      "recorded_at": "2025-12-06T12:34:56.789Z",
      "tenant_id": "tenant_abc",
      "workspace_id": "ws_123",
      "brand_id": "brand_789",
      "run_sequence": 7,
      "source_phase": "61",
      "manifest_version": "mf_2025_11_01_v3"
    },
    "envelope_hash": "sha256:abcdef...",
    "closed_envelope": {
      "...": "deep cloned Phase 61 output"
    },
    "state_views": {
      "connectors": { "...": "projection from closed_envelope" },
      "policy": { "...": "projection from closed_envelope" },
      "safety": { "...": "projection from closed_envelope" },
      "optimizer": { "...": "projection from closed_envelope" },
      "timeline": { "...": "projection from closed_envelope" }
    },
    "trace": {
      "trace_id": "trace_123",
      "span_ids": ["span_1", "span_2"]
    },
    "meta": {
      "size_bytes_estimate": 42318,
      "field_count": 172,
      "warnings": []
    }
  }
}
```

### On Failure

```json
{
  "ok": false,
  "status": "FEATURE_DISABLED" | "INVALID_INPUT" | "INVALID_INPUT_FORBIDDEN_FIELDS" | "NON_SERIALIZABLE_FIELD" | "SNAPSHOT_TOO_LARGE",
  "execution_id": "exec_123",
  "phase": "62",
  "snapshot_contract": "execution_state_snapshot_v1",
  "snapshot": null,
  "error": {
    "code": "NON_SERIALIZABLE_FIELD",
    "message": "Found non-JSON type at path closed_envelope.foo[1].bar",
    "path": "closed_envelope.foo[1].bar"
  }
}
```

### Key Points
*   `snapshot` is always either a fully valid object or `null`.
*   `closed_envelope` inside snapshot is a deep clone.
*   `envelope_hash` is computed over the deterministic, key-sorted `closed_envelope`.
*   All fields must be JSON-serializable primitives.

## 4. Determinism and Serialization Rules

This phase must obey the **Forward Hardening** rules:
*   **Deterministic contract and version tag**: `snapshot_contract` pinned to "execution_state_snapshot_v1".
*   **Idempotent behavior**: same input, same snapshot, same `envelope_hash`.
*   **No hidden IO**: JSON only.
*   **Schema evolution**: future fields must be optional.

### Serialization Rules
*   Run `JSON.stringify(snapshot)` in a safe internal try block to confirm serializability.
*   If stringify fails, return `ok: false, status: "NON_SERIALIZABLE_FIELD"`.
*   All object keys must be sorted recursively in the snapshot.

## 5. Invariants

1.  `snapshot.header.execution_id === input.execution_id`.
2.  `snapshot.header.source_phase === "61"` and `phase === "62"`.
3.  `snapshot.closed_envelope` is structurally identical to input (apart from sorting/Date normalization).
4.  No new PII or connector secrets.
5.  `size_bytes_estimate` must not exceed `snapshot_hints.max_bytes`.
6.  Input object must not be mutated.

## 6. Observability

*   **Log**: `"phase": "62", "status", "execution_id", "snapshot_bytes", "warnings_count"`.
*   **Metrics**:
    *   `kaivo.phase62.snapshot_created` (counter)
    *   `kaivo.phase62.snapshot_failed` (counter)
    *   `kaivo.phase62.snapshot_bytes` (gauge)
*   **Trace**: Tagged with `key: "execution_state_recorder_v1"`.

## 7. Feature Flag Behavior

*   `FF_EXECUTION_STATE_RECORDER === "true"` (env) AND `feature_flags.FF_EXECUTION_STATE_RECORDER === true`: **Active**.
*   Otherwise: Return `status: "FEATURE_DISABLED"`.
