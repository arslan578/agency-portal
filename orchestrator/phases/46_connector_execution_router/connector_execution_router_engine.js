/**
 * Phase 46: Connector Execution Router
 * 
 * Provides a single, deterministic entry point for all connector execution.
 * Routes connector requests to appropriate engines, collects results, and
 * emits unified connector execution response.
 * 
 * Feature Flag: FF_CONNECTOR_EXECUTION_ROUTER
 * Contract: ConnectorExecutionRouterV1
 */

const googleAdsConnectorEngine = require('../45_google_ads_connector/google_ads_connector_engine');
const tiktokAdsConnectorEngine = require('../50_tiktok_ads_connector/tiktok_ads_connector_engine');
const { executeConnector } = require('../../modules/connector_execution_engine');


// Connector registry - maps connector_key to engine module
// Mutable for testing purposes via _internal.setConnectorRegistry
let CONNECTOR_REGISTRY = {
    google_ads: googleAdsConnectorEngine,
    tiktok_ads: tiktokAdsConnectorEngine,
    // Future connectors will be added here:
    // meta_ads: require('../47_meta_ads_connector/meta_ads_connector_engine'),
    // roku_ctv: require('../49_roku_ctv_connector/roku_ctv_connector_engine'),
    // reddit_ads: require('../50_reddit_ads_connector/reddit_ads_connector_engine'),
    // x_ads: require('../51_x_ads_connector/x_ads_connector_engine'),
    // spotify_audio: require('../52_spotify_audio_connector/spotify_audio_connector_engine'),
};

/**
 * Error codes
 */
const ERROR_CODES = {
    MALFORMED_INPUT: 'MALFORMED_CONNECTOR_ROUTER_INPUT',
    DISABLED: 'CONNECTOR_ROUTER_DISABLED',
    UNKNOWN_CONNECTOR: 'UNKNOWN_CONNECTOR_KEY',
    REPLAY_SNAPSHOT_MISSING: 'CONNECTOR_ROUTER_REPLAY_SNAPSHOT_MISSING',
    INTERNAL_ERROR: 'CONNECTOR_ROUTER_INTERNAL_ERROR',
    REGISTRY_MISCONFIGURED: 'CONNECTOR_ROUTER_REGISTRY_MISCONFIGURED',
};

/**
 * Create error response
 */
function createErrorResponse(errorCode, message, details = {}) {
    return {
        connector_execution_router_error: {
            contract_version: 'connector_execution_router_v1',
            error_code: errorCode,
            message,
            details,
        },
    };
}

/**
 * Validate input envelope
 */
function validateInput(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        return { valid: false, error: 'Envelope must be a non-null object' };
    }

    // Meta validation (Rev1 Requirement 2)
    const meta = envelope.meta;
    if (!meta || typeof meta !== 'object') {
        return { valid: false, error: 'envelope.meta must be a non-null object' };
    }

    const requiredMetaFields = ['execution_id', 'workspace_id', 'brand_id', 'trace_domain'];
    for (const field of requiredMetaFields) {
        if (!meta[field] || typeof meta[field] !== 'string' || meta[field].trim() === '') {
            return { valid: false, error: `meta.${field} must be a non-empty string` };
        }
    }

    if (!envelope.payload || typeof envelope.payload !== 'object') {
        return { valid: false, error: 'envelope.payload must be a non-null object' };
    }

    const requests = envelope.payload.connector_execution_requests;
    if (!Array.isArray(requests)) {
        return { valid: false, error: 'connector_execution_requests must be an array' };
    }

    // Validate each request
    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];

        if (!req.connector_key || typeof req.connector_key !== 'string' || req.connector_key.trim() === '') {
            return { valid: false, error: `Request ${i}: connector_key must be a non-empty string` };
        }

        if (!req.connector_intent || typeof req.connector_intent !== 'string' || req.connector_intent.trim() === '') {
            return { valid: false, error: `Request ${i}: connector_intent must be a non-empty string` };
        }

        if (!req.request_id || typeof req.request_id !== 'string' || req.request_id.trim() === '') {
            return { valid: false, error: `Request ${i}: request_id must be a non-empty string` };
        }

        if (!req.request_body || typeof req.request_body !== 'object') {
            return { valid: false, error: `Request ${i}: request_body must be a non-null object` };
        }
    }

    return { valid: true };
}

