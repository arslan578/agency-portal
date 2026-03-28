/**
 * PIB-GOOGLE-PHASE-10: Replay Grounding & Execution Validation
 *
 * Strict validation of connector runtime safety across:
 * 1. Replay Grounding (Schema/Envelope binding)
 * 2. Deterministic Replay Safety (Hash drift check)
 * 3. Counterfactual Compatibility (Override check)
 * 4. Time-Travel Reconstructability (State reconstruction check)
 * 5. Audit Ledger Registration (Strict ledger entry)
 *
 * Usage:
 * const result = phase10.execute(input);
 */

const crypto = require('crypto');

// --- CONSTANTS ---
const PHASE_ID = "PIB_GOOGLE_PHASE_10";
const OUTPUT_VERSION = "pib_google_phase_10_output_v1";

const REQUIRED_INPUTS = [
    "recorder_schema",
    "envelope_plan",
    "safety_horizon_binding",
    "deterministic_replay_material",
    "counterfactual_blueprint",
    "time_travel_material",
    "audit_ledger_context"
];

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

// --- UTILS ---

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== "object") {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

function canonicalize(obj) {
    return JSON.stringify(sortObjectKeys(obj));
}

function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function buildError(input, code, message, details = {}) {
    const eid = input && typeof input.execution_id === "string"
        ? input.execution_id
        : "UNKNOWN";

    return {
        status: "ERROR",
        code,
        details,
        execution_id: eid,
        phase: PHASE_ID
    };
}

// --- CORE LOGIC ---

function validateInput(input) {
    if (!input || typeof input !== "object") {
        return buildError(null, "INVALID_INPUT", "Input must be an object");
    }

    // Check Feature Flag
    if (input.feature_flags && input.feature_flags.FF_PIB_GOOGLE_PHASE_10 === false) {
        return "NO_OP";
    }
    if (!input.feature_flags) {
        return buildError(input, "INVALID_INPUT", "Missing feature_flags");
    }

    // Forbidden Fields
    for (const field of FORBIDDEN_FIELDS) {
        if (field in input) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${field}' is strictly forbidden`);
        }
    }

    // Required Dependencies
    for (const field of REQUIRED_INPUTS) {
        const value = input[field];
        if (!value || typeof value !== "object") {
            return buildError(
                input,
                "MISSING_DEPENDENCY",
                `Missing or invalid required input: ${field}`,
                { missing: field }
            );
        }
    }

    // Correct Phase Check: Zero inference.
    // Spec: If input.phase exists AND input.phase !== PHASE_ID, return INVALID_INPUT.
    if (input.phase && input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", "Wrong phase");
    }

    return null; // OK
}


