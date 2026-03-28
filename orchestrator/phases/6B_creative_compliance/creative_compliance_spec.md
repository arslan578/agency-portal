# Phase 6B: Creative Compliance & Platform Policy Evaluator - Specification

## Overview

**Phase:** 6B  
**Contract:** `creative_compliance_eval_v1`  
**Feature Flag:** `FF_CREATIVE_COMPLIANCE_EVAL`  
**Hardening Origin:** Forward-Hardening Framework  
**Placement:** Between Phase 6A (Creative Assembly) and Phase 8 (Venue Ranking)

## Purpose

Phase 6B provides the **first policy firewall** in the campaign planning pipeline. It evaluates each creative deterministically using:

- Policy Mirror (Phase 32)
- Creative Compliance Inference Layer (Phase 33)
- Creative AI scoring modules (Phase 3)

**Key Principle:** Phase 6B does not reject campaigns outright. Instead, it surfaces structured compliance risks early, ensuring downstream planners never build invalid payloads.

### Downstream Consumers

Outputs feed:
- Venue Ranking (Phase 8)
- Budget Engine (Phase 9B)
- Readiness Engine (Phase 17)
- Optimizers (Phases 35-41)
- Safety Horizon (Phase 58)

## Input Contract

### `input_contract_creative_compliance_v1`

```json
{
  "execution_id": "string",
  "creatives": {
    "[creative_id]": {
      "creative_type": "VIDEO" | "IMAGE" | "TEXT",
      "language": "string",
      "body_text": "string (optional)",
      "headline": "string (optional)",
      "media_url": "string (optional)",
      "duration_ms": "number (optional)",
      "metadata": "object (optional)"
    }
  },
  "policy_context": {
    "tenant_id": "string",
    "workspace_id": "string",
    "locale": "string",
    "platforms": ["string"]
  }
}
```

### Required Fields

- `execution_id` (string)
- `creatives` (object, nonempty)
- For each creative:
  - `creative_type` (enum: VIDEO, IMAGE, TEXT)
  - `language` (string)

### Forbidden Fields

