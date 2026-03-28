# Phase 46: Connector Execution Router

**Objective**: Provide a single, deterministic entry point for all connector execution.

**Position**:
- **Input**: Execution envelope after Phase 44 (Redaction Router) and Phase 45 (Connector Execution IO - currently).
- **Output**: Envelope with a stable `ConnectorExecutionRouterResponseV1`.

**Feature Flag**: `FF_CONNECTOR_EXECUTION_ROUTER`
- **False**: Passthrough to Phase 45 (Google Ads only).
- **True**: Canonical entry point for all connectors.

---

## 1. Contracts

### Input: `ConnectorExecutionRouterInputV1`

Located in `envelope`:

```javascript
{
  meta: {
    execution_id: "string (required)",
    workspace_id: "string (required)",
    brand_id: "string (required)",
    trace_domain: "string (required)",
    replay_mode: "NONE" | "DRY_RUN" | "REHYDRATE" | "REBUILD_CONNECTOR_REQUESTS" // optional
  },
  payload: {
    connector_execution_requests: [
      {
        connector_key: "string (required)", // e.g., 'google_ads', 'meta_ads'
        connector_intent: "string (required)", // e.g., 'CREATE_CAMPAIGN'
        request_id: "string (required)",
        request_body: { ... }, // required object
        retry_context: { ... } // optional
      }
    ]
  },
  snapshot: {
    connectors: {
      [request_id]: { ... } // ConnectorExecutionResultV1
    }
  } // optional
}
```

### Output: `ConnectorExecutionRouterResponseV1`

Located in `envelope.payload.connector_execution_router`:

```javascript
{
  contract_version: "connector_execution_router_v1",
  summary: {
    total_requests: number,
    total_success: number,
    total_failed: number,
    per_connector: {
      [connector_key]: {
        requests: number,
        success: number,
        failed: number
      }
    }
  },
  results: [
    {
      connector_key: "string",
      connector_intent: "string",
      request_id: "string",
      status: "SUCCESS" | "FAILED" | "SKIPPED",
      status_code: "string",
      http_status_code: number, // optional
      response_body: { ... }, // optional
      error_body: { ... }, // optional
      latency_ms: number, // optional
      replay_source: "LIVE" | "SNAPSHOT" // optional
    }
  ],
  unknown_connectors: [
    {
      connector_key: "string",
      request_id: "string",
      error_code: "UNKNOWN_CONNECTOR_KEY",
      message: "string"
    }
  ], // optional
  no_op: boolean // optional
}
```

---

## 2. Routing Semantics

1.  **Feature Flag Check**:
    -   If `FF_CONNECTOR_EXECUTION_ROUTER` is false, delegate to Phase 45 Google Ads path (legacy/passthrough).
    -   Return wrapped response to maintain contract.

2.  **Validation**:
    -   Validate envelope structure and required fields.
    -   Fail with `MALFORMED_CONNECTOR_ROUTER_INPUT` if invalid.

3.  **Replay Behavior**:
    -   `DRY_RUN`: No IO. Return `no_op: true`.
    -   `REHYDRATE` / `REBUILD_CONNECTOR_REQUESTS`: Use snapshot. Fail with `CONNECTOR_ROUTER_REPLAY_SNAPSHOT_MISSING` if snapshot missing. No IO.
    -   `NONE` (or undefined): Live execution.

4.  **Connector Dispatch**:
    -   Lookup engine in registry by `connector_key`.
    -   If missing, record `UNKNOWN_CONNECTOR_KEY`.
    -   If present, call `execute(request, context)`.

5.  **Determinism**:
    -   Results sorted by `connector_key` then `request_id`.
    -   No mutation of inputs.

---

## 3. Error Codes

-   `MALFORMED_CONNECTOR_ROUTER_INPUT`: Invalid input envelope.
-   `CONNECTOR_ROUTER_DISABLED`: Flag off (internal use).
-   `UNKNOWN_CONNECTOR_KEY`: Connector not in registry.
-   `CONNECTOR_ROUTER_REPLAY_SNAPSHOT_MISSING`: Replay requested but snapshot missing.
-   `CONNECTOR_ROUTER_INTERNAL_ERROR`: Unhandled exception.
-   `CONNECTOR_ROUTER_REGISTRY_MISCONFIGURED`: Engine missing `execute` function.

---

## 4. Observability

-   **Metrics**:
    -   `kaivo.connector_router.requests_total`
    -   `kaivo.connector_router.latency_ms`
    -   `kaivo.connector_router.unknown_connectors_total`
    -   `kaivo.connector_router.replay_mode_total`
-   **Logs**: `connector_router_executed` structured log.
-   **Trace**: `phase_46_connector_execution_router` span.

---

## 5. Test Matrix (18 Tests)

### Happy Path (6)
1.  Single Google request, flag on.
2.  Multiple Google requests, flag on.
3.  Mixed connectors (Google + Meta + TikTok).
4.  Replay DRY_RUN.
5.  Replay REHYDRATE.
6.  Passthrough (flag off).

### Negative Path (6)
7.  Missing payload.
8.  `connector_execution_requests` not array.
9.  Request missing `connector_key`.
10. Unknown `connector_key`.
11. Registry misconfigured.
12. Replay snapshot missing.

### Edge Cases (4)
13. Zero length requests.
14. High cardinality, one connector.
15. Duplicate `request_id`.
16. Large nested `request_body`.

### Guards (2)
17. Determinism guard.
18. Regression guard.
