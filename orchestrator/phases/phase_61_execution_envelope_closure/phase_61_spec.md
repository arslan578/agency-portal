# Phase 61: Execution Envelope Closure Engine
**Contract Name**: `execution_envelope_closure_v1`
**Feature Flag**: `FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE`
**Mode**: Pure logic, no IO, replay-safe
**Layer**: State Closure Layer (Phases 61–65)

## 1.1 Purpose
Phase 61 takes the post-Phase-60 execution envelope and:
- Freezes it into a deterministic, immutable "closed envelope".
- Strips unsafe or forbidden fields.
- Normalizes and canonicalizes the shape.
- Annotates closure status and issues for downstream phases.

It is a pure transformation: snapshot in, snapshot out, identical on replay.

## 1.2 Inputs - `input_contract_v1`
```typescript
type ExecutionEnvelopeClosureInputV1 = {
  execution_id: string;            // globally unique
  phase: '61' | string;            // caller may set; engine will overwrite to '61' in output
  feature_flags: {
    FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE?: boolean;
    [key: string]: unknown;
  };

  // Post-Phase-60 execution envelope
  execution_envelope: {
    header: {
      tenant_id: string;
      workspace_id: string;
      brand_id?: string;
      agent_session_id?: string;
      trace_domain?: string;
      requested_at?: string;       // ISO 8601
      prepared_at?: string;        // when Phase 60 finished
    };

    plan: {
      plan_id: string;
      version: string;
      steps: Array<{
        step_id: string;
        connector_id: string;
        objective_id?: string;
        budget_minor_units?: number;
        currency?: string;
        [key: string]: unknown;
      }>;
      global_budget_minor_units?: number;
      currency?: string;
      timeline?: {
        start_at?: string;
        end_at?: string;
      };
    };

    safety: {
      safety_horizon: unknown;
      forbidden_actions?: Array<unknown>;
      redundancy_profile?: unknown;
      risk_ledger?: unknown;
    };

    policy_context?: {
      policy_snapshot_id?: string;
      policy_version?: string;
      [key: string]: unknown;
    };

    connectors?: {
      [connector_id: string]: {
        state?: unknown;
        capabilities?: unknown;
        [key: string]: unknown;
      };
    };

    annotations?: {
      pii_fields?: string[];       // JSON paths that should be redacted
      forbidden_field_paths?: string[]; // JSON paths to remove from envelope
      debug_only_fields?: string[];    // fields that must not survive closure
      [key: string]: unknown;
    };

    // Optional raw / unsafe fields that must be removed in closure
    raw_input_body?: unknown;
    internal_debug_payload?: unknown;
    unredacted_user_input?: unknown;

    metadata?: {
      closure_mode?: 'STRICT' | 'RELAXED';
      [key: string]: unknown;
    };

    [key: string]: unknown; // forward-compatible
  };
};
```

**Required fields**: `execution_id`, `feature_flags`, `execution_envelope` (and its nested strict structure).

**Forbidden fields in closed envelope**: `raw_input_body`, `internal_debug_payload`, `unredacted_user_input`, and paths in `annotations.forbidden_field_paths` / `debug_only_fields`.

## 1.3 Outputs - `output_contract_v1`
```typescript
type ExecutionEnvelopeClosureOutputV1 = {
  execution_id: string;
  phase: '61';

  feature_flags: ExecutionEnvelopeClosureInputV1['feature_flags'];

  closure_status: 'CLOSED' | 'SKIPPED_FEATURE_DISABLED' | 'INVALID_ENVELOPE';

  closure_issues: Array<{
    code: string;          // e.g. 'MISSING_FIELD', 'FORBIDDEN_FIELD_REMOVED'
    path?: string;         // JSON path where applicable
    severity: 'INFO' | 'WARN' | 'ERROR';
    message: string;       // human-readable for logs
  }>;

  closed_envelope: ExecutionEnvelopeClosureInputV1['execution_envelope'] | null;

  closure_summary: {
    has_forbidden_fields: boolean;
    forbidden_fields_removed: string[];   // JSON paths
    pii_fields_redacted: string[];        // JSON paths
    warnings: string[];
  };

  observability: {
    closure_mode: 'STRICT' | 'RELAXED';
    policy_snapshot_id?: string;
    policy_version?: string;
    connector_count: number;
    step_count: number;
  };
};
```

## 1.4 Core Behavior
1. **Feature Flag**: If disabled, return `SKIPPED_FEATURE_DISABLED` with deep cloned envelope.
2. **Validation**: Check strict top-level requirements. If fail, `INVALID_ENVELOPE`.
3. **Sanitization**:
    - Deep clone input.
    - Remove `raw_input_body`, `internal_debug_payload`, `unredacted_user_input`.
    - Remove paths in `forbidden_field_paths` and `debug_only_fields`.
    - Redact paths in `pii_fields` with `[[REDACTED]]`.
4. **Normalization**:
    - Ensure `metadata.closure_mode` is present ('STRICT' default).
    - Stable sort all object keys.
5. **Observability**: Emit logs, metrics, trace.

## 1.5 Determinism
- No randomness or IO.
- Identical inputs produce identical outputs (deep equal).
- Sorting of keys ensures hash stability downstream.