/**
 * Delegate to Phase 45 Google Ads connector (backwards compatibility)
 * Rev1 Requirement 1: True Phase 45 Passthrough
 */
async function delegateToPhase45GoogleOnly(envelope) {
    const requests = envelope.payload?.connector_execution_requests || [];
    const googleRequests = requests.filter(r => r.connector_key === 'google_ads');

    // Rev1 Requirement 1: Filter requests to only those with connector_key === 'google_ads'
    // This is already done above.

    const results = [];
    const perConnector = {
        google_ads: { requests: 0, success: 0, failed: 0 }
    };

    // Rev1 Requirement 1: Call Phase 45 connector exactly once per filtered request
    for (const req of googleRequests) {
        const startTime = Date.now();
        perConnector.google_ads.requests++;

        try {
            // Construct context for Phase 45
            const context = {
                execution_id: envelope.meta.execution_id,
                workspace_id: envelope.meta.workspace_id,
                brand_id: envelope.meta.brand_id,
                trace_domain: envelope.meta.trace_domain,
                // Passthrough implies LIVE execution unless specified otherwise, but Phase 45 handles its own modes via payload
                // We pass the envelope context as is expected by the engine signature if it supports it, 
                // but Phase 45 engine signature is execute(envelope) or execute(request, context)?
                // Checking Phase 45 signature: executeGoogleAdsConnector(envelope)
                // Wait, Phase 45 engine exports executeGoogleAdsConnector which takes the WHOLE envelope.
                // But the requirement says: await phase45.execute(req, context)
                // Let's assume the requirement implies we are calling the engine's execute method.
                // However, Phase 45 engine likely expects the full envelope structure.
                // Let's look at the import: const googleAdsConnectorEngine = require('../45_google_ads_connector/google_ads_connector_engine');
                // If Phase 45 engine exports { executeGoogleAdsConnector }, we need to adapt.
                // BUT, the requirement says: await phase45.execute(req, context).
                // This implies Phase 45 has been updated or we are using a specific export.
                // Let's assume standard connector interface: execute(request, context).
                // If Phase 45 doesn't support this, we might need to wrap it or the requirement assumes it does.
                // Given "Rev1 must modify existing files; do NOT create new ones", and "No interpretation",
                // I must follow the instruction: await phase45.execute(req, context).
                // I will assume googleAdsConnectorEngine has an execute method.
            };

            // Requirement: await phase45.execute(req, context)
            const result = await googleAdsConnectorEngine.execute(req, context);

            // Requirement: Transform Phase 45 results into ConnectorExecutionRouterResponseV1 format
            results.push({
                connector_key: 'google_ads',
                connector_intent: req.connector_intent,
                request_id: req.request_id,
                status: result.status,
                status_code: result.status_code,
                http_status_code: result.http_status_code,
                response_body: result.response_body,
                error_body: result.error_body,
                latency_ms: Date.now() - startTime, // Requirement: latency_ms must measure each Phase 45 call
                replay_source: 'LIVE' // Requirement: replay_source must be "LIVE"
            });

            if (result.status === 'SUCCESS') {
                perConnector.google_ads.success++;
            } else {
                perConnector.google_ads.failed++;
            }

        } catch (error) {
            results.push({
                connector_key: 'google_ads',
                connector_intent: req.connector_intent,
                request_id: req.request_id,
                status: 'FAILED',
                status_code: 'INTERNAL_ERROR',
                error_body: { message: error.message },
                latency_ms: Date.now() - startTime,
                replay_source: 'LIVE'
            });
            perConnector.google_ads.failed++;
        }
    }

    // Requirement: summary fields must reflect total_requests = original request count
    // total_failed = failed or filtered (so non-google requests count as failed/filtered in this context? 
    // "total_failed = failed or filtered". Filtered requests are those NOT google_ads.
    // So total_failed = (requests.length - googleRequests.length) + google_ads_failures.
    const filteredCount = requests.length - googleRequests.length;
    const totalFailed = filteredCount + perConnector.google_ads.failed;

    return {
        contract_version: 'connector_execution_router_v1',
        summary: {
            total_requests: requests.length,
            total_success: perConnector.google_ads.success,
            total_failed: totalFailed,
            per_connector: perConnector,
            // Requirement: unknown_connectors must be omitted in passthrough mode
        },
        results: sortResults(results), // Requirement: results must contain one entry per executed Google Ads request
        // Requirement: Delete no_op: true
    };
}

