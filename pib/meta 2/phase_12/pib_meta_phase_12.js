/**
 * PIB-META-PHASE-12: Connector Readiness Certificate (CRC) Generator
 *
 * Purpose:
 * Produce the Connector Readiness Certificate (CRC) that authorizes the Meta PIB branch
 * to be merged into the OS and enables Kaivo to treat the Meta connector as production eligible.
 *
 * PIB-12 (Meta) is the only phase allowed to certify:
 * 1. All PIB phase outputs (1 to 11) are hash stable.
 * 2. No drift exists across the safety spine.
 * 3. All promotion conditions are satisfied.
 * 4. The Meta connector may be inserted into the Connector Registry (OS-65).
 *
 * Output: Readiness Certificate (READY_FOR_MERGE)
 */

const crypto = require('crypto');

// --- CONSTANTS ---
const PHASE_ID = "PIB_META_PHASE_12";
const OUTPUT_VERSION = "pib_meta_phase_12_output_v1";

const REQUIRED_INPUTS = [
    "execution_id",
    "phase",
    "feature_flags",
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
    "replay_validation_record",
    "activation_checkpoint_record",
    "pib_phase_hashes"
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
        execution_id: eid,
        phase: PHASE_ID,
        errors: [
            {
                code,
                message,
                details
            }
        ]
    };
}

// --- CORE LOGIC ---

