"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_GOOGLE_PHASE_3";
const FEATURE_FLAG = "FF_PIB_GOOGLE_PHASE_3";
const OUTPUT_CONTRACT_VERSION = "pib_google_phase_3_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(Google) Phase-3: Request Blueprint Generator
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_google_phase_3", {
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

        // 3. Core Logic: Blueprint Generation
        const ioSurface = input.io_surface;
        const blueprint = generateRequestBlueprint(ioSurface);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(blueprint);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            request_blueprint: blueprint,
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
        logStructured("pib_google_phase_3_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic: Blueprint Generation
// -----------------------------------------------------------------------------

function generateRequestBlueprint(ioSurface) {
    const rawOps = ioSurface.operations || [];

    // 4.1 Operations Table
    const operations = rawOps.map(op => ({
        operation: op.operation,
        google_api_method_ref: op.google_api_method_ref,
        payload_shape_ref: op.payload_shape_ref,
        idempotency_key_strategy: op.idempotency_key_strategy,
        requires_idempotency: op.idempotency_key_strategy !== "NONE"
    })).sort((a, b) => a.operation.localeCompare(b.operation));

    // 4.2 Idempotency Matrix
    const idempotencyMatrix = {};
    rawOps.forEach(op => {
        idempotencyMatrix[op.operation] = op.idempotency_key_strategy;
    });
    // Ensure matrix keys are sorted in output via canonical sorting, but for object construction order:
    // We can sort keys here to be nice, but canonicalHash handles it.
    // Spec says "Sort keys lexicographically".
    const sortedMatrix = {};
    Object.keys(idempotencyMatrix).sort().forEach(key => {
        sortedMatrix[key] = idempotencyMatrix[key];
    });

    // 4.3 Payload Registry
    const payloadRegistry = {};
    const shapeRefs = new Set();
    rawOps.forEach(op => {
        if (op.payload_shape_ref) shapeRefs.add(op.payload_shape_ref);
    });

    Array.from(shapeRefs).sort().forEach(ref => {
        payloadRegistry[ref] = {
            present: true,
            expansion_allowed: false
        };
    });

    return {
        operations: operations,
        idempotency_matrix: sortedMatrix,
        payload_registry: payloadRegistry
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

    // IO Surface Validation
    const ioSurface = input.io_surface;
    if (!ioSurface || typeof ioSurface !== "object") {
        return buildError(input, "MISSING_IO_SURFACE", "Missing or invalid io_surface", {}, executionId);
    }

    if (!Array.isArray(ioSurface.operations)) {
        return buildError(input, "INVALID_INPUT", "io_surface.operations must be an array", {}, executionId);
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
    logStructured("pib_google_phase_3_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_google_phase_3_processed", 1);
    if (type === "error") metrics.count("pib_google_phase_3_error", 1);
    if (type === "crash") metrics.count("pib_google_phase_3_crash", 1);
    if (type === "disabled") metrics.count("pib_google_phase_3_disabled", 1);
}

module.exports = { execute };
