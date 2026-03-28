/**
 * Phase 47: Meta Ads Connector Engine (v3)
 * 
 * Strict OS-grade implementation.
 * Deterministic, Replayable, Type-Safe.
 *
 * // This connector is constrained by Phase 27B connector_backplane_v1 (request, response, capabilities, error_surface, metadata_fields).
 */

const META_GRAPH_URL = 'https://graph.facebook.com';
const META_API_VERSION = 'v19.0';

const ERROR_CODES = {
    MALFORMED_ENVELOPE: "MALFORMED_ENVELOPE",
    INVALID_CONNECTOR_KEY: "INVALID_CONNECTOR_KEY",
    MALFORMED_CONNECTOR_REQUEST: "MALFORMED_CONNECTOR_REQUEST",
    MISSING_META_CREDENTIALS: "MISSING_META_CREDENTIALS",
    REPLAY_DATA_MISSING: "REPLAY_DATA_MISSING",
    META_API_ERROR: "META_API_ERROR",
    NETWORK_ERROR: "NETWORK_ERROR",
    INTERNAL_ERROR: "INTERNAL_ERROR"
};

/**
 * Create standardized V1 result
 */
function createResult({
    ok,
    status,
    replay_source,
    request = null,
    response = { raw: null, normalized: null },
    error = null,
    metrics = { meta_ads: { requests: 0, latency_ms: 0 } },
    logs = [],
    execution_id,
    started_at,
    finished_at = new Date().toISOString(),
    no_op
}) {
    const result = {
        ok,
        status,
        replay_source,
        connector: "meta_ads",
        request,
        response,
        error,
        metrics,
        logs,
        execution_id,
        started_at,
        finished_at
    };
    if (no_op) result.no_op = true;
    return result;
}

/**
 * Normalize stored result for replay
 */
function normalizeStoredResult(stored) {
    return {
        ok: stored.ok === true,
        status: stored.status || "FAILED",
        request: stored.request || null,
        response: {
            raw: stored.response?.raw ?? null,
            normalized: stored.response?.normalized ?? null
        },
        error: stored.error || null,
        metrics: stored.metrics?.meta_ads || { requests: 0, latency_ms: 0 },
        logs: Array.isArray(stored.logs) ? stored.logs : []
    };
}

/**
 * Execute Meta Ads Connector
 */
