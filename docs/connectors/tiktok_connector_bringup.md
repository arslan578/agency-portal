# TikTok Connector Bring-up Plan

## Staging Activation Status
> [!IMPORTANT]
> **Staging Status: ACTIVE**
> The TikTok connector is **fully enabled** in the Staging environment.
> - **PIB Phases 1-12**: Enabled via `FF_PIB_TIKTOK_PHASE_*`
> - **OS-65 Registry**: Enabled via `FF_OS_CONNECTOR_REGISTRATION`
> - **Runtime Engine**: Enabled via `FF_TIKTOK_ADS_CONNECTOR_ENGINE`
> 
> Production remains disabled/gated.

## Executive Summaryses 1–12

This document:
- Defines the full Platform Integration Bring-up (PIB) series for the **TikTok Ads** connector (`tiktok_ads`) at the specification level.
- Locks all contract identifiers, phase IDs, feature flags, connector IDs, and registry keys for the TikTok integration.
- Maps each `PIB_TIKTOK_PHASE_N` to the corresponding canonical Google and Meta PIB phases.
- Serves as the **single source of truth** for all future TikTok PIB implementation prompts.
- Is **documentation-only** and creates no runtime code or OS contract changes.

## Identifiers and Registry

All TikTok PIB phases follow the strict Forward-Hardening contracts established by the Google and Meta PIB series.

### Canonical Identifiers
- **Connector ID:** `tiktok_ads`
- **Registry Key:** `connector_registry.tiktok_ads`
- **PIB Phase IDs:** `PIB_TIKTOK_PHASE_1` through `PIB_TIKTOK_PHASE_12`
- **Feature Flags:** `FF_PIB_TIKTOK_PHASE_1` through `FF_PIB_TIKTOK_PHASE_12`
- **CRC Phase:** `PIB_TIKTOK_PHASE_12`
- **CRC Feature Flag:** `FF_PIB_TIKTOK_PHASE_12`
- **CRC Connector ID:** `tiktok_ads`

The only structural differences from other connectors are the identifiers listed above. No new contract fields or behaviors are introduced in this planning phase.

## Phase Mapping – TikTok vs Google vs Meta

The TikTok PIB series strictly mirrors the canonical Google PIB series and its Meta counterpart.

| PIB_TIKTOK_PHASE | Mirrors Google | Mirrors Meta |
| :--- | :--- | :--- |
| `PIB_TIKTOK_PHASE_1` | `PIB_GOOGLE_PHASE_1` | `PIB_META_PHASE_1` |
| `PIB_TIKTOK_PHASE_2` | `PIB_GOOGLE_PHASE_2` | `PIB_META_PHASE_2` |
| `PIB_TIKTOK_PHASE_3` | `PIB_GOOGLE_PHASE_3` | `PIB_META_PHASE_3` |
| `PIB_TIKTOK_PHASE_4` | `PIB_GOOGLE_PHASE_4` | `PIB_META_PHASE_4` |
| `PIB_TIKTOK_PHASE_5` | `PIB_GOOGLE_PHASE_5` | `PIB_META_PHASE_5` |
| `PIB_TIKTOK_PHASE_6` | `PIB_GOOGLE_PHASE_6` | `PIB_META_PHASE_6` |
| `PIB_TIKTOK_PHASE_7` | `PIB_GOOGLE_PHASE_7` | `PIB_META_PHASE_7` |
| `PIB_TIKTOK_PHASE_8` | `PIB_GOOGLE_PHASE_8` | `PIB_META_PHASE_8` |
| `PIB_TIKTOK_PHASE_9` | `PIB_GOOGLE_PHASE_9` | `PIB_META_PHASE_9` |
| `PIB_TIKTOK_PHASE_10` | `PIB_GOOGLE_PHASE_10` | `PIB_META_PHASE_10` |
| `PIB_TIKTOK_PHASE_11` | `PIB_GOOGLE_PHASE_11` | `PIB_META_PHASE_11` |
| `PIB_TIKTOK_PHASE_12` | Google CRC behavior on activation-ready connector | `PIB_META_PHASE_12` (CRC Generator) |

