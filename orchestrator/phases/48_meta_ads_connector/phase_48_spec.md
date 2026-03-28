# Phase 48: Meta Ads Connector Logic Layer Specification

**Contract:** `Phase47ConnectorInputV1`  
**Feature Flag:** `FF_META_ADS_CONNECTOR`  
**IO:** None. Pure logic.  
**Mode:** LIVE and REPLAY.

---

## Purpose

Phase 48 is the pure logic layer that validates and translates Kaivo's Meta-oriented planning schema into a stable connector input envelope for the Phase 47 Meta Ads Connector Engine.

It:

- Enforces strict validation of objectives, targeting, creatives, placements, and budgets.
- Normalizes internal structures into Meta-compatible shapes.
- Produces a deterministic `connector_input` payload with both `raw_request` (Meta-ready) and `normalized_request` (planner-ready).
- Guarantees immutability and replay safety through deep cloning, sorting, and deep freezing.

Phase 48 does not perform any outbound network IO.

---

## Inputs

### Context

`context` is an object with:

- `execution_id` - required for LIVE and REPLAY.
- `mode` - `"LIVE"` or `"REPLAY"`. Defaults to `"LIVE"` if missing.
- `iteration_index` - optional, defaults to `0`.
- `connector_input` - required only in REPLAY mode.

### Request

The `request` object must contain:

- `campaign` - object
- `adsets` - non-empty array
- `creatives` - non-empty array
- `targeting` - object
- `special_ad_categories` - non-empty array
- `objective` - string key into Meta objectives mapping
- `optimization_goal` - string key into Meta optimization goals mapping
- `billing_event` - string, must be in allowed billing events
- `placement_bundle` - string key into placement bundles mapping
- `budget` - number
- `currency` - ISO currency code string
- `brand_metadata` - object containing at minimum `brand_id` and `workspace_id`

Missing any required field produces a `META_VALIDATION_ERROR`.

---

## Feature Flag

Phase 48 is enabled only when `FF_META_ADS_CONNECTOR` is true.

Resolution order:

1. `process.env.FF_META_ADS_CONNECTOR` checked in the engine.
2. If flag is not `"true"`, the engine returns:

   ```json
   {
     "ok": false,
     "code": "FEATURE_DISABLED",
     "message": "Meta Ads Connector disabled",
     "envelope": {
       "execution_id": "<execution_id>"
     }
   }
   ```

No further work is done when disabled.

---

## Modes

### LIVE

In LIVE mode, the engine:

1. Validates required fields.
2. Validates objective, campaign, special ad categories, adsets, targeting, and creatives.
3. Validates placement_bundle.
4. Constructs raw_request with Meta-ready fields.
5. Constructs normalized_request mirroring the planner view.
6. Returns a fully frozen connector_input envelope compatible with Phase47ConnectorInputV1.

### REPLAY

In REPLAY mode, the engine:

- Requires context.connector_input.
- Returns ok: true and passes context.connector_input through unchanged.
- Does not revalidate or retranslate.

If context.connector_input is missing in REPLAY mode, the engine returns a META_VALIDATION_ERROR.

---

## Validation Rules

### Required Fields

For each field in:

- campaign
- adsets
- creatives
- targeting
- special_ad_categories
- objective
- optimization_goal
- billing_event
- placement_bundle
- budget
- currency
- brand_metadata

The engine rejects undefined or null with a META_VALIDATION_ERROR.

### Objective

- `objective` must be present in `meta_objectives.json.mappings`.

### Campaign

- `campaign.name` must be a non-empty string.
- `campaign.status` must be `"ACTIVE"`.
- `campaign.special_ad_categories` must be a non-empty array.

### Special Ad Categories

- All values must appear in `meta_special_ad_categories.json.allowed_categories`.
- Input array must be lexicographically sorted.
- If not sorted, the engine returns META_VALIDATION_ERROR.

### Adsets

For each adset:

