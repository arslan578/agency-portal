# PIB-META Phase Mapping (Canonical, Drift-Locked)

This document defines the 11-phase PIB model for the Meta Ads connector, strictly mirroring the Google PIB structure.

## PIB-META Phase Table (1–11)

| Phase | Name | Goal | Canonical Output |
| :--- | :--- | :--- | :--- |
| **PIB-1** | Contract Ingestion + Capability Surface Extraction | Deterministically load `meta_ads` contract v1 and extract all capability metadata (campaign types, objectives, bidding, creatives, targeting, etc.). | Normalized Capability Surface (Meta) **[COMPLETE]** |
| **PIB-2** | IO Schema Normalization + Operation Catalog | Normalize Meta Ads operations and payload schemas. Define idempotency, retry models, and error taxonomy map. | Deterministic Operation Catalog, Normalized IO Schema **[COMPLETE]** |
| **PIB-3** | Request Builder Backplane Initialization | Define the deterministic request blueprint for Phase 45 (Request Builder). Define required/optional fields, merge rules, and canonical serialization. | Request Builder Blueprint (Meta) **[COMPLETE]** |
| **PIB-4** | Transformation Engine Schema Plan | Translate Kaivo canonical concepts to Meta native objects (Objective->Goal, Budget, Placement, Creative, Campaign->AdSet->Ad). | Transformation Engine Schema (Meta) **[COMPLETE]** |
| **PIB-5** | Routing & Endpoint Binding | Define deterministic routing logic (Graph API nodes), batching, concurrency, backoff, and rate-limit surfaces. | Routing Profile & Endpoint Binding Spec **[COMPLETE]** |
| **PIB-6** | Response Normalizer Mapping | Define how Meta responses map to Kaivo normalized responses (field stripping, stability, creative/ad ID norm, multi-object create norm). | Response Normalizer Mapping Spec |
| **PIB-7** | Error Resolver / Retry Strategy Plan | Map Meta errors to Kaivo families (AUTH, PERMISSION, etc.). Define retryability, abort conditions, and safety signal mappings. | Error Resolver Strategy & Map |
| **PIB-8** | Deterministic Recorder Schema & Envelope Plan | Define IO execution envelopes, sealed payload structures, delta representations, and replay-compatible structures for Meta. | Recorder Schema & Envelope Spec |
| **PIB-9** | Safety Horizon Binding | Generate Meta-specific safety rules (constraints, quotas, violation patterns, quality signals) matching Google Phase-9 structure. | Safety Horizon Binding Metadata |
| **PIB-10** | Replay Grounding & Execution Validation | Perform deterministic replay-alignment tests (synthetic envelopes, sandbox execution, drift checks, time-travel). | Replay Validation Report & Suite |
| **PIB-11** | Activation Checkpoint & Connector Promotion | Validate connector stability (capability, IO, safety, replay audit). Transition Meta from EXPERIMENTAL -> ACTIVE if all pass. | Activation Report & Promotion Signal |

---

## Drift-Detector Checklist

To ensure PIB-Meta stays aligned with PIB-Google, the following checks must be performed at each phase boundary:

- [ ] **Structural Mirror Check**: Does the Meta deliverable have the **exact same** JSON/Object keys as the Google equivalent? (Only values differ).
- [ ] **Invariant Check**: Are all invariants for the phase (e.g., "Canonical Serialization", "Sealed Payloads") preserved?
- [ ] **Naming Convention Check**: do file names and function signatures follow the `pib_meta_phase_X` pattern mirroring `pib_google_phase_X`?
- [ ] **Test Coverage Check**: Is the test suite for the Meta phase structurally identical to the Google phase test suite (same test cases, just different data)?
- [ ] **Validation Rule Check**: Are the input/output validation rules (zod/joi schemas etc.) mapped 1:1 from Google?
- [ ] **Drift-Lock Confirmation**: Has the hash of the Google Phase Spec changed? If so, does the Meta Phase need an update to match the new structure?

## Pull Request Template (PIB-Meta)

When submitting PRs for this track, use the following template:

```markdown
# PIB-META Phase [X]: [Phase Name]

**Mirror Target**: `PIB-GOOGLE-PHASE-[X]`
**Drift Check**: [MATCH / DIVERGENCE]

## Deliverables
- [ ] Specification (Drift-Locked to Google)
- [ ] Implementation (Meta logic)
- [ ] Test Suite (Mirrored structure)

## Verification
- [ ] Structural alignment with Google Phase [X] confirmed.
- [ ] All mirrored tests pass.
- [ ] No forbidden fields used.

## Notes
(Any Metaverse-specific deviations or data dictionary additions)
```
