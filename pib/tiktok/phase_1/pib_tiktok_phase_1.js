"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_TIKTOK_PHASE_1";
const FEATURE_FLAG = "FF_PIB_TIKTOK_PHASE_1";
const CONNECTOR_ID = "tiktok_ads";
const OUTPUT_CONTRACT_VERSION = "pib_tiktok_phase_1_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(TikTok) Phase-1: Connector Contract Ingestion + Capability Surface Registration
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_tiktok_phase_1", {
            phase: PHASE_ID,
            execution_id: executionId
        });

        // 1. Validation
        const validationError = validateInput(input, executionId);
        if (validationError) {
            logEvent("ERROR", executionId, 0);
            recordMetrics("error", input);
            if (span) span.setAttribute("status", "ERROR");
            return validationError;
        }

        // 2. Feature Flag Check
        if (!input.feature_flags[FEATURE_FLAG]) {
            logEvent("NO_OP", executionId, 0);
            recordMetrics("disabled", input);
            if (span) span.setAttribute("status", "NO_OP");
            return buildNoOpResponse(executionId);
        }

        // 3. Core Logic: Capability Extraction
        const contract = input.tiktok_contract;
        const capabilitySurface = extractCapabilitySurface(contract);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(capabilitySurface);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            capability_surface: capabilitySurface,
            metadata: {
                canonical_hash: canonicalHash,
                derived_at: "DETERMINISTIC"
            }
        };

        logEvent("OK", executionId, countCapabilities(capabilitySurface));
        recordMetrics("processed", input);
        if (span) span.setAttribute("status", "OK");

        return output;

    } catch (err) {
        logStructured("pib_tiktok_phase_1_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic: Extraction
// -----------------------------------------------------------------------------

function extractCapabilitySurface(contract) {
    const caps = contract.capabilities;
    const constraints = contract.constraints;
    const routing = contract.routing;
    const ioSchema = contract.io_schema;

    // 4.1 Channels
    // Using default lexical sort (stable for strings)
    const channels = (caps.channels || []).slice().sort();

    // 4.2 Campaign Types
    const campaignTypes = (caps.campaign_types || []).map(ct => ({
        id: ct.id,
        channel: ct.channel,
        allowed_objectives: sortArray(ct.allowed_objectives),
        allowed_bidding_strategies: sortArray(ct.allowed_bidding_strategies),
        surfaces: sortArray(ct.surfaces),
        phase_support: ct.phase_support
    })).sort((a, b) => a.id.localeCompare(b.id));

    // 4.3 Bidding Strategies
    const biddingStrategies = (caps.bidding_strategies || []).map(bs => ({
        id: bs.id,
        requires_target_value: bs.requires_target_value,
        supported_channels: sortArray(bs.supported_channels)
    })).sort((a, b) => a.id.localeCompare(b.id));

    // 4.4 Targeting Modes
    const targetingModes = (caps.targeting && caps.targeting.segments ? caps.targeting.segments : []).map(sg => ({
        id: sg.id,
        required_for_campaign_types: sortArray(sg.required_for_campaign_types),
        supports_negative_targets: sg.supports_negative_targets
    })).sort((a, b) => a.id.localeCompare(b.id));

    // 4.5 Creative Formats
    const creativeFormats = (caps.creative_formats || []).map(cf => ({
        id: cf.id,
        channels: sortArray(cf.channels),
        required_assets: sortArray(cf.required_assets),
        optional_assets: sortArray(cf.optional_assets)
    })).sort((a, b) => a.id.localeCompare(b.id));

    // 4.6 Constraints
    const extractedConstraints = {
        budget_policies: (constraints.budget && constraints.budget.policies ? constraints.budget.policies : []).slice().sort((a, b) => a.id.localeCompare(b.id)),
        category_rules: (constraints.categories && constraints.categories.sensitive_categories ? constraints.categories.sensitive_categories : []).slice().sort(),
        region_rules: constraints.regions || {}
    };

    return {
        channels: channels,
        campaign_types: campaignTypes,
        bidding_strategies: biddingStrategies,
        targeting_modes: targetingModes,
        creative_formats: creativeFormats,
        constraints: extractedConstraints,
        routing: routing,
        routing_profile_ref: routing.profile_id,
        error_mapping_ref: ioSchema.error_mapping ? ioSchema.error_mapping.id : undefined
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

    // Contract Validation
    const contract = input.tiktok_contract;
    if (!contract || typeof contract !== "object") {
        return buildError(input, "MISSING_FIELD", "Missing or invalid tiktok_contract", {}, executionId);
    }

    if (contract.connector_id !== CONNECTOR_ID) {
        return buildError(input, "CONTRACT_VIOLATION", `Invalid connector_id: expected '${CONNECTOR_ID}', got '${contract.connector_id}'`, {}, executionId);
    }

    if (contract.connector_version !== undefined) {
        return buildError(input, "CONTRACT_VIOLATION", "Forbidden field 'connector_version' present in contract.", {}, executionId);
    }

    if (!contract.version || typeof contract.version !== "string" || !/^\d+\.\d+\.\d+$/.test(contract.version)) {
        return buildError(input, "CONTRACT_VIOLATION", "Missing or invalid semver 'version' in contract", {}, executionId);
    }

    return null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeExecutionId(input) {
    return (input && typeof input.execution_id === "string") ? input.execution_id : "unknown-exec-id";
}

function sortArray(arr) {
    if (!arr) return [];
    return arr.slice().sort();
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

function countCapabilities(caps) {
    return (caps.channels ? caps.channels.length : 0) +
        (caps.campaign_types ? caps.campaign_types.length : 0);
}

// -----------------------------------------------------------------------------
// Observability Helpers
// -----------------------------------------------------------------------------

function logEvent(status, executionId, count) {
    logStructured("pib_tiktok_phase_1_event", {
        execution_id: executionId,
        status: status,
        capability_elements: count
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_tiktok_phase_1_processed", 1);
    if (type === "error") metrics.count("pib_tiktok_phase_1_error", 1);
    if (type === "crash") metrics.count("pib_tiktok_phase_1_crash", 1);
    if (type === "disabled") metrics.count("pib_tiktok_phase_1_disabled", 1);
}

module.exports = { execute };
