# Kaivo Orchestrator Walkthrough

## Phase 11: Platform Payload Engine

The Platform Payload Engine transforms the deterministic `VenueExecutionPlan` (from Phase 10) into a `PlatformPayloadBundle`. This bundle contains abstract, cross-platform structures and platform-specific "flavors" for each venue, ready for later adaptation.

### Usage

The engine is invoked via the dispatcher using the `BUILD_PLATFORM_PAYLOADS_V1` intent.

### Example

**Input Intent:**

```json
{
  "type": "BUILD_PLATFORM_PAYLOADS_V1",
  "payload": {
    "brand_id": "brand_123",
    "campaign_goal": {
      "type": "LEAD_GEN",
      "primary_kpi": "CPL"
    },
    "venue_execution_plan": {
      "brand_id": "brand_123",
      "campaign_goal": { "type": "LEAD_GEN", "primary_kpi": "CPL" },
      "currency": "USD",
      "total_budget": 5000,
      "venues": [
        {
          "venue_key": "youtube",
          "role": "PRIMARY",
          "priority": 1,
          "objective": "AWARENESS",
          "primary_kpi": "CPV",
          "spend": { "allocated": 3000, "share": 0.6 },
          "creative_requirements": { "requires_video": true }
        }
      ]
    }
  }
}
```

**Output Envelope:**

```json
{
  "ok": true,
  "module": "platform_payload_engine",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "payload": {
    "brand_id": "brand_123",
    "venues": [
      {
        "venue_key": "youtube",
        "role": "PRIMARY",
        "platform_flavor": {
          "hierarchy": "CAMPAIGN_ADGROUP_AD",
          "needs_ad_group": true,
          "supports_multiple_creatives": true,
          "supported_aspect_ratios": ["16:9", "9:16", "1:1"],
          "notes": ["Video first venue", "Shorts support vertical 9:16"]
        },
        "abstract_structure": {
          "creative": {
            "requirements": {
              "requires_video": true,
              "requires_vertical_video": false,
              "requires_image": false,
              "requires_short_form": false
            }
          }
        },
        "meta": {
          "source_phase": 11,
          "from_venue_key": "youtube"
        }
      }
    ],
    "meta": {
      "source_phase": 11,
      "output_version": "PLATFORM_PAYLOAD_BUNDLE_V1"
    }
  }
}
```
