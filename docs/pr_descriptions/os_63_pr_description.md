# OS-63: Workspace Manager Phase Implementation

## Purpose
Implements the **OS-63 Workspace Manager**, a deterministic, multi-tenant workspace allocator for Kaivo OS. It acts as the kernel module responsible for enforcing isolation boundaries, resolving policy versions and connector allowlists, and establishing rate limit and budget envelopes.

## Contract
- **Input**: `input_contract_v1` (Tenant Context, Agent Context, Resolved Manifest, Policy Snapshot, etc.)
- **Output**: `output_contract_v1` (Workspace Context, Envelopes, Environment Definition)

## Deterministic Behavior
- **Policy Resolution**: Strictly prioritized (Manifest -> Policy Snapshot -> "v1").
- **Connector Allowlist**: Ordered intersection of Agent Requests, Registry Availability, Policy Allowlist, and Plan Limits.
- **Envelopes**: Dynamic mapping from Policy Snapshot Pricing Plans to Rate Limits and Budgets.
- **Validation**: Strict shape checks on Resolved Plans (budget/rate_limit types) and Connector arrays.
- **Environment**: Lexicographically sorted package lists and variable maps.
- **IDs**: Workspace ID generated via `SHA256(tenant_id:agent_id)`.
- **Zero-IO**: No database queries or external calls. No timestamps. No hardcoded business logic.

## Observability
- **Logs**: Structured logs for workspace creation (`os_63_workspace_manager`) and feature flags (`os_63_disabled`).
- **Metrics**: `os63_workspace_created`, `os63_connectors_allowed`.
- **Tracing**: OpenTelemetry spans with execution correlation.

## Test Coverage Summary
- **Test Suite**: `os_63_workspace_manager.test.js`
    - 19 tests (FH Atomic Bundle + TP1 Hardening):
        - 6 Happy Paths (Basic/Ent/Free plans, Fallbacks, Observability Assertions)
        - 7 Negative Paths (Missing Inputs, Forbidden Fields, Malformed Plans [NG7])
        - 4 Edge Cases (Flags, Unknown Plans, Bad Types)
        - 1 Regression Guard (Replay Stability)
        - 1 Determinism Guard (100x Loop)
    - 100% Pass Rate.

## Compliance
- **Forward-Hardening**: Pure logic, idempotent, no randomness.
- **Isolation**: Tenant and Agent contexts strictly strictly enforced generating unique workspace IDs.
- **Safety**: Forbidden fields (`_debug` etc) strictly rejected.
