# Phase 48: Meta Ads Connector Logic Layer Specification

## Overview

**Phase**: 48  
**Name**: Meta Ads Connector Logic Layer  
**Contract**: Phase47ConnectorInputV1  
**Feature Flag**: `FF_META_ADS_CONNECTOR`

Phase 48 is a pure translation layer that transforms Phase-45-normalized Kaivo connector requests into the exact `Phase47ConnectorInputV1` format required by Phase 47's Meta Ads Connector Engine.

**Critical Properties:**
- No IO operations
- No inference or creative logic
- Deterministic outputs (byte-identical for identical inputs)
- Zero input mutation
- Strict validation before translation

---

## Input Contract

Phase 48 accepts two parameters:

### `request` (Phase 45 Normalized Request)

Required top-level fields:

```javascript
{
  campaign: {
    name: string,               // Non-empty
    status: "ACTIVE",           // Must be exactly "ACTIVE"
    special_ad_categories: []   // Non-empty array
  },
  adsets: [{
    name: string,               // Non-empty
    optimization_goal: string,  // Must exist in mapping table
    billing_event: string,      // Must exist in mapping table
    daily_budget?: number,      // Either daily_budget or lifetime_budget required
    lifetime_budget?: number,
    targeting: object,          // Required
    placements: []              // Must be sorted lexicographically
  }],
  creatives: [{
    name: string,
    type: string,               // Must exist in mapping table
    body: string,
    headline: string,
    media_url: string
  }],
  targeting: {
    geo: object,                // Required
    age_min: number,            // Required
    age_max: number,            // Required
    genders?: array,
    interests?: array,
    behaviors?: array,
    // ...other allowed fields from mapping table
  },
  special_ad_categories: [],    // Sorted, from mapping table
  objective: string,            // Must exist in mapping table
  optimization_goal: string,
  billing_event: string,
  placement_bundle: string,
  budget: number,
  currency: string,
  brand_metadata: object
}
```

### `context`

```javascript
{
  execution_id: string,
  mode: "LIVE" | "REPLAY",
  iteration_index?: number,
  connector_input?: object      // Required for REPLAY mode
}
```

---

## Output Contract

### Success (LIVE Mode)

```javascript
{
  ok: true,
  connector_input: {
    mode: "LIVE" | "REPLAY",
    connector_key: "meta_ads",
    execution_id: string,
    iteration_index: number,
    request: {
      raw_request: {
        campaign: { /* Meta-formatted */ },
        adsets: [ /* Meta-formatted */ ],
        creatives: [ /* Meta-formatted */ ],
        placements: { /* Meta-formatted */ }
      },
      normalized_request: { /* Kaivo-normalized */ }
    },
    meta: {
      input_contract_version: "Phase47ConnectorInputV1"
    }
  }
}
```

### Success (REPLAY Mode)

```javascript
{
  ok: true,
  connector_input: <passthrough from context.connector_input>
}
```

### Error

```javascript
{
  ok: false,
  code: string,
  message: string,
  envelope: {
    execution_id: string
  }
}
```

**Error Codes:**
- `FEATURE_DISABLED`: Feature flag not enabled
- `META_VALIDATION_ERROR`: Validation failed

---

## Validation Rules

Validation occurs in strict order. First error encountered halts execution.

### 1. Required Field Validation

All 12 top-level fields must exist:
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

**Error if missing:** `Missing required field: <field_name>`

### 2. Objective Validation

- `objective` must exist in `meta_objectives.json` mappings
- No defaulting or substitution allowed

**Error if invalid:** `Invalid objective: <value>`

### 3. Campaign Validation

- `campaign.name`: Non-empty string
- `campaign.status`: Must be exactly `"ACTIVE"`
- `campaign.special_ad_categories`: Non-empty array

**Errors:**
- `campaign.name must be a non-empty string`
- `campaign.status must be exactly "ACTIVE"`
- `campaign.special_ad_categories must be a non-empty array`

### 4. Special Ad Categories Validation

- Each category must exist in `meta_special_ad_categories.json`
- Array must be sorted lexicographically
- No inference of categories allowed

**Errors:**
- `Invalid special ad category: <value>`
- `special_ad_categories must be sorted lexicographically`

### 5. AdSet Validation

For each adset:
- `name`: Non-empty string
- `optimization_goal`: Must exist in `meta_optimization_goals.json`
- `billing_event`: Must exist in `meta_billing_events.json`
- `daily_budget` OR `lifetime_budget`: At least one required
- `targeting`: Must be object
- `placements`: Must be array, sorted lexicographically

**Errors:**
- `adsets[i].name must be a non-empty string`
- `adsets[i].optimization_goal is required`
- `adsets[i].optimization_goal "<value>" is invalid`
- `adsets[i].billing_event is required`
- `adsets[i].billing_event "<value>" is invalid`
- `adsets[i] must have either daily_budget or lifetime_budget`
- `adsets[i].targeting must be an object`
- `adsets[i].placements must be an array`
- `adsets[i].placements must be sorted lexicographically`

