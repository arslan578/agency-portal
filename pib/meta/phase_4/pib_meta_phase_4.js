"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_META_PHASE_4";
const FEATURE_FLAG = "FF_PIB_META_PHASE_4";
const OUTPUT_CONTRACT_VERSION = "pib_meta_phase_4_output_v2";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(Meta) Phase-4: Validator Image + Transformation Engine Schema Plan (Composite)
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_meta_phase_4", {
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

        // 3. Core Logic
        const blueprint = input.request_blueprint;

        // 3.1 Validator Image (Google Mirror)
        const validatorImage = constructValidatorImage(blueprint);

        // 3.2 Transformation Engine Schema Plan (Meta Specific)
        const transformationSchema = constructTransformationSchema();

        // 4. Output Construction
        // Canonical Hash must include both parts
        const canonicalBody = {
            validator_image: validatorImage,
            transformation_engine_schema: transformationSchema
        };
        const canonicalHash = computeCanonicalHash(canonicalBody);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            validator_image: validatorImage,
            transformation_engine_schema: transformationSchema,
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
        logStructured("pib_meta_phase_4_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Part 1: Validator Image Construction (Google Mirror)
// -----------------------------------------------------------------------------

function constructValidatorImage(blueprint) {
    const rawOps = blueprint.operations || [];
    const registry = blueprint.payload_registry || {};
    const blueprintMatrix = blueprint.idempotency_matrix || {};

    const operations = rawOps.map(op => ({
        operation: op.operation,
        requires_idempotency: op.requires_idempotency,
        payload_shape_ref: op.payload_shape_ref || null,
        parameters: { required: [], optional: [] }
    })).sort((a, b) => a.operation.localeCompare(b.operation));

    const idempotencyMatrix = {};
    Object.keys(blueprintMatrix).sort().forEach(key => {
        idempotencyMatrix[key] = blueprintMatrix[key];
    });

    const payloadShapes = {};
    Object.keys(registry).sort().forEach(shapeId => {
        payloadShapes[shapeId] = {
            parameters: { required: [], optional: [] }
        };
    });

    return {
        operations: operations,
        idempotency_matrix: idempotencyMatrix,
        payload_shapes: payloadShapes
    };
}

// -----------------------------------------------------------------------------
// Part 2: Transformation Engine Schema Plan (Meta Implementation)
// -----------------------------------------------------------------------------

function constructTransformationSchema() {
    return {
        objective_map: {
            "KAIVO_AWARENESS": {
                meta_objective: "OUTCOME_AWARENESS",
                allowed_bidding_strategies: ["LOWEST_COST_WITHOUT_CAP", "BID_CAP"],
                required_parameters: ["billing_event"]
            },
            "KAIVO_TRAFFIC": {
                meta_objective: "OUTCOME_TRAFFIC",
                allowed_bidding_strategies: ["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "BID_CAP"],
                required_parameters: ["optimization_goal"]
            },
            "KAIVO_SALES": {
                meta_objective: "OUTCOME_SALES",
                allowed_bidding_strategies: ["LOWEST_COST_WITHOUT_CAP", "COST_CAP"],
                required_parameters: ["attribution_spec"]
            }
        },
        budget_normalization: {
            daily_budget: {
                min_cents: 100,
                currency_conversion_required: true
            },
            lifetime_budget: {
                min_cents: 100,
                start_time_required: true,
                end_time_required: true
            }
        },
        targeting_normalization: {
            age: {
                meta_field: "age_min, age_max",
                constraints: { min: 13, max: 65 }
            },
            geo: {
                meta_field: "geo_locations",
                required_subfields: ["countries"]
            },
            interests: {
                meta_field: "interests",
                max_items: 1000
            }
        },
        creative_normalization: {
            "KAIVO_IMAGE": {
                meta_format: "IMAGE",
                required_assets: ["image_hash"],
                optional_assets: ["title", "body"]
            },
            "KAIVO_VIDEO": {
                meta_format: "VIDEO",
                required_assets: ["video_id"],
                optional_assets: ["thumbnail_url"]
            }
        },
        hierarchy_decomposition: {
            campaign: {
                meta_level: "CAMPAIGN",
                contains: ["ad_set"],
                identity_propagation: true
            },
            ad_set: {
                meta_level: "ADSET",
                contains: ["ad"],
                identity_propagation: true
            },
            ad: {
                meta_level: "AD",
                contains: ["creative"],
                identity_propagation: false
            }
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

    for (const key of Object.keys(input)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${key}' is strictly forbidden.`, { field: key }, executionId);
        }
    }

    if (input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", `Invalid phase: expected '${PHASE_ID}', got '${input.phase}'`, {}, executionId);
    }

    const blueprint = input.request_blueprint;
    if (!blueprint || typeof blueprint !== "object") {
        return buildError(input, "MISSING_BLUEPRINT", "Missing or invalid request_blueprint", {}, executionId);
    }

    if (!Array.isArray(blueprint.operations)) {
        return buildError(input, "INVALID_INPUT", "request_blueprint.operations must be an array", {}, executionId);
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
// Observability
// -----------------------------------------------------------------------------

function logEvent(status, executionId) {
    logStructured("pib_meta_phase_4_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_meta_phase_4_processed", 1);
    if (type === "error") metrics.count("pib_meta_phase_4_error", 1);
    if (type === "crash") metrics.count("pib_meta_phase_4_crash", 1);
    if (type === "disabled") metrics.count("pib_meta_phase_4_disabled", 1);
}

module.exports = { execute };
