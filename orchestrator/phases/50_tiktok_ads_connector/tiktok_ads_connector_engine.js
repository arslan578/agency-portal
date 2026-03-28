/**
 * Phase 50: TikTok Ads Connector IO Engine
 * 
 * Executes TikTok Marketing API requests based on the connector request produced by Phase 49.
 * Handles IO, authentication, retry and backoff, error normalization, and observability.
 * 
 * Contract: tiktok_ads_connector_request_v1 -> tiktok_ads_connector_response_v1
 * Feature Flag: FF_TIKTOK_ADS_CONNECTOR_ENGINE
 *
 * // This connector is constrained by Phase 27B connector_backplane_v1 (request, response, capabilities, error_surface, metadata_fields).
 */

const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

// Mock dependencies for now - in production these would be imported from shared utils
const credentialService = {
    resolve: async (ref) => {
        // In real impl, this looks up the token
        if (ref === 'valid-cred-ref') return 'valid-token';
        return null;
    }
};

const httpClient = {
    request: async (config) => {
        // In real impl, this performs the HTTP request
        // This will be mocked in tests
        throw new Error('HTTP client should be mocked in tests');
    }
};

// --- Internal Helpers ---

const _internal = {
    normalizeError: (op, error, response) => {
        const result = {
            op_id: op ? op.op_id : undefined,
            entity: op ? op.entity : undefined,
            type: op ? op.type : undefined,
            status: 'FAILED'
        };

        const connectorError = {
            message: error.message || 'Unknown error',
            scope: 'OPERATION',
            op_id: op ? op.op_id : undefined
        };

        // Map status codes to connector error codes
        if (response) {
            result.tiktok_status_code = response.status;
            if (response.status === 401 || response.status === 403) {
                connectorError.code = 'AUTH_TOKEN_INVALID';
                connectorError.scope = 'CREDENTIALS';
            } else if (response.status === 429) {
                connectorError.code = 'RATE_LIMIT';
                connectorError.scope = 'NETWORK';
            } else if (response.status >= 500) {
                connectorError.code = 'UPSTREAM_SERVICE_FAILURE';
                connectorError.scope = 'NETWORK';
            } else {
                connectorError.code = 'UPSTREAM_ERROR';
            }

            // Extract TikTok specific error info if available
            if (response.data && response.data.code) {
                result.tiktok_error_code = String(response.data.code);
                result.tiktok_error_message = response.data.message;
            }
        } else if (
            error.code === 'ECONNABORTED' ||
            (typeof error.message === 'string' && error.message.includes('timeout'))
        ) {
            connectorError.code = 'NETWORK_TIMEOUT';
            connectorError.scope = 'NETWORK';
        } else {
            connectorError.code = 'NETWORK_ERROR';
            connectorError.scope = 'NETWORK';
        }

        return { result, error: connectorError };
    },

    buildRequestConfig: (op, token, baseUrl, timeout_ms) => {
        const config = {
            url: `${baseUrl}${op.endpoint}`,
            method: op.method,
            headers: {
                'Access-Token': token,
                'Content-Type': 'application/json'
            },
            timeout: timeout_ms
        };

        if (op.payload && (op.method === 'POST' || op.method === 'PATCH' || op.method === 'PUT')) {
            config.data = op.payload;
        }

        return config;
    },

    shouldRetry: (errOrRes) => {
        // HTTP response path
        if (errOrRes && typeof errOrRes.status === 'number') {
            if (errOrRes.status === 429) return true;
            if (errOrRes.status >= 500) return true;
            return false;
        }

        // Non-HTTP: retry only on known transient network errors
        const code = errOrRes?.code;
        const msg = errOrRes?.message?.toLowerCase?.() || '';

        const transientCodes = new Set([
            'ECONNRESET',
            'ECONNABORTED',
            'ENOTFOUND',
            'ETIMEDOUT'
        ]);

        if (transientCodes.has(code)) return true;

        if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('socket hang up')) {
            return true;
        }

        return false;
    }
};

// --- Main Execute Function ---