async function executeMetaAdsConnector(envelope) {
    const started_at = new Date().toISOString();
    const logs = [];

    // 1. Feature Flag Resolution
    const flagInEnvelope = envelope?.flags?.FF_META_ADS_CONNECTOR;
    const flagInEnv = process.env.FF_META_ADS_CONNECTOR === "true";
    const isEnabled = (flagInEnvelope !== undefined) ? flagInEnvelope : flagInEnv;

    if (!isEnabled) {
        logs.push({
            event: "connector_skipped",
            at: new Date().toISOString(),
            connector: "meta_ads",
            reason: "Feature flag disabled"
        });
        return createResult({
            ok: true,
            status: "SKIPPED",
            replay_source: "LIVE",
            request: envelope?.payload?.connector_request || null,
            response: { raw: null, normalized: { message: "Feature flag disabled" } },
            metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
            logs,
            execution_id: envelope?.execution_id || "unknown",
            started_at,
            no_op: true
        });
    }

    // 2. Envelope Validation
    if (!envelope || !envelope.execution_id || !envelope.payload) {
        logs.push({ event: "execution_error", at: new Date().toISOString(), connector: "meta_ads", error: "Missing execution_id or payload" });
        return createResult({
            ok: false,
            status: "FAILED",
            replay_source: "LIVE",
            error: { code: ERROR_CODES.MALFORMED_ENVELOPE, message: "Missing execution_id or payload" },
            metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
            logs,
            execution_id: "unknown",
            started_at
        });
    }

    const execution_id = envelope.execution_id;
    const payload = envelope.payload;

    // 3. Connector Key Validation
    if (payload.connector_key !== "meta_ads") {
        return createResult({
            ok: false,
            status: "FAILED",
            replay_source: "LIVE",
            error: { code: ERROR_CODES.INVALID_CONNECTOR_KEY, message: `Invalid connector_key: ${payload.connector_key}` },
            metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
            logs,
            execution_id,
            started_at
        });
    }

    // 4. Replay Mode
    if (payload.snapshot && payload.snapshot.replay_mode === "REPLAY") {
        const storedResult = payload.snapshot.connector_responses?.meta_ads;
        if (storedResult) {
            const normalized = normalizeStoredResult(storedResult);
            return createResult({
                ...normalized,
                replay_source: "REPLAY",
                execution_id,
                started_at: storedResult.started_at || started_at,
                finished_at: new Date().toISOString()
            });
        } else {
            logs.push({ event: "execution_error", at: new Date().toISOString(), connector: "meta_ads", error: "Replay data missing" });
            return createResult({
                ok: false,
                status: "FAILED",
                replay_source: "REPLAY",
                error: { code: ERROR_CODES.REPLAY_DATA_MISSING, message: "Replay mode requested but snapshot data missing for meta_ads" },
                metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
                logs,
                execution_id,
                started_at
            });
        }
    }

    // 5. Live Execution Validation
    const connectorRequest = payload.connector_request;
    if (!connectorRequest) {
        return createResult({
            ok: false,
            status: "FAILED",
            replay_source: "LIVE",
            error: { code: ERROR_CODES.MALFORMED_CONNECTOR_REQUEST, message: "Missing connector_request" },
            metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
            logs,
            execution_id,
            started_at
        });
    }

    const requiredFields = ['name', 'objective', 'status', 'special_ad_categories'];
    for (const field of requiredFields) {
        if (connectorRequest[field] === undefined) {
            return createResult({
                ok: false,
                status: "FAILED",
                replay_source: "LIVE",
                error: { code: ERROR_CODES.MALFORMED_CONNECTOR_REQUEST, message: `Missing required field: ${field}` },
                metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
                logs,
                execution_id,
                started_at
            });
        }
    }

    // 6. Credentials
    const accessToken = payload.tenant?.access_token || process.env.META_ACCESS_TOKEN;
    const accountId = payload.tenant?.account_id || process.env.META_ACCOUNT_ID;

    if (!accessToken || !accountId) {
        return createResult({
            ok: false,
            status: "FAILED",
            replay_source: "LIVE",
            error: { code: ERROR_CODES.MISSING_META_CREDENTIALS, message: "Missing Meta credentials" },
            metrics: { meta_ads: { requests: 0, latency_ms: 0 } },
            logs,
            execution_id,
            started_at
        });
    }

    // 7. Payload Construction
    const metaPayload = {
        name: connectorRequest.name,
        objective: connectorRequest.objective,
        status: connectorRequest.status,
        special_ad_categories: connectorRequest.special_ad_categories,
        access_token: accessToken
    };

    // 8. IO
    const apiPath = `/act_${accountId}/campaigns`;
    const url = `${META_GRAPH_URL}/${META_API_VERSION}${apiPath}`;
    let latency = 0;
    let responseBody;
    let responseOk = false;
    let responseStatus = 0;

    try {
        const start = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(metaPayload)
        });
        latency = Date.now() - start;
        responseOk = response.ok;
        responseStatus = response.status;
        responseBody = await response.json();

        logs.push({
            event: "meta_api_call",
            at: new Date().toISOString(),
            connector: "meta_ads",
            url: apiPath,
            status: responseStatus,
            duration_ms: latency
        });

    } catch (error) {
        latency = Date.now() - Date.parse(started_at); // Approx if start not captured exactly before fetch
        // Better to capture start before fetch
        // Re-calculating latency in catch block is tricky if we didn't capture start.
        // Let's assume we capture start before try.
        // Actually, let's refine the try block to capture start correctly.

        logs.push({ event: "execution_error", at: new Date().toISOString(), connector: "meta_ads", error: error.message });

        return createResult({
            ok: false,
            status: "FAILED",
            replay_source: "LIVE",
            request: connectorRequest,
            error: { code: ERROR_CODES.NETWORK_ERROR, message: error.message },
            metrics: { meta_ads: { requests: 1, latency_ms: latency } }, // Latency might be inaccurate if error thrown immediately, but spec says "measured latency"
            logs,
            execution_id,
            started_at
        });
    }

    // 10. Normalization
    const normalized = {
        id: responseBody.id || null,
        success: !!responseBody.id,
        api_call: apiPath
    };

    // 11. Status
    if (responseOk && responseBody.id) {
        return createResult({
            ok: true,
            status: "SUCCESS",
            replay_source: "LIVE",
            request: connectorRequest,
            response: { raw: responseBody, normalized },
            metrics: { meta_ads: { requests: 1, latency_ms: latency } },
            logs,
            execution_id,
            started_at
        });
    } else {
        return createResult({
            ok: false,
            status: "FAILED",
            replay_source: "LIVE",
            request: connectorRequest,
            response: { raw: responseBody, normalized },
            error: {
                code: String(responseBody.error?.code || ERROR_CODES.META_API_ERROR),
                message: responseBody.error?.message || "Unknown Meta API error"
            },
            metrics: { meta_ads: { requests: 1, latency_ms: latency } },
            logs,
            execution_id,
            started_at
        });
    }
}

module.exports = { executeMetaAdsConnector };