- `name` must be a non-empty string.
- `optimization_goal` must be present and mapped in `meta_optimization_goals.json.mappings`.
- `billing_event` must be present and in `meta_billing_events.json.allowed_events`.
- At least one of `daily_budget` or `lifetime_budget` must be present.
- `targeting` must be an object and pass validateTargeting.
- `placements` must be an array and lexicographically sorted.

### Targeting

**Required:**

- geo
- age_min
- age_max

**Disallowed fields:**

- Any key found in `meta_disallowed_targeting_fields.json.disallowed_fields`.

**Allowed fields:**

- Any key not in `meta_targeting_fields.json.allowed_fields` is rejected with a specific error.

These rules apply to top-level targeting and each adset.targeting.

### Creatives

For each creative:

- `name` must be a string.
- `type` required and must be in `meta_creative_types.json.allowed_types`.
- `body` must be a string.
- `headline` must be a string.
- `media_url` must be a string.

---

## Translation

### Campaign Translation

- Meta objective is resolved from objective.
- Meta special ad categories:
  - If the normalized categories are exactly `["NONE"]`, then the raw campaign `special_ad_categories` is `[]`.
  - Otherwise, categories are sorted lexicographically.
- Status is forced to `"ACTIVE"`.
- Keys are sorted for determinism.

### Adset Translation

Each adset is translated to:

- `name` - copied
- `optimization_goal` - mapped value
- `billing_event` - copied
- `targeting` - translated with translateTargeting
- `status` - `"ACTIVE"`
- `daily_budget` and `lifetime_budget` included if present

Keys are sorted.

### Targeting Translation

translateTargeting:

- Sets `geo_locations`, `age_min`, and `age_max`.
- Optionally copies and sorts:
  - genders
  - interests
  - behaviors
  - publisher_platforms
  - facebook_positions
  - instagram_positions
  - audience_network_positions
  - messenger_positions

### Creative Translation

translateCreative:

- Copies `name`, `body`, `headline`, `media_url`.
- Sets `meta_creative_type` to `type`.
- Sorts keys.

### Placement Bundle Translation

translatePlacementBundle:

- Resolves `bundleKey` to a placement config from `meta_placements.json.placement_bundles`.
- Sorts all arrays.
- Returns an error for unknown bundle keys.

---

## Output

On success, Phase 48 returns:

```json
{
  "ok": true,
  "connector_input": {
    "mode": "LIVE",
    "connector_key": "meta_ads",
    "execution_id": "<execution_id>",
    "iteration_index": 0,
    "request": {
      "raw_request": { "..." },
      "normalized_request": { "..." }
    },
    "meta": {
      "input_contract_version": "Phase47ConnectorInputV1"
    }
  }
}
```

Both `raw_request` and `normalized_request` are deeply frozen.

On validation failure, it returns:

```json
{
  "ok": false,
  "code": "META_VALIDATION_ERROR",
  "message": "<specific message>",
  "envelope": {
    "execution_id": "<execution_id>"
  }
}
```

---

## Tests

The Phase 48 test suite covers:

**Happy paths for:**

- Single and multiple adsets
- Complex targeting
- Variant placement bundles
- Multiple creative types
- "NONE" special category handling

**Negative paths for:**

- Missing required fields
- Invalid objective
- Disallowed targeting fields
- Invalid placement bundle

**Edge cases:**

- Large adset arrays
- Large targeting arrays
- Empty optional arrays

**Regression:**

- Golden snapshot of connector_input

**Determinism:**

- Byte-identical JSON for identical inputs

**Behavior:**

- Feature flag disabled
- REPLAY passthrough

All 23 tests passing.

## 13. Backplane Integration

*   Phase 48 logic layer validates inputs against `connector_backplane_v1.request_contract` constraints where applicable.
*   It ensures that the generated `connector_input` respects the `connector_backplane_v1.capabilities` of the target connector.
*   It maps validation errors to `connector_backplane_v1.error_surface` codes (e.g., `META_VALIDATION_ERROR` -> `INVALID_INPUT`).
