# PIB-GOOGLE-PHASE-1 Specification

@phase PIB_GOOGLE_PHASE_1
@contract pib_google_phase_1_output_v1
@mode pure_deterministic

## 1. Purpose
Establish Google Ads as a recognized, validated platform connector inside the Kaivo OS by ingesting the finalized Google Ads Connector Contract (v1) and deriving a normalized internal Capability Surface Snapshot.

## 2. Inputs
```json
{
  "execution_id": "string",
  "phase": "PIB_GOOGLE_PHASE_1",
  "feature_flags": {
      "FF_PIB_GOOGLE_PHASE_1": true
  },
  "google_contract": "object (google_ads_connector_contract_v1)",
  "tenant_context": { "tenant_id": "string" }
}
```

### Validation Rules
1. `phase` MUST be "PIB_GOOGLE_PHASE_1".
2. `feature_flags.FF_PIB_GOOGLE_PHASE_1` MUST be true.
3. `google_contract.connector_id` MUST be "google_ads".
4. `google_contract.version` MUST be a valid semver string (x.y.z).
5. `google_contract` MUST NOT contain `connector_version` (Backplane 27B).
6. Forbidden fields: `_debug`, `debug_info`, `internal_only` are strictly prohibited.

## 3. Outputs
```json
{
  "status": "OK",
  "execution_id": "string",
  "phase": "PIB_GOOGLE_PHASE_1",
  "output_contract_version": "pib_google_phase_1_output_v1",
  "capability_surface": {
      "channels": ["string"],
      "campaign_types": ["object"],
      "bidding_strategies": ["object"],
      "targeting_modes": ["object"],
      "creative_formats": ["object"],
      "constraints": {
          "budget_policies": ["object"],
          "category_rules": ["object"],
          "region_rules": "object"
      },
      "routing_profile_ref": "string",
      "error_mapping_ref": "string"
  },
  "metadata": {
    "canonical_hash": "string (SHA256)",
    "derived_at": "DETERMINISTIC"
  }
}
```

### Normalization Rules
- **Sorting**: All arrays MUST be lexicographically sorted by their stable `id` key (or value for simple strings).
- **Campaign Types**: Normalized to `{ id, channel, allowed_objectives, allowed_bidding_strategies, surfaces, phase_support }`.
- **Bidding Strategies**: Normalized to `{ id, requires_target_value, supported_channels }`.
- **Targeting Modes**: Derived from segments, normalized to `{ id, required_for_campaign_types, supports_negative_targets }`.
- **Creative Formats**: Kept as `{ id, channels, required_assets, optional_assets }`.

## 4. Observability
- **Log Event**: `pib_google_phase_1_event`
- **Metrics**: `pib_google_phase_1_processed`, `pib_google_phase_1_error`, `pib_google_phase_1_crash`, `pib_google_phase_1_disabled`
- **Tracing**: Span `pib_google_phase_1`

## 5. Error Handling
Return `{ status: "ERROR", errors: [{ code, message, details }] }`.
- **INVALID_INPUT**: Schema validation failure.
- **FORBIDDEN_FIELD**: Usage of forbidden fields.
- **CONTRACT_VIOLATION**: Semantic contract issues (e.g. wrong connector_id).
- **INTERNAL_ERROR**: Unexpected runtime errors.