**Note:** TikTok PIB phases do not introduce new behavior. They mirror Google and Meta at the contract level. Any TikTok-specific IO, endpoints, or policy differences will be defined in per-phase implementation specs. This mapping is authoritative.

## Phase Purpose Summaries

### PIB_TIKTOK_PHASE_1
**Contract Ingestion + Capability Surface Extraction:** Defines the specification for deterministic ingestion of the TikTok connector contract and extraction of the `tiktok_ads` capability surface, including channels, campaign types, bidding systems, targeting, creatives, constraints, routing profile reference, and error mapping reference. Mirrors PIB_GOOGLE_PHASE_1.

### PIB_TIKTOK_PHASE_2
**IO Schema Normalization + Operation Catalog:** Defines the specification for deterministic normalization of TikTok operations, payload shapes, idempotency strategies, retry policies, error mapping schema, and routing profile details into a canonical operation catalog for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_2.

### PIB_TIKTOK_PHASE_3
**Request Builder Backplane Initialization:** Defines the deterministic request blueprint that Phase 45 will use for TikTok, including field-by-field mapping rules, canonical JSON strategies, required versus optional versus forbidden fields, static defaults, merging rules, and signature strategy for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_3.

### PIB_TIKTOK_PHASE_4
**Request Validator Image & Transformation Engine Schema Plan:** Defines how Kaivo’s abstract campaign plan is translated into TikTok’s native constructs, including objective-to-bidding-strategy mappings, budget normalization, targeting normalization, creative normalization, and campaign/adgroup/ad asset decomposition for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_4.

### PIB_TIKTOK_PHASE_5
**Routing & Endpoint Binding:** Defines the deterministic routing rules for `tiktok_ads`, including endpoint selection, batching rules, concurrency ceilings, rate-limit hints, and backoff alignment, all derived from the TikTok connector contract. Mirrors PIB_GOOGLE_PHASE_5.

### PIB_TIKTOK_PHASE_6
**Response Normalizer Mapping:** [IMPLEMENTED] Defines how TikTok responses are transformed into Kaivo’s normalized shape, including field-stripping rules, timestamp eradication, structural normalization, and the error interpretation layer for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_6.
- Implementation: `pib/tiktok/phase_6/pib_tiktok_phase_6.js`
- Tests: `pib/tiktok/phase_6/pib_tiktok_phase_6.test.js`

### PIB_TIKTOK_PHASE_7
**Error Resolver / Retry Strategy Plan:** [IMPLEMENTED] Defines the specification for TikTok’s error-domain normalization and retry strategies, including domain-to-category mapping, retry policy assignment, safe-abort categories, mapping tables, and fallback rules for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_7.
- Implementation: `pib/tiktok/phase_7/pib_tiktok_phase_7.js`
- Tests: `pib/tiktok/phase_7/pib_tiktok_phase_7.test.js`
- **Locked Contract**:
    - Consumes `io_surface.error_mapping`, `routing_profile.retry_alignment`, and `response_normalizer_spec.error_mapping_plan`.
    - Produces `error_resolver_spec` with deterministic `domain_category_map`, `category_to_retry_policy`, and `safe_abort_categories`.
    - Fixed `fallback_category = PLATFORM_ERROR`.
    - Strict feature flag behavior with `FF_PIB_TIKTOK_PHASE_7`.
    - Canonical hashing guarantees stable output identity across key reordering.

