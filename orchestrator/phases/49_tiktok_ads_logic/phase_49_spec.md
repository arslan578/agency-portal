# Phase 49: TikTok Ads Connector Logic Layer Specification

**Contract:** `Phase49ConnectorInputV1`  
**Feature Flag:** `FF_TIKTOK_ADS_LOGIC_LAYER`  
**IO:** None. Pure logic.  
**Mode:** LIVE and REPLAY.

---

## Purpose

Phase 49 is the TikTok Ads Logic Layer that validates and translates Kaivo's normalized TikTok planning request into a deterministic, connector-safe envelope for the TikTok Ads connector engine.

It:

- Enforces strict validation of objectives, targeting, creatives, placements, and budgets
- Normalizes internal structures into TikTok-compatible shapes
- Produces a deterministic `connector_input` payload with both `raw_request` (TikTok-ready) and `normalized_request` (planner-ready)
- Guarantees immutability and replay safety through deep cloning, sorting, and deep freezing

Phase 49 does not perform any outbound network IO.

---

## Inputs

### TikTokLogicInputV1

```javascript
{
  execution_id: string,            // required, non-empty
  iteration_index: number,         // required, integer >= 0
  mode: 'LIVE' | 'REPLAY',        // required
  tenant: {
    workspace_id: string,          // required, non-empty
    brand_id: string               // required, non-empty
  },
  request: {
    campaign: {
      name: string,
      objective: string,           // Kaivo-level objective
      status: 'ACTIVE' | 'PAUSED' | 'DRAFT',
      special_ad_categories?: string[]
    },
    adgroups: [...],              // non-empty array
    creatives: {...},             // object keyed by creative ID
    brand: {
      name: string,
      industry?: string,
      url?: string
    }
  },
  meta?: {...}
}
```

---

## Feature Flag

Phase 49 is enabled only when `FF_TIKTOK_ADS_LOGIC_LAYER` is `"true"`.

If disabled:

```json
{
  "ok": false,
  "code": "TIKTOK_LOGIC_FEATURE_DISABLED",
  "message": "TikTok Ads Logic Layer disabled",
  "connector_key": "tiktok_ads",
  "execution_id": "<execution_id>",
  "iteration_index": 0,
  "mode": "LIVE"
}
```

---

## Validation Rules

### Required Roots

- `execution_id`: non-empty string
- `iteration_index`: integer >= 0
- `mode`: exactly "LIVE" or "REPLAY"
- `tenant.workspace_id`: non-empty string
- `tenant.brand_id`: non-empty string

### Campaign

- `campaign.name`: non-empty string
- `campaign.objective`: must exist in mappings
- `campaign.status`: one of ACTIVE, PAUSED, DRAFT

### Adgroups

For each adgroup:

- `name`: non-empty string
- `status`: one of ACTIVE, PAUSED, DRAFT
- `optimization_goal`: must exist in mappings
- `billing_event`: must exist in mappings
- `budget.amount`: number > 0
- `budget.currency`: ISO 4217 code
- `budget.type`: DAILY or LIFETIME
- `schedule.start_time`: required
- `placements`: non-empty array, each must exist in mappings
- `creatives`: non-empty array, each must exist in request.creatives

### Budget Consistency

All adgroups must use the same currency.

### Targeting

If present:

- `age`: 13 <= min < max <= 65
- No disallowed fields per mappings
- All arrays sorted lexicographically

### Creative References

Every creative ID referenced in adgroups must exist in `request.creatives`.

---

## Output Contract

### Success

```javascript
{
  ok: true,
  code: 'OK',
  connector_key: 'tiktok_ads',
  mode: 'LIVE' | 'REPLAY',
  execution_id: string,
  iteration_index: number,
  request: {
    raw_request: {
      campaign: {...},      // TikTok API ready
      adgroups: [{...}],    // TikTok API ready
      ads: [{...}]          // TikTok API ready
    },
    normalized_request: {...}  // Deep clone of input.request
  },
  meta: {
    input_contract_version: 'TikTokLogicInputV1',
    output_contract_version: 'Phase49ConnectorInputV1',
    snapshot_id?: string,
    trace_domain?: string
  }
}
```

### Error

```javascript
{
  ok: false,
  code: 'TIKTOK_VALIDATION_ERROR' | ...,
  message: string,
  connector_key: 'tiktok_ads',
  mode: 'LIVE' | 'REPLAY',
  execution_id: string,
  iteration_index: number
}
```

---

## Error Codes

