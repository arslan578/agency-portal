# Phase 8B — Objective Normalization Engine

## Purpose

Phase 8B converts vague, high-level campaign intents into a structured, multi-objective performance vector that downstream planners can optimize against. It gives Kaivo a deterministic interpretation of "what the advertiser is trying to accomplish," replacing guesswork with normalized, policy-aware, optimization-ready signals.

This phase is required because real intents ("grow my brand", "boost visibility", "get signups", "reach more people") are not directly actionable. Downstream engines—venue ranking, budget allocation, optimizer, connectors—require fully specified, quantifiable objectives.

Phase 8B is the canonical translator between human / agent intent and machine-executable objective space.

## Overview

**Phase:** 8B  
**Contract:** `objective_normalization_v1`  
**Feature Flag:** `FF_OBJECTIVE_NORMALIZATION`  
**Hardening Origin:** Forward-Hardening Framework  
**Placement:** After Phase 3 (Intent Understanding) and before Phase 8 (Venue Ranking)

## Input Contract

### `objective_normalization_input_v1`

```json
{
  "execution_id": "string",
  "raw_intent": "string | object",
  "creative_compliance": {
    "overall_status": "PASS" | "WARN" | "FAIL",
    "creatives": {}
  },
  "learning_signals": {
    "historical_performance": {},
    "trend_indicators": {}
  },
  "policy_rules": {
    "allowed_objectives": [],
    "platform_constraints": {}
  },
  "knowledge_mappings": {
    "intent_to_objective": {},
    "objective_weights": {},
    "platform_capabilities": {}
  }
}
```

### Required Fields

- `execution_id` (string)
- `raw_intent` (string or structured intent tree from Phase 3)
- `creative_compliance` (Phase 6B output)
- `learning_signals` (Phase 36 output)
- `policy_rules` (Phase 16 + Policy Mirror 32)
- `knowledge_mappings` (KG-resolved mapping tables)

### Forbidden Fields