### 6. Targeting Validation

Required fields:
- `geo`: Must exist
- `age_min`: Must exist
- `age_max`: Must exist

Disallowed fields (from `meta_disallowed_targeting_fields.json`):
- `custom_audiences`
- `excluded_custom_audiences`
- `connections`
- 20+ other sensitive/deprecated fields

**Errors:**
- `targeting.geo is required`
- `targeting.age_min is required`
- `targeting.age_max is required`
- `targeting.<field> is not allowed`

### 7. Creative Validation

For each creative:
- `name`: Required string
- `type`: Must exist in `meta_creative_types.json`
- `body`: Required string
- `headline`: Required string
- `media_url`: Required string

**Forbidden fields:** No automatic addition of `object_story_spec`, `link_data`, `asset_feed_spec`, `page_id`, or `call_to_action` structures

**Errors:**
- `creatives[i].name is required and must be a string`
- `creatives[i].type is required`
- `creatives[i].type "<value>" is invalid`
- `creatives[i].body is required and must be a string`
- `creatives[i].headline is required and must be a string`
- `creatives[i].media_url is required and must be a string`

---

## Translation Rules

### Campaign Translation

```javascript
{
  name: campaign.name,
  objective: objectivesMapping.mappings[objective],
  special_ad_categories: sorted(special_ad_categories),
  status: "ACTIVE"
}
```

**No additional fields permitted.**

### AdSet Translation

```javascript
{
  name: adset.name,
  optimization_goal: optimizationGoalsMapping.mappings[adset.optimization_goal],
  billing_event: adset.billing_event,
  daily_budget?: adset.daily_budget,          // If present
  lifetime_budget?: adset.lifetime_budget,    // If present
  targeting: translateTargeting(adset.targeting),
  status: "ACTIVE"
}
```

**Forbidden fields:** `promoted_object`, `pacing`, `bid_strategy`, `attribution_spec`

### Targeting Translation

```javascript
{
  geo_locations: targeting.geo,
  age_min: targeting.age_min,
  age_max: targeting.age_max,
  genders?: sorted(targeting.genders),
  interests?: sorted(targeting.interests),
  behaviors?: sorted(targeting.behaviors),
  publisher_platforms?: sorted(targeting.publisher_platforms),
  facebook_positions?: sorted(targeting.facebook_positions),
  instagram_positions?: sorted(targeting.instagram_positions),
  audience_network_positions?: sorted(targeting.audience_network_positions),
  messenger_positions?: sorted(targeting.messenger_positions)
}
```

**All arrays must be sorted lexicographically.**  
**All keys must be sorted alphabetically.**

### Creative Translation

```javascript
{
  name: creative.name,
  body: creative.body,
  headline: creative.headline,
  media_url: creative.media_url,
  meta_creative_type: creative.type
}
```

**No complex Meta structures generated.**

### Placement Bundle Translation

Uses `meta_placements.json` to map bundle keys to platform/position arrays:

```javascript
{
  publisher_platforms: sorted(bundle.publisher_platforms),
  facebook_positions: sorted(bundle.facebook_positions),
  instagram_positions: sorted(bundle.instagram_positions),
  audience_network_positions: sorted(bundle.audience_network_positions),
  messenger_positions: sorted(bundle.messenger_positions)
}
```

---

## Determinism Guarantees

Phase 48 must ensure:

1. **Deep Clone Before Modifying**: Original request never mutated
2. **Deep Freeze After Construction**: Output is immutable
3. **Sorted Arrays**: All arrays sorted lexicographically
4. **Sorted Object Keys**: All object keys sorted alphabetically
5. **Stable Execution**: Identical inputs → byte-identical outputs

**Verification**: Determinism test runs same input twice and compares JSON.stringify() results.

---

## REPLAY Mode Behavior

When `context.mode === "REPLAY"`:

1. **No Validation**: Skip all validation steps
2. **No Translation**: Do not rebuild `raw_request`
3. **No Field Mapping**: Do not use mapping tables
4. **Strict Passthrough**: Return `context.connector_input` as-is

```javascript
if (context.mode === 'REPLAY') {
    return {
        ok: true,
        connector_input: context.connector_input
    };
}
```

**Purpose**: Replay mode allows exact reproduction of historical executions without re-validation or re-translation.

---

## Feature Flag Behavior

**Flag**: `FF_META_ADS_CONNECTOR`  
**Check**: `process.env.FF_META_ADS_CONNECTOR === 'true'`

If flag is not `"true"`:

```javascript
{
  ok: false,
  code: "FEATURE_DISABLED",
  message: "Meta Ads Connector disabled",
  envelope: { execution_id }
}
```

**No partial execution permitted.**

---

## Mapping Tables

All mapping tables located in: `orchestrator/phases/48_meta_ads_connector/mapping/`

