"use strict";

const { logStructured } = require("../../orchestrator/shared/logging");
const metrics = require("../../orchestrator/shared/metrics");
const tracing = require("../../orchestrator/shared/tracing");

const PHASE_ID = "OS-65";
const FEATURE_FLAG = "FF_OS_CONNECTOR_REGISTRY";
const INTENT_NAME = "os_65_connector_registry";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

const OUTPUT_CONTRACT_VERSION = "os_65_connector_registry_output_v1";
const ALLOWED_LIFECYCLE_STATUSES = ["ACTIVE", "DEPRECATED", "EXPERIMENTAL", "DISABLED", "SUPPORTED_PHASE_2"];

/**
 * OS-65: Connector Registry
 * Source of truth for connector definitions.
 */
const decoder = require("./os_65_connector_registration_decoder");

function execute(input) {
    if (input && input.connector_registration_packet) {
        return decoder.execute(input);
    }
    let span;
    const executionId = safeExecutionId(input);

    try {
        // Observability
        // Use INTENT_NAME as per review
        span = tracing.startSpan(INTENT_NAME, {
            phase: PHASE_ID,
            execution_id: executionId
        });

        // Input Validation
        const validationError = validateInputShape(input, executionId);
        if (validationError) {
            logStructured("os_65_validation_error", { execution_id: executionId, error: validationError });
            recordMetrics("errors", input);
            if (span) span.setAttribute("status", "ERROR");
            return validationError;
        }

        // Feature Flag Check
        if (!isFeatureFlagEnabled(input)) {
            // Updated to use consistent event name and 'disabled' metric as per canonical spec
            logStructured("os_65_connector_registry_event", {
                execution_id: executionId,
                status: "NO_OP",
                intent: INTENT_NAME,
                connector_count: 0,
                errors: 0
            });
            recordMetrics("disabled", input);
            if (span) span.setAttribute("status", "NO_OP");
            return buildNoOpResponse(executionId);
        }

        // Core Logic: Registry Construction
        const processingResult = processRegistry(input.connector_definitions, executionId);

        if (processingResult.error) {
            const errOutput = buildError(input, "VALIDATION_ERROR", processingResult.error.message, processingResult.error.details, executionId);
            logStructured("os_65_connector_registry_event", {
                execution_id: executionId,
                status: "ERROR",
                intent: INTENT_NAME,
                connector_count: 0,
                errors: 1
            });
            recordMetrics("errors", input);
            if (span) span.setAttribute("status", "ERROR");
            return errOutput;
        }

        const registry = processingResult.registry;

        // Output Construction
        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            registry: {
                connectors: registry
            }
        };

        if (span) span.setAttribute("status", "OK");

        logStructured("os_65_connector_registry_event", {
            execution_id: executionId,
            status: "OK",
            intent: INTENT_NAME,
            connector_count: registry.length,
            errors: 0
        });
        recordMetrics("processed", input);

        return output;

    } catch (err) {
        // Trap unexpected
        logStructured("os_65_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        recordMetrics("errors", input);

        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic
// -----------------------------------------------------------------------------

function processRegistry(definitions, executionId) {
    // 1. Convert to Array
    // 2. Sort
    // 3. Deep Copy & Seal
    // 4. Validate along the way

    const entries = [];
    const keys = Object.keys(definitions).sort(); // Sort keys for deterministic iteration order?
    // Actually, prompt says: "Convert connector_definitions object -> array", "Sort array deterministically"

    for (const key of keys) {
        const def = definitions[key];

        // Validate
        const valErr = validateConnector(def, key);
        if (valErr) {
            return { error: valErr };
        }

        // Deep copy properties with deterministic sorting
        let copy;
        try {
            copy = canonicalize(def);
        } catch (e) {
            return { error: { message: `Serialization failed for ${key}`, details: { error: e.message } } };
        }

        // The validateConnector function already checks for unknown fields (Section 6.2).
        // processRegistry loop validates BEFORE copy.
        // However, we must ensure 'copy' contains ONLY the known fields if we want to "Strip unknown fields" (Section 8.4).
        // But Section 6.2 says "Unknown fields trigger ERROR".
        // If we strictly fail on known fields, stripping isn't needed (input is rejected).
        // But prompt 8.4 says "Strip unknown fields". This suggests we might need to support inputs with extra fields IF they are not inside the definition?
        // No, "Unknown fields in connector definitions triggers ERROR" (Section 6.2).
        // Let's stick to strict validation. If verified, then canonicalize simply copies the valid structure.

        entries.push(copy);
    }

    // Sort lexicographically by: 1. connector_id, 2. version
    entries.sort((a, b) => {
        const idCmp = a.connector_id.localeCompare(b.connector_id);
        if (idCmp !== 0) return idCmp;
        const vA = a.version || "0.0.0";
        const vB = b.version || "0.0.0";
        return vA.localeCompare(vB);
    });

    return { registry: entries };
}

function canonicalize(obj) {
    // Strict JSON compatibility check
    if (typeof obj === 'function' || typeof obj === 'symbol' || typeof obj === 'undefined') {
        throw new Error(`Data contains non-JSON compatible type: ${typeof obj}`);
    }
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(canonicalize);

    // Sort keys
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = canonicalize(obj[key]);
    });
    return sorted;
}

