# PHASE 19 SPEC — CONNECTOR CONTRACTS ENGINE

## Objective
Create POSIX-style ABI for connector layer:
- Validate connector readiness per venue/unit
- Normalize connector_key, objectives, currency
- Provide retry policies
- Return structured errors/warnings

## Files Modified/Created
- `orchestrator/modules/connector_contracts_engine.js` (new)
- `orchestrator/dispatcher.js` (updated)
- `orchestrator/tests/connector_contracts_engine.test.js` (new)

## Input
`ExecutionSubmissionBundleInput` with:
- `submission_id`, `brand_id` (required)
- `goal`, `currency`, `total_budget`
- `readiness` (global_status, can_launch)
- `venues[]` with units

## Output
`ConnectorContractsReport` with:
- `is_connector_ready`: Global connector readiness
- `summary`: Counts (venues, units, errors, warnings)
- `venues[]`: Per-venue contracts with normalized fields

## Envelope
All outputs follow orchestrator envelope format:
{ ok, module: "connector_contracts_engine", timestamp, payload: { bundle, connector_contracts } | null, error? }

## Key Normalizations
1. **connector_key**: `meta` → `META_ADS`, `google*` → `GOOGLE_ADS`, `tiktok` → `TIKTOK_ADS`, etc.
2. **Objectives**: Fold to `AWARENESS`, `TRAFFIC`, `LEADS`, `SALES`, or `CUSTOM`
3. **Currency**: Uppercase only (v0.1)

## Validation Rules
### Venue-level:
- venue_key required
- budget.allocated: finite, non-negative
- units non-empty if status=READY && can_submit=true

### Unit-level:
- unit_id, creative_ref, audience_ref required
- Flags: `is_connector_ready`, `missing_fields[]`

## Retry Policy (Defaults)
- Strategy: `LINEAR_BACKOFF`
- Max attempts: 3
- Initial delay: 1000ms
- Max delay: 30000ms

## Test Coverage
10 tests covering:
- Happy path (multi-venue)
- Missing required fields
- Negative budget
- Empty units
- Missing unit fields
- Unknown venue_key
- Objective/currency normalization
- Input immutability
- Determinism
