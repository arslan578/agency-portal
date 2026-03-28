/**
 * Envelope Validator
 * 
 * Contract validation utilities for Phase 57-59 Safety Layer integration.
 * Enforces required/forbidden fields and validates contract compliance at phase boundaries.
 * 
 * Forward-Hardening compliance:
 * - Deterministic validation
 * - Explicit error messages
 * - No side effects
 * - Strict immutability checks
 * - Deep structure validation
 */

/**
 * Validate required fields are present
 * @param {object} obj - Object to validate
 * @param {string[]} requiredFields - List of required field names
 * @param {string} context - Context for error messages
 * @returns {{valid: boolean, missingFields: string[], error: string|null}}
 */
function validateRequiredFields(obj, requiredFields, context) {
    const missingFields = [];

    for (const field of requiredFields) {
        if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
            missingFields.push(field);
        }
    }

    return {
        valid: missingFields.length === 0,
        missingFields,
        error: missingFields.length > 0
            ? `${context}: Missing required fields: ${missingFields.join(', ')}`
            : null
    };
}

/**
 * Validate no forbidden fields are present
 * @param {object} obj - Object to validate
 * @param {string[]} allowedFields - List of allowed field names
 * @param {string} context - Context for error messages
 * @returns {{valid: boolean, forbiddenFields: string[], error: string|null}}
 */
function validateForbiddenFields(obj, allowedFields, context) {
    const allowedSet = new Set(allowedFields);
    const forbiddenFields = [];

    for (const key of Object.keys(obj)) {
        if (!allowedSet.has(key)) {
            forbiddenFields.push(key);
        }
    }

    return {
        valid: forbiddenFields.length === 0,
        forbiddenFields,
        error: forbiddenFields.length > 0
            ? `${context}: Forbidden fields present: ${forbiddenFields.join(', ')}`
            : null
    };
}

/**
 * Validate keys are sorted (determinism check)
 * @param {object} obj - Object to validate
 * @returns {boolean} - True if keys are sorted alphabetically
 */
function validateSortedKeys(obj) {
    const keys = Object.keys(obj);
    const sortedKeys = [...keys].sort();
    return JSON.stringify(keys) === JSON.stringify(sortedKeys);
}

/**
 * Validate Phase 57 output matches Phase 58 input requirements
 * @param {object} phase57Output - Output from Phase 57
 * @returns {{valid: boolean, error: string|null}}
 */
function validatePhase57Output(phase57Output) {
    // Required top-level fields from Phase 57
    const requiredFields = ['execution_id', 'phase', 'merged_state'];

    const requiredCheck = validateRequiredFields(
        phase57Output,
        requiredFields,
        'Phase 57→58 Transition'
    );

    if (!requiredCheck.valid) {
        return {
            valid: false,
            error: requiredCheck.error
        };
    }

    // Allowed top-level fields (from Phase 57 actual output contract)
    const allowedTopLevel = [
        'capability_matrix',
        'determinism_hash',
        'error',
        'execution_id',
        'feature_flag_enabled',
        'global_drift',
        'global_health',
        'merged_state',
        'phase',
        'requested_at',
        'routing_profile',
        'status',
        'status_code',
        'stop_reason'
    ];

    const forbiddenCheck = validateForbiddenFields(
        phase57Output,
        allowedTopLevel,
        'Phase 57→58 Transition'
    );

    if (!forbiddenCheck.valid) {
        return {
            valid: false,
            error: forbiddenCheck.error
        };
    }

    // Enforce sorted keys for determinism
    if (!validateSortedKeys(phase57Output)) {
        return {
            valid: false,
            error: 'Phase 57→58 Transition: top-level keys must be sorted for determinism'
        };
    }

    // Validate merged_state structure (it's the connector map)
    if (typeof phase57Output.merged_state !== 'object' || phase57Output.merged_state === null) {
        return {
            valid: false,
            error: 'Phase 57→58 Transition: merged_state must be a non-null object'
        };
    }

    // Structural validation for each connector entry
    for (const [connectorId, data] of Object.entries(phase57Output.merged_state)) {
        if (typeof data !== 'object' || data === null) {
            return {
                valid: false,
                error: `Phase 57→58 Transition: Invalid connector entry for ${connectorId} (must be object)`
            };
        }

        // Required fields per connector
        const requiredConnectorFields = ['state', 'capabilities'];

        for (const field of requiredConnectorFields) {
            if (!(field in data)) {
                return {
                    valid: false,
                    error: `Phase 57→58 Transition: Connector ${connectorId} missing required field: ${field}`
                };
            }
        }
    }

    return {
        valid: true,
        error: null
    };
}

