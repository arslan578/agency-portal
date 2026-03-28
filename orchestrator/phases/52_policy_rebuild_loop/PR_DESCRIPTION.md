# Phase 52: Policy-Aware Rebuild Loop Engine

## Summary
Implements the **Policy-Aware Rebuild Loop Engine**, the second autonomous recovery layer that inspects Phase 51 outcomes, consults policy rules, and generates deterministic rebuild plans. This is a pure planning engine—it does not execute rebuilds, only produces replayable, snapshot-safe action plans.

## Changes

### New Files
- `orchestrator/phases/52_policy_rebuild_loop/policy_rebuild_loop_engine.js` - Core rebuild planning engine
- `orchestrator/phases/52_policy_rebuild_loop/phase_52_spec.md` - Contract and behavior specification
- `orchestrator/phases/52_policy_rebuild_loop/tests/policy_rebuild_loop_engine.test.js` - Comprehensive test suite (18 tests)

### Key Features
- **Contract**: `policy_rebuild_input_v1` → `policy_rebuild_output_v1`
- **Feature Flag**: `FF_POLICY_AWARE_REBUILD_LOOP` (defaults to false for safe deployment)
- **Pure Planning Engine**: Generates rebuild action plans without executing them
- **Policy-Driven Decisions**: All logic from policy resolver, no hardcoded rules
- **Deterministic**: Identical inputs → identical outputs (snapshot-safe, replay-safe)
- **Never Mutates**: Phase 50/51 envelopes are read-only

### Implementation Details

**Decision Logic:**
- Feature flag disabled → NO_REBUILD
- Phase 51 clean SUCCESS → NO_REBUILD
- Phase 51 PARTIAL_SUCCESS → consult policy (default: PARTIAL_REBUILD)
- Phase 51 HARD_FAIL (auth errors) → NO_REBUILD (policy forbids)
- Phase 51 HARD_FAIL (other) → FULL_REBUILD
- Phase 51 RETRY_EXHAUSTED → FULL_REBUILD

**Policy Resolver:**
- Deterministic in-memory default implementation
- Replaceable via `_internal.setPolicyResolver()` for testing
- Interface designed for future Policy Mirror integration
- Returns: `{ decision, reason, details, policy_version }`

**Rebuild Actions:**
- NO_REBUILD: Empty actions array
- FULL_REBUILD: Rebuild entire connector request
- PARTIAL_REBUILD: Rebuild specific fields only

**Observability:**
- Span: `phase_52_policy_rebuild_loop` with guaranteed lifecycle
- Logs: Structured per execution with execution_id, statuses, policy_ruleset_id
- Metrics: invoked, full, partial, none, error counters

## Testing
- **18 tests**: 6 happy path, 6 negative path, 4 edge cases, 1 regression, 1 determinism
- **All passing**: Verified decision logic, policy integration, error handling, determinism
- Run with: `node orchestrator/phases/52_policy_rebuild_loop/tests/policy_rebuild_loop_engine.test.js`

## Dependencies
- Reads Phase 51 outcomes (never mutates)
- Independent policy resolver (stub, replaceable with Policy Mirror)
- Uses shared observability utilities (`logging`, `tracing`, `metrics`)

## Deployment Notes
1. Deploy with `FF_POLICY_AWARE_REBUILD_LOOP=false` initially
2. Verify in staging environment
3. Enable flag gradually to activate rebuild planning
4. Monitor metrics for rebuild decisions
5. Integrate with real Policy Mirror when available

## Breaking Changes
None. This is a new phase that reads Phase 51 outputs without modifying them.

## Related Issues
- Second layer of autonomous recovery (Phases 51-55)
- Enables policy-driven rebuild decisions
- Foundation for rebuild execution engine (Phase 53)

---

**Review checklist:**
- [ ] All 18 tests pass
- [ ] Decision logic matches spec exactly
- [ ] Policy resolver is deterministic
- [ ] No mutation of Phase 50/51 envelopes
- [ ] Outputs are snapshot-safe and replay-safe
- [ ] Feature flag is properly wired