### PIB_TIKTOK_PHASE_8
**Deterministic Recorder Schema & Envelope Plan:** [IMPLEMENTED] Defines how executed TikTok IO is recorded into deterministic envelopes and sealed execution forms, including replay-compatible metadata and snapshot deltas for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_8.
- Implementation: `pib/tiktok/phase_8/pib_tiktok_phase_8.js`
- Tests: `pib/tiktok/phase_8/pib_tiktok_phase_8.test.js`
- **Locked Contract**:
    - Input: `request_blueprint` (single op), `validator_image`, `routing_profile`.
    - Output: `recorder_schema` (Request, Response, Error, Metadata), `envelope_plan` (Envelope Shape, Canonicalization Rules).
    - `envelope_shape.connector_id` locked to `"tiktok_ads"`.
    - Canonical hashing guarantees stable output identity.

### PIB_TIKTOK_PHASE_9
**Safety Horizon Binding:** [IMPLEMENTED] Computes and defines deterministic safety metadata for `tiktok_ads` from the capability surface, routing profile, known policy risks, quota models, and failure modes, and binds the connector into the global Safety Horizon engine. Mirrors PIB_GOOGLE_PHASE_9.
- Implementation: `pib/tiktok/phase_9/pib_tiktok_phase_9.js`
- Tests: `pib/tiktok/phase_9/pib_tiktok_phase_9.test.js`
- **Locked Contract**:
    - Input: `capability_surface`, `routing_profile`, `response_normalizer_spec`, `error_resolver_spec`.
    - Output: `safety_horizon_binding` (Operation Safety, Global Risk Profile, Safety Hints).
    - `connector_id` in binding context implicit as `tiktok_ads`.
    - Derivations: Quota Pressure, Routing Risk, Policy Risks, Failure Modes, Enforcement Grade, Connector Stability.

### PIB_TIKTOK_PHASE_10
**Replay Grounding & Execution Validation:** [IMPLEMENTED] Defines the specification for controlled sandbox executions for the TikTok connector, establishing deterministic envelope patterns, ensuring replay safety, verifying counterfactual compatibility, validating time-travel reconstructability, and registering audit ledger entries for `tiktok_ads`. Mirrors PIB_GOOGLE_PHASE_10.
- Implementation: `pib/tiktok/phase_10/pib_tiktok_phase_10.js`
- Tests: `pib/tiktok/phase_10/pib_tiktok_phase_10.test.js`
- **Locked Contract**:
    - Input: `recorder_schema`, `envelope_plan`, `safety_horizon_binding`, `deterministic_replay_material`, `counterfactual_blueprint`, `time_travel_material`, `audit_ledger_context`.
    - Output: `replay_validation_record` (Ground Hash, Replay Safe, Counterfactual Safe, Time Travel Safe, Audit Ledger Entry).
    - `connector_id` in binding context implicit as `tiktok_ads`.
    - Strict determinism enforced; no IO or random sources.
PIB_TIKTOK_PHASE_10 – Replay Grounding & Execution Validation – IMPLEMENTED, TESTED, CONTRACT LOCKED (pib_tiktok_phase_10_output_v1).

### PIB_TIKTOK_PHASE_11
**Activation Checkpoint & Connector Promotion:** [IMPLEMENTED] Defines the activation checkpoint and promotion gate for the TikTok connector, validating that the capability mirror is stable, IO Layer 45–50 for `tiktok_ads` is stable, the Safety Horizon is stable, replay is stable, the Policy Mirror is matched, and drift detection passes before `tiktok_ads` can become ACTIVE. Mirrors PIB_GOOGLE_PHASE_11.
- Implementation: `pib/tiktok/phase_11/pib_tiktok_phase_11.js`
- Tests: `pib/tiktok/phase_11/pib_tiktok_phase_11.test.js`
- **Locked Contract**:
    - Input: Full suite of PIB Artifacts 1–10.
    - Output: Activation Status, Drift Report.
    - Strict validation of all upstream artifacts.
    - No IO; purely deterministic validation of configuration stability.

