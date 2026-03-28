"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_GOOGLE_PHASE_8";
const FEATURE_FLAG = "FF_PIB_GOOGLE_PHASE_8";
const OUTPUT_CONTRACT_VERSION = "pib_google_phase_8_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(Google) Phase-8: Deterministic Recorder Schema & Envelope Plan
 * Produces the canonical recording contract for all Google connector executions.
 * Pure logic (NO IO).
 */
function execute(input) {
    let span;
    try {
        span = tracing.startSpan(PHASE_ID);
        logStructured("pib_google_phase_8_event", { phase: PHASE_ID, status: "START" });

        // 1. Validate Input
        const validationError = validateInput(input, input?.execution_id);
        if (validationError) {
            metrics.count("pib_google_phase_8_error", 1, { code: validationError.errors[0].code });
            if (span) {
                span.setAttribute("status", "ERROR");
                span.end();
            }
            return validationError;
        }

        // 2. Feature Flag Check
        if (!input.feature_flags[FEATURE_FLAG]) {
            metrics.count("pib_google_phase_8_disabled", 1);
            logStructured("pib_google_phase_8_event", { phase: PHASE_ID, status: "NO_OP" });
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

        metrics.count("pib_google_phase_8_processed", 1);
        logStructured("pib_google_phase_8_event", { phase: PHASE_ID, status: "SUCCESS", hash: canonicalHash });

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
        metrics.count("pib_google_phase_8_crash", 1);
        logStructured("pib_google_phase_8_error", { phase: PHASE_ID, error: error.message, stack: error.stack });
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
    // We are validating specifically for the single operation flow implied by 'request_blueprint.operation' in Patch 1 instructions.
    // However, the previous remediation was multi-operation.
    // The Patch 1 instructions explicitly reference 'input.request_blueprint.operation' as a single string.
    // But P3 output (which I remediated to) had 'operations' array.
    // Wait. Patch 1 Prompt says:
    // "Phase 8 currently treats the operation as: const operation = request_blueprint.operation || "UNKNOWN";"
    // "1.1 Tighten validateInput... if (typeof input.request_blueprint.operation !== "string"..."
    // This implies that Phase 8 is built for a SINGLE operation execution context (which makes sense for a single execution ID).
    // The P3 Blueprint *generator* (Phase 3) generates a blueprint having *all* operations?
    // Let's re-read P3 code. P3 generates `request_blueprint` containing `operations` array.
    // BUT the prompt assumes `request_blueprint.operation` is present.
    // This implies that between P3 end and P8 start, something selected *the* operation?
    // Or did I misunderstand P3 output?
    // P3 output: `request_blueprint: { operations: ..., ... }`
    // The prompt says "request_blueprint: { ... } // From Phase-3".
    // If P3 output has 'operations' array, then `request_blueprint.operation` would be undefined.
    // BUT the patch instructions are extremely specific:
    // "if (typeof input.request_blueprint.operation !== 'string' ... return INVALID_REQUEST_BLUEPRINT"
    // This implies that the input to Phase 8 *must* have `.operation`.
    // If Phase 3 executes for *all* operations, then Phase 8 runs for *one*?
    // Or likely, `request_blueprint` in Phase 8 input is actually the P3 *output* PLUS context of which operation is being executed?
    // The prompt says "Input keys... request_blueprint (from Phase-3)".
    // If the patch insists on `.operation` being a string, I must enforce it.
    // I will assume the input object structure has `request_blueprint` which HAS `.operation`.
    // It is possible the `request_blueprint` passed to P8 is a *specific* blueprint for one op?
    // No, P3 returns a "Request Blueprint" artifact.
    // Let's look at the Patch 1 text again: "Phase 8 currently treats the operation as: `request_blueprint.operation`".
    // My previous code (Remediated Phase 8) was iterating over `request_blueprint.operations`.
    // The PATCH instruction scolds: "Phase 8 currently treats the operation as... [legacy single op code]".
    // Wait, my *original* Phase 8 code (before remediation) did `request_blueprint.operation`.
    // The *manual remediation* I did in step 972 changed it to `operations` array iteration because I saw P3 had an array.
    // BUT the *User Request* Step 992 ("SURGICAL PATCH PACKET") explicitly quotes the code `const operation = request_blueprint.operation` and says "Fix this to be strict".
    // It treats `request_blueprint` as having a single `operation`.
    // This implies the contract for P8 input expects a single operation context.
    // If so, `request_blueprint` passed to P8 might be *augmented* or is a specific *instance* of a blueprint request?
    // But P3 output is the Registry.
    // Maybe `request_blueprint` *is* the Registry, and we are supposed to validate that we are running for *an* operation?
    // The Prompt says: "request_blueprint: { ... } // From Phase-3".
    // P3 Output: `request_blueprint: { operations: [...] }`.
    // There is a conflict between P3 actual output and P8 Patch expectation if P8 expects `.operation`.
    // UNLESS the P8 input is constructed such that `request_blueprint` contains the selection?
    // OR, more likely, the User Patch assumes the typical case where `request_blueprint` has the *intent* (single op).
    // Let's look at P1-P7. P1-P7 are "setup" phases. P8 is "Recorder".
    // Recorder records *an execution*. An execution is single-op.
    // So the input to P8 *should* know which operation it is recording.
    // The patch says: `const requestedOp = input.request_blueprint.operation;`
    // I will FOLLOW THE PATCH STRICTLY. If this mismatches P3 output shape (array vs string), then the input to P8 is not *raw* P3 output, but P3 output *plus* selection?
    // Or maybe P3 *should* have had `.operation`? No, P3 is a Blueprint for the whole connector.
    // Valid Interpretation: The `input` to P8 includes `request_blueprint` which is the P3 artifact, BUT the patch implies we look for `.operation` on it.
    // This suggests I should modify P8 to expect `request_blueprint.operation` string.
    // If P3 doesn't provide it, then my test case (which I control) needs to provide it.
    // Implicitly, the `request_blueprint` passed to P8 is *augmented* or is a specific *instance* of a blueprint request?
    // Use strict compliance with the patch. The patch says to check `input.request_blueprint.operation`. I will do so.

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
            connector_id: "google_ads",
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
