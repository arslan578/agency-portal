# Phase 44: Multi Tenant Redaction Router

**Contract Version:** `redaction_router_v1`  
**Feature Flag:** `FF_MULTI_TENANT_REDACTION_ROUTER`  

Phase 44 takes a fully constructed orchestrator envelope with an attached `trace_domain` from Phase 43 and produces:

1. A deterministic **redaction plan** for the execution.
2. A set of **redacted views** that are safe to use for:
   - Logs
   - Metrics payloads
   - Snapshots and replay bundles
   - Debug mirrors

The original envelope remains unchanged and continues to flow to downstream phases, including connector dispatch.

Phase 44 is the first tenant aware privacy layer in the multi tenant shell.

---

## 1. Position in the Orchestrator Chain

Phase chain segment:

- 42: Trace Reconstruction Engine
- 43: Multi Tenant Trace Domain Engine
- 44: Multi Tenant Redaction Router  ← (this phase)
- 45+: Connector IO and tenant aware replay

Phase 44 assumes that:

- `execution_id` is present and valid.
- `trace_domain.trace_domain_key` is present and valid.
- Tenant metadata has passed Phase 43 validation.

---

## 2. Contracts

### 2.1 Input Contract

**Name:** `RedactionRouterRequestV1`  

Phase 44 reads an envelope with at least:

```ts
type RedactionRouterRequestV1 = {
  execution_id: string;
  tenant?: {
    tenant_id: string;
  };
  workspace?: {
    workspace_id: string;
  };
  brand?: {
    brand_id: string;
  };
  trace_domain?: {
    trace_domain_key: string;
  };
  payload?: Record<string, unknown>;
  meta?: {
    intent_name?: string;
    environment?: "production" | "staging" | "development" | string;
  };
  // other fields are allowed and must be preserved
};
```

Required fields:
- `execution_id` non empty string
- `trace_domain.trace_domain_key` non empty string when feature flag is on

Optional but constrained:
- `tenant.tenant_id`, `workspace.workspace_id`, `brand.brand_id`
- If present, must be non empty strings.
- `meta.intent_name`, `meta.environment` are optional strings.

Forbidden behavior:
- No mutation or reinterpretation of existing fields.
- No removal of fields in the original envelope.

If the feature flag is disabled, Phase 44 must act as a pass through.

---

### 2.2 Output Contract

**Name:** `RedactionRouterResponseV1`

Phase 44 returns a shallow clone of the input envelope plus a redaction block:

```ts
type RedactionRouterResponseV1 = RedactionRouterRequestV1 & {
  redaction?: {
    contract_version: "redaction_router_v1";
    trace_domain_key: string;
    views: {
      log_envelope: Record<string, unknown>;
      snapshot_envelope: Record<string, unknown>;
      metrics_envelope: Record<string, unknown>;
    };
    plan: {
      applied_rule_set: string; // rule set name or ID
      rules_applied: RedactionRuleApplication[];
      stats: {
        fields_redacted: number;
        fields_inspected: number;
      };
    };
  };
};

type RedactionRuleApplication = {
  rule_id: string;
  reason_code: string;
  paths: string[];         // JSON paths redacted by this rule
  view_targets: string[];  // "log" | "snapshot" | "metrics"
};
```

The original envelope fields stay as they were. Redacted views are separate objects inside the redaction.views block.

---

## 3. Redaction Rules

To comply with the Forward Hardening Framework rule for externalized knowledge, Phase 44 must not hardcode redaction logic.

It instead consumes a single rule source:

`orchestrator/policy/rules/redaction_rules.json`

Example structure:

```json
{
  "default_rule_set": "GLOBAL_DEFAULT",
  "rule_sets": {
    "GLOBAL_DEFAULT": [
      {
        "rule_id": "REDACT_PII_EMAIL",
        "reason_code": "PII_EMAIL",
        "match": {
          "field_names": ["email", "email_address"],
          "value_types": ["string"]
        },
        "views": ["log", "snapshot", "metrics"],
        "action": "REDACT_VALUE"
      },
      {
        "rule_id": "REDACT_ACCESS_TOKENS",
        "reason_code": "SECRET_TOKEN",
        "match": {
          "field_names": ["access_token", "refresh_token", "api_key"]
        },
        "views": ["log", "snapshot", "metrics"],
        "action": "REDACT_VALUE"
      }
    ]
  },
  "routing": {
    "TENANT:public::WS:null::BRAND:null": "GLOBAL_DEFAULT"
  }
}
```

Routing rules map `trace_domain_key` prefixes or exact matches to a `rule_set` identifier.

If no routing entry exists for a given key, the router falls back to `default_rule_set`.

---

## 4. Behavior

### 4.1 Feature Flag

Environment variable:

