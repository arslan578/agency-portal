# Phase 45: Google Ads and YouTube Connector IO Engine

**Contract Version:** `google_ads_connector_v1`  
**Feature Flag:** `FF_GOOGLE_ADS_CONNECTOR_IO`

---

## 1. Purpose and Scope

Phase 45 is the **Google Ads and YouTube Connector IO Engine**.

It sits after:

- Phase 20: Connector Request Builder  
- Phases 28–30: Snapshot and Replay Layers  
- Phase 43: Multi-Tenant Trace Domain Engine  
- Phase 44: Multi-Tenant Redaction Router  

It provides a **hardening-compliant IO shell** around the Google Ads and YouTube execution path, executing campaigns using deterministic, contract-driven requests while preserving full replayability and multi-tenant safety.

Supported modes:

- `DRY_RUN`: Build requests only, no IO.  
- `RECORD_ONLY`: Build requests, emit observability, no IO.  
- `LIVE_SEND`: Execute requests through the Google Ads / YouTube API client.

All IO goes through `orchestrator/connectors/google_ads/client/google_ads_client.js`.

---

## Connector Template Status

**Phase 45 defines the canonical connector IO pattern for all Kaivo platform connectors.**

Every future connector (Meta, TikTok, Roku, etc.) must mirror Phase 45's architecture: contract-driven input validation, feature flag semantics (NOOP when OFF, strict validation when ON), deterministic raw request construction, stable replay alignment, mode-aware execution (DRY_RUN, RECORD_ONLY, LIVE_SEND), IO-only duration measurement, structured error mapping with retry signals, and the standardized connector_result envelope shape. The test matrix (28 tests: 6 happy, 8 negative, 4 edge, 2 guards, 8 connector-specific) is the required coverage pattern. Phase 45 is not "Google Ads working"—it is the deterministic, replayable, multi-tenant-safe boundary between Kaivo's orchestrator and external platform chaos.

See `docs/connector_template.md` for the full template specification.

---

## 2. Input Contract: `GoogleAdsConnectorRequestEnvelopeV1`

```json
{
  "execution_id": "string (required, non-empty)",
  "trace_domain": {
    "trace_domain_key": "string (required when feature flag is ON)"
  },
  "connector_request": {
    "connector_key": "GOOGLE_ADS",
    "mode": "DRY_RUN | RECORD_ONLY | LIVE_SEND",
    "account": {
      "customer_id": "string (required, non-empty)",
      "login_customer_id": "string (optional)"
    },
    "payloads": [
      {
        "entity_type": "CAMPAIGN | AD_GROUP | AD",
        "operation": "CREATE | UPDATE | REMOVE",
        "data": { }
      }
    ]
  },
  "replay_snapshot": {
    "raw_requests": [
      {
        "customer_id": "string",
        "operation": "CREATE | UPDATE | REMOVE",
        "campaign": { },
        "ad_group": { },
        "ad": { }
      }
    ]
  }
}
```

Notes:
- `trace_domain.trace_domain_key` is required only when `FF_GOOGLE_ADS_CONNECTOR_IO` is true.
- When `payloads` is missing or not an array, the engine treats it as an empty list.
- `replay_snapshot` is optional; if present, it must be consistent with the reconstructed `raw_requests`.

---

## 3. Output Contract: `GoogleAdsConnectorResultEnvelopeV1`

The engine returns the original envelope without mutation, plus an additive `connector_result` block.

---

## 4. Feature Flag: `FF_GOOGLE_ADS_CONNECTOR_IO`

- **OFF**: The engine does not perform validation beyond basic shape. Returns safe envelope with `NOOP_FEATURE_FLAG_OFF` status.
- **ON**: Full validation, mode dispatch, IO, mapping, and replay verification are enforced.

---

## 5. Control Flow

See specification document for complete control flow details.

---

## 6. Test Plan

Phase 45 ships with 26 tests:
- 6 Happy Path
- 6 Negative
- 4 Edge
- 2 Guards (Regression, Determinism)
- 8 Connector-Specific

All tests are deterministic, IO-bounded, and compliant with the Forward Hardening Framework.

## 7. Backplane Integration

*   This connector’s request and response surfaces are constrained by `connector_backplane_v1.request_contract` and `connector_backplane_v1.response_contract` from Phase 27B.
*   The connector’s capabilities object conforms to `connector_backplane_v1.capabilities`.
*   The connector’s errors map into the canonical `connector_backplane_v1.error_surface`.
*   The connector’s metadata keys (`campaign_id`, `adset_id`, `creative_id`, `connector_key`, `version`, `lineage_token`) conform to `connector_backplane_v1.metadata_fields`.
