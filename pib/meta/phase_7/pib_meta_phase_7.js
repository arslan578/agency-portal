"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_META_PHASE_7";
const FEATURE_FLAG = "FF_PIB_META_PHASE_7";
const OUTPUT_CONTRACT_VERSION = "pib_meta_phase_7_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];
const FALLBACK_CATEGORY = "PLATFORM_ERROR";

/**
 * PIB(Meta) Phase-7: Error Resolver & Retry Strategy
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_meta_phase_7", {
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

        // 3. Core Logic: Error Resolver Spec Generation
        const resolverSpec = generateErrorResolverSpec(input);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(resolverSpec);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            error_resolver_spec: resolverSpec,
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
        logStructured("pib_meta_phase_7_crash", { execution_id: executionId, error: err.stack });
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

function generateErrorResolverSpec(input) {
    const routingProfile = input.routing_profile;
    const normSpec = input.response_normalizer_spec;

    // 4.1 DOMAIN -> CATEGORY MAP
    // Use exactly the map provided by PIB-6
    const sourceMap = normSpec.error_mapping_plan.google_domain_to_category || {};
    const domainCategoryMap = sortObjectKeys(sourceMap);

    // 4.2 CATEGORY SET CONSTRUCTION
    // 1) domain_category_map.values
    const domainCategories = Object.values(domainCategoryMap);

    // 2) routing_profile.retry_alignment.safe_abort_conditions
    // Ensure sorted for determinism later, though Set handles uniqueness.
    const safeAborts = routingProfile.retry_alignment.safe_abort_conditions || [];

    // 3) add "PLATFORM_ERROR"
    const categorySet = new Set([...domainCategories, ...safeAborts, FALLBACK_CATEGORY]);

    // Convert to sorted array for deterministic iteration
    const sortedCategories = Array.from(categorySet).sort();

    // 4.3 CATEGORY -> RETRY POLICY RESOLUTION
    const categoryToRetryPolicy = {};

    // Pre-sort policies lexicographically by id for deterministic default selection
    const sortedPolicies = [...(routingProfile.retry_alignment.policies || [])].sort((a, b) => {
        const idA = (a.id || "").localeCompare(b.id || "");
        const idB = (b.id || "").localeCompare(a.id || "");
        return idA - idB;
    });
    const policyIds = new Set(sortedPolicies.map(p => p.id));

    // Default policy id (may be undefined if no policies)
    const defaultPolicyId = sortedPolicies.length > 0 ? sortedPolicies[0].id : null;
    const safeAbortSet = new Set(safeAborts);

    for (const category of sortedCategories) {
        let retryPolicy = null;

        if (safeAbortSet.has(category)) {
            // Safe abort always wins: never retry
            retryPolicy = null;
        } else if (policyIds.has(category)) {
            // Exact category -> policy match
            retryPolicy = category;
        } else if (defaultPolicyId) {
            // Fallback to deterministic default policy when any policies exist
            retryPolicy = defaultPolicyId;
        } else {
            // No policies at all -> no retry for this category
            retryPolicy = null;
        }

        categoryToRetryPolicy[category] = retryPolicy;
    }

    // 4.4 SAFE ABORT CATEGORIES
    const safeAbortCategories = [...safeAborts].sort();

    return {
        domain_category_map: domainCategoryMap,
        resolver_rules: {
            category_to_retry_policy: sortObjectKeys(categoryToRetryPolicy),
            safe_abort_categories: safeAbortCategories,
            fallback_category: FALLBACK_CATEGORY
        }
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

    // Feature Flags - Missing entirely -> INVALID_INPUT
    if (!input.feature_flags) {
        return buildError(input, "INVALID_INPUT", "Missing feature_flags", {}, executionId);
    }

    // Structural Validation
    if (!input.io_surface || typeof input.io_surface !== "object") {
        return buildError(input, "MISSING_IO_SURFACE", "Missing or invalid io_surface", {}, executionId);
    }
    if (!input.io_surface.error_mapping) {
        return buildError(input, "MISSING_ERROR_MAPPING", "io_surface.error_mapping is missing", {}, executionId);
    }

    if (!input.routing_profile || typeof input.routing_profile !== "object") {
        return buildError(input, "MISSING_ROUTING_PROFILE", "Missing or invalid routing_profile", {}, executionId);
    }

    if (!input.response_normalizer_spec || typeof input.response_normalizer_spec !== "object") {
        return buildError(input, "MISSING_RESPONSE_NORMALIZER", "Missing or invalid response_normalizer_spec", {}, executionId);
    }
    if (!input.response_normalizer_spec.error_mapping_plan) {
        return buildError(input, "MISSING_ERROR_MAPPING_PLAN", "response_normalizer_spec.error_mapping_plan is missing", {}, executionId);
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
    logStructured("pib_meta_phase_7_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_meta_phase_7_processed", 1);
    if (type === "error") metrics.count("pib_meta_phase_7_error", 1);
    if (type === "crash") metrics.count("pib_meta_phase_7_crash", 1);
    if (type === "disabled") metrics.count("pib_meta_phase_7_disabled", 1);
}

module.exports = { execute };
