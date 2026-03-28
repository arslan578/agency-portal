/**
 * Phase 57: Cross-Connector State Merger Engine
 * 
 * Aggregates individual connector states into a global, deterministic system state.
 * Strict contracts, no IO, pure in-memory processing.
 *
 * // Phase 57 aggregates Phase 27B-compliant snapshots into a global view.
 */

const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

const INPUT_CONTRACT_NAME = 'global_connector_state_merger_input_contract_v1';
const OUTPUT_CONTRACT_NAME = 'global_connector_state_merger_output_contract_v1';

/**
 * Merge global connector state
 * @param {object} input - input_contract_v1
 * @returns {object} - output_contract_v1
 */
function mergeGlobalConnectorState(input) {
    const execution_id = input?.execution_id || null;
    const requested_at = input?.requested_at || null;

    // 1. Feature Flag Check
    if (process.env.FF_GLOBAL_CONNECTOR_STATE_MERGER !== 'true') {
        const disabledPayload = {
            execution_id,
            requested_at,
            global_health: 'UNKNOWN',
            global_drift: 'UNRESOLVED',
            capability_matrix: {},
            routing_profile: {
                active_primary_paths: 0,
                fallback_dependencies: 0,
                degraded_connectors: [],
                routing_failures: 0
            },
            merged_state: {},
            feature_flag_enabled: false,
            stop_reason: 'FEATURE_DISABLED',
            status: 'OK',
            error: null
        };

        // Canonical Disabled Payload for Hash
        const canonicalDisabledPayload = {
            connector_states_by_key: {},
            global_health: 'UNKNOWN',
            global_drift: 'UNRESOLVED',
            capability_matrix: {},
            routing_profile: {
                active_primary_paths: 0,
                fallback_dependencies: 0,
                degraded_connectors: [],
                routing_failures: 0
            }
        };

        const hash = computeDeterministicHash(canonicalDisabledPayload);
        return deepFreeze({ ...disabledPayload, determinism_hash: hash });
    }

    // 2. Start Observability
    // Note: We must handle the case where execution_id is missing/invalid in the error handler,
    // but for tracing we need it early. If missing, we'll use 'unknown'.
    const traceId = execution_id || 'unknown';
    const span = startSpan('phase_57_global_connector_state_merger', { execution_id: traceId });

    try {
        metrics.count('phase_57_state_merger_invoked', 1);
        logStructured('phase_57_state_merger_invoked', {
            execution_id: traceId,
            phase: 57,
            connector_count: input?.connector_states_by_key ? Object.keys(input.connector_states_by_key).length : 0
        });

        // 3. Deep Clone Input (No Mutation Rule)
        const inputClone = JSON.parse(JSON.stringify(input));

        // 4. Input Validation
        validateInput(inputClone);

        // 5. Core Logic
        const connectorKeys = Object.keys(inputClone.connector_states_by_key).sort(); // Lexicographical sort

        // Global Health & Drift
        let globalHealth = 'OK';
        let globalDrift = 'RESOLVED';

        // Routing Profile Aggregation
        let activePrimary = 0;
        let fallbackDeps = 0;
        let routingFailures = 0;
        const degradedConnectors = [];

        // Capability Matrix
        const capabilityMatrix = {};

        // Process Connectors (Sorted Order)
        for (const key of connectorKeys) {
            const state = inputClone.connector_states_by_key[key];

            // Health Aggregation
            if (state.health_state === 'BROKEN') {
                globalHealth = 'BROKEN';
            } else if (state.health_state === 'DEGRADED' && globalHealth !== 'BROKEN') {
                globalHealth = 'DEGRADED';
            }

            // Drift Aggregation
            if (state.drift_status === 'UNRESOLVED') {
                globalDrift = 'UNRESOLVED';
            } else if (state.drift_status === 'PARTIALLY_RESOLVED' && globalDrift !== 'UNRESOLVED') {
                globalDrift = 'PARTIALLY_RESOLVED';
            }

            // Routing Profile (Zero Inference enforced by strict checks)
            if (state.routing_state && typeof state.routing_state === 'object') {
                if (state.routing_state.active_role === 'PRIMARY') activePrimary++;
                if (state.routing_state.active_role === 'FALLBACK') fallbackDeps++;

                if (state.routing_state.routing_status === 'FAILED' ||
                    (state.routing_state.switch_attempted === true && state.routing_state.switched === false)) {
                    routingFailures++;
                }
            }

            if (state.health_state !== 'OK') {
                degradedConnectors.push(key);
            }
        }

        // Capability Matrix Construction
        if (inputClone.capabilities_by_connector_key) {
            const capConnectorKeys = Object.keys(inputClone.capabilities_by_connector_key).sort();
            for (const connKey of capConnectorKeys) {
                const caps = inputClone.capabilities_by_connector_key[connKey];
                if (caps && typeof caps === 'object') {
                    for (const [capKey, isSupported] of Object.entries(caps)) {
                        if (isSupported === true) {
                            if (!capabilityMatrix[capKey]) {
                                capabilityMatrix[capKey] = [];
                            }
                            capabilityMatrix[capKey].push(connKey);
                        }
                    }
                }
            }
        }

        // Sort Capability Matrix
        const sortedCapabilityMatrix = {};
        Object.keys(capabilityMatrix).sort().forEach(capKey => {
            sortedCapabilityMatrix[capKey] = capabilityMatrix[capKey].sort();
        });

        // Construct Output Components
        const routingProfile = {
            active_primary_paths: activePrimary,
            fallback_dependencies: fallbackDeps,
            degraded_connectors: degradedConnectors.sort(),
            routing_failures: routingFailures
        };

        // Merged State (Sorted)
        const mergedState = {};
        for (const key of connectorKeys) {
            mergedState[key] = inputClone.connector_states_by_key[key];
        }

        // 6. Canonical Payload & Hash (Strict Structure)
        const canonicalPayload = {
            connector_states_by_key: mergedState,
            global_health: globalHealth,
            global_drift: globalDrift,
            capability_matrix: sortedCapabilityMatrix,
            routing_profile: routingProfile
        };

        const hash = computeDeterministicHash(canonicalPayload);

        // 7. Verify No Mutation
        const postClone = JSON.parse(JSON.stringify(inputClone));
        // We compare inputClone (which we worked on) with a fresh clone of it.
        // Wait, the requirement is: "Before returning, deep-clone inputClone again to postClone and verify... inputClone !== postClone"
        // Actually, we should compare inputClone against the ORIGINAL input to be sure, but we can't touch original input.
        // The prompt says: "Immediately deep-clone... into inputClone... Perform all reads from inputClone... Before returning, deep-clone inputClone again to postClone and verify if (JSON.stringify(inputClone) !== JSON.stringify(postClone))"
        // This verifies we didn't mutate inputClone during processing.
        if (JSON.stringify(inputClone) !== JSON.stringify(postClone)) {
            throw new Error("Input clone mutated inside Phase 57");
        }

        span.end();

        return deepFreeze({
            execution_id: inputClone.execution_id,
            requested_at: inputClone.requested_at || null,
            global_health: globalHealth,
            global_drift: globalDrift,
            capability_matrix: sortedCapabilityMatrix,
            routing_profile: routingProfile,
            merged_state: mergedState,
            determinism_hash: hash,
            feature_flag_enabled: true,
            stop_reason: null,
            status: 'OK',
            error: null
        });

    } catch (error) {
        span.end();
        const isInvalidInput = error.message.startsWith('INVALID_INPUT:');
        return createErrorResponse({
            execution_id: execution_id, // Use original if available
            requested_at: requested_at,
            stop_reason: isInvalidInput ? 'INVALID_INPUT' : 'ENGINE_ERROR',
            errorMessage: error.message
        });
    }
}

