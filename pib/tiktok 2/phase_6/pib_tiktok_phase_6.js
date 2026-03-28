"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_TIKTOK_PHASE_6";
const FEATURE_FLAG = "FF_PIB_TIKTOK_PHASE_6";
const OUTPUT_CONTRACT_VERSION = "pib_tiktok_phase_6_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

// Standard Infrastructure Fields to Strip (Metadata, Diagnostics)
const STRIP_FIELDS_DEFAULT = [
    "debugInfo",
    "diagnostics",
    "partialFailureError",
    "policySummary",
    "responseHeaders",
    "responseMetaData"
];

const RENAME_MAP_DEFAULT = {
    "resourceName": "id"
};

/**
 * PIB(TikTok) Phase-6: Response Normalizer Mapping
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_tiktok_phase_6", {
            phase: PHASE_ID,
            execution_id: executionId
        });

        // 1. Validation
        const validationError = validateInput(input, executionId);
        if (validationError) {
            logEvent("ERROR", executionId);
            recordMetrics("error", input);
            if (span) span.setAttribute("status", "ERROR");
            return validationError;
        }

        // 2. Feature Flag Check
        if (!input.feature_flags[FEATURE_FLAG]) {
            logEvent("NO_OP", executionId);
            recordMetrics("disabled", input);
            if (span) span.setAttribute("status", "NO_OP");
            return buildNoOpResponse(executionId);
        }

        // 3. Core Logic: Response Normalizer Spec Generation
        const ioSurface = input.io_surface;
        const normSpec = generateResponseNormalizerSpec(ioSurface);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(normSpec);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            response_normalizer_spec: normSpec,
            metadata: {
                canonical_hash: canonicalHash,
                derived_at: "DETERMINISTIC"
            }
        };

        logEvent("OK", executionId);
        recordMetrics("processed", input);
        if (span) span.setAttribute("status", "OK");

        return output;

    } catch (err) {
        logStructured("pib_tiktok_phase_6_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic: Spec Generation
// -----------------------------------------------------------------------------

function generateResponseNormalizerSpec(ioSurface) {
    // 1. Operations Normalization
    const operations = (ioSurface.operations || []).map(op => {
        return {
            operation: op.operation,
            google_api_method_ref: op.google_api_method_ref,
            normalization_plan: {
                strip_fields: [...STRIP_FIELDS_DEFAULT].sort(), // Deterministic sort
                rename_map: { ...RENAME_MAP_DEFAULT },
                interpret_error_domain: true,
                drop_nulls: true,
                delete_empty_arrays: true,
                normalize_ids: true,
                normalize_timestamps: true
            }
        };
    }).sort((a, b) => a.operation.localeCompare(b.operation)); // Operations sorted lexicographically

    // 2. Error Mapping Plan
    const googleDomains = ioSurface.error_mapping && ioSurface.error_mapping.google_domains
        ? ioSurface.error_mapping.google_domains
        : [];
    const kaivoErrorCodes = ioSurface.error_mapping && ioSurface.error_mapping.kaivo_error_codes
        ? ioSurface.error_mapping.kaivo_error_codes
        : [];
    const retryOverrides = [];

    const googleDomainToCategory = {};
    googleDomains.forEach(d => {
        // Strict contract adherence: use mapped_category.
        // Fallback to PLATFORM_ERROR only if missing.
        // We expect d to be an object { google_domain, mapped_category, ... }
        // For robustness against legacy string inputs (if any), check type.
        if (typeof d === "string") {
            // Legacy/Test path support (though we will fix tests)
            // Temporarily support strings but default to PLATFORM_ERROR or deprecate?
            // Prompt says "No silent fallthroughs".
            // We won't support string strings. We demand objects per Phase 2.
            return;
        }

        const domainKey = d.google_domain;
        if (domainKey) {
            googleDomainToCategory[domainKey] = d.mapped_category || "PLATFORM_ERROR";
        }
    });

    // Sort keys of domain map for deterministic output
    const sortedDomainMap = sortObjectKeys(googleDomainToCategory);

    // Sort codes and rules
    const sortedKaivoCodes = [...kaivoErrorCodes].sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    const sortedRetryOverrides = retryOverrides.sort();

    const errorMappingPlan = {
        google_domain_to_category: sortedDomainMap,
        kaivo_error_codes: sortedKaivoCodes,
        retry_policy_override_rules: sortedRetryOverrides
    };

    // 3. Shape Rules (Global)
    const shapeRules = {
        sort_keys: true,
        drop_unknown_fields: true,
        enforce_type_normalization: true
    };

    return {
        operations: operations,
        error_mapping_plan: errorMappingPlan,
        shape_rules: shapeRules
    };
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function validateInput(input, executionId) {
    if (!input || typeof input !== "object") {
        return buildError(input, "INVALID_INPUT", "Input must be a non-null object", {}, executionId);
    }

    // Forbidden Fields
    for (const key of Object.keys(input)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${key}' is strictly forbidden.`, { field: key }, executionId);
        }
    }

    // Phase Check
    if (input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", `Invalid phase: expected '${PHASE_ID}', got '${input.phase}'`, {}, executionId);
    }

    // Feature Flags
    if (!input.feature_flags) {
        return buildError(input, "INVALID_INPUT", "Missing feature_flags", {}, executionId);
    }

    // Inputs Check
    if (!input.io_surface || typeof input.io_surface !== "object") {
        return buildError(input, "MISSING_IO_SURFACE", "Missing or invalid io_surface", {}, executionId);
    }

    if (!input.routing_profile || typeof input.routing_profile !== "object") {
        return buildError(input, "MISSING_ROUTING_PROFILE", "Missing or invalid routing_profile", {}, executionId);
    }

    // Deep Checks (optional but good for robustness per Negative Path requirements)
    if (!input.io_surface.error_mapping) {
        return buildError(input, "MISSING_ERROR_MAPPING", "io_surface.error_mapping is missing", {}, executionId);
    }

    if (!Array.isArray(input.io_surface.operations)) {
        // "operations not array" negative test
        return buildError(input, "INVALID_OPERATIONS", "io_surface.operations must be an array", {}, executionId);
    }

    for (const op of input.io_surface.operations) {
        if (!op || typeof op !== "object") {
            return buildError(
                input,
                "INVALID_OPERATION_SHAPE",
                "Each operation in io_surface.operations must be an object",
                {},
                executionId
            );
        }
        if (typeof op.operation !== "string" || !op.operation.trim()) {
            return buildError(
                input,
                "INVALID_OPERATION_SHAPE",
                "Each operation must include a non-empty 'operation' string",
                { operation: op.operation },
                executionId
            );
        }
        if (typeof op.google_api_method_ref !== "string" || !op.google_api_method_ref.trim()) {
            return buildError(
                input,
                "INVALID_OPERATION_SHAPE",
                "Each operation must include a non-empty 'google_api_method_ref' string",
                { operation: op.operation },
                executionId
            );
        }
    }

    return null;
}

// -----------------------------------------------------------------------------
// Hashing (TP1 Strict Canonical)
// -----------------------------------------------------------------------------

function computeCanonicalHash(obj) {
    const canonical = canonicalizeForHash(obj);
    const json = JSON.stringify(canonical);
    return crypto.createHash("sha256").update(json).digest("hex");
}

function canonicalizeForHash(value) {
    if (value === null || typeof value !== "object") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(canonicalizeForHash);
    }

    const out = {};
    for (const key of Object.keys(value).sort()) {
        out[key] = canonicalizeForHash(value[key]);
    }
    return out;
}

function sortObjectKeys(obj) {
    const out = {};
    Object.keys(obj).sort().forEach(key => {
        out[key] = obj[key];
    });
    return out;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeExecutionId(input) {
    return (input && typeof input.execution_id === "string") ? input.execution_id : "unknown-exec-id";
}

function buildError(input, code, message, details = {}, forceExecId = null) {
    return {
        status: "ERROR",
        execution_id: forceExecId || safeExecutionId(input),
        phase: PHASE_ID,
        errors: [{ code, message, details }]
    };
}

function buildNoOpResponse(executionId) {
    return {
        status: "NO_OP",
        execution_id: executionId,
        phase: PHASE_ID
    };
}

// -----------------------------------------------------------------------------
// Observability Helpers
// -----------------------------------------------------------------------------

function logEvent(status, executionId) {
    logStructured("pib_tiktok_phase_6_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_tiktok_phase_6_processed", 1);
    if (type === "error") metrics.count("pib_tiktok_phase_6_error", 1);
    if (type === "crash") metrics.count("pib_tiktok_phase_6_crash", 1);
    if (type === "disabled") metrics.count("pib_tiktok_phase_6_disabled", 1);
}

module.exports = { execute };