/**
 * Validate Phase 58 output matches Phase 59 input requirements
 * @param {object} phase58Output - Output from Phase 58
 * @param {object} originalInput - Original input to chain (for optimizer_plan immutability check)
 * @returns {{valid: boolean, error: string|null}}
 */
function validatePhase58Output(phase58Output, originalInput) {
    // Required top-level fields
    const requiredFields = ['execution_id', 'phase', 'safety_zone', 'safe_execution_horizon', 'forbidden_actions', 'risk_ledger', 'redundancy_profile'];

    const requiredCheck = validateRequiredFields(
        phase58Output,
        requiredFields,
        'Phase 58→59 Transition'
    );

    if (!requiredCheck.valid) {
        return {
            valid: false,
            error: requiredCheck.error
        };
    }

    // Allowed top-level fields (from Phase 58 actual output contract)
    const allowedTopLevel = [
        'execution_id',
        'feature_flag_enabled',
        'forbidden_actions',
        'phase',
        'redundancy_profile',
        'risk_ledger',
        'safe_execution_horizon',
        'safety_zone',
        'snapshot',
        'status',
        'status_code'
    ];

    const forbiddenTop = validateForbiddenFields(
        phase58Output,
        allowedTopLevel,
        'Phase 58→59 Transition'
    );

    if (!forbiddenTop.valid) {
        return {
            valid: false,
            error: forbiddenTop.error
        };
    }

    // Enforce sorted keys for determinism
    if (!validateSortedKeys(phase58Output)) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: top-level keys must be sorted for determinism'
        };
    }

    // Type validation for critical fields
    if (typeof phase58Output.safe_execution_horizon !== 'object') {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: safe_execution_horizon must be an object'
        };
    }

    if (typeof phase58Output.safety_zone !== 'object') {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: safety_zone must be an object'
        };
    }

    if (!Array.isArray(phase58Output.forbidden_actions)) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: forbidden_actions must be an array'
        };
    }

    if (typeof phase58Output.risk_ledger !== 'object') {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: risk_ledger must be an object'
        };
    }

    if (typeof phase58Output.redundancy_profile !== 'object') {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: redundancy_profile must be an object'
        };
    }

    // Enforce sorted keys within safety-critical nested objects
    if (!validateSortedKeys(phase58Output.safe_execution_horizon)) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: safe_execution_horizon keys must be sorted for determinism'
        };
    }

    if (!validateSortedKeys(phase58Output.safety_zone)) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: safety_zone keys must be sorted for determinism'
        };
    }

    if (!validateSortedKeys(phase58Output.risk_ledger)) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: risk_ledger keys must be sorted for determinism'
        };
    }

    if (!validateSortedKeys(phase58Output.redundancy_profile)) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: redundancy_profile keys must be sorted for determinism'
        };
    }

    // Enforce sorted keys on snapshot if present (for deterministic replay)
    if (phase58Output.snapshot && typeof phase58Output.snapshot === 'object') {
        if (!validateSortedKeys(phase58Output.snapshot)) {
            return {
                valid: false,
                error: 'Phase 58→59 Transition: snapshot keys must be sorted for determinism'
            };
        }
    }

    // Strict optimizer_plan immutability checks (Phase 58 must not touch it)
    // Detection 1: Phase 58 must not inject optimizer_plan if it wasn't in original input
    if (!originalInput.optimizer_plan && phase58Output.optimizer_plan) {
        return {
            valid: false,
            error: 'Phase 58→59 Transition: optimizer_plan must not be injected by Phase 58 (Safety Layer is observational)'
        };
    }

    // Detection 2: Phase 58 must not mutate optimizer_plan if it was present
    if (originalInput.optimizer_plan && phase58Output.optimizer_plan) {
        const originalStr = JSON.stringify(originalInput.optimizer_plan);
        const currentStr = JSON.stringify(phase58Output.optimizer_plan);

        if (originalStr !== currentStr) {
            return {
                valid: false,
                error: 'Phase 58→59 Transition: optimizer_plan was mutated by Phase 58 (Safety Layer must not modify plans)'
            };
        }
    }

    return {
        valid: true,
        error: null
    };
}

/**
 * Create validation error response
 * @param {string} phase - Phase where validation failed
 * @param {string} error - Error message
 * @param {string|null} execution_id - Execution ID for correlation (or null if unavailable)
 * @returns {object} - Standard error response matching orchestrator contract
 */
function createValidationError(phase, error, execution_id = null) {
    return {
        execution_id,
        phase,
        status: 'INVALID_INPUT',
        stop_reason: 'CONTRACT_VIOLATION',
        error,
        violations: [],
        valid: false
    };
}

module.exports = {
    validateRequiredFields,
    validateForbiddenFields,
    validateSortedKeys,
    validatePhase57Output,
    validatePhase58Output,
    createValidationError
};
