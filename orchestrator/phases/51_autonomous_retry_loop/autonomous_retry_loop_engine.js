/**
 * Phase 51: Autonomous Retry Loop Engine
 * 
 * Wraps connector execution in a policy-aware retry loop.
 * Currently supports: tiktok_ads (Phase 50)
 * 
 * Contract: autonomous_retry_loop_v1
 * Feature Flag: FF_AUTONOMOUS_RETRY_LOOP
 */

const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

// Import Phase 50 engine and helpers
const tiktokAdsConnectorEngine = require('../50_tiktok_ads_connector/tiktok_ads_connector_engine');

// Registry of supported connectors
const CONNECTOR_REGISTRY = {
    tiktok_ads: tiktokAdsConnectorEngine
};

/**
 * Execute the autonomous retry loop
 */
async function execute(envelope) {
    const start = Date.now();
    const requestedAt = envelope?.requested_at || new Date().toISOString();

    // 1. Feature Flag Check
    const featureFlagEnabled = process.env.FF_AUTONOMOUS_RETRY_LOOP === 'true';

    if (!featureFlagEnabled) {
        // Pass-through mode: Execute once, no retry loop logic wrapping (other than contract mapping)
        // But we still need to return the AutonomousRetryLoopResponse shape
        return executePassThrough(envelope, requestedAt, start);
    }

    // 2. Input Validation
    if (!envelope || typeof envelope !== 'object') {
        return createErrorResponse(envelope, start, requestedAt, 'INVALID_REQUEST', 'Envelope must be an object');
    }

    if (!envelope.connector_key || !CONNECTOR_REGISTRY[envelope.connector_key]) {
        return createErrorResponse(envelope, start, requestedAt, 'HARD_FAIL', `Unsupported or missing connector_key: ${envelope.connector_key}`);
    }

    if (!envelope.connector_request) {
        return createErrorResponse(envelope, start, requestedAt, 'INVALID_REQUEST', 'Missing connector_request');
    }

    // 3. Start Span
    const span = startSpan('autonomous_retry_loop', {
        execution_id: envelope.execution_id,
        connector_key: envelope.connector_key,
        workspace_id: envelope.tenant?.workspace_id,
        brand_id: envelope.tenant?.brand_id
    });

    try {
        const connectorEngine = CONNECTOR_REGISTRY[envelope.connector_key];
        const attemptLimit = envelope.attempt_limit || 3;
        const attempts = [];
        let finalResponse = null;
        let status = 'SUCCESS';
        let stopReason = 'SUCCESS';

        // 4. Retry Loop
        for (let i = 1; i <= attemptLimit; i++) {
            const attemptStart = Date.now();
            let attemptStatus = 'SUCCESS';
            let attemptError = null;
            let retryable = false;

            try {
                // Execute Connector
                // We need to construct the envelope expected by the connector engine
                // Phase 50 expects: { execution_id, connector_key, tenant, request, requested_at, ... }
                // We map from AutonomousRetryLoopEnvelope to ConnectorEnvelope
                const connectorEnvelope = {
                    execution_id: envelope.execution_id,
                    connector_key: envelope.connector_key,
                    tenant: envelope.tenant,
                    request: envelope.connector_request,
                    requested_at: requestedAt,
                    // Pass through context if needed
                    context: envelope.context
                };

                // Call Phase 50 execute
                finalResponse = await connectorEngine.execute(connectorEnvelope, {
                    // Pass through dependencies if injected in envelope.context (for testing)
                    credentialService: envelope.context?.credentialService,
                    httpClient: envelope.context?.httpClient
                });

                // Analyze Result
                if (finalResponse.status === 'FAILED' || finalResponse.status === 'PARTIAL_FAILURE') {
                    // Phase 50 returns FAILED for auth/network/upstream issues
                    // and PARTIAL_FAILURE when some ops succeeded and some failed.
                    // We never blindly retry PARTIAL_FAILURE to avoid duplicates.

                    const statusCode = finalResponse.status_code;
                    const isRetryableStatus =
                        statusCode === 'RATE_LIMITED' ||
                        statusCode === 'UPSTREAM_SERVICE_FAILURE' ||
                        statusCode === 'NETWORK_ERROR' ||
                        statusCode === 'NETWORK_TIMEOUT';

                    if (finalResponse.status === 'FAILED' && isRetryableStatus) {
                        // Retryable transient failure
                        attemptStatus = 'FAILED';
                        retryable = true;
                        attemptError = finalResponse.errors?.[0]?.code || statusCode;
                    } else if (finalResponse.status === 'FAILED') {
                        // Hard failure (AUTH_ERROR, INVALID_REQUEST, etc)
                        attemptStatus = 'FAILED';
                        retryable = false;
                        attemptError = finalResponse.errors?.[0]?.code || statusCode;
                        status = 'HARD_FAIL';
                        stopReason = 'HARD_ERROR';
                    } else {
                        // PARTIAL_FAILURE: terminal, non-retryable, but not a hard failure.
                        // We surface it as a successful run with partial outcome.
                        attemptStatus = 'FAILED';
                        retryable = false;
                        attemptError = finalResponse.errors?.[0]?.code || statusCode;
                        status = 'SUCCESS';
                        stopReason = 'PARTIAL_SUCCESS';
                    }
                } else {
                    // SUCCESS (or other non-failing terminal statuses)
                    attemptStatus = 'SUCCESS';
                    retryable = false;
                }

            } catch (e) {
                // Unexpected crash in connector engine
                attemptStatus = 'FAILED';
                attemptError = e.message;
                retryable = false; // Crash is usually hard error unless we identify it as transient
                status = 'HARD_FAIL';
                stopReason = 'ENGINE_CRASH';
            }

            // Record Attempt
            attempts.push({
                attempt_number: i,
                timestamp: new Date().toISOString(),
                status: attemptStatus,
                error_code: attemptError,
                retryable: retryable,
                latency_ms: Date.now() - attemptStart
            });

            // Log Attempt
            logStructured('autonomous_retry_attempt', {
                execution_id: envelope.execution_id,
                attempt: i,
                status: attemptStatus,
                retryable
            });

            // Decision
            if (attemptStatus === 'SUCCESS') {
                status = 'SUCCESS';
                stopReason = 'SUCCESS';
                break;
            }

            if (!retryable) {
                // status and stopReason already set above
                break;
            }

            if (i === attemptLimit) {
                status = 'RETRY_EXHAUSTED';
                stopReason = 'LIMIT_REACHED';
                break;
            }

            // Backoff before next attempt (if not last)
            // Phase 50 has internal backoff. This loop might want a larger backoff?
            // Prompt doesn't specify backoff strategy for Phase 51, just "Applies backoff".
            // I'll use a simple exponential backoff starting at 500ms.
            const backoff = 500 * Math.pow(2, i - 1);
            await new Promise(resolve => setTimeout(resolve, backoff));
        }

        // 5. Response Assembly
        const response = {
            execution_id: envelope.execution_id,
            connector_key: envelope.connector_key,
            status,
            attempts,
            final_response: finalResponse,
            meta: {
                contract_version: 'autonomous_retry_loop_v1',
                total_attempts: attempts.length,
                stop_reason: stopReason,
                feature_flag_enabled: true,
                requested_at: requestedAt
            }
        };

        // 6. Observability
        logStructured('autonomous_retry_loop_result', {
            execution_id: response.execution_id,
            status: response.status,
            attempts: response.meta.total_attempts,
            stop_reason: response.meta.stop_reason
        });

        metrics.count('autonomous_retry_loop.count', 1);
        metrics.count(`autonomous_retry_loop.status.${status}`, 1);
        metrics.histogram('autonomous_retry_loop.latency_ms', Date.now() - start);

        return response;

    } finally {
        span.end();
    }
}

