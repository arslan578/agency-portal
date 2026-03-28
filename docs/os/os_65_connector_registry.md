## Meta Ads Connector (`meta_ads`)

- **Registry key:** `connector_registry.meta_ads`
- **CRC source:** Output of `PIB_META_PHASE_12`
- **Activation condition:**
  - Use `readiness_certificate` from PIB-Meta-12 as the single source of truth.
  - Insert or update `connector_registry.meta_ads` only when:
    - `readiness_certificate.connector_id === "meta_ads"`
    - `readiness_certificate.promotion_status === "READY_FOR_MERGE"`
    - `readiness_certificate.drift_detected === false`

- **Stored checksum:**
  - Persist `readiness_certificate.readiness_hash` as the OS-65 checksum for the Meta connector state.
  - OS-65 must treat `readiness_hash` as the canonical checksum for the `connector_registry.meta_ads` entry. Do not recompute this hash inside OS-65.
  - Use this hash for future drift checks and deterministic replay in OS-level tooling.

- **References for policy and audit:**
  - `capability_surface_ref` → capability surface reference for Meta.
  - `policy_mirror_ref` → policy mirror used for Meta policy evaluation.
  - `io_layer_contract_ref` → IO layer contract that matches PIB phases 2–7.
  - `safety_horizon_ref` → bound safety horizon for Meta.
  - `replay_validation_ref` → replay and time-travel validation record from PIB-10.