### PIB_TIKTOK_PHASE_12
**Connector Readiness Certificate (CRC)**: [IMPLEMENTED] CRC generator for TikTok that aggregates all prior PIB phases into a readiness certificate and hash chain, with `readiness_certificate.connector_id === "tiktok_ads"`. Mirrors the CRC behavior used for Google and Meta CRC phases.
- Implementation: `pib/tiktok/phase_12/pib_tiktok_phase_12.js`
- Tests: `pib/tiktok/phase_12/pib_tiktok_phase_12.test.js`
- **Locked Contract**:
    - Input: Full PIB Artifacts 1-11 + Hash Chain.
    - Output: Connector Readiness Certificate (CRC) + Promotion Status.
    - Final gate before OS level loading.

## CRC and OS-65 Registration Expectations

`PIB_TIKTOK_PHASE_12` serves as the final gatekeeper for the TikTok connector integration.

### CRC Guarantees
1.  **Full Hash Chain**: All PIB phases 1–11 are hash-stable and present in the CRC.
2.  **Zero Drift**: No drift detected across the capability mirror, IO layer, or policy mirror.
3.  **Safety Horizon**: Safety horizon is not `CRITICAL`, `BLOCKING`, or `UNSAFE`.
4.  **Replay Safety**: Replay and time-travel operations are verified safe, and counterfactuals are evaluated within the same safety guarantees as the Google and Meta CRC behavior.
5.  **Policy Stability**: The effective policy mirror matches the bound safety horizon.
6.  **Reproducibility**: The CRC generation is purely deterministic.

### CRC Output Fields
The CRC (Connector Readiness Certificate) will contain:
- `connector_id`: `"tiktok_ads"`
- `version`: sourced from `recorder_schema.connector_version`
- `promotion_status`: `"READY_FOR_MERGE"` (required for merge)
- `readiness_hash`: The SHA-256 digest of the canonical connector state.

### OS-65 Behavior
OS-65 treats `tiktok_ads` identically to `google_ads` and `meta_ads`:
- **Registry Key**: `connector_registry.tiktok_ads`
- **Checksum**: `readiness_hash` is the **single canonical checksum** for activation.
- **Contract**: No new fields. TikTok populates the existing OS-65 registry surface.

## Implementation Guardrails

All future TikTok PIB implementation work must adhere to these rules:

- **No Shared File Modification**: Do **not** modify Google or Meta PIB files, OS-65 core logic, or orchestrator contracts.
- **Strict Mirroring**: Use the corresponding Google PIB phase as the canonical template. Change only:
    - Phase ID (`PIB_TIKTOK_PHASE_*`)
    - Feature Flag (`FF_PIB_TIKTOK_PHASE_*`)
    - Connector ID (`"tiktok_ads"`)
    - Registry Key (`connector_registry.tiktok_ads`)
- **Config-Only Variance**: Platform-specific logic (endpoints, error codes) belongs in the specific implementation files, not in the shared framework.
- **Standard Contracts**: Hashing, canonicalization, error codes, and output structures must be **identical** to the Google versions.
- **Mirrored Testing**: Test suites must mirror the Google suites one-to-one in structure and coverage.
- **Drift Zero**: This planning doc is the authoritative source. Any deviation is a spec violation.

PIB-TikTok Phases 1–12 are COMPLETE. Phase 12 (CRC) is implemented. TikTok connector is verified, grounded, and ready for OS-level promotion.

### Phase 12 CRC Snapshot
- **connector_id**: `tiktok_ads`
- **version**: `1.0.0`
- **promotion_status**: `READY_FOR_MERGE`
- **readiness_hash**: `8c763eab0c9366d1b207a0de0f5b3e064c490ac7e014cc127a2d0c37be668152`
- **crc_output_canonical_hash**: `8ef3a20ea1d17e953b510e608ad7bb22ba4557b098bd837ba0d7336b1ee1cc7e`

### Hash Chain
- PIB phase hashes (1 through 11) consumed and validated.
- `drift_detected: false`.

*Note: This document is documentation-only. It defines no new runtime behavior and introduces no IO. All future TikTok PIB implementation prompts must reference this file as their authoritative planning source.*
