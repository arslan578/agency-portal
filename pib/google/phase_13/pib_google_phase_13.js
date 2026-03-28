/**
 * PIB-GOOGLE-PHASE-13: Connector Registration Packet Writer
 *
 * Produces the Connector Registration Packet (CRP) for OS-65.
 * Deterministic bundling and signing of all prior phase outputs.
 *
 * Output: connector_registration_packet
 */

const crypto = require('crypto');

// --- CONSTANTS ---
const PHASE_ID = "PIB_GOOGLE_PHASE_13";
const OUTPUT_VERSION = "pib_google_phase_13_output_v1";

const REQUIRED_INPUTS = [
    "capability_surface",
    "io_surface",
    "routing_profile",
    "safety_horizon_binding",
    "replay_validation_record",
    "readiness_certificate",
    "activation_checkpoint_record",
    "pib_phase_hashes"
];

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];
const REQUIRED_PHASES = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

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
    // Basic recursion check is implied by JSON.stringify failing, but spec says check CANONICALIZATION_FAILED
    try {
        return JSON.stringify(sortObjectKeys(obj));
    } catch (e) {
        throw new Error("Canonicalization failed");
    }
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
    if (input.feature_flags && input.feature_flags.FF_PIB_GOOGLE_PHASE_13 === false) {
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
        if (value === undefined || value === null) {
            return buildError(
                input,
                "MISSING_DEPENDENCY",
                `Missing required input: ${field}`,
                { missing: field }
            );
        }
    }

    // Hash Chain Completeness
    const hashes = input.pib_phase_hashes;
    for (const p of REQUIRED_PHASES) {
        if (!hashes[p] || typeof hashes[p].canonical_hash !== "string") {
            return buildError(input, "HASH_CHAIN_INVALID", `Missing or invalid hash for phase ${p}`);
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
        routing_profile,
        safety_horizon_binding,
        replay_validation_record,
        readiness_certificate,
        activation_checkpoint_record,
        pib_phase_hashes
    } = input;

    const eid = execution_id || "UNKNOWN";

    // --- Compute Signatures (and check Canonicalization) ---
    let signatures = {};
    try {
        signatures.capability_surface = sha256(canonicalize(capability_surface));
        signatures.io_surface = sha256(canonicalize(io_surface));
        signatures.policy_mirror = sha256(canonicalize(routing_profile.policy_mirror));
        signatures.safety_horizon = sha256(canonicalize(safety_horizon_binding));
        signatures.replay_validation = sha256(canonicalize(replay_validation_record));
        signatures.readiness_certificate = sha256(canonicalize(readiness_certificate));
        signatures.activation_checkpoint = sha256(canonicalize(activation_checkpoint_record));
    } catch (e) {
        return buildError(input, "CANONICALIZATION_FAILED", "Failed to canonicalize input");
    }

    // --- Build Packet ---
    const connector_registration_packet = {
        connector_id: "google_ads",
        connector_version: readiness_certificate.version || "0.0.0", // Fallback not spec'd but safe to read prop
        hash_chain: pib_phase_hashes,
        capability_surface_signature: signatures.capability_surface,
        io_surface_signature: signatures.io_surface,
        policy_mirror_signature: signatures.policy_mirror,
        safety_horizon_signature: signatures.safety_horizon,
        replay_validation_signature: signatures.replay_validation,
        readiness_certificate_signature: signatures.readiness_certificate,
        activation_checkpoint_signature: signatures.activation_checkpoint
    };

    const output = {
        status: "OK",
        execution_id: eid,
        phase: PHASE_ID,
        output_contract_version: OUTPUT_VERSION,
        connector_registration_packet,
        metadata: {
            derived_at: "DETERMINISTIC"
        }
    };

    const sorted = sortObjectKeys(output);
    sorted.metadata.canonical_hash = sha256(canonicalize(sorted));

    return sorted;
}

module.exports = { execute };