| Code | Condition |
|------|-----------|
| `OK` | Success |
| `TIKTOK_LOGIC_FEATURE_DISABLED` | Feature flag not enabled |
| `TIKTOK_VALIDATION_ERROR` | Input validation failed |
| `TIKTOK_MAPPING_ERROR` | Mapping tables unavailable |
| `TIKTOK_UNSUPPORTED_OBJECTIVE` | Objective not in mappings |
| `TIKTOK_UNSUPPORTED_BILLING_EVENT` | Billing event not in mappings |
| `TIKTOK_UNSUPPORTED_PLACEMENT` | Placement not in mappings |
| `TIKTOK_UNSUPPORTED_TARGETING` | Targeting field not allowed |
| `TIKTOK_INTERNAL_ERROR` | Unexpected internal error |

---

## Translation Logic

### Campaign

```javascript
{
  campaign_name: campaign.name,
  objective_type: mappings.objectives[campaign.objective],
  campaign_status: mappings.status_mapping[campaign.status],
  budget_mode: 'BUDGET_MODE_INFINITE'
}
```

### Adgroup

```javascript
{
  adgroup_name: adgroup.name,
  campaign_id: null,
  placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
  placement_list: [...],        // From mappings, sorted
  optimization_goal: mappings.optimization_goals[adgroup.optimization_goal],
  billing_event: mappings.billing_events[adgroup.billing_event],
  budget: adgroup.budget.amount,
  budget_mode: mappings.budget_mode_mapping[adgroup.budget.type],
  schedule_start_time: adgroup.schedule.start_time,
  schedule_end_time?: adgroup.schedule.end_time,
  status: mappings.status_mapping[adgroup.status],
  targeting: {...},
  creative_ids: [...]           // Sorted
}
```

### Targeting

```javascript
{
  location?: {
    city: [...],                // Sorted
    region: [...],              // Sorted
    country: [...]              // Sorted
  },
  age: [min, max],
  gender: 'GENDER_MALE' | 'GENDER_FEMALE' | 'GENDER_UNLIMITED',
  interest_category: [...],     // Sorted
  behavior_category: [...],     // Sorted
  os: [...],                    // Sorted
  device: [...],                // Sorted
  language: [...]               // Sorted
}
```

### Ad

One ad per adgroup × creative pair:

```javascript
{
  ad_name: `${adgroup.name}_${creativeId}`,
  adgroup_id: null,
  creative_material_mode: 'SINGLE_VIDEO' | 'SINGLE_IMAGE',
  ad_format: 'VIDEO' | 'IMAGE',
  landing_page_url: creative.landing_page_url,
  creative: {
    ad_text: creative.primary_text,
    video_id?: creative.video_asset_id,
    image_id?: creative.image_asset_id,
    call_to_action?: creative.call_to_action
  },
  status: mappings.status_mapping[adgroup.status]
}
```

---

## Determinism Guarantees

1. **Deep clone input** before modification
2. **Sort adgroups** by name
3. **Sort all arrays** lexicographically
4. **Sort ads** by ad_name
5. **Sort object keys** alphabetically
6. **Deep freeze outputs**
7. **Byte-identical outputs** for identical inputs

---

## Observability

**Trace span:** `"phase_49_tiktok_ads_logic"`

**Metrics:**
- `kaivo.phase49.tiktok.logic.invocations`
- `kaivo.phase49.tiktok.logic.success`
- `kaivo.phase49.tiktok.logic.error` (tagged by code)
- `kaivo.phase49.tiktok.logic.duration_ms`

---

## Test Coverage

**18 tests total:**

Happy path (6):
1. Single adgroup, single video creative
2. Multiple adgroups, shared creatives
3. Daily budget with day budget mode
4. Lifetime budget with total budget mode
5. Targeting with geo, age, gender, interests, behaviors
6. Replay mode deterministic output

Negative path (6):
7. Feature flag disabled
8. Missing required campaign objective
9. Unknown mapping for objective
10. Unknown mapping for billing event
11. Unknown placement
12. Creative reference missing in creatives map

Edge cases (4):
13. Empty optional targeting
14. Maximal targeting set
15. Mixed genders including UNKNOWN
16. Currency mismatch across adgroups

Regression (1):
17. Golden snapshot for known good payload

Determinism (1):
18. Identical inputs produce byte-identical outputs

All 18 tests passing ✓

## 8. Backplane Integration

*   This connector’s request and response surfaces are constrained by `connector_backplane_v1.request_contract` and `connector_backplane_v1.response_contract` from Phase 27B.
*   The connector’s capabilities object conforms to `connector_backplane_v1.capabilities`.
*   The connector’s errors map into the canonical `connector_backplane_v1.error_surface`.
*   The connector’s metadata keys (`campaign_id`, `adset_id`, `creative_id`, `connector_key`, `version`, `lineage_token`) conform to `connector_backplane_v1.metadata_fields`.
