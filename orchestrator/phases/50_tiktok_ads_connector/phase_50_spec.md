# Phase 50: TikTok Ads Connector IO Engine Specification

**Contract:** `tiktok_ads_connector_request_v1` → `tiktok_ads_connector_response_v1`  
**Feature Flag:** `FF_TIKTOK_ADS_CONNECTOR_ENGINE`  
**IO:** Yes (TikTok Marketing API)  
**Mode:** LIVE and REPLAY.

---

## Purpose

Phase 50 is the production TikTok execution layer. It takes the connector request produced by Phase 49, sends real TikTok Marketing API calls, and returns a normalized connector response that Phase 46 can route like any other connector.

Key responsibilities:
- Read the TikTok connector request from the orchestrator envelope
- Resolve OAuth or long lived tokens through the existing credentials path
- Invoke TikTok Marketing API for all requested operations in a deterministic order
- Apply retry and backoff policy for retryable failures
- Normalize all responses and errors into the Kaivo connector schema
- Emit metrics, structured logs, and trace spans for observability

---

## Inputs

### ConnectorExecutionEnvelope

```javascript
{
  execution_id: string,                 // globally unique, stable
  requested_at?: string,                // ISO 8601, optional
  connector_key: 'tiktok_ads',          // router enforced
  tenant: {
    workspace_id: string,
    brand_id: string
  },
  context: {
    trace_domain?: string,
    locale?: string
  },
  request: TikTokConnectorRequestV1
}
```

### TikTokConnectorRequestV1

```javascript
{
  contract_version: 'tiktok_ads_v1',
  account: {
    tiktok_advertiser_id: string,
    credential_ref: string, // pointer to token store
    region?: 'EU' | 'US' | 'APAC'
  },
  operations: TikTokOperationV1[],
  settings?: {
    timeout_ms?: number,          // per request upper bound
    max_retries?: number,         // default 2
    initial_backoff_ms?: number   // default 250
  }
}
```

### TikTokOperationV1

```javascript
{
  op_id: string,                    // deterministic, unique per request
  type: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME',
  entity: 'CAMPAIGN' | 'AD_GROUP' | 'AD',
  endpoint: string,                 // relative path
  method: 'POST' | 'GET' | 'PATCH',
  payload: Record<string, any>      // fully shaped request body
}
```

---

## Outputs

### TikTokConnectorResponseV1

```javascript
{
  execution_id: string,
  connector_key: 'tiktok_ads',
  status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED' | 'DISABLED',
  status_code: 'OK' | 'NO_OP' | 'DISABLED' | 'INVALID_REQUEST' | 'UPSTREAM_ERROR' | 'AUTH_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR',
  results: TikTokOperationResultV1[],
  latency_ms: number,
  meta: {
    contract_version: 'tiktok_ads_v1',
    attempted_operation_count: number,
    succeeded_operation_count: number,
    failed_operation_count: number,
    retries_applied: number,
    feature_flag_enabled: boolean,
    requested_at?: string       // passed through from input or generated if missing
  },
  errors?: ConnectorErrorV1[]
}
```

### TikTokOperationResultV1

```javascript
{
  op_id: string,
  entity: 'CAMPAIGN' | 'AD_GROUP' | 'AD',
  type: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME',
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  tiktok_request_id?: string,
  tiktok_status_code?: number,
  tiktok_error_code?: string,
  tiktok_error_message?: string,
  response_body_redacted?: boolean,
  response_body?: any
}
```

### ConnectorErrorV1

```javascript
{
  code: string,          // e.g. 'AUTH_TOKEN_INVALID', 'RATE_LIMIT'
  message: string,
  scope: 'REQUEST' | 'OPERATION' | 'CREDENTIALS' | 'NETWORK',
  op_id?: string,
  details?: Record<string, any>
}
```

---

## Behavior

### Feature Flag
- When `FF_TIKTOK_ADS_CONNECTOR_ENGINE` is false:
  - Engine ignores upstream operations
  - Returns status `DISABLED` and code `DISABLED`, with empty results
  - No external IO

### Credential Resolution
- Resolves TikTok access token using `request.account.credential_ref` via shared credential service
- If lookup fails:
  - Status `FAILED`, status_code `AUTH_ERROR`
  - Single connector error with scope `CREDENTIALS`

### Retry Policy
- Default: `max_retries` = 2, `initial_backoff_ms` = 250
- Retry applies only for:
  - HTTP 429
  - HTTP 5xx
  - Network level transient errors (ECONNRESET, ECONNABORTED, ENOTFOUND, ETIMEDOUT, or timeout messages)
- Backoff: `initial_backoff_ms * 2^attempt`
- No retry for 4xx (other than 429) or business logic errors

### Deterministic Ordering
- Sort `request.operations` by `op_id` ascending before processing
- Execute sequentially

### Error Normalization
- HTTP 401, 403 → `AUTH_TOKEN_INVALID` / `AUTH_NOT_AUTHORIZED`
- HTTP 429 → `RATE_LIMIT`
- HTTP 5xx (exhausted) → `UPSTREAM_SERVICE_FAILURE`
- Network timeout → `NETWORK_TIMEOUT`

---

## Observability

- **Log Event:** `tiktok_ads_connector_result`
- **Trace Span:** `connector.tiktok_ads.execute`
- **Metrics:**
  - Operation count, success count, failure count
  - Retry count
  - Latency histogram

## 8. Backplane Integration

*   This connector’s request and response surfaces are constrained by `connector_backplane_v1.request_contract` and `connector_backplane_v1.response_contract` from Phase 27B.
*   The connector’s capabilities object conforms to `connector_backplane_v1.capabilities`.
*   The connector’s errors map into the canonical `connector_backplane_v1.error_surface`.
*   The connector’s metadata keys (`campaign_id`, `adset_id`, `creative_id`, `connector_key`, `version`, `lineage_token`) conform to `connector_backplane_v1.metadata_fields`.