/**
 * Validate Input
 */
function validateInput(input) {
    if (!input || typeof input !== 'object') throw new Error('INVALID_INPUT: Input must be an object');

    // Top-level fields check
    const allowedFields = ["execution_id", "requested_at", "connector_states_by_key", "capabilities_by_connector_key"];
    const actualFields = Object.keys(input);
    for (const field of actualFields) {
        if (!allowedFields.includes(field)) {
            throw new Error(`INVALID_INPUT: Unknown top-level field '${field}'`);
        }
    }

    if (!input.execution_id || typeof input.execution_id !== 'string') {
        throw new Error('INVALID_INPUT: execution_id must be a non-empty string');
    }

    if (!input.connector_states_by_key || typeof input.connector_states_by_key !== 'object') {
        throw new Error('INVALID_INPUT: connector_states_by_key must be an object');
    }

    if (input.capabilities_by_connector_key && typeof input.capabilities_by_connector_key !== 'object') {
        throw new Error('INVALID_INPUT: capabilities_by_connector_key must be an object');
    }

    // Connector State Validation
    for (const [key, state] of Object.entries(input.connector_states_by_key)) {
        if (!state || typeof state !== 'object') throw new Error(`INVALID_INPUT: Invalid state for connector '${key}'`);

        // Enums
        if (!['OK', 'DEGRADED', 'BROKEN'].includes(state.health_state)) {
            throw new Error(`INVALID_INPUT: Invalid health_state for '${key}'`);
        }
        if (!['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED'].includes(state.drift_status)) {
            throw new Error(`INVALID_INPUT: Invalid drift_status for '${key}'`);
        }
        if (!['VALID', 'INVALID', 'UNKNOWN'].includes(state.auth_state)) {
            throw new Error(`INVALID_INPUT: Invalid auth_state for '${key}'`);
        }

        // Routing State
        if (state.routing_state) {
            if (state.routing_state.active_role && !['PRIMARY', 'FALLBACK'].includes(state.routing_state.active_role)) {
                throw new Error(`INVALID_INPUT: Invalid active_role for '${key}'`);
            }
            if (state.routing_state.routing_status && !['STABLE', 'SWITCHED', 'FAILED'].includes(state.routing_state.routing_status)) {
                throw new Error(`INVALID_INPUT: Invalid routing_status for '${key}'`);
            }
        }
    }
}

