/**
 * PIB-META-PHASE-11: Activation Checkpoint & Connector Promotion
 *
 * Strict deterministic gatekeeper for Connector Activation.
 * Validates stability across Phases 1-10:
 * 1. Capability Mirror Stability
 * 2. IO Layer Drift (Phases 2-7)
 * 3. Safety Horizon Stability
 * 4. Replay Stability (Phases 8-10)
 * 5. Policy Mirror Equivalence
 *
 * Output: Activation Status (ACTIVE | INACTIVE)
 */

const crypto = require('crypto');

// --- CONSTANTS ---
const PHASE_ID = "PIB_META_PHASE_11";
const OUTPUT_VERSION = "pib_meta_phase_11_output_v1";

const REQUIRED_INPUTS = [
    "capability_surface",
    "io_surface",
    "request_blueprint",
    "validator_image",
    "routing_profile",
    "response_normalizer_spec",
    "error_resolver_spec",
    "recorder_schema",
    "envelope_plan",
    "safety_horizon_binding",
    "replay_validation_record"
];

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

const UNSAFE_RISK_LEVELS = ["CRITICAL", "BLOCKING", "UNSAFE"];

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

    // 3.1 Feature Flag
    if (input.feature_flags && input.feature_flags.FF_PIB_META_PHASE_11 === false) {
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

    // 3.2 Wrong Phase
    if (input.phase && input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", "Wrong phase");
    }

    // 3.3 Required Inputs
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

    return null; // OK
}

function execute(input) {
    const errorOrNoOp = validateInput(input);

    // Handle NO_OP
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
        capability_surface,
        io_surface,
        request_blueprint,
        validator_image,
        routing_profile,
        response_normalizer_spec,
        error_resolver_spec,
        recorder_schema,
        // envelope_plan unused directly but verified present
        safety_horizon_binding,
        replay_validation_record
    } = input;

    const eid = execution_id || "UNKNOWN";

    // --- DRIFT CHECKS ---

    // 3.4 Capability Mirror Stability
    if (!recorder_schema.capability_surface_ref) {
        return buildError(input, "CAPABILITY_MIRROR_DRIFT", "Missing capability_surface_ref in recorder_schema");
    }
    const capHash = sha256(canonicalize(capability_surface));
    const refHash = sha256(canonicalize(recorder_schema.capability_surface_ref));

    if (capHash !== refHash) {
        return buildError(input, "CAPABILITY_MIRROR_DRIFT", "Capability surface mismatch with recorder schema ref");
    }

    // 3.5 IO Layer Drift Check
    const ioCheckList = [
        { obj: io_surface, name: "io_surface" },
        { obj: request_blueprint, name: "request_blueprint" },
        { obj: validator_image, name: "validator_image" },
        { obj: routing_profile, name: "routing_profile" },
        { obj: response_normalizer_spec, name: "response_normalizer_spec" },
        { obj: error_resolver_spec, name: "error_resolver_spec" }
    ];

    for (const item of ioCheckList) {
        const refKey = `${item.name}_ref`;
        const refObj = recorder_schema[refKey];
        if (!refObj) {
            return buildError(input, "IO_LAYER_DRIFT", `Missing ${refKey} in recorder_schema`);
        }

        const h1 = sha256(canonicalize(item.obj));
        const h2 = sha256(canonicalize(refObj));

        if (h1 !== h2) {
            return buildError(input, "IO_LAYER_DRIFT", `Drift detected in ${item.name}`);
        }
    }

    // 3.6 Safety Horizon Stability
    const risk = safety_horizon_binding.global_risk_profile.policy_exposure;
    if (UNSAFE_RISK_LEVELS.includes(risk)) {
        return buildError(input, "SAFETY_HORIZON_UNSAFE", `Risk level ${risk} is unsafe for activation`);
    }

    // 3.7 Replay Stability
    if (replay_validation_record.replay_safe !== true || replay_validation_record.time_travel_safe !== true) {
        return buildError(input, "REPLAY_UNSAFE", "Replay or Time Travel verification failed");
    }

    // Counterfactual
    if (replay_validation_record.counterfactual_safe === false) {
        const bp = replay_validation_record.counterfactual_blueprint;
        if (!bp || !bp.overrides || Object.keys(bp.overrides).length === 0) {
            return buildError(input, "COUNTERFACTUAL_UNSAFE", "Counterfactual unsafe and no overrides found");
        }
    }

    // 3.8 Policy Mirror Equivalence
    const pol1 = sha256(canonicalize(routing_profile.policy_mirror));
    const pol2 = sha256(canonicalize(safety_horizon_binding.policy_mirror));

    if (pol1 !== pol2) {
        return buildError(input, "POLICY_MIRROR_DRIFT", "Policy mirror mismatch");
    }

    // 4. Output Contract
    const output = {
        status: "OK",
        execution_id: eid,
        phase: PHASE_ID,
        output_contract_version: OUTPUT_VERSION,
        activation_status: "ACTIVE",
        activation_details: {
            capability_mirror_stable: true,
            io_layer_stable: true,
            safety_horizon_stable: true,
            replay_stable: true,
            policy_mirror_stable: true,
            drift_detected: false
        },
        metadata: {
            derived_at: "DETERMINISTIC"
        }
    };

    const sorted = sortObjectKeys(output);
    sorted.metadata.canonical_hash = sha256(canonicalize(sorted));

    return sorted;
}

module.exports = { execute };
