"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_GOOGLE_PHASE_5";
const FEATURE_FLAG = "FF_PIB_GOOGLE_PHASE_5";
const OUTPUT_CONTRACT_VERSION = "pib_google_phase_5_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(Google) Phase-5: Routing & Endpoint Binding
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_google_phase_5", {
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

        // 3. Core Logic: Routing Profile Extraction
        const ioSurface = input.io_surface;
        // validator_image is required by spec but not actually used for derivation in Phase 5 logic, 
        // as per "This phase consumes: validator_image... This phase produces: routing_profile (deterministically derived from the connector contract [io_surface])".
        // The prompt says "Used ONLY for routing/rate-limit retry logic extraction." refers to io_surface.
        // It implies validator_image is just passed through or checked? 
        // "This phase consumes: validator_image (from PIB-4)"
        // But the Output Shape does NOT include validator_image. It solely returns routing_profile.
        // So validator_image acts as a prerequisite check and possibly context for future binding, but for now we derive strictly from io_surface.

        const routingProfile = deriveRoutingProfile(ioSurface);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(routingProfile);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            routing_profile: routingProfile,
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
        logStructured("pib_google_phase_5_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic: Routing Profile Derivation
// -----------------------------------------------------------------------------

function deriveRoutingProfile(ioSurface) {
    const routing = ioSurface.routing || {};
    const retryLogic = ioSurface.retry_logic || {};

    // 1. Endpoint Binding
    const defaultEndpoint = routing.default_endpoint || null;

    // 2. Batching
    const batching = {
        supported: !!routing.supports_batching,
        max_batch_size: routing.max_batch_size || null
    };

    // 3. Concurrency (Deterministic Shallow Sort)
    const concurrencyLimits = sortObjectKeys(routing.concurrency_limits || {});

    // 4. Rate Limits (Deterministic Shallow Sort)
    const rateLimitHint = sortObjectKeys(routing.rate_limit_hint || {});

    // 5. Timeouts
    const timeouts = {
        connect_timeout_ms: (routing.timeout_ms && routing.timeout_ms.connect_timeout_ms) || null,
        read_timeout_ms: (routing.timeout_ms && routing.timeout_ms.read_timeout_ms) || null
    };

    // 6. Retry Alignment
    const rawPolicies = retryLogic.policies || [];
    const policies = rawPolicies.sort((a, b) => {
        // Sort lexicographically by ID (assuming ID exists as per Phase 2 extraction)
        // Fallback to empty string if missing? Should strict check? 
        // Phase 2 guarantees policies have IDs.
        const idA = a.id || "";
        const idB = b.id || "";
        return idA.localeCompare(idB);
    });

    const rawAbortConditions = retryLogic.safe_abort_conditions || [];
    const safeAbortConditions = rawAbortConditions.sort((a, b) => a.localeCompare(b));

    const retryAlignment = {
        policies: policies,
        safe_abort_conditions: safeAbortConditions
    };

    return {
        default_endpoint: defaultEndpoint,
        batching: batching,
        concurrency: { limits: concurrencyLimits },
        rate_limits: { hint: rateLimitHint },
        timeouts: timeouts,
        retry_alignment: retryAlignment
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

    // Feature Flag structure check (existence)
    if (!input.feature_flags) {
        return buildError(input, "INVALID_INPUT", "Missing feature_flags", {}, executionId);
    }

    // Validator Image Check
    if (!input.validator_image || typeof input.validator_image !== "object") {
        return buildError(input, "INVALID_INPUT", "Missing validator_image", {}, executionId);
    }

    // Google Contract Check (New in TP1)
    const contract = input.google_contract;
    if (!contract || typeof contract !== "object") {
        return buildError(input, "MISSING_CONTRACT", "Missing or invalid google_contract", {}, executionId);
    }

    if (contract.connector_id !== "google_ads") {
        return buildError(input, "CONTRACT_VIOLATION", "Invalid connector_id, expected google_ads", { actual: contract.connector_id }, executionId);
    }

    // Forbidden Check: connector_version
    if (contract.connector_version !== undefined) {
        return buildError(input, "CONTRACT_VIOLATION", "Field 'connector_version' is forbidden. Use 'version'.", {}, executionId);
    }

    // SemVer Check
    const semVerRegex = /^\d+\.\d+\.\d+$/;
    if (typeof contract.version !== "string" || !semVerRegex.test(contract.version)) {
        return buildError(input, "CONTRACT_VIOLATION", "Contract version must be a valid SemVer string (X.Y.Z)", { actual: contract.version }, executionId);
    }

    // Retry Logic Check (on Contract)
    if (!contract.retry_logic || typeof contract.retry_logic !== "object") {
        return buildError(input, "MISSING_RETRY_LOGIC", "google_contract.retry_logic is required", {}, executionId);
    }

    // IO Surface Check
    const ioSurface = input.io_surface;
    if (!ioSurface || typeof ioSurface !== "object") {
        return buildError(input, "MISSING_IO_SURFACE", "Missing or invalid io_surface", {}, executionId);
    }

    if (!ioSurface.routing) {
        return buildError(input, "MISSING_ROUTING", "io_surface.routing is missing", {}, executionId);
    }

    if (!ioSurface.retry_logic) {
        return buildError(input, "MISSING_RETRY_LOGIC", "io_surface.retry_logic is missing", {}, executionId);
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
    logStructured("pib_google_phase_5_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_google_phase_5_processed", 1);
    if (type === "error") metrics.count("pib_google_phase_5_error", 1);
    if (type === "crash") metrics.count("pib_google_phase_5_crash", 1);
    if (type === "disabled") metrics.count("pib_google_phase_5_disabled", 1);
}

module.exports = { execute };