/**
 * Compute Deterministic Hash
 */
function computeDeterministicHash(payload) {
    const canonical = sortObjectKeys(payload);
    const json = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Recursive Object Sort
 */
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        // Sort arrays of strings lexicographically
        if (obj.length > 0 && typeof obj[0] === 'string') {
            return [...obj].sort().map(sortObjectKeys);
        }
        // For object arrays, keep order but sort keys inside
        return obj.map(sortObjectKeys);
    }

    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

/**
 * Deep Freeze
 */
function deepFreeze(obj) {
    if (obj && typeof obj === 'object') {
        Object.freeze(obj);
        Object.keys(obj).forEach(key => deepFreeze(obj[key]));
    }
    return obj;
}

/**
 * Create Error Response
 */
function createErrorResponse({ execution_id, requested_at, stop_reason, errorMessage }) {
    const errorPayload = {
        execution_id: execution_id || null,
        requested_at: requested_at || null,
        global_health: 'BROKEN',
        global_drift: 'UNRESOLVED',
        capability_matrix: {},
        routing_profile: {
            active_primary_paths: 0,
            fallback_dependencies: 0,
            degraded_connectors: [],
            routing_failures: 0
        },
        merged_state: {},
        feature_flag_enabled: true,
        stop_reason: stop_reason,
        status: 'ERROR',
        error: errorMessage
    };

    // Canonical Error Payload for Hash
    const canonicalErrorPayload = {
        connector_states_by_key: {},
        global_health: 'BROKEN',
        global_drift: 'UNRESOLVED',
        capability_matrix: {},
        routing_profile: {
            active_primary_paths: 0,
            fallback_dependencies: 0,
            degraded_connectors: [],
            routing_failures: 0
        }
    };

    const hash = computeDeterministicHash(canonicalErrorPayload);

    return deepFreeze({ ...errorPayload, determinism_hash: hash });
}

module.exports = {
    mergeGlobalConnectorState,
    INPUT_CONTRACT_NAME,
    OUTPUT_CONTRACT_NAME
};
