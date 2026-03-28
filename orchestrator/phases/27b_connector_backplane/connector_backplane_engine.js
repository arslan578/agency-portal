/**
 * Phase 27B: Connector Backplane Specification Layer
 * 
 * Creates the universal, versioned, deterministic connector contract that governs every connector in Kaivo OS.
 * 
 * Feature Flag: FF_CONNECTOR_BACKPLANE_SPEC
 */

const ERROR_CODES = {
    INVALID_BACKPLANE_SPEC: 'INVALID_BACKPLANE_SPEC',
    CAPABILITY_INCONSISTENCY: 'CAPABILITY_INCONSISTENCY',
    POLICY_MIRROR_RESOLUTION_FAILURE: 'POLICY_MIRROR_RESOLUTION_FAILURE',
    MISSING_ERROR_SURFACE: 'MISSING_ERROR_SURFACE',
    UNSUPPORTED_CONNECTOR_SHAPE: 'UNSUPPORTED_CONNECTOR_SHAPE'
};

const CANONICAL_ERROR_SURFACE = [
    'AUTH_ERROR',
    'INVALID_REQUEST',
    'POLICY_FORBIDDEN',
    'CAPABILITY_CONFLICT',
    'UNSUPPORTED_OPERATION',
    'RATE_LIMIT',
    'PLATFORM_INTERNAL',
    'NETWORK_FAILURE',
    'TIMEOUT',
    'UNKNOWN'
];

// Required field lists for validation
const REQUIRED_REQUEST_FIELDS = [
    'connector_key', 'request_id', 'execution_context', 'account',
    'campaign', 'adsets', 'creatives', 'budget'
];

const REQUIRED_CAPABILITIES = [
    'min_budget', 'max_budget', 'supported_objectives',
    'supported_regions', 'optimization_goals', 'retry_feasibility', 'can_batch'
];

const REQUIRED_ROUTING_FLAGS = [
    'SAFE_TO_RETRY', 'SKIP_RETRY', 'HARD_STOP', 'REQUIRES_ESCALATION', 'SANDBOX_ONLY'
];

const REQUIRED_METADATA_FIELDS = [
    'campaign_id', 'adset_id', 'creative_id', 'connector_key', 'version', 'lineage_token'
];

const REQUIRED_POLICY_BINDINGS = [
    'min_spend_policy_ref', 'forbidden_objectives_policy_ref',
    'rate_limit_policy_ref', 'platform_restriction_policy_ref'
];

const REQUIRED_READINESS_RULES = [
    'requires_account_link', 'requires_policy_check',
    'requires_capability_lookup', 'connector_disabled'
];

const REQUIRED_RECONCILIATION_FIELDS = [
    'connector_key', 'execution_status', 'last_success_timestamp',
    'last_failure_timestamp', 'error_code', 'drift_flag', 'capabilities_hash'
];

const REQUIRED_SNAPSHOT_FIELDS = [
    'connector_key', 'request_id', 'status_code', 'response_body', 'error_code', 'metadata'
];

const REQUIRED_RESPONSE_SUCCESS_FIELDS = [
    'status', 'status_code', 'response_body', 'latency_ms',
    'connector_metadata', 'origin_timestamp', 'request_classification', 'dry_run'
];

const REQUIRED_RESPONSE_FAILURE_FIELDS = [
    'status', 'status_code', 'error_message', 'latency_ms',
    'connector_metadata', 'origin_timestamp', 'request_classification', 'dry_run'
];

/**
 * Emit observability signals (Framework Rule #3)
 */
function emitObservability(status) {
    if (process.env.NODE_ENV !== 'test') {
        // Metric
        console.log(JSON.stringify({
            metric: 'kaivo.connector_backplane_spec.load',
            status
        }));

        // Log event
        console.log(JSON.stringify({
            event: 'connector_backplane_specification_built',
            phase: '27B',
            status
        }));

        // Trace span
        console.log(JSON.stringify({
            trace_span: 'phase_27b_connector_backplane_spec',
            status
        }));
    }
}