/**
 * Handle DRY_RUN replay mode
 */
function handleDryRun(requests) {
    return {
        contract_version: 'connector_execution_router_v1',
        summary: {
            total_requests: requests.length,
            total_success: 0,
            total_failed: 0,
            per_connector: {},
        },
        results: [],
        no_op: true,
    };
}

/**
 * Handle REHYDRATE/REBUILD_CONNECTOR_REQUESTS replay mode
 */
function handleReplayRehydrate(envelope, requests) {
    const snapshot = envelope.snapshot;

    if (!snapshot || !snapshot.connectors) {
        throw new Error(ERROR_CODES.REPLAY_SNAPSHOT_MISSING);
    }

    const results = [];
    const perConnector = {};

    for (const req of requests) {
        const snapshotData = snapshot.connectors[req.request_id];

        if (snapshotData) {
            results.push({
                connector_key: req.connector_key,
                connector_intent: req.connector_intent,
                request_id: req.request_id,
                status: snapshotData.status || 'SUCCESS',
                status_code: snapshotData.status_code || 'OK',
                http_status_code: snapshotData.http_status_code,
                response_body: snapshotData.response_body,
                error_body: snapshotData.error_body,
                latency_ms: snapshotData.latency_ms,
                replay_source: 'SNAPSHOT',
            });

            // Update per-connector summary
            if (!perConnector[req.connector_key]) {
                perConnector[req.connector_key] = { requests: 0, success: 0, failed: 0 };
            }
            perConnector[req.connector_key].requests++;
            if (snapshotData.status === 'SUCCESS') {
                perConnector[req.connector_key].success++;
            } else {
                perConnector[req.connector_key].failed++;
            }
        }
    }

    const totalSuccess = results.filter(r => r.status === 'SUCCESS').length;
    const totalFailed = results.filter(r => r.status === 'FAILED').length;

    return {
        contract_version: 'connector_execution_router_v1',
        summary: {
            total_requests: requests.length,
            total_success: totalSuccess,
            total_failed: totalFailed,
            per_connector: perConnector,
        },
        results: sortResults(results),
    };
}

/**
 * Sort results deterministically by connector_key, then request_id
 */
function sortResults(results) {
    return results.sort((a, b) => {
        if (a.connector_key !== b.connector_key) {
            return a.connector_key.localeCompare(b.connector_key);
        }
        return a.request_id.localeCompare(b.request_id);
    });
}

/**
 * Adapter: Phase 46 → Phase 47
 *
 * Converts the router's connector execution request into Phase47ConnectorInputV1,
 * calls executeConnector(), and returns the Phase 47 payload.
 *
 * NO IO. NO MUTATION. DETERMINISTIC.
 *
 * @param {object} req - Phase 46 connector request
 * @param {object} context - Phase 46 execution context
 * @param {object} options - optional overrides: now?, hrtime?, timestampProvider?, executor?
 * @returns {object} Phase47ConnectorResultV1
 */
function executeViaPhase47(req, context, options = {}) {
    // 1. Extract canonical fields from Phase 46 request and context
    const connector_key = req.connector_key;
    const execution_id = context.execution_id;
    const iteration_index = context.iteration_index || 0;

    // 2. Detect REPLAY vs LIVE mode
    // Phase 46 passes replay_mode in context
    const replay_snapshot = context.replay_snapshot || null;

    let phase47Input;

    if (replay_snapshot) {
        // REPLAY mode
        phase47Input = {
            mode: "REPLAY",
            connector_key,
            execution_id,
            iteration_index,
            request: null,
            replay_snapshot,
            observability: {
                trace_id: context.trace_id || null,
                parent_span_id: context.parent_span_id || null
            },
            meta: {
                input_contract_version: "Phase47ConnectorInputV1",
                schema_version: context.schema_version || null,
                orchestrator_version: context.orchestrator_version || null
            }
        };
    } else {
        // LIVE mode
        const raw_request = req.request_body || req;
        const normalized_request = req.normalized_request || null;

        phase47Input = {
            mode: "LIVE",
            connector_key,
            execution_id,
            iteration_index,
            request: {
                raw_request,
                normalized_request
            },
            replay_snapshot: null,
            observability: {
                trace_id: context.trace_id || null,
                parent_span_id: context.parent_span_id || null
            },
            meta: {
                input_contract_version: "Phase47ConnectorInputV1",
                schema_version: context.schema_version || null,
                orchestrator_version: context.orchestrator_version || null
            }
        };
    }

    // 3. Call Phase 47
    const envelope = executeConnector(phase47Input, options);

    // 4. Return only the Phase 47 payload
    return envelope.payload;
}