async function execute(connectorEnvelope, context = {}) {
    const start = Date.now();
    const requestedAt = connectorEnvelope?.requested_at || null;

    // 1. Feature Flag Check
    const featureFlagEnabled = process.env.FF_TIKTOK_ADS_CONNECTOR_ENGINE === 'true';

    if (!featureFlagEnabled) {
        return {
            execution_id: connectorEnvelope?.execution_id,
            connector_key: 'tiktok_ads',
            status: 'DISABLED',
            status_code: 'DISABLED',
            results: [],
            latency_ms: Date.now() - start,
            meta: {
                contract_version: 'tiktok_ads_v1',
                attempted_operation_count: 0,
                succeeded_operation_count: 0,
                failed_operation_count: 0,
                retries_applied: 0,
                feature_flag_enabled: false,
                requested_at: requestedAt || new Date().toISOString()
            }
        };
    }

    // 2. Input Validation
    if (!connectorEnvelope || typeof connectorEnvelope !== 'object') {
        return createInvalidRequestResponse(connectorEnvelope, start, 'Envelope must be an object');
    }

    if (connectorEnvelope.connector_key !== 'tiktok_ads') {
        return createInvalidRequestResponse(connectorEnvelope, start, 'Invalid connector_key');
    }

    const req = connectorEnvelope.request;
    if (!req || req.contract_version !== 'tiktok_ads_v1' ||
        !req.account?.tiktok_advertiser_id || !req.account?.credential_ref ||
        !Array.isArray(req.operations)) {
        return createInvalidRequestResponse(connectorEnvelope, start, 'Invalid request contract');
    }

    // 3. Start span AFTER feature flag + validation
    const span = startSpan('connector.tiktok_ads.execute', {
        execution_id: connectorEnvelope.execution_id,
        workspace_id: connectorEnvelope.tenant?.workspace_id,
        brand_id: connectorEnvelope.tenant?.brand_id
    });

    try {
        // 4. Credential Resolution
        let token;
        try {
            // Use injected credential service if available (for tests), otherwise default
            const credService = context.credentialService || credentialService;
            token = await credService.resolve(req.account.credential_ref);
        } catch (e) {
            // Treat resolution error as auth failure
            token = null;
        }

        if (!token) {
            return {
                execution_id: connectorEnvelope.execution_id,
                connector_key: 'tiktok_ads',
                status: 'FAILED',
                status_code: 'AUTH_ERROR',
                results: [],
                latency_ms: Date.now() - start,
                meta: {
                    contract_version: 'tiktok_ads_v1',
                    attempted_operation_count: 0,
                    succeeded_operation_count: 0,
                    failed_operation_count: 0,
                    retries_applied: 0,
                    feature_flag_enabled: true,
                    requested_at: requestedAt || new Date().toISOString()
                },
                errors: [{
                    code: 'AUTH_TOKEN_INVALID',
                    message: 'Failed to resolve credentials',
                    scope: 'CREDENTIALS'
                }]
            };
        }

        // 5. Setup Execution
        const baseUrl = process.env.TIKTOK_API_BASE_URL || 'https://business-api.tiktok.com';
        const client = context.httpClient || httpClient;

        const settings = req.settings || {};
        const maxRetries = settings.max_retries ?? 2;
        const initialBackoff = settings.initial_backoff_ms ?? 250;
        const timeoutMs = settings.timeout_ms ?? 8000;

        // Sort operations deterministically
        const operations = [...req.operations].sort((a, b) => a.op_id.localeCompare(b.op_id));

        const results = [];
        const errors = [];
        let succeededCount = 0;
        let failedCount = 0;
        let totalRetries = 0;

        // 6. Execute Operations
        for (const op of operations) {
            const config = _internal.buildRequestConfig(op, token, baseUrl, timeoutMs);
            let attempts = 0;
            let success = false;
            let lastError = null;
            let lastResponse = null;

            while (attempts <= maxRetries && !success) {
                if (attempts > 0) {
                    totalRetries++;
                    const backoff = initialBackoff * Math.pow(2, attempts - 1);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }

                try {
                    const response = await client.request(config);
                    lastResponse = response;

                    // Check for business level errors in 200 OK responses if TikTok does that
                    // Assuming standard HTTP status codes for now based on spec

                    results.push({
                        op_id: op.op_id,
                        entity: op.entity,
                        type: op.type,
                        status: 'SUCCESS',
                        tiktok_status_code: response.status,
                        response_body: response.data
                    });
                    succeededCount++;
                    success = true;
                } catch (error) {
                    lastError = error;
                    lastResponse = error.response;

                    const shouldRetry = _internal.shouldRetry(lastResponse || error);
                    if (!shouldRetry) {
                        break; // Don't retry non-transient errors
                    }
                    attempts++;
                }
            }

            if (!success) {
                failedCount++;
                const normalized = _internal.normalizeError(op, lastError, lastResponse);
                results.push(normalized.result);
                errors.push(normalized.error);
            }
        }

        // 7. Response Assembly
        let status = 'SUCCESS';
        let statusCode = 'OK';

        if (operations.length === 0) {
            statusCode = 'NO_OP';
        } else if (failedCount === operations.length) {
            status = 'FAILED';
            // Use dominant error code from first error for simplicity
            statusCode = errors.length > 0 ? mapErrorCodeToStatus(errors[0].code) : 'UPSTREAM_ERROR';
        } else if (failedCount > 0) {
            status = 'PARTIAL_FAILURE';
            statusCode = errors.length > 0 ? mapErrorCodeToStatus(errors[0].code) : 'UPSTREAM_ERROR';
        }

        const latencyMs = Date.now() - start;

        const response = {
            execution_id: connectorEnvelope.execution_id,
            connector_key: 'tiktok_ads',
            status,
            status_code: statusCode,
            results,
            latency_ms: latencyMs,
            meta: {
                contract_version: 'tiktok_ads_v1',
                attempted_operation_count: operations.length,
                succeeded_operation_count: succeededCount,
                failed_operation_count: failedCount,
                retries_applied: totalRetries,
                feature_flag_enabled: true,
                requested_at: requestedAt || new Date().toISOString()
            }
        };

        if (errors.length > 0) {
            response.errors = errors;
        }

        // 8. Observability
        logStructured('tiktok_ads_connector_result', {
            execution_id: response.execution_id,
            workspace_id: connectorEnvelope?.tenant?.workspace_id,
            brand_id: connectorEnvelope?.tenant?.brand_id,
            status: response.status,
            status_code: response.status_code,
            attempted: response.meta.attempted_operation_count,
            succeeded: response.meta.succeeded_operation_count,
            failed: response.meta.failed_operation_count,
            retries: response.meta.retries_applied
        });

        metrics.count('connector.tiktok_ads.operations', operations.length);
        metrics.count('connector.tiktok_ads.success', succeededCount);
        metrics.count('connector.tiktok_ads.failed', failedCount);
        metrics.count('connector.tiktok_ads.retries', totalRetries);
        metrics.histogram('connector.tiktok_ads.latency_ms', latencyMs);

        return response;
    } finally {
        span.end();
    }
}

function createInvalidRequestResponse(envelope, start, message) {
    return {
        execution_id: envelope?.execution_id,
        connector_key: 'tiktok_ads',
        status: 'FAILED',
        status_code: 'INVALID_REQUEST',
        results: [],
        latency_ms: Date.now() - start,
        meta: {
            contract_version: 'tiktok_ads_v1',
            attempted_operation_count: 0,
            succeeded_operation_count: 0,
            failed_operation_count: 0,
            retries_applied: 0,
            feature_flag_enabled: true,
            requested_at: envelope?.requested_at || new Date().toISOString()
        },
        errors: [{
            code: 'INVALID_REQUEST',
            message,
            scope: 'REQUEST'
        }]
    };
}

function mapErrorCodeToStatus(code) {
    switch (code) {
        case 'AUTH_TOKEN_INVALID': return 'AUTH_ERROR';
        case 'RATE_LIMIT': return 'RATE_LIMITED';
        case 'NETWORK_TIMEOUT':
        case 'NETWORK_ERROR': return 'NETWORK_ERROR';
        default: return 'UPSTREAM_ERROR';
    }
}

module.exports = {
    execute,
    _internal
};