`FF_MULTI_TENANT_REDACTION_ROUTER=true | false`

- When `false`: return the envelope unchanged, do not attach redaction.
- When `true`: apply full validation and redaction plan.

### 4.2 Validation

Validation steps when flag is on:
1. Ensure envelope is a non null object.
2. Ensure `execution_id` is a non empty string.
3. Ensure `trace_domain` exists and `trace_domain.trace_domain_key` is a non empty string.
4. If `tenant.tenant_id`, `workspace.workspace_id`, or `brand.brand_id` are present:
   - Must be non empty strings.

On validation failure, return a Phase native error envelope:

```json
{
  "ok": false,
  "code": "INVALID_REDACTION_ROUTER_INPUT",
  "message": "Description",
  "envelope": {
    "execution_id": "<value if present>"
  }
}
```

### 4.3 Redaction Routing

1. Read `trace_domain.trace_domain_key`.
2. Locate the matching `rule_set` in `redaction_rules.json`:
   - Exact match on key if present.
   - Otherwise, prefix match on `TENANT:<id>` segment is allowed.
   - Otherwise, fall back to `default_rule_set`.
3. If no rule set can be resolved, Phase 44 must return an error:

```json
{
  "ok": false,
  "code": "REDACTION_RULESET_NOT_FOUND",
  "message": "No redaction rule set found for trace domain key",
  "envelope": {
    "execution_id": "..."
  }
}
```

No guessing, no silent defaults beyond the configured `default_rule_set`.

### 4.4 View Construction

Phase 44 creates three redacted views:
- `log_envelope`
- `snapshot_envelope`
- `metrics_envelope`

Each view follows this process:
1. Deep clone the original envelope using a deterministic technique.
2. Walk the cloned object and apply rules for that view only.
3. Replace matched field values with a literal placeholder:
   - `"[REDACTED]"` for string like values.
   - `null` for objects or arrays if entire branches are hidden.
   - Preserve shapes and keys whenever possible.

Redaction must not change:
- Top level types.
- Required fields.
- Envelope structure that downstream tools expect.

### 4.5 Statistics and Plan

Phase 44 must:
- Count the number of fields inspected.
- Count the number of fields redacted across all views.
- Record each rule application as a `RedactionRuleApplication`.

These details allow later phases and external tools to understand how aggressive a given tenant configuration is, and to debug redaction behavior without exposing sensitive data.

---

## 5. Determinism And Purity

Phase 44 must obey the Forward Hardening Framework:
- No IO at runtime apart from reading static rule files within the process.
- No randomness.
- No mutation of the input envelope.
- Identical input plus identical rule set yields identical outputs.

Given an envelope and a fixed `redaction_rules.json`, Phase 44 is fully replayable.

---

## 6. Observability

Phase 44 emits a standard observability event:
- `event_type`: `REDACTION_ROUTED`
- `execution_id`
- `trace_domain_key`
- `rule_set_id`
- `fields_redacted`
- `fields_inspected`
- `timestamp`

This event must not include any sensitive field values.

---

## 7. Error Cases

Primary error codes:
- `INVALID_REDACTION_ROUTER_INPUT`
- `REDACTION_RULESET_NOT_FOUND`
- `REDACTION_RULESET_MALFORMED`

Each error envelope:

```json
{
  "ok": false,
  "code": "...",
  "message": "...",
  "envelope": {
    "execution_id": "..."
  }
}
```

---

## 8. Test Plan

Per Forward Hardening Framework, Phase 44 ships with:
- 6 happy path tests
- 6 negative tests
- 4 edge tests
- 1 regression guard
- 1 determinism guard

### Happy Paths
1. Valid envelope, global default rule set, basic email redaction in logs, snapshots, metrics.
2. Tenant specific rule set that redacts brand names only in logs.
3. Workspace specific rule set that redacts user IDs in snapshots only.
4. Rule set that hides access tokens in all views.
5. Rule set that redacts nested PII in payload objects.
6. Rule set that redacts nothing (fields_inspected > 0, fields_redacted = 0).

### Negative Paths
1. Null envelope.
2. Missing execution_id.
3. Missing trace_domain.
4. Empty trace_domain_key.
5. Resolved rule set id that does not exist in rule_sets.
6. Malformed rule set entry (missing action).

### Edge Cases
1. Envelope with no fields matched by any rule.
2. Envelope with fields that match multiple rules (ensure stable order and plan).
3. Very deep nested structure with PII at depth greater than 5.
4. Large envelope where redaction must still complete and remain deterministic.

### Regression Guard
- Reuse a known envelope and rules fixture and assert that the redaction block stays byte identical to a golden snapshot.

### Determinism Guard
- Run Phase 44 twice with the same envelope and rule set; compare outputs for deep equality.
