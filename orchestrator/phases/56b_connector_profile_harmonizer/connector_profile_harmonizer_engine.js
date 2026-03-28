const { logStructured } = require('../../shared/logging');
const { metrics } = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

const FEATURE_FLAG = 'FF_CONNECTOR_PROFILE_HARMONIZER';

// --- Helper Functions ---

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const cloned = {};
    for (const key of Object.keys(obj)) {
        cloned[key] = deepClone(obj[key]);
    }
    return cloned;
}

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

function normalizeReadiness(state) {
    if (state === 'HEALTHY') return 'READY';
    return 'NOT_READY';
}

function validateAndNormalizeProfile(connectorId, rawProfile, state, capabilityTable, schema) {
    const normalized = {};
    const errors = [];

    // 1. Schema Validation & Normalization
    // Required fields
    if (schema.required_fields) {
        schema.required_fields.forEach(field => {
            if (rawProfile[field] === undefined && field !== 'capabilities' && field !== 'routing') {
                // Some fields might be constructed, not in raw_profile
                // For this engine, we construct 'capabilities' and 'routing', so we skip check if they are missing in raw
            }
        });
    }

    // 2. Capability Expansion
    const capabilities = {};
    if (rawProfile.capabilities) {
        if (Array.isArray(rawProfile.capabilities)) {
            rawProfile.capabilities.forEach(cap => {
                if (capabilityTable && capabilityTable.includes(cap)) {
                    capabilities[cap] = true;
                } else {
                    errors.push(`Undefined capability: ${cap}`);
                }
            });
        } else if (typeof rawProfile.capabilities === 'object') {
            Object.keys(rawProfile.capabilities).forEach(cap => {
                if (capabilityTable && capabilityTable.includes(cap)) {
                    capabilities[cap] = true;
                } else {
                    errors.push(`Undefined capability: ${cap}`);
                }
            });
        }
    }

    // 3. Routing Normalization
    const routing = {
        readiness: normalizeReadiness(state),
        redundancy_group: rawProfile.redundancy_group || rawProfile.metadata?.redundancy_group || null
    };

    // 4. Metadata Normalization (Strip forbidden/unknown)
    // --- Strict Metadata Normalization ---
    const metadata = {};
    if (rawProfile.metadata && typeof rawProfile.metadata === 'object') {

        const allowedMetadata = schema.metadata_fields || []; // Optional strict list
        const isStrict = Array.isArray(allowedMetadata) && allowedMetadata.length > 0;

        for (const key of Object.keys(rawProfile.metadata)) {

            // Strip forbidden fields always
            if (schema.forbidden_fields && schema.forbidden_fields.includes(key)) {
                continue;
            }

            // Strip unknown fields if schema is strict
            if (isStrict && !allowedMetadata.includes(key)) {
                continue;
            }

            metadata[key] = rawProfile.metadata[key];
        }
    }

    // Construct Final Object
    normalized.connector_id = connectorId;
    normalized.version = rawProfile.version || '0.0.0'; // Fallback
    normalized.state = state;
    normalized.capabilities = capabilities;
    normalized.routing = routing;
    normalized.metadata = metadata;

    // --- Required Field Enforcement ---
    if (schema.required_fields && Array.isArray(schema.required_fields)) {
        for (const field of schema.required_fields) {
            if (normalized[field] === undefined) {
                errors.push(`Missing required normalized field: ${field}`);
            }
        }
    }

    // Sort keys for determinism
    return { normalized: sortObjectKeys(normalized), errors };
}

// --- Main Execute Function ---

function execute(input) {
    // Deep clone defensively to prevent accidental mutation
    const clonedInput = deepClone(input);
    const span = tracing.startSpan('phase_56b_connector_profile_harmonizer');
    const executionId = clonedInput?.execution_id || 'unknown';

    try {
        // 1. Feature Flag Check
        if (!clonedInput?.feature_flags?.[FEATURE_FLAG]) {
            return enforceTopLevelWhitelist({
                execution_id: executionId,
                phase: '56B',
                status: 'OK',
                feature_disabled: true,
                harmonized_profiles: {},
                errors: {}
            });
        }

        // 2. Input Validation
        if (!clonedInput.from_phase_56 || !clonedInput.from_phase_56.connector_states || !clonedInput.capability_tables || !clonedInput.backplane_schema) {
            return enforceTopLevelWhitelist({
                execution_id: executionId,
                phase: '56B',
                status: 'INVALID_INPUT',
                harmonized_profiles: {},
                errors: { global: { code: 'INVALID_INPUT', message: 'Missing required inputs' } }
            });
        }

        const harmonizedProfiles = {};
        const harmonizationErrors = {};
        let successCount = 0;
        let errorCount = 0;

        const connectorStates = clonedInput.from_phase_56.connector_states;
        const sortedConnectorIds = Object.keys(connectorStates).sort();

        // 3. Processing Loop
        for (const connectorId of sortedConnectorIds) {
            const connectorData = connectorStates[connectorId];
            const capabilityTable = clonedInput.capability_tables[connectorId] || [];

            const { normalized, errors } = validateAndNormalizeProfile(
                connectorId,
                connectorData.raw_profile || {},
                connectorData.state,
                capabilityTable,
                clonedInput.backplane_schema
            );

            if (errors.length > 0) {
                harmonizationErrors[connectorId] = {
                    code: 'HARMONIZATION_ERROR',
                    message: errors.join(', ')
                };
                errorCount++;
            } else {
                harmonizedProfiles[connectorId] = normalized;
                successCount++;
            }
        }

        // 4. Observability
        metrics.count('harmonizer_profiles_processed', successCount + errorCount);
        metrics.count('harmonizer_errors', errorCount);
        metrics.count('harmonizer_success', successCount);

        logStructured('phase_56b_connector_profile_harmonizer', {
            execution_id: executionId,
            processed: successCount + errorCount,
            errors: errorCount
        });

        // 5. Output Construction
        return enforceTopLevelWhitelist({
            execution_id: executionId,
            phase: '56B',
            status: errorCount > 0 ? 'HARMONIZATION_ERROR' : 'OK',
            harmonized_profiles: harmonizedProfiles,
            errors: Object.keys(harmonizationErrors).length > 0 ? harmonizationErrors : undefined
        });

    } catch (e) {
        // Catch-all for unexpected runtime errors
        return enforceTopLevelWhitelist({
            execution_id: executionId,
            phase: '56B',
            status: 'HARMONIZATION_ERROR',
            harmonized_profiles: {},
            errors: { global: { code: 'RUNTIME_ERROR', message: e.message } }
        });
    } finally {
        span.end();
    }
}

const ALLOWED_TOP_LEVEL_FIELDS = [
    'execution_id',
    'phase',
    'status',
    'harmonized_profiles',
    'errors',
    'feature_disabled'
];

function enforceTopLevelWhitelist(obj) {
    const cleaned = {};
    for (const key of ALLOWED_TOP_LEVEL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cleaned[key] = obj[key];
        }
    }
    return cleaned;
}

module.exports = { execute };
