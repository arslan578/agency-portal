"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_TIKTOK_PHASE_8";
const FEATURE_FLAG = "FF_PIB_TIKTOK_PHASE_8";
const OUTPUT_CONTRACT_VERSION = "pib_tiktok_phase_8_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(TikTok) Phase-8: Deterministic Recorder Schema & Envelope Plan
 * Produces the canonical recording contract for all TikTok connector executions.
 * Pure logic (NO IO).
 */
function execute(input) {
    let span;
    try {
        span = tracing.startSpan(PHASE_ID);
        logStructured("pib_tiktok_phase_8_event", { phase: PHASE_ID, status: "START" });

        // 1. Validate Input
        const validationError = validateInput(input, input?.execution_id);
        if (validationError) {
            metrics.count("pib_tiktok_phase_8_error", 1, { code: validationError.errors[0].code });
            if (span) {
                span.setAttribute("status", "ERROR");
                span.end();
            }
            return validationError;
        }

        // 2. Feature Flag Check
        if (!input.feature_flags[FEATURE_FLAG]) {
            metrics.count("pib_tiktok_phase_8_disabled", 1);
            logStructured("pib_tiktok_phase_8_event", { phase: PHASE_ID, status: "NO_OP" });
            if (span) {
                span.setAttribute("status", "NO_OP");
                span.end();
            }
            return {
                status: "NO_OP",
                execution_id: input.execution_id,
                phase: PHASE_ID,
                message: "Feature flag disabled"
            };
        }

        // 3. Generate Recorder Schema
        const recorderSchema = generateRecorderSchema(input);

        // 4. Generate Envelope Plan
        const envelopePlan = generateEnvelopePlan(input);

        // 5. Compute Canonical Hash
        const canonicalBody = {
            recorder_schema: recorderSchema,
            envelope_plan: envelopePlan
        };
        const canonicalHash = computeCanonicalHash(canonicalBody);

        metrics.count("pib_tiktok_phase_8_processed", 1);
        logStructured("pib_tiktok_phase_8_event", { phase: PHASE_ID, status: "SUCCESS", hash: canonicalHash });

        if (span) {
            span.setAttribute("status", "OK");
            span.end();
        }

        return {
            status: "OK",
            execution_id: input.execution_id,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            recorder_schema: recorderSchema, // Keys sorted in generation
            envelope_plan: envelopePlan,     // Keys sorted in generation
            metadata: {
                canonical_hash: canonicalHash,
                derived_at: "DETERMINISTIC"
            }
        };

    } catch (error) {
        metrics.count("pib_tiktok_phase_8_crash", 1);
        logStructured("pib_tiktok_phase_8_error", { phase: PHASE_ID, error: error.message, stack: error.stack });
        if (span) {
            span.setAttribute("status", "ERROR");
            span.end();
        }
        return buildError(input, "INTERNAL_ERROR", `Crash in Phase 8: ${error.message}`, {}, input?.execution_id);
    }
}

function validateInput(input, executionId) {
    if (!input || typeof input !== "object") {
        return buildError(input, "INVALID_INPUT", "Input must be an object", {}, executionId);
    }

    // Check Forbidden Fields
    for (const field of FORBIDDEN_FIELDS) {
        if (input[field]) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${field}' is forbidden`, {}, executionId);
        }
    }

    // Phase Check
    if (input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", `Invalid phase: expected ${PHASE_ID}, got ${input.phase}`, {}, executionId);
    }

    // Feature Flags Check
    if (!input.feature_flags || typeof input.feature_flags !== "object") {
        return buildError(input, "INVALID_INPUT", "Missing or invalid feature_flags", {}, executionId);
    }

    // Dependencies Check
    const dependencies = [
        "request_blueprint",
        "validator_image",
        "routing_profile",
        "response_normalizer_spec",
        "error_resolver_spec"
    ];

    for (const dep of dependencies) {
        if (!input[dep] || typeof input[dep] !== "object") {
            return buildError(input, "MISSING_DEPENDENCY", `Missing or invalid dependency: ${dep}`, {}, executionId);
        }
    }

    // Request Blueprint Shape
    if (typeof input.request_blueprint.operation !== "string" || !input.request_blueprint.operation.trim()) {
        return buildError(input, "INVALID_REQUEST_BLUEPRINT", "request_blueprint.operation must be a non-empty string", {}, executionId);
    }

    // Response Normalizer Spec Shape
    if (!Array.isArray(input.response_normalizer_spec.operations)) {
        return buildError(input, "INVALID_NORMALIZER_SPEC", "response_normalizer_spec.operations must be an array", {}, executionId);
    }

    const requestedOp = input.request_blueprint.operation;
    const hasMatchingOp = input.response_normalizer_spec.operations.some(
        (o) => o && typeof o.operation === "string" && o.operation === requestedOp
    );

    if (!hasMatchingOp) {
        return buildError(
            input,
            "MISSING_OPERATION_SPEC",
            `No matching response_normalizer_spec entry for operation '${requestedOp}'`,
            { operation: requestedOp },
            executionId
        );
    }

    // Check Tenant Context
    if (!input.tenant_context || typeof input.tenant_context !== "object" || !input.tenant_context.tenant_id) {
        return buildError(input, "INVALID_INPUT", "Missing or invalid tenant_context", {}, executionId);
    }

    return null;
}

