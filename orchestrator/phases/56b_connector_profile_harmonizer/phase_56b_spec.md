# Phase 56B: Connector Profile Harmonizer Specification

**Contract Name:** `connector_profile_harmonizer_v1`
**Feature Flag:** `FF_CONNECTOR_PROFILE_HARMONIZER` (Default: `false`)
**Mode:** Pure Logic (No IO)

## 1. Purpose
Phase 56B produces the authoritative, normalized, schema-harmonized connector profile set consumed by Phase 57. It ensures that every connector entering the global merge phase conforms to a deterministic, schema-aligned, capability-aware, and backplane-governed metadata profile.

## 2. Inputs (`input_contract_v1`)

The engine accepts a single `input` object:

```json
{
  "execution_id": "exec_123",
  "phase": "56B",
  "feature_flags": {
    "FF_CONNECTOR_PROFILE_HARMONIZER": true
  },
  "from_phase_56": {
    "connector_states": {
      "meta_ads": {
        "state": "HEALTHY",
        "raw_profile": { ... },
        "last_seen": "2023-10-27T10:00:00Z",
        "version": "1.2.0"
      }
    }
  },
  "capability_tables": {
    "meta_ads": ["CAP_AUDIENCE_READ", "CAP_CAMPAIGN_WRITE"]
  },
  "backplane_schema": {
    "required_fields": ["connector_id", "version", "state", "capabilities", "routing"],
    "optional_fields": ["metadata"],
    "forbidden_fields": ["internal_id", "legacy_config"]
  }
}
```

**Constraints:**
*   `execution_id` is required.
*   `from_phase_56.connector_states` is required.
*   `capability_tables` is required (resolved externally).
*   `backplane_schema` is required (resolved from Phase 27B).

## 3. Outputs (`output_contract_v1`)

The engine returns a deterministic object structure:

```json
{
  "execution_id": "exec_123",
  "phase": "56B",
  "status": "OK",
  "harmonized_profiles": {
    "meta_ads": {
      "connector_id": "meta_ads",
      "version": "1.2.0",
      "state": "HEALTHY",
      "capabilities": {
        "CAP_AUDIENCE_READ": true,
        "CAP_CAMPAIGN_WRITE": true
      },
      "routing": {
        "readiness": "READY",
        "redundancy_group": "social_ads"
      },
      "metadata": {
        "api_version": "v17.0",
        "region": "us-east-1"
      }
    }
  },
  "errors": {}
}
```

**Status Codes:**
*   `OK`: Successful harmonization.
*   `INVALID_INPUT`: Missing required top-level fields or schema violation.
*   `HARMONIZATION_ERROR`: Connector profile violates Backplane schema or uses undefined capabilities.

**Top-Level Output Contract:**
Top-level output fields are normalized against a strict whitelist:
`execution_id`, `phase`, `status`, `harmonized_profiles`, `errors`, `feature_disabled`.
Any additional fields generated during execution are removed before returning output.

## 4. Behavior Requirements

### 4.1 Schema Harmonization
*   Validate `raw_profile` against `backplane_schema`.
*   **Missing Optional Fields:** Populate with defaults (e.g., empty object for `metadata`).
*   **Forbidden Fields:** Strip any field listed in `backplane_schema.forbidden_fields`.
*   **Unknown Fields:** If a field is not in required or optional lists, strictly remove it (or error if strict mode is implied, but "Harmonizer" suggests cleaning). *Refinement: The prompt says "No connector profile may contain unrecognized fields after harmonization". We will strip them.*

**Required Field Invariant:**
All fields listed in `required_fields` must exist in the normalized output.
The harmonizer synthesizes required fields if not provided in `raw_profile`.
Missing required fields in the final normalized object produce `HARMONIZATION_ERROR`.

### 4.2 Capability Expansion & Validation
*   Resolve capability sets using `capability_tables`.
*   If a connector claims a capability NOT in `capability_tables`, return `HARMONIZATION_ERROR` for that connector.
*   Format capabilities as an object: `{ "CAP_NAME": true }`.

### 4.3 Routing Metadata Normalization
*   **Readiness:**
    *   `HEALTHY` → `READY`
    *   `DEGRADED` / `ERROR` / `UNKNOWN` → `NOT_READY`
*   **Redundancy Group:**
    *   Extract from `raw_profile` or `metadata`.
    *   Fallback: `null`.

### 4.4 Metadata Normalization
*   Convert `raw_profile` into normalized, canonical shape.
*   Remove duplicate keys.
*   Enforce deterministic ordering of fields (lexicographical sort of keys).
*   **Unknown metadata fields** are stripped if the Backplane schema declares `metadata_fields`.
*   If no `metadata_fields` list exists, metadata is treated as an open field bag and non-forbidden keys are retained.

### 4.5 Feature Flag
*   If `FF_CONNECTOR_PROFILE_HARMONIZER` is not `true`:
    *   Return `status: "OK"`
    *   `feature_disabled: true`
    *   `harmonized_profiles`: `{}` (or pass-through if required, but prompt says "return pass-through with feature_disabled semantics", implying we might just return the input or empty. Let's stick to the prompt's example: `status: "OK", feature_disabled: true`).

### 4.6 Idempotency & Determinism
*   **No Mutation:** Inputs are immutable.
*   **Deep Clone:** Outputs are new objects.
*   **Determinism:** `connector_id` keys in `harmonized_profiles` MUST be sorted lexicographically.

## 5. Observability
*   **Log:** `phase_56b_connector_profile_harmonizer` (Structured Event)
*   **Metrics:**
    *   `harmonizer_profiles_processed` (Counter)
    *   `harmonizer_errors` (Counter)
    *   `harmonizer_success` (Counter)
*   **Trace:** `phase_56b_connector_profile_harmonizer`

## 6. Forward-Hardening
*   **No IO:** Pure logic only.
*   **Replay Safe:** Bit-identical output for identical input.
*   **Schema Evolution:** Versioned contracts (`v1`).
