/**
 * OS-65: Connector Registration Decoder
 *
 * Ingests a Connector Registration Packet, validates all signatures and hash chains,
 * and produces a verified Registry Entry.
 *
 * Input: connector_registration_packet + raw artifacts
 * Output: registry_entry
 */

const crypto = require('crypto');

// --- CONSTANTS ---
const PHASE_ID = "OS_65";
const OUTPUT_VERSION = "os_65_connector_registry_v2";
const REQUIRED_PHASES_GOOGLE = Array.from({ length: 13 }, (_, i) => (i + 1).toString());
const REQUIRED_PHASES_TIKTOK = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
const REQUIRED_PHASES_META = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

const REQUIRED_DEPS = [
    "capability_surface",
    "io_surface",
    "routing_profile",
    "safety_horizon_binding",
    "replay_validation_record",
    "readiness_certificate",
    "activation_checkpoint_record"
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

    // 4.1 Feature Flag
    // "FF_OS_CONNECTOR_REGISTRATION = true"
    // Does input HAVE feature_flags object? Spec doesn't strictly say structure of flag input, 
    // but usually it's input.feature_flags.FF_...
    // Prompt says: "4.1 Feature Flag FF_OS_CONNECTOR_REGISTRATION = true. If false -> NO_OP."
    // It implies we check `input.feature_flags.FF_OS_CONNECTOR_REGISTRATION`.
    if (input.feature_flags && input.feature_flags.FF_OS_CONNECTOR_REGISTRATION === false) {
        return "NO_OP";
    }
    // Strictness on missing flag? Usually yes.
    if (!input.feature_flags || input.feature_flags.FF_OS_CONNECTOR_REGISTRATION !== true) {
        // If undefined, is it NO_OP or ERROR? 
        // "If false -> NO_OP". Undefined is not false, but flag logic usually requires explicit true.
        // Let's assume if missing -> ERROR like previous phases or treat as off?
        // Prompt says "Strict Validation of feature flag".
        return buildError(input, "INVALID_INPUT", "Missing or invalid feature flag");
    }

    // 4.2 Forbidden Fields
    for (const field of FORBIDDEN_FIELDS) {
        if (field in input) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${field}' is strictly forbidden`);
        }
    }

    // 4.3 Phase Check
    if (input.phase && input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", "Wrong phase");
    }

    // Check Packet Existence
    if (!input.connector_registration_packet) {
        return "NO_OP"; // "If the connector packet is missing -> NO_OP"
    }

    // 3. Missing Dependencies
    for (const field of REQUIRED_DEPS) {
        if (!input[field]) {
            return buildError(input, "MISSING_DEPENDENCY", `Missing required dependency: ${field}`);
        }
    }

    // Check routing_profile.policy_mirror specifically?
    if (!input.routing_profile.policy_mirror) {
        return buildError(input, "MISSING_DEPENDENCY", "Missing routing_profile.policy_mirror");
    }

    // 4.4 Hash Chain Validation
    // Determine required phases based on connector_id (if available in packet)
    // Note: This requires packet to be inspectable.
    const cid = input.connector_registration_packet.connector_id;
    let requiredPhases = [];

    if (cid === "google_ads") {
        requiredPhases = REQUIRED_PHASES_GOOGLE;
    } else if (cid === "meta_ads") {
        requiredPhases = REQUIRED_PHASES_META;
    } else if (cid === "tiktok_ads") {
        requiredPhases = REQUIRED_PHASES_TIKTOK;
    } else {
        // Unknown connector; use the default list so hash_chain structure is still checked,
        // then fail later on INVALID_CONNECTOR_ID.
        requiredPhases = REQUIRED_PHASES_GOOGLE;
    }

    const chain = input.connector_registration_packet.hash_chain;
    if (!chain) return buildError(input, "HASH_CHAIN_INVALID", "Missing hash chain in packet");
    for (const p of requiredPhases) {
        if (!chain[p] || typeof chain[p].canonical_hash !== "string") {
            return buildError(input, "HASH_CHAIN_INVALID", `Missing/Invalid hash for phase ${p}`);
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
        connector_registration_packet,
        capability_surface,
        io_surface,
        routing_profile,
        safety_horizon_binding,
        replay_validation_record,
        readiness_certificate,
        activation_checkpoint_record
    } = input;

    const eid = execution_id || "UNKNOWN";

    // 4.5 Signature Verification
    const packet = connector_registration_packet;

    // --- PATCH: Strict connector_id validation ---
    if (!["google_ads", "meta_ads", "tiktok_ads"].includes(packet.connector_id)) {
        return buildError(input, "INVALID_CONNECTOR_ID", "Unexpected connector_id");
    }

    const verifySig = (name, obj, expectedSig) => {
        const computed = sha256(canonicalize(obj));
        if (computed !== expectedSig) {
            return {
                code: "SIGNATURE_MISMATCH",
                message: `Signature mismatch for ${name}`,
                details: { expected: expectedSig, actual: computed, component: name }
            };
        }
        return null;
    };

    const errors = [];

    errors.push(verifySig("capability_surface", capability_surface, packet.capability_surface_signature));
    errors.push(verifySig("io_surface", io_surface, packet.io_surface_signature));
    errors.push(verifySig("policy_mirror", routing_profile.policy_mirror, packet.policy_mirror_signature));
    errors.push(verifySig("safety_horizon", safety_horizon_binding, packet.safety_horizon_signature));
    errors.push(verifySig("replay_validation", replay_validation_record, packet.replay_validation_signature));
    errors.push(verifySig("readiness_certificate", readiness_certificate, packet.readiness_certificate_signature));
    errors.push(verifySig("activation_checkpoint", activation_checkpoint_record, packet.activation_checkpoint_signature));

    const activeErrors = errors.filter(e => e !== null);
    // --- PATCH: strict fast-fail signature behavior ---
    if (activeErrors.length > 0) {
        const first = activeErrors[0];
        return {
            status: "ERROR",
            code: "SIGNATURE_MISMATCH",
            message: first.message,
            details: first.details,
            execution_id: eid,
            phase: PHASE_ID
        };
    }

    // 5. Registry Entry Construction
    const registry_entry = {
        connector_id: packet.connector_id,
        version: packet.connector_version,
        capability_surface_ref: capability_surface,
        io_surface_ref: io_surface,
        policy_mirror_ref: routing_profile.policy_mirror,
        safety_horizon_ref: safety_horizon_binding,
        replay_validation_ref: replay_validation_record,
        readiness_certificate_ref: readiness_certificate,
        activation_checkpoint_ref: activation_checkpoint_record,
        pib_hash_chain: packet.hash_chain
    };

    // --- PATCH: Compute registry_entry canonical hash for output ---
    const registry_canonical_hash = sha256(canonicalize(registry_entry));

    // 6. Output Contract
    const output = {
        status: "OK",
        phase: PHASE_ID,
        execution_id: eid,
        output_contract_version: OUTPUT_VERSION,
        connector_registry: {
            [packet.connector_id]: {
                ...registry_entry,
                canonical_hash: registry_canonical_hash   // PATCH: required by spec
            }
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
