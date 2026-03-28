# PHASE 20 SPEC — CONNECTOR REQUEST BUILDER ENGINE

## Objective
Build platform-specific request payloads without IO:
- Consumes Phase 19 connector contracts
- Routes by platform_kind (Meta, Google Ads, TikTok, Generic)
- Builds adapter-ready request shapes
- Pure logic, deterministic, no network calls

## Files Modified/Created
- `orchestrator/modules/connector_request_builder.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/connector_request_builder.test.js` (new)

## Input
Phase 19 output with `connector_contracts.venues[]`

## Output
`ConnectorVenueRequest[]` with:
- `can_build_request`: Boolean flag
- `status`: "READY" | "SKIPPED" | "ERROR"
- `requests.primary`: Platform-specific request object
- `requests.secondary`: Additional requests (empty array in v0.1)
- `errors`, `warnings`: Structured issues
- `debug`: Objective, bid, currency info

## Envelope
All outputs follow orchestrator envelope format:
{ ok, module: "connector_request_builder", timestamp, payload: { plan, readiness, validation, policy, connector_contracts, connector_requests } | null, error? }

## Platform Routing
1. **META**: Meta Ads request (account_id, campaign, ad_set, targeting, creative, tracking)
2. **GOOGLE_ADS**: Google Ads request (customer_id, campaign, ad_group, targeting, creative, tracking)
3. **TIKTOK**: TikTok Ads request (advertiser_id, campaign, ad_group, targeting, creative, tracking)
4. **GENERIC**: Pass-through request (venue_key, budget, objective, audience, creative, tracking, schedule, meta)

## Status Rules
- **SKIPPED**: `is_connector_ready === false` or `can_submit === false`
- **READY**: Request built successfully
- **ERROR**: Missing required fields (objective, budget)

## Test Coverage
12 tests covering:
- Invalid input
- Venue not ready (SKIPPED)
- Platform-specific builders (Meta, Google, TikTok, Generic)
- Missing required fields (ERROR)
- Mixed venues
- platform_kind derivation
- Input immutability
- Determinism
