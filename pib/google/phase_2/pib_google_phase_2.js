"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_GOOGLE_PHASE_2";
const FEATURE_FLAG = "FF_PIB_GOOGLE_PHASE_2";
const CONNECTOR_ID = "google_ads";
const OUTPUT_CONTRACT_VERSION = "pib_google_phase_2_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(Google) Phase-2: IO Surface Normalization
 * Deterministic, pure logic (NO IO).
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_google_phase_2", {
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

        // 3. Core Logic: IO Surface Normalization
        const contract = input.google_contract;
        const ioSurface = normalizeIOSurface(contract);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(ioSurface);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            io_surface: ioSurface,
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
        logStructured("pib_google_phase_2_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic: Normalization
// -----------------------------------------------------------------------------

function normalizeIOSurface(contract) {
    const ioSchema = contract.io_schema || {};
    const requestContract = ioSchema.request_contract || {};
    const errorMapping = ioSchema.error_mapping || {};
    const retryLogic = contract.retry_logic || {}; // Assuming retry_logic is at root or io_schema? Spec says "google_contract.retry_logic" implicitly via "Retry Logic Schema" section, but strict path isn't explicit in input. Usually root.
    // Wait, prompt 3.6 says "Extract deterministic retry_logic.policies". It doesn't explicitly say path in google_contract, but usually it's `contract.retry_logic`. Let's assume root based on usage.
    const routing = contract.routing || {};

    // 3.1 Operations Table
    const rawOps = requestContract.operations || [];
    const operations = rawOps.map(op => ({
        operation: op.operation,
        google_api_method_ref: op.google_api_method_ref,
        payload_shape_ref: op.payload_shape_ref,
        idempotency_key_strategy: op.idempotency_key_strategy
    })).sort((a, b) => a.operation.localeCompare(b.operation));

    // 3.2 Payload Shapes
    const payloadShapes = {};
    // Extract unique payload_shape_refs from operations to build the keys? 
    // Or does request_contract have a payload_shapes definitions?
    // Prompt 3.2 says: "Extract each referenced payload shape ID into: payload_shapes[payload_shape_ref] = {}".
    // This implies we scan operations for refs.
    // Ideally the contract has a dictionary of shapes.
    // But "No payload content expansion happens here. Only structural presence + deterministic ID ordering."
    // If the contract has `io_schema.payload_shapes`, we should probably use that keyset. 
    // If not, we infer from operations? 
    // Let's assume `io_schema.payload_shapes` exists, or we gather from ops.
    // Prompt says "Extract each referenced payload shape ID".
    // Let's gather from operations to be safe and deterministic based on usage.
    const shapeRefs = new Set();
    rawOps.forEach(op => {
        if (op.payload_shape_ref) shapeRefs.add(op.payload_shape_ref);
    });
    // If contract has definitions, maybe we should validate existence? 
    // But "No payload content expansion". 
    // Let's just create empty objects for the refs we find, or all definitions if available.
    // Let's assume we pull from definitions if present, or just refs.
    // Given "Extract each referenced payload shape ID", I'll iterate the ops.
    Array.from(shapeRefs).sort().forEach(ref => {
        payloadShapes[ref] = {};
    });

    // 3.3 Idempotency Strategy Table
    const idempotency = rawOps.map(op => ({
        operation: op.operation,
        strategy: op.idempotency_key_strategy
    })).sort((a, b) => a.operation.localeCompare(b.operation));

    // 3.4 Routing Profile
    const normsRouting = {
        default_endpoint: routing.default_endpoint,
        supports_batching: routing.supports_batching,
        max_batch_size: routing.max_batch_size,
        concurrency_limits: sortObjectKeys(routing.concurrency_limits || {}),
        rate_limit_hint: sortObjectKeys(routing.rate_limit_hint || {}),
        timeout_ms: sortObjectKeys(routing.timeout_ms || {})
    };

    // 3.5 Error Mapping Schema
    const normsErrorMapping = {
        google_domains: (errorMapping.google_domains || []).slice().sort((a, b) => a.google_domain.localeCompare(b.google_domain)),
        kaivo_error_codes: (errorMapping.kaivo_error_codes || []).slice().sort((a, b) => a.code.localeCompare(b.code))
    };

    // 3.6 Retry Logic Schema
    const normsRetryLogic = {
        policies: (retryLogic.policies || []).slice().sort((a, b) => a.id.localeCompare(b.id)),
        safe_abort_conditions: (retryLogic.safe_abort_conditions || []).slice().sort()
    };

    return {
        operations: operations,
        payload_shapes: payloadShapes,
        idempotency: idempotency,
        routing: normsRouting,
        error_mapping: normsErrorMapping,
        retry_logic: normsRetryLogic
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
    const contract = input.google_contract;
    if (!contract || typeof contract !== "object") {
        return buildError(input, "MISSING_FIELD", "Missing or invalid google_contract", {}, executionId);
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

    const retryLogic = contract.retry_logic;
    if (!retryLogic || typeof retryLogic !== "object") {
        return buildError(
            input,
            "MISSING_RETRY_LOGIC",
            "Missing or invalid retry_logic in google_contract",
            {},
            executionId
        );
    }

    if (!Array.isArray(retryLogic.policies) || !Array.isArray(retryLogic.safe_abort_conditions)) {
        return buildError(
            input,
            "CONTRACT_VIOLATION",
            "retry_logic must include arrays 'policies' and 'safe_abort_conditions'",
            {},
            executionId
        );
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

function sortObjectKeys(obj) {
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = obj[key];
    });
    return sorted;
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
    logStructured("pib_google_phase_2_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_google_phase_2_processed", 1);
    if (type === "error") metrics.count("pib_google_phase_2_error", 1);
    if (type === "crash") metrics.count("pib_google_phase_2_crash", 1);
    if (type === "disabled") metrics.count("pib_google_phase_2_disabled", 1);
}

module.exports = { execute };