1. **meta_objectives.json**: Kaivo objectives → Meta API objectives
2. **meta_optimization_goals.json**: Kaivo optimization goals → Meta optimization goals
3. **meta_billing_events.json**: Allowed billing event types
4. **meta_special_ad_categories.json**: Allowed special ad category values
5. **meta_placements.json**: Placement bundle definitions
6. **meta_targeting_fields.json**: Allowed targeting field names
7. **meta_disallowed_targeting_fields.json**: Disallowed/sensitive targeting fields
8. **meta_creative_types.json**: Allowed creative format types

**No hardcoded mappings permitted in engine logic.**

---

## Test Coverage

**Total Tests**: 18

### Happy Path (6)
1. Valid single adset campaign
2. Multiple adsets
3. Placement bundle translation
4. Complex targeting with interests and behaviors
5. Special ad categories sorting
6. Valid creative set with all fields

### Negative Path (6)
1. Missing campaign
2. Missing adsets
3. Invalid objective
4. Missing age_min
5. Disallowed targeting field
6. Missing creative media_url

### Edge Cases (4)
1. Large adset array (100+ adsets)
2. Large targeting arrays
3. Multiple placement combinations
4. Empty interests/behaviors arrays

### Regression Guard (1)
- Golden snapshot for standard campaign structure

### Determinism Guard (1)
- Byte-for-byte equality across identical runs

---

## Execution Example

### Input

```javascript
const request = {
  campaign: { name: 'Summer Sale', status: 'ACTIVE', special_ad_categories: ['NONE'] },
  adsets: [
    {
      name: 'US Target',
      optimization_goal: 'LINK_CLICKS',
      billing_event: 'LINK_CLICKS',
      daily_budget: 5000,
      targeting: { geo: { countries: ['US'] }, age_min: 18, age_max: 65 },
      placements: ['facebook', 'instagram']
    }
  ],
  creatives: [
    {
      name: 'Image Ad',
      type: 'SINGLE_IMAGE',
      body: 'Shop now',
      headline: 'Summer Sale',
      media_url: 'https://example.com/ad.jpg'
    }
  ],
  targeting: { geo: { countries: ['US'] }, age_min: 18, age_max: 65 },
  special_ad_categories: ['NONE'],
  objective: 'CONVERSIONS',
  optimization_goal: 'LINK_CLICKS',
  billing_event: 'LINK_CLICKS',
  placement_bundle: 'AUTOMATIC',
  budget: 10000,
  currency: 'USD',
  brand_metadata: { brand_id: 'brand-123' }
};

const context = {
  execution_id: 'exec-123',
  mode: 'LIVE',
  iteration_index: 0
};
```

### Output

```javascript
{
  ok: true,
  connector_input: {
    mode: 'LIVE',
    connector_key: 'meta_ads',
    execution_id: 'exec-123',
    iteration_index: 0,
    request: {
      raw_request: {
        campaign: {
          name: 'Summer Sale',
          objective: 'OUTCOME_TRAFFIC',
          special_ad_categories: ['NONE'],
          status: 'ACTIVE'
        },
        adsets: [{
          billing_event: 'LINK_CLICKS',
          daily_budget: 5000,
          name: 'US Target',
          optimization_goal: 'LINK_CLICKS',
          status: 'ACTIVE',
          targeting: {
            age_max: 65,
            age_min: 18,
            geo_locations: { countries: ['US'] }
          }
        }],
        creatives: [{
          body: 'Shop now',
          headline: 'Summer Sale',
          media_url: 'https://example.com/ad.jpg',
          meta_creative_type: 'SINGLE_IMAGE',
          name: 'Image Ad'
        }],
        placements: {
          audience_network_positions: ['classic', 'rewarded_video'],
          facebook_positions: ['feed', 'instant_article', 'marketplace', 'right_hand_column', 'search', 'story', 'video_feeds'],
          instagram_positions: ['explore', 'story', 'stream'],
          messenger_positions: ['messenger_home', 'sponsored_messages', 'story'],
          publisher_platforms: ['audience_network', 'facebook', 'instagram', 'messenger']
        }
      },
      normalized_request: { /* Kaivo-normalized copy */ }
    },
    meta: {
      input_contract_version: 'Phase47ConnectorInputV1'
    }
  }
}
```

---

## Completion Criteria

Phase 48 is complete when:

1. ✅ All 18 tests pass
2. ✅ Feature flag gating implemented
3. ✅ REPLAY mode passthrough implemented
4. ✅ All 8 mapping tables created
5. ✅ All 7 validation rules implemented
6. ✅ All 5 translation rules implemented
7. ✅ Determinism guaranteed (deep clone, freeze, sorted arrays/keys)
8. ✅ No IO operations
9. ✅ No input mutation
10. ✅ Exact Phase47ConnectorInputV1 output contract

**Any missing requirement → incomplete.**
