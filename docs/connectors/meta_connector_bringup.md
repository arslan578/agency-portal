# Meta Connector Bring-Up – PIB-Meta Phases 1–12

## Staging Activation Status
> [!IMPORTANT]
> **Staging Status: ACTIVE**
> The Meta connector is **fully enabled** in the Staging environment.
> - **PIB Phases 1-12**: Enabled via `FF_PIB_META_PHASE_*`
> - **OS-65 Registry**: Enabled via `FF_OS_CONNECTOR_REGISTRATION`
> - **Runtime Engine**: Enabled via `FF_META_ADS_CONNECTOR`
> 
> Production remains disabled/gated.

## Status

Meta Ads connector (`meta_ads`) PIB phases **1 through 12** are complete.

- PIB-META-PHASE-1 → PIB-META-PHASE-11: capability surface, IO layer, safety horizon, replay, and policy mirror are wired and tested.
- PIB-META-PHASE-12: Connector Readiness Certificate (CRC) Generator is implemented and passing a deterministic test suite.
- When PIB-12 returns `promotion_status: "READY_FOR_MERGE"`, the Meta connector is eligible for OS-65 registry insertion and production use.

## Safety Spine Guarantees (PIB-1 → PIB-12)

PIB-Meta confirms:

- Capability surface matches `recorder_schema.capability_surface_ref` at the hash level.
- IO layer artifacts (`io_surface`, `request_blueprint`, `validator_image`, `routing_profile`, `response_normalizer_spec`, `error_resolver_spec`)
  match their `*_ref` entries in `recorder_schema`.
- Safety horizon exposure is not `CRITICAL`, `BLOCKING`, or `UNSAFE`.
- Replay and time-travel checks are marked safe in `replay_validation_record`.
- Counterfactual behavior is safe or explicitly guarded by overrides.
- Policy mirror in `routing_profile.policy_mirror` matches `safety_horizon_binding.policy_mirror`.
- PIB phase hash chain for phases `"1"` through `"11"` contains non-empty `canonical_hash` values.

## Connector Readiness Certificate (CRC)

On success, PIB-META-PHASE-12 emits:

```jsonc
{
  "status": "OK",
  "phase": "PIB_META_PHASE_12",
  "readiness_certificate": {
    "connector_id": "meta_ads",
    "version": "<recorder_schema.connector_version>",
    "promotion_status": "READY_FOR_MERGE",

    "pib_phase_hashes": { "1": { "canonical_hash": "..." }, "...": {}, "11": {} },
    "readiness_hash": "<sha256>",

    "capability_mirror_stable": true,
    "io_layer_stable": true,
    "safety_horizon_stable": true,
    "replay_stable": true,
    "policy_mirror_stable": true,
    "drift_detected": false,

    "capability_surface_ref": { ... },
    "policy_mirror_ref": { ... },
    "io_layer_contract_ref": { ... },
    "safety_horizon_ref": { ... },
    "replay_validation_ref": { ... }
  },
  "metadata": {
    "derived_at": "DETERMINISTIC",
    "canonical_hash": "<sha256 of canonical output>"
  }
}
```

`readiness_certificate.readiness_hash` is the checksum that OS-65 will store for the Meta connector entry.

### Merge and Activation Conditions

Meta connector is eligible for merge and activation when:
*   PIB-META-PHASE-12 returns `status: "OK"`.
*   `readiness_certificate.connector_id === "meta_ads"`.
*   `readiness_certificate.promotion_status === "READY_FOR_MERGE"`.
*   `readiness_certificate.capability_mirror_stable`, `io_layer_stable`, `safety_horizon_stable`, `replay_stable`, and `policy_mirror_stable` must all be `true`.
*   All PIB phase hashes `"1"` through `"11"` have valid `canonical_hash` values.
*   No error codes such as `CAPABILITY_MIRROR_DRIFT`, `IO_LAYER_DRIFT`, `SAFETY_HORIZON_UNSAFE`, `REPLAY_UNSAFE`, `COUNTERFACTUAL_UNSAFE`, `POLICY_MIRROR_DRIFT`, or `MISSING_PIB_PHASE_HASH` are present.

Once these hold, the Meta connector can be written into the OS-65 connector registry and treated as production eligible.
