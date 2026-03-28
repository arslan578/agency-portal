/**
 * PIB-GOOGLE-PHASE-12: Connector Readiness Certificate (CRC) Generator
 *
 * The final gatekeeper for the Google Connector.
 * Certifies stability, safety, and hash integrity across Phases 1-11.
 * Produces the Connector Readiness Certificate (CRC) for OS-65 registration.
 *
 * Output: promotion_status: "READY_FOR_MERGE" | Errors
 */

const crypto = require('crypto');

// --- CONSTANTS ---
const PHASE_ID = "PIB_GOOGLE_PHASE_12";
const OUTPUT_VERSION = "pib_google_phase_12_output_v1";

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

    // Feature Flag
    if (input.feature_flags && input.feature_flags.FF_PIB_GOOGLE_PHASE_12 === false) {
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

    // Phase Check
    if (input.phase && input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", "Wrong phase");
    }

    // Required Inputs
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
        // envelope_plan unused directly but checked presence
        safety_horizon_binding,
        replay_validation_record,
        activation_checkpoint_record, // checked presence
        pib_phase_hashes
    } = input;

    const eid = execution_id || "UNKNOWN";
    const errors = [];

    // --- 3.1 Capability Mirror Stability ---
    if (!recorder_schema.capability_surface_ref) {
        errors.push({ code: "CAPABILITY_MIRROR_DRIFT", message: "Missing capability_surface_ref in schema" });
    } else {
        const hashCap = sha256(canonicalize(capability_surface));
        const hashRef = sha256(canonicalize(recorder_schema.capability_surface_ref));
        if (hashCap !== hashRef) {
            errors.push({ code: "CAPABILITY_MIRROR_DRIFT", message: "Capability surface mismatch" });
        }
    }

    // --- 3.2 IO Layer Stability ---
    const ioCheckList = [
        { obj: io_surface, name: "io_surface" },
        { obj: request_blueprint, name: "request_blueprint" },
        { obj: validator_image, name: "validator_image" },
        { obj: routing_profile, name: "routing_profile" },
        { obj: response_normalizer_spec, name: "response_normalizer_spec" },
        { obj: error_resolver_spec, name: "error_resolver_spec" }
    ];

    let ioDrift = false;
    for (const item of ioCheckList) {
        const refKey = `${item.name}_ref`;
        const refObj = recorder_schema[refKey];
        if (!refObj) {
            errors.push({ code: "IO_LAYER_DRIFT", message: `Missing ${refKey} in recorder_schema` });
            ioDrift = true;
        } else {
            const h1 = sha256(canonicalize(item.obj));
            const h2 = sha256(canonicalize(refObj));
            if (h1 !== h2) {
                errors.push({ code: "IO_LAYER_DRIFT", message: `Drift detected in ${item.name}` });
                ioDrift = true;
            }
        }
    }

    // --- 3.3 Safety Horizon Stability ---
    const risk = safety_horizon_binding.global_risk_profile.policy_exposure;
    if (UNSAFE_RISK_LEVELS.includes(risk)) {
        errors.push({ code: "SAFETY_HORIZON_UNSAFE", message: `Risk level ${risk} is unsafe` });
    }

    // --- 3.4 Replay Stability ---
    if (replay_validation_record.replay_safe !== true) {
        errors.push({ code: "REPLAY_UNSAFE", message: "Replay safe check failed" });
    }
    if (replay_validation_record.time_travel_safe !== true) {
        errors.push({ code: "REPLAY_UNSAFE", message: "Time Travel safe check failed" });
    }

    // Counterfactual Logic: IF safe==false AND no overrides -> Unsafe
    if (replay_validation_record.counterfactual_safe === false) {
        // PIB-10 output doesn't pass blueprint. PIB-11 logic implied we check what we have.
        // If `replay_validation_record` holds blueprint (spec evolution mentioned in PIB-11 text? No, PIB-11 note said "Is acceptable for now").
        // But here provided input is just `replay_validation_record`.
        // Spec 3.4 says: "If counterfactual_safe === false AND there are no overrides -> COUNTERFACTUAL_UNSAFE".
        // Where do we look for overrides?
        // In PIB-11 we checked `replay_validation_record.counterfactual_blueprint.overrides`. 
        // Assuming it's NOT present in standard PIB-10 output, validation will fail if safe is false.
        // Unless `replay_validation_record` DOES contain it. 
        // Since we are enforcing strict logic:
        // If `counterfactual_blueprint` is missing from `replay_validation_record`, then overrides are "no overrides".
        const bp = replay_validation_record.counterfactual_blueprint;
        if (!bp || !bp.overrides || Object.keys(bp.overrides).length === 0) {
            errors.push({ code: "COUNTERFACTUAL_UNSAFE", message: "Counterfactual unsafe and no overrides found" });
        }
    }

    // --- 3.5 Policy Mirror Stability ---
    const pol1 = sha256(canonicalize(routing_profile.policy_mirror));
    const pol2 = sha256(canonicalize(safety_horizon_binding.policy_mirror));
    if (pol1 !== pol2) {
        errors.push({ code: "POLICY_MIRROR_DRIFT", message: "Policy mirror mismatch" });
    }

    // --- 3.6 PIB Hash Chain Stability ---
    const requiredPhases = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    let hashMissing = false;
    for (const p of requiredPhases) {
        if (!pib_phase_hashes[p] || typeof pib_phase_hashes[p].canonical_hash !== "string") {
            errors.push({ code: "MISSING_PIB_PHASE_HASH", message: `Missing canonical hash for phase ${p}` });
            hashMissing = true;
        }
    }

    // --- Final Decision ---
    if (errors.length > 0) {
        return {
            status: "ERROR",
            execution_id: eid,
            phase: PHASE_ID,
            errors
        };
    }

    // Success -> Generate Certificate
    // Readiness Hash
    const version = recorder_schema.connector_version || "0.0.0";
    const certificateBase = {
        connector_id: "google_ads",
        version: version,
        pib_phase_hashes: pib_phase_hashes,
        safety_horizon_binding: safety_horizon_binding,
        replay_validation_record: replay_validation_record,
        // routing_profile.policy_mirror? Prompt says: "routing_profile.policy_mirror".
        policy_mirror: routing_profile.policy_mirror // Mapping explicit field? Or nested?
        // Prompt says: "readiness_hash = sha256(canonical({ ..., routing_profile.policy_mirror }))".
        // It implies the key in the object is `routing_profile.policy_mirror`? Or `policy_mirror`?
        // Standard JS object key: "routing_profile": { "policy_mirror": ... }?
        // OR flatten it?
        // Let's assume structure mimics the list in prompt:
    };

    // Construct object for hashing exact structure from prompt 3.6
    // "readiness_hash = sha256(canonical({ connector_id, version, pib_phase_hashes, safety_horizon_binding, replay_validation_record, routing_profile.policy_mirror }))"
    // This syntax `routing_profile.policy_mirror` usually means value. Key name not specified.
    // I will use `policy_mirror` as key name which aligns with `readiness_certificate` output structure.

    const readinessForHash = {
        connector_id: "google_ads",
        version: version,
        pib_phase_hashes: pib_phase_hashes,
        safety_horizon_binding: safety_horizon_binding,
        replay_validation_record: replay_validation_record,
        policy_mirror: routing_profile.policy_mirror
    };

    const readiness_hash = sha256(canonicalize(readinessForHash));

    const readiness_certificate = {
        connector_id: "google_ads",
        version: version,
        promotion_status: "READY_FOR_MERGE",
        pib_phase_hashes: pib_phase_hashes,
        readiness_hash: readiness_hash,

        capability_mirror_stable: true,
        io_layer_stable: true,
        safety_horizon_stable: true,
        replay_stable: true,
        policy_mirror_stable: true,
        drift_detected: false,

        capability_surface_ref: recorder_schema.capability_surface_ref,
        policy_mirror_ref: safety_horizon_binding.policy_mirror, // Using the object as ref? Or ID?
        // Spec 2: "capability_surface_ref, policy_mirror_ref, io_layer_contract_ref...".
        // io_layer_contract_ref is NOT in inputs. Maybe derived?
        // `io_surface` is input. Maybe `recorder_schema.io_surface_ref`?
        // Prompt 2 list references.
        // Let's assume we pass the REFs we verified.
        io_layer_contract_ref: recorder_schema.io_surface_ref, // Best guess for "Contract"
        safety_horizon_ref: "OPERATION_SAFETY", // Constant or from binding?
        replay_validation_ref: replay_validation_record.audit_ledger_entry ? replay_validation_record.audit_ledger_entry.trace_delta_ref : "UNKNOWN"
        // Prompt doesn't specify exact source for these refs.
        // I will use best logical source given strict context.
    };

    // Note: safety_horizon_ref is actually `safety_summary_ref` in PIB-10 ledger.
    // I'll stick to reasonable defaults if not available, OR check prompt input.
    // Prompt 2: "safety_horizon_ref". Input `safety_horizon_binding`.
    // Binding has `global_risk_profile`...
    // I will map what I can.

    const output = {
        status: "OK",
        execution_id: eid,
        phase: PHASE_ID,
        output_contract_version: OUTPUT_VERSION,
        readiness_certificate,
        metadata: {
            derived_at: "DETERMINISTIC"
        }
    };

    const sorted = sortObjectKeys(output);
    sorted.metadata.canonical_hash = sha256(canonicalize(sorted));

    return sorted;
}

module.exports = { execute };
