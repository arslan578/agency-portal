/**
 * Phase 45: Google Ads and YouTube Connector IO Engine
 *
 * Contract: google_ads_connector_v1
 * Feature Flag: FF_GOOGLE_ADS_CONNECTOR_IO
 *
 * // This connector is constrained by Phase 27B connector_backplane_v1 (request, response, capabilities, error_surface, metadata_fields).
 */

const GoogleAdsClient = require('../../connectors/google_ads/client/google_ads_client');
const fieldMappings = require('../../connectors/google_ads/mappings/google_ads_field_mappings.json');
const errorMappings = require('../../connectors/google_ads/mappings/google_ads_error_mappings.json');

// --- Helpers ---

function createErrorEnvelope(code, message, executionId) {
    return {
        ok: false,
        code,
        message,
        envelope: executionId ? { execution_id: executionId } : {}
    };
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function mapFields(entityType, data) {
    const mapping = fieldMappings.mappings[entityType];
    if (!mapping) {
        // Unknown entity type, pass through original data
        return data || {};
    }

    const result = {};
    const safeData = data || {};

    for (const [kaivoField, googleField] of Object.entries(mapping)) {
        if (safeData[kaivoField] !== undefined) {
            const parts = googleField.split('.');
            let current = result;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) current[parts[i]] = {};
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = safeData[kaivoField];
        }
    }

    // Optional debug logging for unmapped fields
    if (process.env.DEBUG_CONNECTOR_MAPPING === 'true') {
        const unmapped = Object.keys(safeData).filter(
            key => !mapping[key]
        );

        if (unmapped.length > 0) {
            console.log(JSON.stringify({
                event_type: 'GOOGLE_ADS_UNMAPPED_FIELDS',
                entity_type,
                unmapped_fields: unmapped
            }));
        }
    }

    return result;
}

function mapError(error) {
    const rawCode = error && error.code ? error.code : 'INTERNAL_ERROR';
    const mappedCode = errorMappings.mappings[rawCode] || 'TRANSIENT_ERROR';
    const retryable = Array.isArray(errorMappings.retryable_codes)
        ? errorMappings.retryable_codes.includes(rawCode)
        : false;

    return {
        code: mappedCode,
        original_code: rawCode,
        message: error && error.message ? error.message : '',
        retryable
    };
}

function extractEntityId(resourceName) {
    if (!isNonEmptyString(resourceName)) return null;
    const parts = resourceName.split('/');
    return parts.length ? parts[parts.length - 1] : null;
}

function normalizeResponseFromApi(payload, apiResult) {
    const resourceName = apiResult && apiResult.resource_name ? apiResult.resource_name : null;
    const status = apiResult && apiResult.status ? apiResult.status : null;
    const metrics = apiResult && apiResult.metrics ? apiResult.metrics : undefined;

    const normalized = {
        entity_type: payload.entity_type,
        entity_id: extractEntityId(resourceName),
        resource_name: resourceName,
        status: status
    };

    if (metrics) {
        normalized.metrics = metrics;
    }

    return normalized;
}

function normalizeResponseNoIo(payload) {
    // Used for DRY_RUN and RECORD_ONLY (no IO)
    return {
        entity_type: payload.entity_type,
        entity_id: null,
        resource_name: null,
        status: 'NOT_SENT'
    };
}

/**
 * Stable stringify for deterministic replay comparison
 */
function stableStringify(obj) {
    return JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value).sort().reduce((sorted, k) => {
                sorted[k] = value[k];
                return sorted;
            }, {});
        }
        return value;
    });
}

/**
 * Optional replay alignment.
 * If envelope.replay_snapshot.raw_requests is present, it must match the
 * reconstructed rawRequests list exactly or we treat it as invalid input.
 */