/**
 * Validates that all required fields are present and no extra fields exist
 */
function validateFields(obj, requiredFields, errorType) {
    const keys = Object.keys(obj);

    // Check for missing fields
    for (const field of requiredFields) {
        if (!keys.includes(field)) {
            throw { code: errorType, message: `Missing required field: ${field}` };
        }
    }

    // Check for extra fields
    for (const key of keys) {
        if (!requiredFields.includes(key)) {
            throw { code: errorType, message: `Extra field forbidden: ${key}` };
        }
    }
}

/**
 * Validates spec consistency and invariants
 */
function validateSpecConsistency(spec) {
    // 1. Validate Capabilities Semantics
    const caps = spec.capabilities;
    if (caps.min_budget.min < 0) {
        throw { code: ERROR_CODES.CAPABILITY_INCONSISTENCY, message: 'min_budget must be >= 0' };
    }
    if (caps.max_budget.min < 0) {
        throw { code: ERROR_CODES.CAPABILITY_INCONSISTENCY, message: 'max_budget must be >= 0' };
    }
    // Check max >= min if values are present (simulated check for test)
    if (caps.min_budget.value !== undefined && caps.max_budget.value !== undefined) {
        if (caps.max_budget.value < caps.min_budget.value) {
            throw { code: ERROR_CODES.CAPABILITY_INCONSISTENCY, message: 'max_budget must be >= min_budget' };
        }
    }

    // 2. Validate Policy Bindings Patterns
    const policies = spec.policy_bindings;
    for (const key of Object.keys(policies)) {
        const pattern = policies[key].pattern;
        if (pattern) {
            if (pattern instanceof RegExp) {
                if (!pattern.source.startsWith('^policy\\.')) {
                    throw { code: ERROR_CODES.POLICY_MIRROR_RESOLUTION_FAILURE, message: `Invalid policy pattern for ${key}` };
                }
            }
        }
    }

    // 3. Validate Readiness Rules Invariants
    const readiness = spec.readiness_rules;
    // "If connector_disabled === true, then all other readiness flags MUST be false."
    // We check if the *spec* defines a fixed value (simulated)
    if (readiness.connector_disabled.value === true) {
        if (readiness.requires_account_link.value === true ||
            readiness.requires_policy_check.value === true ||
            readiness.requires_capability_lookup.value === true) {
            throw { code: ERROR_CODES.INVALID_BACKPLANE_SPEC, message: 'If connector_disabled is true, all other readiness flags must be false' };
        }
    }

    // 4. Validate Routing Flags Forbidden Combinations
    const routing = spec.routing_flags;
    // "If HARD_STOP is true → no other retry-related flags may be true."
    if (routing.HARD_STOP.value === true) {
        if (routing.SAFE_TO_RETRY.value === true ||
            routing.SKIP_RETRY.value === true ||
            routing.REQUIRES_ESCALATION.value === true) { // Assuming these are retry-related
            throw { code: ERROR_CODES.INVALID_BACKPLANE_SPEC, message: 'HARD_STOP cannot be combined with other retry flags' };
        }
    }
    // "If SAFE_TO_RETRY and SKIP_RETRY appear simultaneously" (both true)
    if (routing.SAFE_TO_RETRY.value === true && routing.SKIP_RETRY.value === true) {
        throw { code: ERROR_CODES.INVALID_BACKPLANE_SPEC, message: 'SAFE_TO_RETRY and SKIP_RETRY cannot both be true' };
    }

    // 5. Validate Descriptors
    // Helper to check descriptor structure
    const checkDescriptor = (desc, name) => {
        if (!desc || typeof desc !== 'object') throw { code: ERROR_CODES.INVALID_BACKPLANE_SPEC, message: `Invalid descriptor for ${name}` };
        if (!desc.type) throw { code: ERROR_CODES.INVALID_BACKPLANE_SPEC, message: `Missing type for ${name}` };
        if (desc.required === undefined) throw { code: ERROR_CODES.INVALID_BACKPLANE_SPEC, message: `Missing required flag for ${name}` };
    };

    // Check a sample of descriptors (or all)
    Object.values(spec.request_contract).forEach(d => checkDescriptor(d, 'request_contract field'));
    Object.values(spec.capabilities).forEach(d => checkDescriptor(d, 'capability field'));
    Object.values(spec.routing_flags).forEach(d => checkDescriptor(d, 'routing flag'));
}