function validateInput(input) {
    if (!input || typeof input !== "object") {
        return buildError(null, "INVALID_INPUT", "Input must be an object");
    }

    // Feature Flag
    if (input.feature_flags && input.feature_flags.FF_PIB_META_PHASE_12 === false) {
        return "NO_OP";
    }
    // Note: Required fields check below handles missing feature_flags object, 
    // but the spec says "If !input.feature_flags -> INVALID_INPUT".
    // We can do strictly what spec says for flags here or rely on REQUIRED_INPUTS.
    // Spec task 2 says: "If feature_flags.FF_PIB_META_PHASE_12 === false then return... "
    // But Test Group 2 says: "Missing feature_flags -> INVALID_INPUT".
    // "Missing each required dependency -> MISSING_DEPENDENCY".
    // There is a slight overlap. Usually checking "Missing feature_flags -> INVALID_INPUT" is a specific guard.
    if (!input.feature_flags) {
        return buildError(input, "INVALID_INPUT", "Missing feature_flags");
    }

    // Forbidden Fields
    for (const field of FORBIDDEN_FIELDS) {
        if (field in input) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${field}' is strictly forbidden`);
        }
    }

    // Phase Check
    if (input.phase && input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", "Wrong phase");
    }

    // Required Inputs
    for (const field of REQUIRED_INPUTS) {
        // Exception: execution_id and phase are strings, others are objects
        // The Spec says "Required dependencies (listed in section 1): ... pib_phase_hashes"
        // Also "If any ... missing -> MISSING_DEPENDENCY".
        // Use loose check for values?
        // Spec 1. Required Input Shape lists types.
        // Task 2: "Required fields (listed in section 1)..."
        // "Missing each required dependency (one at a time) -> MISSING_DEPENDENCY".
        // Note: 'phase' and 'execution_id' are primitives.
        const value = input[field];
        if (value === undefined || value === null) {
            return buildError(
                input,
                "MISSING_DEPENDENCY",
                `Missing required input: ${field}`,
                { missing: field }
            );
        }
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
        capability_surface,
        io_surface,
        request_blueprint,
        validator_image,
        routing_profile,
        response_normalizer_spec,
        error_resolver_spec,
        recorder_schema,
        // envelope_plan unused strictly but check for presence is done
        safety_horizon_binding,
        replay_validation_record,
        // activation_checkpoint_record unused strictly but check for presence is done
        pib_phase_hashes
    } = input;

    const eid = execution_id || "UNKNOWN";

    // 3.1 Capability Mirror Stability
    // Hash(cap) vs Hash(ref)
    if (!recorder_schema.capability_surface_ref) {
        return buildError(input, "CAPABILITY_MIRROR_DRIFT", "Missing capability_surface_ref");
    }
    const hash_cap_surface = sha256(canonicalize(capability_surface));
    const hash_cap_ref = sha256(canonicalize(recorder_schema.capability_surface_ref));

    if (hash_cap_surface !== hash_cap_ref) {
        return buildError(input, "CAPABILITY_MIRROR_DRIFT", "Capability surface mismatch");
    }

    // 3.2 IO Layer Stability
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

    // 3.3 Safety Horizon Stability
    const exposure = safety_horizon_binding.global_risk_profile.policy_exposure;
    if (UNSAFE_RISK_LEVELS.includes(exposure)) {
        return buildError(input, "SAFETY_HORIZON_UNSAFE", `Risk level ${exposure} is unsafe`);
    }

    // 3.4 Replay Stability
    if (replay_validation_record.replay_safe !== true || replay_validation_record.time_travel_safe !== true) {
        return buildError(input, "REPLAY_UNSAFE", "Replay or Time Travel verification failed");
    }

    if (replay_validation_record.counterfactual_safe === false) {
        const bp = replay_validation_record.counterfactual_blueprint; // Note: Assuming input object has it or we check overrides existence
        // Spec says: "If replay_validation_record.counterfactual_blueprint is missing, or .overrides is missing or empty"
        // Wait, does replay_validation_record (from input) have .counterfactual_blueprint?
        // See Phase 11 discussion. Input to Phase 12 includes `replay_validation_record` from Phase 10 output.
        // Phase 10 Output DOES NOT include `counterfactual_blueprint`.
        // However, PIB-12 (Meta) Spec explicitly says: "replay_validation_record.counterfactual_blueprint.overrides".
        // This likely implies we need to be able to access it. 
        // If it's missing from the record, we must fail?
        // Or did we assume `replay_validation_record` was ENRICHED between P10 and P12?
        //
        // Let's assume strict compliance with the prompt provided for Phase 12.
        // check `replay_validation_record.counterfactual_blueprint`.

        if (!replay_validation_record.counterfactual_blueprint ||
            !replay_validation_record.counterfactual_blueprint.overrides ||
            Object.keys(replay_validation_record.counterfactual_blueprint.overrides).length === 0) {
            return buildError(input, "COUNTERFACTUAL_UNSAFE", "Counterfactual unsafe and no overrides found");
        }
    }

    // 3.5 Policy Mirror Stability
    const h1 = sha256(canonicalize(routing_profile.policy_mirror));
    const h2 = sha256(canonicalize(safety_horizon_binding.policy_mirror));
    if (h1 !== h2) {
        return buildError(input, "POLICY_MIRROR_DRIFT", "Policy mirror mismatch");
    }

    // 3.6 PIB Hash Chain Stability
    // Check phases 1 to 11
    for (let i = 1; i <= 11; i++) {
        const key = String(i);
        const ph = pib_phase_hashes[key];
        if (!ph || typeof ph.canonical_hash !== "string" || ph.canonical_hash.length === 0) {
            return buildError(input, "MISSING_PIB_PHASE_HASH", `Missing or malformed hash for Phase ${i}`);
        }
    }

    const version = recorder_schema.connector_version;
    // Spec: "version supplied via recorder_schema.connector_version" (assumed present)

    const readiness_certificate_structure = {
        connector_id: "meta_ads",
        version: version,
        pib_phase_hashes: pib_phase_hashes,
        safety_horizon_binding: safety_horizon_binding,
        replay_validation_record: replay_validation_record,
        policy_mirror: routing_profile.policy_mirror
    };

    // calculate readiness_hash
    const readiness_hash = sha256(canonicalize(readiness_certificate_structure));

    // 4. Final Output
    const readiness_certificate = {
        connector_id: "meta_ads",
        version: version,
        promotion_status: "READY_FOR_MERGE",
        pib_phase_hashes: pib_phase_hashes,
        readiness_hash: readiness_hash,

        // Stability Guarantees
        capability_mirror_stable: true,
        io_layer_stable: true,
        safety_horizon_stable: true,
        replay_stable: true,
        policy_mirror_stable: true,
        drift_detected: false,

        // References
        capability_surface_ref: recorder_schema.capability_surface_ref,
        policy_mirror_ref: routing_profile.policy_mirror, // Based on equivalence check
        io_layer_contract_ref: recorder_schema.io_surface_ref, // or generic io ref? Spec says "io_layer_contract_ref". 
        // Spec 2. Output Contract just lists "io_layer_contract_ref". 
        // Is it io_surface_ref? Let's use io_surface_ref as it represents the contract.
        safety_horizon_ref: safety_horizon_binding, // or ref? Spec lists it.
        replay_validation_ref: replay_validation_record
    };

    // Actually, let's double check what "ref" means here.
    // It likely means pointing to the object involved in the certificate.
    // Spec says: "capability_surface_ref, policy_mirror_ref, io_layer_contract_ref, safety_horizon_ref, replay_validation_ref".
    // I will map them to the corresponding stable input objects or schema/refs.
    // "io_layer_contract_ref" likely maps to `recorder_schema.io_surface_ref` (the contract).
    readiness_certificate.io_layer_contract_ref = recorder_schema.io_surface_ref;
    readiness_certificate.safety_horizon_ref = safety_horizon_binding; // The binding accepted
    readiness_certificate.replay_validation_ref = replay_validation_record; // The record accepted
    readiness_certificate.policy_mirror_ref = routing_profile.policy_mirror;

    const output = {
        status: "OK",
        execution_id: eid,
        phase: PHASE_ID,
        output_contract_version: OUTPUT_VERSION,
        readiness_certificate: readiness_certificate,
        metadata: {
            derived_at: "DETERMINISTIC"
        }
    };

    const sortedOutput = sortObjectKeys(output);
    const hash = sha256(canonicalize(sortedOutput));
    sortedOutput.metadata.canonical_hash = hash;

    return sortedOutput;
}

module.exports = { execute };
