/**
 * Phase 32: Policy Mirror Engine
 *
 * Deterministic, read-only, central rule mirror of all Kaivo operational rules and constraints.
 * Mirrors the "laws of the world" from static definitions without inference or mutation.
 *
 * Governed by Forward Hardening Framework.
 */

// Static rule imports (No runtime IO)
const budgetRules = require('../policy/rules/budget_rules.json');
const venueRules = require('../policy/rules/venue_rules.json');
const compatibilityMatrix = require('../policy/rules/compatibility_matrix.json');
const connectorRules = require('../policy/rules/connector_rules.json');

/**
 * Main entry point for Phase 32.
 *
 * @param {object} envelope - Orchestrator envelope
 * @returns {object} - Orchestrator envelope with PolicyMirrorResponseV1
 */
function getPolicyMirror(envelope) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Strict Input Validation
        if (!envelope || typeof envelope !== 'object') {
            return createErrorEnvelope(timestamp, "MALFORMED_POLICY_CONTRACT", "Input must be an object");
        }

        if (!envelope.payload || typeof envelope.payload !== 'object') {
            return createErrorEnvelope(timestamp, "MALFORMED_POLICY_CONTRACT", "Input envelope missing payload");
        }

        const payload = envelope.payload;

        if (!payload.execution_id || !payload.request_context) {
            return createErrorEnvelope(timestamp, "MALFORMED_POLICY_CONTRACT", "Missing execution_id or request_context");
        }

        const { execution_id } = payload;

        // 2. Feature Flag Check
        if (process.env.FF_POLICY_MIRROR_V1 === "false") {
            return {
                ok: true,
                module: "policy_mirror_engine",
                timestamp,
                payload: {
                    execution_id,
                    policy_version: "DISABLED",
                    timestamp,
                    rules: {
                        budget: {},
                        venues: {},
                        compatibility_matrix: {
                            objective_to_venue: {},
                            creative_to_venue: {},
                            audience_to_venue: {}
                        },
                        connector_rules: {}
                    }
                },
                error: null
            };
        }

        // 3. Validate Rules (Shape Validation)
        const budgetError = validateBudgetRules(budgetRules);
        if (budgetError) return createErrorEnvelope(timestamp, "KG_MISSING_RULES", budgetError);

        const venueError = validateVenueRules(venueRules);
        if (venueError) return createErrorEnvelope(timestamp, "KG_MISSING_RULES", venueError);

        const matrixError = validateCompatibilityMatrix(compatibilityMatrix);
        if (matrixError) return createErrorEnvelope(timestamp, "INVALID_COMPATIBILITY_TABLE", matrixError);

        const connectorError = validateConnectorRules(connectorRules);
        if (connectorError) return createErrorEnvelope(timestamp, "KG_MISSING_RULES", connectorError);

        // 4. Construct Output (Deterministic Ordering)
        const rules = {
            budget: sortKeys(budgetRules),
            venues: sortKeys(venueRules),
            compatibility_matrix: sortKeys(compatibilityMatrix),
            connector_rules: sortKeys(connectorRules)
        };

        // 5. Construct Response
        const responsePayload = {
            execution_id: payload.execution_id,
            policy_version: "1.0.0",
            timestamp,
            rules
        };

        return {
            ok: true,
            module: "policy_mirror_engine",
            timestamp,
            payload: responsePayload,
            error: null
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message);
    }
}

// Validation Helpers

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function validateBudgetRules(rules) {
    if (!rules || typeof rules !== 'object') return "Budget rules missing or invalid";
    if (!isNumber(rules.min_total)) return "Budget rules missing min_total";
    if (!isNumber(rules.max_total)) return "Budget rules missing max_total";
    if (!isNumber(rules.min_per_venue)) return "Budget rules missing min_per_venue";
    return null;
}

function validateVenueRules(rules) {
    if (!rules || typeof rules !== 'object') return "Venue rules missing or invalid";
    for (const key in rules) {
        const venue = rules[key];
        if (typeof venue.enabled !== 'boolean') return `Venue ${key} missing enabled`;
        if (!Array.isArray(venue.compatible_objectives)) return `Venue ${key} missing compatible_objectives`;
        if (!Array.isArray(venue.required_creative_types)) return `Venue ${key} missing required_creative_types`;
        if (!Array.isArray(venue.required_audience_types)) return `Venue ${key} missing required_audience_types`;
        if (typeof venue.pacing_allowed !== 'boolean') return `Venue ${key} missing pacing_allowed`;
        if (!venue.capability_profile ||
            typeof venue.capability_profile.supports_multilingual !== 'boolean' ||
            typeof venue.capability_profile.supports_variants !== 'boolean' ||
            typeof venue.capability_profile.supports_tracking !== 'boolean' ||
            typeof venue.capability_profile.supports_custom_objectives !== 'boolean') {
            return `Venue ${key} missing or invalid capability_profile`;
        }
        if (!venue.sequencing || !Array.isArray(venue.sequencing.allowed_roles)) return `Venue ${key} missing sequencing.allowed_roles`;
    }
    return null;
}

function validateCompatibilityMatrix(matrix) {
    if (!matrix || typeof matrix !== 'object') return "Compatibility matrix missing or invalid";
    if (!matrix.objective_to_venue) return "Missing objective_to_venue";
    if (!matrix.creative_to_venue) return "Missing creative_to_venue";
    if (!matrix.audience_to_venue) return "Missing audience_to_venue";
    return null;
}

function validateConnectorRules(rules) {
    if (!rules || typeof rules !== 'object') return "Connector rules missing or invalid";
    for (const key in rules) {
        const venue = rules[key];
        if (!Array.isArray(venue.min_payload_fields)) return `Connector rules ${key} missing min_payload_fields`;
        if (!Array.isArray(venue.forbidden_fields)) return `Connector rules ${key} missing forbidden_fields`;
        if (!Array.isArray(venue.readiness_requirements)) return `Connector rules ${key} missing readiness_requirements`;
    }
    return null;
}

// Helper to sort object keys recursively for determinism
function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "policy_mirror_engine",
        timestamp,
        payload: null,
        error: { code, message }
    };
}

module.exports = {
    getPolicyMirror
};