- Any field not explicitly listed above
- Any payload that mutates upstream creative shapes (Framework Rule #1)

## Output Contract

### `creative_compliance_report_v1`

```json
{
  "execution_id": "string",
  "overall_status": "PASS" | "WARN" | "FAIL",
  "creatives": {
    "[creative_id]": {
      "status": "PASS" | "WARN" | "FAIL",
      "reasons": ["string"],
      "platform_findings": {
        "[platform_key]": {
          "status": "PASS" | "WARN" | "FAIL",
          "reasons": ["string"],
          "error_code": "string (optional)"
        }
      },
      "suggested_fixes": ["string"]
    }
  },
  "metrics": {
    "total_creatives": "number",
    "pass_count": "number",
    "warn_count": "number",
    "fail_count": "number"
  }
}
```

### Invariants

1. **Deterministic:** Identical inputs produce identical outputs (Framework Rule #5)
2. **Policy Resolution:** All platform policy rules resolved via Policy Mirror (Framework Rule #4)
3. **No Mutation:** No mutation of upstream creative objects
4. **No IO:** Beyond allowed knowledge service queries
5. **Snapshot Safe:** Output must be snapshot-safe for replay
6. **Structured Errors:** Platform-level failures include `error_code` for classification (e.g., `UNSUPPORTED_MEDIA_TYPE`)

## Behavior

### Evaluation Pipeline

For each creative:

1. **Policy Resolution:** Resolve platform policy rules via Policy Mirror (Phase 32)
2. **Compliance Inference:** Run Creative Compliance Inference Layer for static + ML signals (Phase 33)
3. **Platform Evaluation:** Combine findings into per-platform verdicts
4. **Status Aggregation:** Produce deterministic creative status:
   - If any platform `FAIL` → creative `FAIL`
   - If any platform `WARN` and none `FAIL` → creative `WARN`
   - Otherwise → creative `PASS`
5. **Overall Status:** Max severity across all creatives

### Platform Policy Rules (Mock)

Current mock implementation includes policies for:

- **Google Ads:** 30 char headline, 90 char description, 5000 char body
- **Meta:** 40 char headline, 125 char description/body
- **TikTok:** 100 char headline/description/body
- **YouTube:** 100 char headline, 5000 char description/body
- **Reddit:** 300 char headline/description, 40K char body

## Error Modes

Phase 6B **never throws**. It only returns structured failures:

### Top-Level (Pipeline) Error Codes

- `INVALID_INPUT`: Missing or invalid required fields
- `KNOWLEDGE_RESOLUTION_FAILURE`: Policy Mirror failed to resolve platform policy
- `CREATIVE_UNSCANNABLE`: Evaluation failed unexpectedly (e.g., Compliance Inference failure)
- `POLICY_VIOLATION`: Creative compliance failure in strict mode (see below)

### Platform-Level Error Codes

These appear in the `error_code` field of `platform_findings`:

- `UNSUPPORTED_MEDIA_TYPE`: Creative type not in [VIDEO, IMAGE, TEXT]

### Strict Compliance Mode

**Environment variable:** `FF_STRICT_CREATIVE_COMPLIANCE`

- **Default:** `false`
- **When `false`:**
  - Phase 6B always returns `ok=true`
  - `overall_status` may be PASS, WARN, or FAIL
  - Downstream phases decide how to react to failures

- **When `true`:**
  - If `overall_status` is FAIL:
    - Phase 6B returns `ok=false`
    - `payload` still contains the full `creative_compliance_report_v1`
    - `error` is set to:

```json
{
  "code": "POLICY_VIOLATION",
  "fatal": true,
  "message": "Creative compliance failure in strict mode"
}
```

  - If `overall_status` is PASS or WARN:
    - Phase 6B behaves as in non-strict mode and returns `ok=true`

## Observability Hooks

Required by Framework Rule #3:

### Metrics

- `creative_compliance.scan_completed`
  - Labels: `execution_id`, `overall_status`, `total_creatives`

### Log Events

```json
{
  "event": "creative_compliance_evaluation",
  "phase": "6B",
  "execution_id": "...",
  "overall_status": "...",
  "metrics": { ... }
}
```

### Trace Spans

- Span name: `creative_compliance_eval_v1`
- Attributes: `execution_id`, `status`

## Determinism Requirements

1. **Stable Replay:** All evaluations must be stable under replay
2. **Sorted Findings:** Platform findings sorted alphabetically by key
3. **Sorted Fixes:** Suggested fixes sorted lexicographically
4. **No Randomness:** No nondeterministic randomness, timestamps, or ML drift

## Feature Flag Behavior

### `FF_CREATIVE_COMPLIANCE_EVAL`

- **Default:** `false` (safe rollout)
- **Enabled:** Full evaluation pipeline (when set to `'true'`)
- **Disabled:** Returns empty PASS report

The flag is enabled when `FF_CREATIVE_COMPLIANCE_EVAL` is set to the string `"true"` in the environment.:

```json
{
  "execution_id": "...",
  "overall_status": "PASS",
  "creatives": {},
  "metrics": {
    "total_creatives": 0,
    "pass_count": 0,
    "warn_count": 0,
    "fail_count": 0
  }
}
```

**Rollback Path:** Disable flag to return to empty PASS reports while maintaining contract shape.

## Example Output

```json
{
  "execution_id": "exec_123",
  "overall_status": "WARN",
  "creatives": {
    "cr1": {
      "status": "WARN",
      "reasons": ["Body text exceeds meta limit"],
      "platform_findings": {
        "google": { "status": "PASS", "reasons": [] },
        "meta": { "status": "WARN", "reasons": ["Body text exceeds meta limit"] }
      },
      "suggested_fixes": ["Shorten body_text to meet meta requirements"]
    }
  },
  "metrics": {
    "total_creatives": 1,
    "pass_count": 0,
    "warn_count": 1,
    "fail_count": 0
  }
}
```

## Testing Requirements

Comprehensive test suite (18 tests minimum):

- 6 happy path tests
- 6 negative path tests
- 4 edge case tests
- 1 regression guard test
- 1 determinism guard test

See `__tests__/creative_compliance_engine.test.js` for full implementation.

## Integration Points

### Injectable Resolvers

Policy resolution and compliance inference are accessed through injectable resolvers:

- `policyResolver(platform_key, tenant_id, workspace_id)` - Resolves platform policy rules
- `inferenceEngine(creative, platform_key)` - Runs ML compliance inference

The engine accepts these via the optional `context` argument:

```javascript
const result = await evaluateCreativeCompliance(input, {
  policyResolver: customPolicyResolver,
  inferenceEngine: customInferenceEngine
});
```

If not provided, it uses internal stub implementations for Policy Mirror and Compliance Inference. This allows tests and higher layers to swap in real services without changing the engine contract.

### Dependencies

- **Phase 32:** Policy Mirror (mock in initial implementation)
- **Phase 33:** Creative Compliance Inference Layer (mock in initial implementation)
- **Phase 3:** Creative AI scoring modules (future enhancement)

### Consumers

- **Phase 8:** Venue Ranking uses compliance status to filter/prioritize venues
- **Phase 9B:** Budget Engine considers compliance risk scores
- **Phase 17:** Readiness Engine blocks launch if strict mode enabled and failures exist
- **Phases 35-41:** Optimizers use compliance signals to guide decisions
- **Phase 58:** Safety Horizon aggregates compliance metrics

## Version History

- **v1.0** (2025-12-04): Initial production-ready implementation
- **v1.1** (2025-12-04): Correctness patch
  - Added dependency injection for `policyResolver` and `inferenceEngine`
  - Added structured `error_code` field to platform_findings
  - Implemented strict mode with `POLICY_VIOLATION` error
  - Updated test suite to 19 tests (added strict mode test)
