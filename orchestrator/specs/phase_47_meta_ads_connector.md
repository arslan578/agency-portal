# Phase 47: Meta Ads Connector (v3)

## Objective
Provide a deterministic, replayable, and strictly typed connector for Meta Ads (Facebook/Instagram).

## Contracts

### Input Envelope
- `execution_id`: required string
- `payload`:
  - `connector_key`: "meta_ads"
  - `connector_request`:
    - `name`: string
    - `objective`: string
    - `status`: string
    - `special_ad_categories`: array
  - `snapshot` (optional):
    - `replay_mode`: "REPLAY"
    - `connector_responses`: { meta_ads: Phase47ConnectorResultV1 }
  - `tenant` (optional): { access_token, account_id }
- `flags`: { FF_META_ADS_CONNECTOR: boolean }

### Output: Phase47ConnectorResultV1
```javascript
{
  ok: boolean,
  status: "SUCCESS" | "FAILED" | "SKIPPED",
  replay_source: "LIVE" | "REPLAY",
  connector: "meta_ads",
  request: object | null,
  response: { raw: object | null, normalized: object | null },
  error: { code: string, message: string } | null,
  metrics: { meta_ads: { requests: number, latency_ms: number } },
  logs: Array<{ event, at, connector, ... }>,
  execution_id: string,
  started_at: string,
  finished_at: string,
  no_op?: boolean // Only if SKIPPED
}
```

## Error Codes
- `MALFORMED_ENVELOPE`
- `INVALID_CONNECTOR_KEY`
- `MALFORMED_CONNECTOR_REQUEST`
- `MISSING_META_CREDENTIALS`
- `REPLAY_DATA_MISSING`
- `META_API_ERROR`
- `NETWORK_ERROR`
- `INTERNAL_ERROR`

## Behavior
1. **Feature Flag**: If disabled, returns SKIPPED with `no_op: true`.
2. **Replay**: If `snapshot.replay_mode === 'REPLAY'`, uses stored result. No IO.
3. **Live**: Validates request, checks creds, calls Meta Graph API, normalizes response.
4. **Determinism**: No inference, strict validation, immutable envelope.
