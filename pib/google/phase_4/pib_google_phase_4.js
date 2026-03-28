"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_GOOGLE_PHASE_4";
const FEATURE_FLAG = "FF_PIB_GOOGLE_PHASE_4";
const OUTPUT_CONTRACT_VERSION = "pib_google_phase_4_output_v2";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(Google) Phase-4: Validator Image + Transformation Engine Schema Plan (Composite)
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_google_phase_4", {
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

        // 3.1 Validator Image (Existing Logic)
        const validatorImage = constructValidatorImage(blueprint);

        // 3.2 Transformation Engine Schema Plan (New Logic)
        const transformationSchema = constructTransformationSchema();

        // 4. Output Construction
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
        logStructured("pib_google_phase_4_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Part 1: Validator Image Construction (Existing)
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
// Part 2: Transformation Engine Schema Plan (New - Google Specific)
// -----------------------------------------------------------------------------

function constructTransformationSchema() {
    return {
        objective_to_bidding: [
            {
                kaivo_objective: "SALES",
                google_campaign_type: "SEARCH",
                google_bidding_strategies: ["MAXIMIZE_CONVERSIONS", "TARGET_CPA", "TARGET_ROAS"],
                default_strategy: "MAXIMIZE_CONVERSIONS"
            },
            {
                kaivo_objective: "AWARENESS",
                google_campaign_type: "DISPLAY",
                google_bidding_strategies: ["MAXIMIZE_CONVERSIONS", "TARGET_CPA"],
                default_strategy: "MAXIMIZE_CONVERSIONS"
            },
            {
                kaivo_objective: "AWARENESS",
                google_campaign_type: "VIDEO",
                google_bidding_strategies: ["TARGET_CPM", "MAXIMIZE_REACH"],
                default_strategy: "TARGET_CPM"
            }
        ],
        budget_normalization: {
            modes: [
                {
                    kaivo_mode: "DAILY",
                    google_field: "daily_budget_micros",
                    min_micros_ref: "google_budget_min_daily_micros_v1"
                },
                {
                    kaivo_mode: "LIFETIME",
                    google_field: "amount_micros",
                    min_micros_ref: "google_budget_min_lifetime_micros_v1"
                }
            ],
            pacing_rules: [
                "STANDARD",
                "ACCELERATED"
            ]
        },
        targeting_normalization: {
            segments: [
                {
                    kaivo_segment: "LOCATION",
                    google_target_type: "geo_target",
                    required_fields: ["country_code"],
                    optional_fields: ["postal_code"],
                    policy_constraints_ref: "google_targeting_policy_rules_v1"
                },
                {
                    kaivo_segment: "KEYWORD",
                    google_target_type: "keyword",
                    required_fields: ["match_type", "text"]
                },
                {
                    kaivo_segment: "DEMOGRAPHIC",
                    google_target_type: "gender",
                    required_fields: ["type"]
                }
            ]
        },
        creative_normalization: {
            formats: [
                {
                    kaivo_creative_type: "SINGLE_IMAGE",
                    google_ad_type: "RESPONSIVE_DISPLAY_AD",
                    required_assets: ["image_asset_ref", "headline", "description"],
                    optional_assets: ["long_headline", "business_name"]
                },
                {
                    kaivo_creative_type: "VIDEO",
                    google_ad_type: "VIDEO_AD",
                    required_assets: ["video_asset_ref"],
                    optional_assets: ["companion_banner_asset_ref"]
                }
            ]
        },
        decomposition: {
            levels: [
                {
                    level: "CAMPAIGN",
                    google_entity: "campaign",
                    required_fields_ref: "google_campaign_required_fields_v1"
                },
                {
                    level: "AD_GROUP",
                    google_entity: "ad_group",
                    required_fields_ref: "google_ad_group_required_fields_v1"
                },
                {
                    level: "AD",
                    google_entity: "ad",
                    required_fields_ref: "google_ad_required_fields_v1"
                }
            ],
            identity_propagation_rules: [
                {
                    from_level: "CAMPAIGN",
                    to_level: "AD_GROUP",
                    field: "customer_id",
                    propagation_mode: "copy"
                }
            ]
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

    // Request Blueprint Validation
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
// Observability Helpers
// -----------------------------------------------------------------------------

function logEvent(status, executionId) {
    logStructured("pib_google_phase_4_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_google_phase_4_processed", 1);
    if (type === "error") metrics.count("pib_google_phase_4_error", 1);
    if (type === "crash") metrics.count("pib_google_phase_4_crash", 1);
    if (type === "disabled") metrics.count("pib_google_phase_4_disabled", 1);
}

module.exports = { execute };