/**
 * Builds and validates the connector backplane specification
 */
function buildBackplaneSpec() {
    // Feature flag check
    const FF_CONNECTOR_BACKPLANE_SPEC = process.env.FF_CONNECTOR_BACKPLANE_SPEC !== 'false'; // Default true

    if (!FF_CONNECTOR_BACKPLANE_SPEC) {
        return { feature_flag_enabled: false };
    }

    try {
        // Construct the spec object with structured descriptors
        const spec = {
            request_contract: {
                connector_key: { type: 'string', required: true },
                request_id: { type: 'string', required: true },
                execution_context: { type: 'object', required: true },
                account: { type: 'object', required: true },
                campaign: { type: 'object', required: true },
                adsets: { type: 'array', items: 'object', required: true },
                creatives: { type: 'array', items: 'object', required: true },
                budget: { type: 'object', required: true }
            },
            response_contract: {
                success: {
                    status: 'SUCCESS',
                    status_code: 'OK',
                    response_body: { type: 'object', required: true },
                    latency_ms: { type: 'number', required: true },
                    connector_metadata: { type: 'object', required: true },
                    origin_timestamp: { type: 'string', format: 'iso8601', required: true },
                    request_classification: { type: 'string', required: true },
                    dry_run: { type: 'boolean', required: false }
                },
                failure: {
                    status: 'FAILURE',
                    status_code: 'ERROR_CODE',
                    error_message: { type: 'string', required: true },
                    latency_ms: { type: 'number', required: true },
                    connector_metadata: { type: 'object', required: true },
                    origin_timestamp: { type: 'string', format: 'iso8601', required: true },
                    request_classification: { type: 'string', required: true },
                    dry_run: { type: 'boolean', required: false }
                }
            },
            capabilities: {
                min_budget: { type: 'number', min: 0, required: true },
                max_budget: { type: 'number', min: 0, required: true },
                supported_objectives: { type: 'array', items: 'string', required: true },
                supported_regions: { type: 'array', items: 'string', required: true },
                optimization_goals: { type: 'array', items: 'string', required: true },
                retry_feasibility: { type: 'boolean', required: true },
                can_batch: { type: 'boolean', required: true }
            },
            error_surface: {
                AUTH_ERROR: 'AUTH_ERROR',
                INVALID_REQUEST: 'INVALID_REQUEST',
                POLICY_FORBIDDEN: 'POLICY_FORBIDDEN',
                CAPABILITY_CONFLICT: 'CAPABILITY_CONFLICT',
                UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
                RATE_LIMIT: 'RATE_LIMIT',
                PLATFORM_INTERNAL: 'PLATFORM_INTERNAL',
                NETWORK_FAILURE: 'NETWORK_FAILURE',
                TIMEOUT: 'TIMEOUT',
                UNKNOWN: 'UNKNOWN'
            },
            routing_flags: {
                SAFE_TO_RETRY: { type: 'string', required: true },
                SKIP_RETRY: { type: 'string', required: true },
                HARD_STOP: { type: 'string', required: true },
                REQUIRES_ESCALATION: { type: 'string', required: true },
                SANDBOX_ONLY: { type: 'string', required: true }
            },
            metadata_fields: {
                campaign_id: { type: 'string', required: true },
                adset_id: { type: 'string', required: true },
                creative_id: { type: 'string', required: true },
                connector_key: { type: 'string', required: true },
                version: { type: 'string', required: true },
                lineage_token: { type: 'string', required: true }
            },
            readiness_rules: {
                requires_account_link: { type: 'boolean', required: true },
                requires_policy_check: { type: 'boolean', required: true },
                requires_capability_lookup: { type: 'boolean', required: true },
                connector_disabled: { type: 'boolean', required: true }
            },
            reconciliation_shape: {
                connector_key: { type: 'string', required: true },
                execution_status: { type: 'string', required: true },
                last_success_timestamp: { type: 'string', format: 'iso8601', required: true },
                last_failure_timestamp: { type: 'string', format: 'iso8601', required: true },
                error_code: { type: 'string', required: true },
                drift_flag: { type: 'boolean', required: true },
                capabilities_hash: { type: 'string', pattern: /^[a-f0-9]{64}$/, required: true }
            },
            snapshot_shape: {
                connector_key: { type: 'string', required: true },
                request_id: { type: 'string', required: true },
                status_code: { type: 'string', required: true },
                response_body: { type: 'object', required: true },
                error_code: { type: 'string', required: true },
                metadata: { type: 'object', required: true }
            },
            policy_bindings: {
                min_spend_policy_ref: { type: 'string', pattern: /^policy\./, required: true },
                forbidden_objectives_policy_ref: { type: 'string', pattern: /^policy\./, required: true },
                rate_limit_policy_ref: { type: 'string', pattern: /^policy\./, required: true },
                platform_restriction_policy_ref: { type: 'string', pattern: /^policy\./, required: true }
            }
        };

        // Validate contracts
        validateFields(spec.request_contract, REQUIRED_REQUEST_FIELDS, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.capabilities, REQUIRED_CAPABILITIES, ERROR_CODES.CAPABILITY_INCONSISTENCY);
        validateFields(spec.routing_flags, REQUIRED_ROUTING_FLAGS, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.metadata_fields, REQUIRED_METADATA_FIELDS, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.policy_bindings, REQUIRED_POLICY_BINDINGS, ERROR_CODES.POLICY_MIRROR_RESOLUTION_FAILURE);

        // Add missing extra-field validation
        validateFields(spec.response_contract.success, REQUIRED_RESPONSE_SUCCESS_FIELDS, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.response_contract.failure, REQUIRED_RESPONSE_FAILURE_FIELDS, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.readiness_rules, REQUIRED_READINESS_RULES, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.reconciliation_shape, REQUIRED_RECONCILIATION_FIELDS, ERROR_CODES.INVALID_BACKPLANE_SPEC);
        validateFields(spec.snapshot_shape, REQUIRED_SNAPSHOT_FIELDS, ERROR_CODES.INVALID_BACKPLANE_SPEC);

        // Validate error surface
        const errorCodes = Object.keys(spec.error_surface);
        for (const code of CANONICAL_ERROR_SURFACE) {
            if (!errorCodes.includes(code)) {
                throw { code: ERROR_CODES.MISSING_ERROR_SURFACE, message: `Missing error code: ${code}` };
            }
        }
        for (const code of errorCodes) {
            if (!CANONICAL_ERROR_SURFACE.includes(code)) {
                throw { code: ERROR_CODES.MISSING_ERROR_SURFACE, message: `Extra error code forbidden: ${code}` };
            }
        }

        // Validate consistency and invariants
        validateSpecConsistency(spec);

        emitObservability('SUCCESS');

        return {
            connector_backplane_v1: spec,
            feature_flag_enabled: true
        };

    } catch (error) {
        emitObservability('FAILURE');
        throw error;
    }
}

module.exports = {
    buildBackplaneSpec,
    ERROR_CODES,
    _internal: {
        validateFields,
        validateSpecConsistency,
        REQUIRED_REQUEST_FIELDS,
        REQUIRED_CAPABILITIES,
        REQUIRED_ROUTING_FLAGS,
        REQUIRED_METADATA_FIELDS,
        REQUIRED_POLICY_BINDINGS,
        CANONICAL_ERROR_SURFACE
    }
};
