# PHASE 11 SPEC — PLATFORM PAYLOAD ENGINE

## Objective
Build the Platform Payload Engine.  
It consumes the VenueExecutionPlan from Phase 10 and produces a PlatformPayloadBundle that contains:

• abstract, cross-platform structure  
• platform-specific flavor metadata  

No external IO. No dependency on real APIs.  
Pure deterministic logic.

## FILES YOU MAY MODIFY / CREATE

ALLOWED:

1. orchestrator/modules/platform_payload_engine.js (new)
2. orchestrator/dispatcher.js (add routing only)
3. orchestrator/tests/platform_payload_engine.test.js (new)
4. docs/walkthrough.md or orchestrator/docs/walkthrough.md (whichever exists)

NOT ALLOWED:
- modifying deployment files
- modifying platform connectors
- modifying earlier phase modules unless explicitly stated

## INPUT CONTRACT

Export from the new module:

```js
async function buildPlatformPayloads(input) { ... }
module.exports = { buildPlatformPayloads };
```

input MUST contain:

```js
{
  brand_id: string;
  campaign_goal: {
    type: string;
    primary_kpi: string;
    secondary_kpi?: string | null;
  };
  venue_execution_plan: {
    brand_id: string;
    campaign_goal: {...};
    currency: string | null;
    total_budget: number;
    venues: Array<{
      venue_key: string;
      role: "PRIMARY"|"SUPPORTING"|"REMARKETING";
      priority: number;
      objective: string;
      primary_kpi: string;
      spend: { allocated: number; share: number };
      audience_hint?: any;
      creative_requirements?: {
        requires_video?: boolean;
        requires_vertical_video?: boolean;
        requires_image?: boolean;
        requires_short_form?: boolean;
      };
      meta?: any;
    }>;
  };
  meta?: any;
}
```

Validation rules:
- Missing or invalid input → return envelope with error "INVALID_INPUT".
- venues missing or empty → "NO_VENUES".

Must NOT throw; must return clean error envelopes.

## OUTPUT CONTRACT — ENVELOPE

Return exactly:

```js
{
  ok: boolean,
  module: "platform_payload_engine",
  timestamp: string,  // ISO 8601
  payload: PlatformPayloadBundle | null,
  error?: {
    code: string,
    message: string,
    details?: any
  }
}
```

On success:
- ok: true
- payload: PlatformPayloadBundle

On failure:
- ok: false
- payload: null
- error.code ∈ [“INVALID_INPUT”, “NO_VENUES”, “INTERNAL_ERROR”]

Wrap unexpected exceptions in INTERNAL_ERROR.

## PLATFORMPAYLOADBUNDLE — FULL SCHEMA

```js
PlatformPayloadBundle = {
  brand_id: string,
  campaign_goal: { type, primary_kpi, secondary_kpi? },
  currency: string | null,
  total_budget: number,
  venues: PlatformVenuePayload[],
  meta: {
    source_phase: 11,
    source_modules: ["venue_planner","platform_payload_engine"],
    orchestrator_run_id?: string | null,
    generated_at: string,
    input_version?: string,
    output_version?: string
  }
}
```

Each venue:

```js
PlatformVenuePayload = {
  venue_key,
  role,
  priority,
  objective,
  primary_kpi,
  spend: {
    allocated,
    share,
    currency
  },
  abstract_structure: {
    campaign_intent: {...},
    budget: {...},
    audience: {
      hint: any | null,
      segmentation_confidence: "LOW"|"MEDIUM"|"HIGH"
    },
    creative: {
      requirements: {
        requires_video,
        requires_vertical_video,
        requires_image,
        requires_short_form
      },
      recommended_slots: {
        video, image, text
      }
    },
    pacing: {
      strategy: "STANDARD",
      notes: []
    }
  },
  platform_flavor: {
    hierarchy: "SINGLE_LEVEL"|"CAMPAIGN_ADSET_AD"|"CAMPAIGN_ADGROUP_AD"|"CAMPAIGN_LINEITEM_CREATIVE",
    needs_ad_group: boolean,
    supports_multiple_creatives: boolean,
    supported_aspect_ratios: string[],
    recommended_creative_counts: { video, image, text },
    naming_constraints: { max_length, safe_character_pattern },
    notes: string[]
  },
  meta: {
    source_phase: 11,
    from_venue_index: number,
    from_venue_key: string,
    generated_at: string
  }
}
```

## PLATFORM FLAVOR TABLE (STATIC)

Implement:

- youtube → CAMPAIGN_ADGROUP_AD
- meta → CAMPAIGN_ADSET_AD
- tiktok → CAMPAIGN_ADGROUP_AD
- reddit → CAMPAIGN_ADGROUP_AD
- google_display → CAMPAIGN_LINEITEM_CREATIVE
- fallback → SINGLE_LEVEL

All fields must be copied immutably using .slice() or explicit copies.

## DISPATCHER ROUTING

In orchestrator/dispatcher.js, add:

```js
const platform_payload_engine = require("./modules/platform_payload_engine");

if (intent.type === "BUILD_PLATFORM_PAYLOADS_V1") {
  return await platform_payload_engine.buildPlatformPayloads(intent.payload);
}
```

Do NOT modify other routing logic.

## TEST SUITE REQUIREMENTS

Create: orchestrator/tests/platform_payload_engine.test.js

Tests required:
1. Happy Path
   - Two venues: youtube PRIMARY, google_display SUPPORTING
   - Assert flavor, abstract_structure, recommended_slots, spend, meta
2. Unknown Venue → Default Flavor
   - venue_key: “unknown_abc”
   - hierarchy: “SINGLE_LEVEL”
3. Missing venue_execution_plan → INVALID_INPUT
4. Empty venues → NO_VENUES

All tests must be deterministic.

## DOCUMENTATION UPDATE

Add a Phase 11 section to walkthrough.md:
- Describe purpose
- Show example intent
- Show simplified example payload
- Confirm deterministic behavior
