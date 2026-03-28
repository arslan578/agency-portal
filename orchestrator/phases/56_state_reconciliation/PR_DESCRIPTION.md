Phase 56: Autonomous State Reconciliation Engine (Finalized)

This PR introduces Phase 56 of the Kaivo Orchestrator: the Autonomous State Reconciliation Engine.

It converts Phase 55 execution truth into a deterministic, authoritative connector-state snapshot. 
This phase implements:
- Canonical state normalization (auth/api/structural/routing/health/drift)
- Capability supremacy across all dimensions
- Policy-aware reconciliation
- Deterministic output via canonical sorting + SHA-256 determinism_hash
- Full immutability enforcement of Phase 55 inputs
- No IO of any kind (Forward-Hardening Rule 5)
- Complete observability (logs, metrics, traces)
- Uniform contract shape across success/error/feature-disabled states

Test suite: 27 deterministic tests (happy, negative, edge, regression, determinism, optional, hardening)
All tests are green.

Phase 56 is now fully hardened and ready for integration into the Kaivo OS.