function validateConnector(def, key) {
    if (!def || typeof def !== 'object') return { message: `Definition for ${key} must be an object` };

    // Forbidden fields check
    for (const f of FORBIDDEN_FIELDS) {
        if (def[f] !== undefined) return { message: `Connector ${key} contains forbidden field ${f}` };
    }

    // Version check (Strict singular version)
    // VIOLATION FIX: connector_version IS NOT ALLOWED.
    // Backplane 27B: "Every connector MUST expose a singular version field in x.y.z semantic format. Legacy or auxiliary synonyms MUST NOT appear."
    if (def.connector_version !== undefined) {
        return { message: `Connector ${key} must not include deprecated field 'connector_version'. Use 'version' only.` };
    }

    // Known fields only check
    const known = [
        "connector_id",
        "version",
        "backplane_contract_version",
        "os_registry_contract",
        "intent_name",
        "feature_flag",
        "capability_hash",
        "lifecycle_status",
        "supported_environments",
        "owner",
        "description",
        "backplane_fields",
        "capabilities",
        "constraints",
        "io_schema",
        "routing",
        "safety_profile",
        "knowledge_sources",
        "metadata"
    ];

    for (const k of Object.keys(def)) {
        if (!known.includes(k)) return { message: `Connector ${key} contains unknown field ${k}` };
    }

    // Required fields check
    if (!def.connector_id || typeof def.connector_id !== 'string' || def.connector_id.length === 0) {
        return { message: `Connector ${key} missing valid connector_id` };
    }

    // HARDENING: Key/ID Consistency
    if (def.connector_id !== key) {
        return { message: `Connector key '${key}' must match connector_id '${def.connector_id}'` };
    }

    // HARDENING: Lifecycle Status
    if (def.lifecycle_status && !ALLOWED_LIFECYCLE_STATUSES.includes(def.lifecycle_status)) {
        return { message: `Connector ${key} has invalid lifecycle_status '${def.lifecycle_status}'` };
    }

    // HARDENING: lifecycle_status verified above.

    // Version format check
    if (!def.version || typeof def.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(def.version)) {
        return { message: `Connector ${key} missing valid semver 'version' field (expected x.y.z)` };
    }
    if (!def.capabilities || typeof def.capabilities !== 'object') {
        return { message: `Connector ${key} missing valid capabilities object` };
    }
    if (!def.constraints || typeof def.constraints !== 'object') {
        return { message: `Connector ${key} missing valid constraints object` };
    }
    if (!def.metadata || typeof def.metadata !== 'object') {
        return { message: `Connector ${key} missing valid metadata object` };
    }

    return null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeExecutionId(input) {
    if (input && typeof input.execution_id === "string" && input.execution_id.length > 0) {
        return input.execution_id;
    }
    return "unknown-exec-id";
}

function validateInputShape(input, executionId) {
    if (!input || typeof input !== "object") {
        return buildError(input, "INVALID_INPUT", "Input must be a non-null object", {}, executionId);
    }

    const ALLOWED_TOP_LEVEL_FIELDS = new Set([
        "execution_id",
        "phase",
        "feature_flags",
        "tenant_context",
        "connector_definitions",
        "metadata", // Listed as optional in contract
        "version"   // Listed as optional in contract
    ]);

    for (const key of Object.keys(input)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${key}' is strictly forbidden.`, { field: key }, executionId);
        }
        if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
            return buildError(
                input,
                "UNKNOWN_FIELD",
                `Top-level field '${key}' is not allowed in OS-65 input.`,
                { field: key },
                executionId
            );
        }
    }

    const required = [
        { key: "execution_id", type: "string" },
        { key: "phase", type: "string" },
        { key: "feature_flags", type: "object" },
        { key: "tenant_context", type: "object" },
        { key: "connector_definitions", type: "object" }
    ];

    for (const req of required) {
        if (input[req.key] === undefined) {
            return buildError(input, "MISSING_FIELD", `Required field '${req.key}' is missing.`, { field: req.key }, executionId);
        }
        if (typeof input[req.key] !== req.type) {
            return buildError(input, "INVALID_FIELD_TYPE", `Field '${req.key}' must be of type ${req.type}.`, { field: req.key }, executionId);
        }
    }

    if (input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", `Invalid phase: expected '${PHASE_ID}', got '${input.phase}'`, {}, executionId);
    }

    return null;
}

function isFeatureFlagEnabled(input) {
    return input.feature_flags && input.feature_flags[FEATURE_FLAG] === true;
}

function buildNoOpResponse(executionId) {
    return {
        status: "NO_OP",
        execution_id: executionId,
        phase: PHASE_ID
    };
}

function buildError(input, code, message, details = {}, forceExecId = null) {
    return {
        status: "ERROR",
        execution_id: forceExecId || safeExecutionId(input),
        phase: PHASE_ID,
        errors: [{
            code,
            message,
            details
        }]
    };
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("os_65_registry_processed", 1);
    if (type === "errors") metrics.count("os_65_registry_errors", 1);
    if (type === "crash") metrics.count("os_65_registry_crash", 1);
    if (type === "disabled") metrics.count("os_65_registry_disabled", 1);
}

module.exports = { execute };
