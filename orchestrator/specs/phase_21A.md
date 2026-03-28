# PHASE 21A SPEC — UNIVERSAL IO CONNECTOR INTERFACE

## Objective
Create the abstract interface, routing skeleton, and envelopes for connector execution without implementing real HTTP calls.
- Pure logic, deterministic
- No network IO
- Abstract `BaseConnector` and platform stubs

## Files Modified/Created
- `orchestrator/modules/connector_io_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/connector_io_engine.test.js` (new)

## Input
Phase 20 output with `connector_requests.venues[]`

## Output
`ConnectorIOResult[]` with:
- `status`: "SKIPPED" | "READY" | "SUCCESS" | "FAILED"
- `http_status`: number | null
- `response_body`: object | null
- `errors`, `warnings`: Structured issues

## Connector Interface
```javascript
class BaseConnector {
  constructor(config) {}
  async execute(primaryRequest) {
    // Returns { http_status: null, response_body: null, errors: [], warnings: [] }
  }
  static validateConfig(config) {}
}
```

## Routing Skeleton
- **META**: `MetaConnector`
- **GOOGLE_ADS**: `GoogleAdsConnector`
- **TIKTOK**: `TikTokConnector`
- **GENERIC**: `GenericHttpConnector`

## Status Rules
- **SKIPPED**: Venue not ready or `can_build_request` is false
- **READY**: Connector instantiated and executed (stub returns empty result)
- **FAILED**: Exception during execution

## Test Coverage
7 tests covering:
- Invalid input
- Missing requests
- SKIPPED venues
- READY venues (Meta, Google)
- Determinism
- BaseConnector interface
- No network calls

## Phase 21B – Google Ads Connector (IO-Ready)

This phase extends Phase 21A by implementing a real Google Ads connector:

- `GoogleAdsConnector` now accepts a config with:
  - `developer_token`
  - `access_token`
  - optional `login_customer_id`
  - optional `api_base_url`
  - optional injected `http_client(url, options)`

- `execute(primaryRequest)`:
  - Validates config and primary request.
  - Builds a Google Ads SearchStream request for GAQL.
  - Uses `http_client` (if provided) to call:
    `POST {api_base_url}/v16/customers/{customer_id}/googleAds:searchStream`
  - Maps the HTTP response into:
    `{ http_status, response_body, errors, warnings }`

- No HTTP library is hard-coded; all IO is performed via injected `http_client`.
- Orchestrator behavior remains:
  - `executeVenue` keeps using status `"READY"` for executed connectors.
  - Errors inside the connector are returned as structured errors.

## Phase 21C: Connector Config Injection Layer

### Objective
Implement a deterministic configuration injection layer to provide each connector with a merged config (global platform, venue-level, and runtime `http_client`).

### Key Features
1.  **Config Injection:** The `run` function now accepts an optional `injectedConfig` object.
2.  **Config Merging:** For each venue, a `mergedConfig` is built by combining:
    *   `global_connector_config[platform_kind]` (Platform-wide settings like `developer_token`)
    *   `connector_contracts.venues[].meta` (Venue-specific overrides like `login_customer_id`)
    *   `http_client` (Runtime dependency for network IO)
3.  **Deterministic Resolution:** The merging order ensures venue-specific config overrides global config, allowing for granular control.
4.  **Testability:** By injecting the `http_client`, we can mock network responses in tests without making real HTTP calls, ensuring the system remains deterministic and safe.

### Updated `run` Signature
```javascript
async function run(payload, injectedConfig = {})
```

### Updated `executeVenue` Logic
1.  Retrieve `platformConfig` from `injectedConfig`.
2.  Retrieve `venueConfig` from `connector_contracts`.
3.  Merge configs: `global` + `venue` + `http_client`.
4.  Instantiate connector with `mergedConfig`.

### Test Coverage (New Tests 12-15)
*   **Test 12:** Config Injection Merging (Global + Venue) - Verifies that global and venue configs are correctly merged.
*   **Test 13:** Config Injection Venue Override - Verifies that venue config overrides global config when keys collide.
*   **Test 14:** Missing Global Config - Verifies graceful fallback when global config is missing but venue config provides necessary fields.
*   **Test 15:** End-to-End Google Ads with Injected Config - Verifies the full flow using a mocked `http_client` to simulate a Google Ads API response.

## Phase 21D: Meta Connector (IO-Ready)

### Objective
Implement the Meta Marketing API connector with real IO capability, following the pattern established in Phase 21B. This connector performs a safe, read-only GET request to validate credentials.

### Key Features
1.  **Config Validation:** Requires `access_token` and `http_client`.
2.  **Primary Request Validation:** Requires `ad_account_id`.
3.  **Deterministic Request Building:**
    *   Defaults: `api_base_url` ("https://graph.facebook.com"), `api_version` ("v18.0"), `fields` ("id,name").
    *   URL: `{api_base_url}/{api_version}/{ad_account_id}?fields={fields}`
    *   Headers: `Authorization: Bearer {access_token}`
4.  **Response Mapping:**
    *   Success (200-299): Returns `http_status` and `response_body`.
    *   Error (non-2xx): Returns `META_HTTP_ERROR`.
    *   Network Failure: Returns `META_NETWORK_ERROR`.

### Test Coverage (New Tests 16-19)
*   **Test 16:** Meta Config Validation - Verifies missing `access_token` fails.
*   **Test 17:** Meta Primary Request Validation - Verifies missing `ad_account_id` fails.
*   **Test 18:** Meta Success Mapping - Verifies correct URL construction and success response mapping.
*   **Test 19:** Meta HTTP Error Mapping - Verifies handling of API errors (e.g., 403).

---

**Note on Later Phases:**
Phase 21B, 21C, and 21D extend the Phase 21A module with IO-ready connectors
(Google Ads and Meta) and a configuration injection layer. Phase 21A remains
pure logic; IO occurs only when later-phase connectors are invoked through an
injected http_client. The original Phase 21A contract is unchanged.
