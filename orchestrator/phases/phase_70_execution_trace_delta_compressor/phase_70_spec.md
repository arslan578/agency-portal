# Phase 70: Execution Trace Delta Compressor Specification

**Status:** Canonical (v1)
**Feature Flag:** `FF_EXECUTION_TRACE_DELTA_COMPRESSOR`

## 1. Overview

The **Execution Trace Delta Compressor** sits at the head of the Formal Execution Model Layer. It receives a canonicalized execution trace (from Phase 64) and computes the minimal set of deterministic deltas required to reconstruct the full trace. This minimizes storage while maximizing replay fidelity (for Phase 75).

### Role
- **Input:** Canonical Trace (Sequence of Envelopes & Snapshots).
- **Output:** Delta Trace (Sequence of Diff Objects) + Invariant Hash.
- **Nature:** Pure Logic. No side effects, no IO, no randomness, no timestamps.

## 2. Input Contract

The engine accepts a single `InputEnvelope`.

### Required Fields
- `execution_id` (string)
- `phase`: "70"
- `feature_flags`: Record<string, boolean>
- `canonical_trace`: Object
    - `steps`: Array of Step Objects (Must be ≥ 1)

### Step Object Structure
- `step_id`: string
- `envelope`: Object (Normalized)
- `snapshot`: Object (Normalized)

### Hard Constraints
- **No `undefined` values.**
- **No unknown top-level fields.**
- **No keys starting with `_debug` (deep check).**
- **No forbidden types** (Function, Symbol, BigInt).
- **No Date Objects** (Must be pre-serialized to ISO strings).
- **Input Sorting:** The engine strictly enforces sorting of input keys before processing.

## 3. Core Logic: Delta Compression

The engine iterates through the trace steps to compute deltas.

### 3.1 Pre-Processing
Before delta computation, `canonical_trace` is deep-cloned and recursively sorted. This guarantees determinism even if the input source was unordered.

### 3.2 Algorithm
1.  **Step 0 (Root):** The delta is the full `envelope` and `snapshot` (Comparison against empty state).
2.  **Step N (N > 0):** The delta is the minimal difference between Step N and Step N-1.
    - Fields strictly identical (`===` or deep equal) are removed.
    - Fields added, modified, or removed are kept.
    - **Deletions:** If a key exists in Step N-1 but is missing in Step N, it is explicitly recorded as `key: null`.
3.  **Sorting:** All keys in the resulting delta objects must be lexicographically sorted.
4.  **Immutability:** Inputs are never mutated.

### 3.2 Invariant Hash
The engine computes a stable SHA-256 hash of the final delta sequence to guarantee integrity.
- **Source:** `JSON.stringify(deltas)` (with deterministic sorted keys).

## 4. Observability

The engine emits Forward-Hardening compliant telemetry:
- **Metrics:** `kaivo.phase_70.delta_count`, `kaivo.phase_70.execution`.
- **Logs:** Structured log `phase_70_execution_trace_delta_compressor` with delta stats.
- **Tracing:** Span `phase_70`.

## 5. Output Contract

```typescript
interface OutputEnvelope {
  ok: boolean;
  status: "DELTA_COMPUTED" | "FEATURE_DISABLED" | "INPUT_INVALID";
  execution_id: string;
  phase: "70";
  deltas: Array<{
      step_id: string;
      envelope_delta: Object;
      snapshot_delta: Object;
  }>;
  invariant_hash: string; // SHA-256
}
```

## 6. Forward-Hardening Compliance
- **Purity:** Pure function, no IO.
- **Determinism:** 100% replay-safe. Sorted keys.
- **Reversibility:** Deltas allow perfect reconstruction.
- **Strictness:** Rejects malformed input explicitly.