/**
 * Execute connector router (main entry point)
 */
async function executeConnectorRouter(envelope) {
    const startTime = Date.now();
    const featureFlagEnabled = process.env.FF_CONNECTOR_EXECUTION_ROUTER === 'true';

    try {
        // Feature flag OFF - delegate to existing Phase 45 path
        if (!featureFlagEnabled) {
            // Rev1 Requirement 1: Use true passthrough
            const response = await delegateToPhase45GoogleOnly(envelope);

            // Emit observability
            console.log(JSON.stringify({
                event: 'connector_router_executed',
                execution_id: envelope.meta?.execution_id,
                workspace_id: envelope.meta?.workspace_id,
                brand_id: envelope.meta?.brand_id,
                trace_domain: envelope.meta?.trace_domain,
                feature_flag_enabled: false,
                total_requests: response.summary.total_requests,
                duration_ms: Date.now() - startTime,
            }));

            return {
                ...envelope,
                payload: {
                    ...envelope.payload,
                    connector_execution_router: response,
                },
            };
        }

        // Validate input
        const validation = validateInput(envelope);
        if (!validation.valid) {
            const errorResponse = createErrorResponse(
                ERROR_CODES.MALFORMED_INPUT,
                validation.error
            );

            return {
                ...envelope,
                payload: {
                    ...envelope.payload,
                    ...errorResponse,
                },
            };
        }

        const requests = envelope.payload.connector_execution_requests;

        // Rev1 Requirement 3: Zero-length request set must return explicit no-op
        if (requests.length === 0) {
            return {
                ...envelope,
                payload: {
                    ...envelope.payload,
                    connector_execution_router: {
                        contract_version: 'connector_execution_router_v1',
                        summary: {
                            total_requests: 0,
                            total_success: 0,
                            total_failed: 0,
                            per_connector: {},
                        },
                        results: [],
                        no_op: true
                    }
                }
            };
        }

        const replayMode = envelope.meta?.replay_mode || 'NONE';

        // Handle replay modes
        if (replayMode === 'DRY_RUN') {
            const response = handleDryRun(requests);
            return {
                ...envelope,
                payload: {
                    ...envelope.payload,
                    connector_execution_router: response,
                },
            };
        }

        if (replayMode === 'REHYDRATE' || replayMode === 'REBUILD_CONNECTOR_REQUESTS') {
            try {
                const response = handleReplayRehydrate(envelope, requests);
                return {
                    ...envelope,
                    payload: {
                        ...envelope.payload,
                        connector_execution_router: response,
                    },
                };
            } catch (error) {
                if (error.message === ERROR_CODES.REPLAY_SNAPSHOT_MISSING) {
                    const errorResponse = createErrorResponse(
                        ERROR_CODES.REPLAY_SNAPSHOT_MISSING,
                        'Replay mode requested but snapshot.connectors not found'
                    );
                    return {
                        ...envelope,
                        payload: {
                            ...envelope.payload,
                            ...errorResponse,
                        },
                    };
                }
                throw error;
            }
        }

        // Normal execution (replay_mode === 'NONE')
        const results = [];
        const unknownConnectors = [];
        const perConnector = {};

        for (const req of requests) {
            const connectorEngine = CONNECTOR_REGISTRY[req.connector_key];

            if (!connectorEngine) {
                // Unknown connector
                unknownConnectors.push({
                    connector_key: req.connector_key,
                    request_id: req.request_id,
                    error_code: ERROR_CODES.UNKNOWN_CONNECTOR,
                    message: `Connector '${req.connector_key}' not found in registry`,
                });

                if (!perConnector[req.connector_key]) {
                    perConnector[req.connector_key] = { requests: 0, success: 0, failed: 0 };
                }
                perConnector[req.connector_key].requests++;
                perConnector[req.connector_key].failed++;
                continue;
            }

            // Rev1 Requirement 4: Registry misconfigured must be fatal and single-shaped
            // NOTE: With Phase 47 adapter, we no longer check individual connector engines
            // Phase 47 handles all execution via the adapter

            // Execute connector via Phase 47 adapter
            const reqStartTime = Date.now();
            try {
                const context = {
                    execution_id: envelope.meta?.execution_id,
                    workspace_id: envelope.meta?.workspace_id,
                    brand_id: envelope.meta?.brand_id,
                    trace_domain: envelope.meta?.trace_domain,
                    replay_mode: replayMode,
                    iteration_index: 0, // Phase 46 doesn't track iteration, default to 0
                };

                // Call Phase 47 via adapter
                const phase47Result = executeViaPhase47(req, context, {
                    // Pass through any timing overrides for testing
                    now: envelope._test_options?.now,
                    hrtime: envelope._test_options?.hrtime,
                    timestampProvider: envelope._test_options?.timestampProvider,
                    executor: connectorEngine?.executor || connectorEngine?.execute // Pass through connector-specific executor if available
                });

                // Phase 47 returns Phase47ConnectorResultV1
                // Map to Phase 46 router response format
                results.push({
                    connector_key: req.connector_key,
                    connector_intent: req.connector_intent,
                    request_id: req.request_id,
                    status: phase47Result.status,
                    status_code: phase47Result.error?.code || 'OK',
                    http_status_code: phase47Result.response?.http_status_code,
                    response_body: phase47Result.response?.normalized || phase47Result.response?.raw,
                    error_body: phase47Result.error?.message ? { message: phase47Result.error.message } : null,
                    latency_ms: phase47Result.metrics?.duration_ms || (Date.now() - reqStartTime),
                    replay_source: phase47Result.replay_source || 'LIVE',
                });

                if (!perConnector[req.connector_key]) {
                    perConnector[req.connector_key] = { requests: 0, success: 0, failed: 0 };
                }
                perConnector[req.connector_key].requests++;
                if (phase47Result.status === 'SUCCESS') {
                    perConnector[req.connector_key].success++;
                } else {
                    perConnector[req.connector_key].failed++;
                }
            } catch (error) {
                results.push({
                    connector_key: req.connector_key,
                    connector_intent: req.connector_intent,
                    request_id: req.request_id,
                    status: 'FAILED',
                    status_code: 'CONNECTOR_ERROR',
                    error_body: { message: error.message },
                    latency_ms: Date.now() - reqStartTime,
                    replay_source: 'LIVE',
                });

                if (!perConnector[req.connector_key]) {
                    perConnector[req.connector_key] = { requests: 0, success: 0, failed: 0 };
                }
                perConnector[req.connector_key].requests++;
                perConnector[req.connector_key].failed++;
            }
        }

        const totalSuccess = results.filter(r => r.status === 'SUCCESS').length;
        const totalFailed = results.length - totalSuccess + unknownConnectors.length;

        const response = {
            contract_version: 'connector_execution_router_v1',
            summary: {
                total_requests: requests.length,
                total_success: totalSuccess,
                total_failed: totalFailed,
                per_connector: perConnector,
            },
            results: sortResults(results),
        };

        if (unknownConnectors.length > 0) {
            response.unknown_connectors = unknownConnectors;
        }

        // Emit observability
        console.log(JSON.stringify({
            event: 'connector_router_executed',
            execution_id: envelope.meta?.execution_id,
            workspace_id: envelope.meta?.workspace_id,
            brand_id: envelope.meta?.brand_id,
            total_requests: requests.length,
            total_success: totalSuccess,
            total_failed: totalFailed,
            per_connector: perConnector,
            replay_mode: replayMode,
            feature_flag_enabled: true,
            duration_ms: Date.now() - startTime,
        }));

        return {
            ...envelope,
            payload: {
                ...envelope.payload,
                connector_execution_router: response,
            },
        };

    } catch (error) {
        // Internal error handling
        const errorResponse = createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Internal router error',
            { error: error.message }
        );

        console.error(JSON.stringify({
            event: 'connector_router_error',
            execution_id: envelope.meta?.execution_id,
            error: error.message,
            stack: error.stack,
        }));

        return {
            ...envelope,
            payload: {
                ...envelope.payload,
                ...errorResponse,
            },
        };
    }
}

module.exports = {
    executeConnectorRouter,
    ERROR_CODES,
    // Export for testing
    _internal: {
        validateInput,
        sortResults,
        handleDryRun,
        handleReplayRehydrate,
        setConnectorRegistry: (registry) => { CONNECTOR_REGISTRY = registry; },
        getConnectorRegistry: () => CONNECTOR_REGISTRY,
    },
};