function generateRecorderSchema(input) {
    const {
        request_blueprint,
        validator_image,
        routing_profile,
        response_normalizer_spec,
        error_resolver_spec
    } = input;

    // PATCH 1.2: Remove "UNKNOWN" fallback
    // We rely on validateInput to guarantee `operation` exists and has P6 match.
    const operation = request_blueprint.operation;

    // PATCH 3: Routing Method Resolution
    const resolvedMethod =
        routing_profile && typeof routing_profile.method === "string" && routing_profile.method.trim()
            ? routing_profile.method
            : "POST";

    const requestSection = {
        operation_id: operation,
        payload_schema_ref: validator_image.payload_schema_ref || "UNKNOWN",
        routing_decision: {
            endpoint: routing_profile.default_endpoint,
            method: resolvedMethod
        },
        timestamp_placeholder: "DETERMINISTIC_TIMESTAMP",
        request_id_format: `REQ-${operation}`
    };

    // PATCH 2: Response Section Mirrors Phase 6
    const opSpec = (response_normalizer_spec.operations || []).find(
        (o) => o && typeof o.operation === "string" && o.operation === operation
    );

    // validateInput guarantees opSpec exists and has normalization_plan (or we default safe)
    // but strictly we use P6 rules.
    const normPlan = (opSpec && opSpec.normalization_plan) ? opSpec.normalization_plan : {};

    const responseSection = {
        strip_fields: normPlan.strip_fields || [],
        rename_map: normPlan.rename_map || {},
        drop_nulls: Boolean(normPlan.drop_nulls),
        normalize_timestamps: Boolean(normPlan.normalize_timestamps),
        normalize_ids: Boolean(normPlan.normalize_ids)
    };

    const errorSection = {
        fields: ["domain", "category", "retry_policy", "safe_abort"],
        determinism: "SORTED_KEYS",
        resolver_ref: error_resolver_spec.id || "UNKNOWN"
    };

    const metadataSection = {
        tenant_id: input.tenant_context.tenant_id,
        blueprint_id: request_blueprint.blueprint_id || "UNKNOWN",
        validator_hash: computeCanonicalHash(validator_image),
        routing_profile_hash: computeCanonicalHash(routing_profile),
        response_normalizer_hash: computeCanonicalHash(response_normalizer_spec),
        error_resolver_hash: computeCanonicalHash(error_resolver_spec)
    };

    return {
        request_section: sortObjectKeys(requestSection),
        response_section: sortObjectKeys(responseSection),
        error_section: sortObjectKeys(errorSection),
        metadata_section: sortObjectKeys(metadataSection)
    };
}

// PATCH 4: Envelope Plan as Canonical Shape
function generateEnvelopePlan(input) {
    const executionId = input.execution_id || "UNKNOWN";
    const tenantId = input.tenant_context && input.tenant_context.tenant_id
        ? input.tenant_context.tenant_id
        : "UNKNOWN";

    const envelopePlan = {
        envelope_shape: {
            envelope_id: `ENVELOPE-${executionId}`,
            connector_id: "tiktok_ads", // TikTok Specific
            tenant_id: tenantId,
            execution_id: executionId,
            phase: PHASE_ID,
            request: {
                section: "request_section",
                type: "OBJECT"
            },
            response: {
                section: "response_section",
                type: "OBJECT"
            },
            error: {
                section: "error_section",
                type: "OBJECT"
            },
            metadata: {
                section: "metadata_section",
                type: "OBJECT"
            }
        },
        canonicalization_rules: {
            sort_keys: true,
            stable_array_sort: true,
            drop_forbidden_fields: true,
            enforce_type_normalization: true,
            no_optional_behavior: true
        },
        forbidden_fields: ["_debug", "debug_info", "internal_only"],
        compression_plan: {
            algorithm: "DEFLATE",
            level: 5,
            stable: true
        },
        hash_algorithm: "sha256"
    };

    return sortObjectKeys(envelopePlan);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function buildError(input, code, message, details = {}, executionId) {
    return {
        status: "ERROR",
        execution_id: executionId || "UNKNOWN",
        phase: PHASE_ID,
        errors: [{
            code: code,
            message: message,
            details: details
        }]
    };
}

function sortObjectKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    } else if (obj !== null && typeof obj === 'object') {
        const sorted = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = sortObjectKeys(obj[key]);
        });
        return sorted;
    }
    return obj;
}

function computeCanonicalHash(data) {
    const canonicalJson = JSON.stringify(sortObjectKeys(data));
    return crypto.createHash("sha256").update(canonicalJson).digest("hex");
}

module.exports = { execute };