- Any field not explicitly listed above
- Any payload that mutates upstream objects (Framework Rule #1)

## Output Contract

### `objective_normalization_v1`

```json
{
  "execution_id": "string",
  "normalized_objectives": {
    "reach": "number",
    "conversions": "number",
    "frequency": "number",
    "value": "number"
  },
  "priority_order": ["string"],
  "feasibility": {
    "google": "SUPPORTED" | "LIMITED" | "UNSUPPORTED",
    "meta": "SUPPORTED" | "LIMITED" | "UNSUPPORTED",
    "tiktok": "SUPPORTED" | "LIMITED" | "UNSUPPORTED",
    "youtube": "SUPPORTED" | "LIMITED" | "UNSUPPORTED",
    "reddit": "SUPPORTED" | "LIMITED" | "UNSUPPORTED"
  },
  "policy_constraints": ["string"],
  "recommended_modes": ["string"],
  "explanations": ["string"]
}
```

### Determinism Requirements

- **Sorted keys:** All object keys must be alphabetically sorted
- **Sorted lists:** `priority_order`, `policy_constraints`, `recommended_modes`, `explanations` must be sorted
- **Stable normalization:** Identical inputs produce identical outputs
- **No randomness:** No nondeterministic behavior

## Behavior Requirements

### 1. Intent Normalization

Convert raw human/agent intent into quantifiable objectives:

- Parse `raw_intent` string or structured tree
- Map intent phrases to objective dimensions via `knowledge_mappings.intent_to_objective`
- Apply deterministic weights from `knowledge_mappings.objective_weights`
- Produce normalized vector: `{reach, conversions, frequency, value}`

**Example Mappings:**
- "brand awareness" → `{reach: 0.9, conversions: 0.1, frequency: 0.5, value: 0.2}`
- "increase signups" → `{reach: 0.3, conversions: 0.9, frequency: 0.2, value: 0.7}`
- "boost visibility" → `{reach: 0.8, conversions: 0.2, frequency: 0.6, value: 0.3}`

#### Intent Phrase Resolution Rules

Phase 8B resolves natural-language intent using deterministic token-level matching. 
Exact string equality is not required. An intent phrase is considered a match when:

1. At least two tokens overlap with a known intent pattern, or
2. The phrase contains the pattern after stopword removal (e.g., "my"), or
3. The pattern contains the phrase.

This rule ensures stable, replayable interpretation of natural intent while 
adhering to the no-heuristic constraint of the Forward-Hardening Framework 
because all patterns must originate from the Knowledge Graph and are not hardcoded.

### 2. Cross-Venue Normalization

Normalize objectives across all supported platforms:

- Use `knowledge_mappings.platform_capabilities` to understand platform-specific objective support
- Apply venue-specific constraints from `policy_rules.platform_constraints`
- Produce unified objective vector that all venues can interpret

### 3. Policy Constraint Resolution

Apply policy rules to trim unsupported objectives:

- Check `policy_rules.allowed_objectives` for global constraints
- Check platform-specific constraints
- Add constraint descriptions to `policy_constraints` array
- Adjust objective weights based on policy limits

### 4. Feasibility Computation

Compute per-venue feasibility for the normalized objectives:

- **SUPPORTED:** Venue fully supports all primary objectives
- **LIMITED:** Venue supports some objectives with limitations
- **UNSUPPORTED:** Venue cannot support primary objectives

Feasibility determination uses:
- `knowledge_mappings.platform_capabilities`
- `policy_rules.platform_constraints`
- `creative_compliance` status

### 5. Priority Ordering

Produce deterministic priority ordering of objectives:

- Sort objectives by normalized weight (descending)
- Break ties alphabetically by objective name
- Return as `priority_order` array

### 6. Learning Signal Integration

Adjust objective weights based on historical performance:

- Use `learning_signals.historical_performance` to boost/reduce weights
- Apply trend indicators for recency weighting
- Maintain determinism via stable rounding/sorting

### 7. Recommended Modes

Generate optimization mode recommendations:

- Based on objective vector composition
- Based on feasibility across venues
- Examples: `["awareness_optimized", "conversion_focused", "balanced_reach"]`

### 8. Structured Explanations

Populate `explanations` with human-readable descriptions:

- Why certain objectives were prioritized
- What constraints were applied
- Why certain venues are LIMITED or UNSUPPORTED
- All explanations must be deterministically generated and sorted

## Error Semantics

Phase 8B **never halts execution**. It returns structured errors in the output while still providing best-effort normalization.

### Error Codes

- `OBJECTIVE_UNRECOGNIZED`: Raw intent could not be mapped to known objectives
- `OBJECTIVE_CONFLICT`: Multiple contradictory objectives detected
- `POLICY_BLOCKED_OBJECTIVE`: Policy rules block a requested objective
- `KNOWLEDGE_RESOLUTION_FAILURE`: Knowledge mappings missing or incomplete

### Error Handling

When errors occur:
1. Log structured error with code and context
2. Apply fallback normalization (uniform weights)
3. Set all feasibility to `LIMITED`
4. Add explanation describing the error condition
5. Return output contract with partial data

## Observability Requirements

### Metrics

```json
{
  "metric": "phase_8b_objective_normalization_invoked",
  "execution_id": "...",
  "raw_intent_type": "string | structured",
  "objectives_count": "number"
}
```

### Log Events

```json
{
  "event": "objective_normalization",
  "phase": "8B",
  "execution_id": "...",
  "raw_intent": "...",
  "normalized_objectives": {},
  "feasibility_summary": {}
}
```

### Trace Spans

- Span name: `objective_normalization`
- Attributes: `execution_id`, `intent_complexity`, `venues_evaluated`

All observability hooks disabled in `test` environment.

## Invariants

### 1. No Inline Knowledge

All knowledge must come from `knowledge_mappings` input. No hardcoded intent-to-objective mappings in the implementation.

**Exception:** Fallback weights for error cases may use uniform distribution `{reach: 0.25, conversions: 0.25, frequency: 0.25, value: 0.25}`.

### 2. Replay Determinism

Output must be identical under replay:
- Same inputs → same outputs
- Sorted collections
- Stable rounding
- No timestamps in output (only in observability)

### 3. No Mutation

Input envelope and all nested objects must never be mutated. Deep clone before processing.

### 4. Feature Flag Gated

When `FF_OBJECTIVE_NORMALIZATION !== 'true'`:

Return fallback output:
```json
{
  "execution_id": "...",
  "normalized_objectives": {
    "reach": 0.25,
    "conversions": 0.25,
    "frequency": 0.25,
    "value": 0.25
  },
  "priority_order": ["conversions", "frequency", "reach", "value"],
  "feasibility": {
    "google": "SUPPORTED",
    "meta": "SUPPORTED",
    "tiktok": "SUPPORTED",
    "youtube": "SUPPORTED",
    "reddit": "SUPPORTED"
  },
  "policy_constraints": [],
  "recommended_modes": ["balanced"],
  "explanations": ["Feature flag disabled, using uniform distribution"]
}
```

## Feature Flag Behavior

**Environment Variable:** `FF_OBJECTIVE_NORMALIZATION`

- **Default:** `false` (safe rollout)
- **Enabled:** Full normalization pipeline (when set to `'true'`)
- **Disabled:** Returns uniform fallback

The flag is enabled when `FF_OBJECTIVE_NORMALIZATION` is set to the string `"true"` in the environment.

## Integration Points

### Dependencies

- **Phase 3:** Intent Understanding (provides `raw_intent`)
- **Phase 6B:** Creative Compliance (provides compliance status)
- **Phase 16:** Policy Engine (provides policy rules)
- **Phase 32:** Policy Mirror (provides platform policies)
- **Phase 36:** Learning Signals (provides historical performance)
- **Knowledge Graph:** Provides all mapping tables

### Consumers

- **Phase 8:** Venue Ranking (uses objective vector for scoring)
- **Phase 9B:** Budget Allocation (allocates based on objectives)
- **Phases 35-41:** Optimizers (optimize against objectives)
- **Phase 17:** Readiness Engine (validates objective feasibility)
- **Connector Engines:** Use objective context for platform-specific tuning

## Testing Requirements

Comprehensive test suite: **20 tests minimum**

- 6 happy path tests
- 6 negative path tests
- 4 edge case tests
- 1 regression guard test
- 1 determinism guard test (100 runs)

See `__tests__/objective_normalization_engine.test.js` for full implementation.

## Example Output

### Input:
```json
{
  "execution_id": "exec_001",
  "raw_intent": "grow my brand and increase awareness",
  "creative_compliance": {"overall_status": "PASS", "creatives": {}},
  "learning_signals": {"historical_performance": {"reach": 0.85}},
  "policy_rules": {"allowed_objectives": ["reach", "frequency"], "platform_constraints": {}},
  "knowledge_mappings": {
    "intent_to_objective": {
      "grow brand": {"reach": 0.9, "frequency": 0.6},
      "increase awareness": {"reach": 0.8, "frequency": 0.5}
    }
  }
}
```

### Output:
```json
{
  "execution_id": "exec_001",
  "normalized_objectives": {
    "reach": 0.85,
    "conversions": 0.0,
    "frequency": 0.55,
    "value": 0.0
  },
  "priority_order": ["reach", "frequency", "conversions", "value"],
  "feasibility": {
    "google": "SUPPORTED",
    "meta": "SUPPORTED",
    "reddit": "LIMITED",
    "tiktok": "SUPPORTED",
    "youtube": "SUPPORTED"
  },
  "policy_constraints": [
    "Conversions blocked by policy rules",
    "Value blocked by policy rules"
  ],
  "recommended_modes": ["awareness_optimized"],
  "explanations": [
    "Primary objective: reach (0.85)",
    "Policy trimmed unsupported objectives",
    "Reddit has limited frequency support"
  ]
}
```

## Version History

- **v1.0** (2025-12-04): Initial production-ready implementation