function validateReplaySnapshot(envelope, rawRequests, executionId) {
    const snapshot = envelope && envelope.replay_snapshot;
    if (!snapshot || !Array.isArray(snapshot.raw_requests)) {
        return null;
    }

    const currentJson = stableStringify(rawRequests);
    const snapshotJson = stableStringify(snapshot.raw_requests);

    if (currentJson !== snapshotJson) {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            'Replay snapshot raw_requests mismatch',
            executionId
        );
    }

    return null;
}

// --- Main Engine ---

async function executeGoogleAdsConnector(envelope, clientOverride = null) {
    const FF_GOOGLE_ADS_CONNECTOR_IO = process.env.FF_GOOGLE_ADS_CONNECTOR_IO === 'true';

    // Feature flag OFF: short circuit, no validation, no IO
    if (!FF_GOOGLE_ADS_CONNECTOR_IO) {
        const safeEnvelope = envelope && typeof envelope === 'object' ? envelope : {};
        const executionId = safeEnvelope.execution_id || null;

        console.log(JSON.stringify({
            event_type: 'GOOGLE_ADS_CONNECTOR_SKIPPED',
            execution_id: executionId,
            trace_domain_key: safeEnvelope.trace_domain && safeEnvelope.trace_domain.trace_domain_key
                ? safeEnvelope.trace_domain.trace_domain_key
                : null,
            reason: 'Feature flag off'
        }));

        return {
            ...safeEnvelope,
            connector_result: {
                status: 'NOOP_FEATURE_FLAG_OFF',
                requests: [],
                summary_metrics: {
                    success_count: 0,
                    failure_count: 0
                },
                observability: {
                    log_event_id: executionId
                        ? `log-${executionId}-phase-45`
                        : 'log-unknown-phase-45',
                    trace_span_id: executionId
                        ? `span-${executionId}-phase-45`
                        : 'span-unknown-phase-45'
                }
            }
        };
    }

    // 1. Validation (flag ON)
    if (!envelope || typeof envelope !== 'object') {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            'Envelope must be a non null object',
            null
        );
    }

    const executionId = envelope.execution_id;
    if (!isNonEmptyString(executionId)) {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            'execution_id is required',
            executionId
        );
    }

    const traceDomain = envelope.trace_domain || {};
    if (!isNonEmptyString(traceDomain.trace_domain_key)) {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            'trace_domain_key is required when flag is on',
            executionId
        );
    }

    const request = envelope.connector_request;
    if (!request || request.connector_key !== 'GOOGLE_ADS') {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            'connector_request.connector_key must be GOOGLE_ADS',
            executionId
        );
    }

    const allowedModes = ['DRY_RUN', 'RECORD_ONLY', 'LIVE_SEND'];
    if (!allowedModes.includes(request.mode)) {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            `Invalid mode: ${request.mode}`,
            executionId
        );
    }

    const account = request.account || {};
    if (!isNonEmptyString(account.customer_id)) {
        return createErrorEnvelope(
            'INVALID_CONNECTOR_INPUT',
            'account.customer_id is required',
            executionId
        );
    }

    const payloads = Array.isArray(request.payloads) ? request.payloads : [];

    // DELETE → REMOVE aliasing (normalize without mutating original)
    const normalizedPayloads = payloads.map(p => {
        if (p.operation === 'DELETE') {
            return { ...p, operation: 'REMOVE' };
        }
        return p;
    });

    // Strict entity_type and operation validation
    const allowedEntityTypes = ['CAMPAIGN', 'AD_GROUP', 'AD'];
    const allowedOperations = ['CREATE', 'UPDATE', 'REMOVE'];

    for (const payload of normalizedPayloads) {
        if (!allowedEntityTypes.includes(payload.entity_type)) {
            return createErrorEnvelope(
                'INVALID_CONNECTOR_INPUT',
                `Unsupported entity_type: ${payload.entity_type}`,
                executionId
            );
        }

        if (!allowedOperations.includes(payload.operation)) {
            return createErrorEnvelope(
                'INVALID_CONNECTOR_INPUT',
                `Unsupported operation: ${payload.operation}`,
                executionId
            );
        }
    }

    // 2. Build raw requests deterministically (no IO, no randomness)
    const rawRequests = normalizedPayloads.map((payload) => {
        const mappedData = mapFields(payload.entity_type, payload.data);
        const entityKey = isNonEmptyString(payload.entity_type)
            ? payload.entity_type.toLowerCase()
            : 'entity';

        return {
            customer_id: account.customer_id,
            operation: payload.operation,
            [entityKey]: mappedData
        };
    });

    // 3. Replay snapshot validation (if present)
    const replayError = validateReplaySnapshot(envelope, rawRequests, executionId);
    if (replayError) {
        return replayError;
    }

    // 4. Execution (mode aware)
    const client = clientOverride || new GoogleAdsClient({ customerId: account.customer_id });
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let ioStart = 0;
    let ioEnd = 0;

    for (let index = 0; index < normalizedPayloads.length; index++) {
        const payload = normalizedPayloads[index];
        const rawRequest = rawRequests[index];

        const requestId = `req-${executionId}-${index}`;
        let rawResponse = null;
        let normalizedResponse = null;
        let error = null;

        try {
            if (request.mode === 'LIVE_SEND') {
                ioStart = Date.now();
                const response = await client.send({
                    customer_id: account.customer_id,
                    payloads: [payload]
                });
                ioEnd += (Date.now() - ioStart);

                rawResponse = response;
                const firstResult = response && Array.isArray(response.results)
                    ? response.results[0]
                    : {};

                normalizedResponse = normalizeResponseFromApi(payload, firstResult);
                successCount++;
            } else {
                // DRY_RUN or RECORD_ONLY (no IO)
                normalizedResponse = normalizeResponseNoIo(payload);
                successCount++;
            }
        } catch (e) {
            error = mapError(e);
            failureCount++;
        }

        results.push({
            request_id: requestId,
            raw_request: rawRequest,
            raw_response: rawResponse,
            normalized_response: normalizedResponse,
            error
        });
    }

    // 5. Status and observability
    const durationMs = ioEnd;

    let baseStatus;
    if (failureCount === 0) {
        baseStatus = request.mode === 'LIVE_SEND' ? 'SUCCESS' : 'DRY_RUN_OK';
    } else if (successCount === 0) {
        baseStatus = 'FAILED';
    } else {
        baseStatus = 'PARTIAL_SUCCESS';
    }

    const finalStatus =
        request.mode === 'DRY_RUN'
            ? 'DRY_RUN_OK'
            : request.mode === 'RECORD_ONLY'
                ? 'RECORDED_NO_IO'
                : baseStatus;

    if (request.mode === 'RECORD_ONLY') {
        console.log(JSON.stringify({
            event_type: 'GOOGLE_ADS_CONNECTOR_RECORDED',
            execution_id: executionId,
            trace_domain_key: traceDomain.trace_domain_key,
            request_count: payloads.length
        }));
    }

    console.log(JSON.stringify({
        event_type: 'GOOGLE_ADS_CONNECTOR_EXECUTED',
        execution_id: executionId,
        trace_domain_key: traceDomain.trace_domain_key,
        mode: request.mode,
        request_count: payloads.length,
        success_count: successCount,
        failure_count: failureCount,
        duration_ms: durationMs,
        trace_span: 'phase_45_google_ads_connector_io'
    }));

    // 6. Output construction (do not mutate original envelope)
    return {
        ...envelope,
        connector_result: {
            status: finalStatus,
            requests: results,
            summary_metrics: {
                success_count: successCount,
                failure_count: failureCount
            },
            observability: {
                log_event_id: `log-${executionId}-phase-45`,
                trace_span_id: `span-${executionId}-phase-45`
            }
        }
    };
}

module.exports = {
    executeGoogleAdsConnector,
    _internal: {
        mapFields,
        mapError,
        extractEntityId,
        normalizeResponseFromApi,
        normalizeResponseNoIo
    }
};