function execute(input) {
    const errorOrNoOp = validateInput(input);
    if (errorOrNoOp === "NO_OP") {
        const eid = input && typeof input.execution_id === "string"
            ? input.execution_id
            : "UNKNOWN";

        return {
            status: "NO_OP",
            execution_id: eid,
            phase: PHASE_ID
        };
    }
    if (errorOrNoOp) return errorOrNoOp;

    const {
        execution_id,
        recorder_schema,
        envelope_plan,
        safety_horizon_binding,
        deterministic_replay_material,
        counterfactual_blueprint,
        time_travel_material,
        audit_ledger_context
    } = input;

    const eid = execution_id || "UNKNOWN";

    // 3.1 Replay Grounding
    const envShape = envelope_plan.envelope_shape;
    if (!envShape || !envShape.request || !envShape.response || !envShape.error || !envShape.metadata) {
        return { status: "ERROR", code: "INVALID_ENVELOPE_PATTERN", details: { reason: "Missing envelope sections" }, execution_id: eid, phase: PHASE_ID };
    }

    // Verify sections map to recorder schema
    const reqKey = envShape.request.section;
    const resKey = envShape.response.section;
    const errKey = envShape.error.section;
    const metaKey = envShape.metadata.section;

    if (!recorder_schema[reqKey] || !recorder_schema[resKey] || !recorder_schema[errKey] || !recorder_schema[metaKey]) {
        return { status: "ERROR", code: "INVALID_ENVELOPE_PATTERN", details: { reason: "Envelope sections map to missing schema" }, execution_id: eid, phase: PHASE_ID };
    }

    const request_schema_ref = recorder_schema[reqKey].payload_schema_ref;
    const response_schema_ref = recorder_schema[resKey].payload_schema_ref;
    const error_schema_ref = recorder_schema[errKey].payload_schema_ref;
    const metadata_schema_ref = recorder_schema[metaKey].payload_schema_ref;

    const grounding_snapshot = {
        request_schema_ref,
        response_schema_ref,
        error_schema_ref,
        metadata_schema_ref,
        // MUST include envelope_shape to match replay_material hash if strict equality is enforced
        envelope_shape: envShape,
        envelope_binding: {
            connector_id: envShape.connector_id,
            tenant_id: envShape.tenant_id,
            phase: PHASE_ID
        }
    };

    const ground_hash = sha256(canonicalize(sortObjectKeys(grounding_snapshot)));

    // 3.2 Deterministic Replay Safety
    const replay_hash = sha256(canonicalize(sortObjectKeys(deterministic_replay_material)));

    // Check for structural drift (naive object comparison via canonical string)
    // "replay_material.envelope_shape !== envelope_plan.envelope_shape"

    // Strengthened Structural Drift Rule
    if (!deterministic_replay_material.envelope_shape) {
        return {
            status: "ERROR",
            code: "REPLAY_DRIFT",
            details: { reason: "Missing envelope_shape in replay material" },
            execution_id: eid,
            phase: PHASE_ID
        };
    }

    const replayShapeStr = canonicalize(sortObjectKeys(deterministic_replay_material.envelope_shape));
    const envelopeShapeStr = canonicalize(sortObjectKeys(envelope_plan.envelope_shape));

    // Drift conditions
    if (replayShapeStr !== envelopeShapeStr || replay_hash !== ground_hash) {
        return {
            status: "ERROR",
            code: "REPLAY_DRIFT",
            details: {
                baseline_hash: ground_hash,
                replay_hash: replay_hash
            },
            execution_id: eid,
            phase: PHASE_ID
        };
    }

    // 3.3 Counterfactual Compatibility
    const counterfactual_hash = sha256(canonicalize(sortObjectKeys(counterfactual_blueprint)));
    const overrides = counterfactual_blueprint.overrides;
    const hasOverrides = overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0;

    // Incompatible if overrides empty AND hash mismatch
    if (!hasOverrides && counterfactual_hash !== replay_hash) {
        return {
            status: "ERROR",
            code: "COUNTERFACTUAL_INCOMPATIBLE",
            details: {
                expected_hash: replay_hash,
                actual_hash: counterfactual_hash
            },
            execution_id: eid,
            phase: PHASE_ID
        };
    }

    // 3.4 Time-Travel Reconstructability
    const time_travel_hash = sha256(canonicalize(sortObjectKeys(time_travel_material)));

    if (time_travel_hash !== replay_hash) {
        return {
            status: "ERROR",
            code: "TIME_TRAVEL_UNSAFE",
            details: {
                replay_hash,
                time_travel_hash
            },
            execution_id: eid,
            phase: PHASE_ID
        };
    }

    // 3.5 Audit Ledger Registration
    const ledgerEntry = {
        scenario_type: "BASELINE",
        ground_sha256: ground_hash,
        replay_sha256: replay_hash,
        counterfactual_sha256: counterfactual_hash,
        time_travel_sha256: time_travel_hash,

        policy_summary: safety_horizon_binding.global_risk_profile.policy_exposure,

        safety_summary_ref: "OPERATION_SAFETY",
        safety_summary: sortObjectKeys(safety_horizon_binding.operation_safety),

        trace_delta_ref: audit_ledger_context.trace_delta_ref
    };

    // 4. Final Output
    const output = {
        status: "OK",
        execution_id: eid,
        phase: PHASE_ID,
        output_contract_version: OUTPUT_VERSION,
        replay_validation_record: {
            ground_hash,
            replay_hash,
            counterfactual_hash,
            time_travel_hash,
            replay_safe: (replay_hash === ground_hash),
            counterfactual_safe: (counterfactual_hash === replay_hash),
            time_travel_safe: (time_travel_hash === replay_hash),
            audit_ledger_entry: sortObjectKeys(ledgerEntry)
        },
        metadata: {
            // Placeholder for canonical hash, computed below
            derived_at: "DETERMINISTIC"
        }
    };

    const sortedOutput = sortObjectKeys(output);
    const hash = sha256(canonicalize(sortedOutput));
    sortedOutput.metadata.canonical_hash = hash;

    return sortedOutput;
}

module.exports = { execute };