/**
 * Execute in pass-through mode (Feature Flag Disabled)
 */
async function executePassThrough(envelope, requestedAt, start) {
    // Validate enough to run a single connector execution
    if (
        !envelope ||
        !envelope.connector_key ||
        !CONNECTOR_REGISTRY[envelope.connector_key] ||
        !envelope.connector_request
    ) {
        return createErrorResponse(
            envelope,
            start,
            requestedAt,
            'INVALID_REQUEST',
            'Invalid input for pass-through'
        );
    }

    const connectorEngine = CONNECTOR_REGISTRY[envelope.connector_key];
    const connectorEnvelope = {
        execution_id: envelope.execution_id,
        connector_key: envelope.connector_key,
        tenant: envelope.tenant,
        request: envelope.connector_request,
        requested_at: requestedAt,
        context: envelope.context
    };

    const attemptStart = Date.now();
    let finalResponse = null;
    let loopStatus = 'SUCCESS';
    let attemptStatus = 'SUCCESS';
    let attemptError = null;

    try {
        finalResponse = await connectorEngine.execute(connectorEnvelope, {
            credentialService: envelope.context?.credentialService,
            httpClient: envelope.context?.httpClient
        });

        if (finalResponse?.status === 'FAILED') {
            loopStatus = 'HARD_FAIL';
            attemptStatus = 'FAILED';
            attemptError = finalResponse.errors?.[0]?.code || finalResponse.status_code;
        } else if (finalResponse?.status === 'PARTIAL_FAILURE') {
            // Partial success: connector ran, some ops failed.
            // Loop is considered successful but with partial outcome.
            loopStatus = 'SUCCESS';
            attemptStatus = 'FAILED';
            attemptError = finalResponse.errors?.[0]?.code || finalResponse.status_code;
        } else if (finalResponse?.status === 'DISABLED') {
            loopStatus = 'DISABLED';
            attemptStatus = 'FAILED';
        }
    } catch (e) {
        loopStatus = 'HARD_FAIL';
        attemptStatus = 'FAILED';
        attemptError = e?.message;
    }

    const attemptLatency = Date.now() - attemptStart;

    return {
        execution_id: envelope.execution_id,
        connector_key: envelope.connector_key,
        status: loopStatus,
        attempts: [
            {
                attempt_number: 1,
                timestamp: new Date().toISOString(),
                status: attemptStatus,
                error_code: attemptError,
                retryable: false,
                latency_ms: attemptLatency
            }
        ],
        final_response: finalResponse,
        meta: {
            contract_version: 'autonomous_retry_loop_v1',
            total_attempts: 1,
            stop_reason: 'FEATURE_DISABLED',
            feature_flag_enabled: false,
            requested_at: requestedAt
        }
    };
}

function createErrorResponse(envelope, start, requestedAt, status, message) {
    return {
        execution_id: envelope?.execution_id,
        connector_key: envelope?.connector_key,
        status,
        attempts: [],
        final_response: null,
        meta: {
            contract_version: 'autonomous_retry_loop_v1',
            total_attempts: 0,
            stop_reason: 'VALIDATION_ERROR',
            feature_flag_enabled: process.env.FF_AUTONOMOUS_RETRY_LOOP === 'true',
            requested_at: requestedAt
        },
        error: message // Optional top level error for validation failures
    };
}

module.exports = { execute };
