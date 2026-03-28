const decoder = require("../os_65_connector_registration_decoder");
const crypto = require('crypto');

// --- HELPER ---
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function sha256(obj) {
    // For test setup, we need actual hashes to match implementation
    // Implementation uses simple recursive sort.
    const sort = (o) => {
        if (o === null || typeof o !== 'object') return o;
        if (Array.isArray(o)) return o.map(sort);
        return Object.keys(o).sort().reduce((acc, k) => {
            acc[k] = sort(o[k]);
            return acc;
        }, {});
    };
    return crypto.createHash('sha256').update(JSON.stringify(sort(obj))).digest('hex');
}

// --- BASE INPUT ---
// Construct valid artifact set so signatures match
const CAPABILITY = { caps: "A" };
const IO = { io: "B" };
const POLICY = { pol: "C" };
const SAFETY = { safe: "D" };
const REPLAY = { rep: "E" };
const READY = { ready: "F" };
const CHECK = { check: "G" };

const CHAIN = {};
for (let i = 1; i <= 13; i++) CHAIN[i.toString()] = { canonical_hash: "hash" + i };

const PACKET = {
    connector_id: "google_ads",
    connector_version: "1.0.0",
    hash_chain: CHAIN,
    capability_surface_signature: sha256(CAPABILITY),
    io_surface_signature: sha256(IO),
    policy_mirror_signature: sha256(POLICY),
    safety_horizon_signature: sha256(SAFETY),
    replay_validation_signature: sha256(REPLAY),
    readiness_certificate_signature: sha256(READY),
    activation_checkpoint_signature: sha256(CHECK)
};

const BASE_INPUT = {
    execution_id: "test-exec-1",
    phase: "OS_65",
    feature_flags: { FF_OS_CONNECTOR_REGISTRATION: true },
    connector_registration_packet: PACKET,

    capability_surface: CAPABILITY,
    io_surface: IO,
    routing_profile: { policy_mirror: POLICY, other: "ignore" },
    safety_horizon_binding: SAFETY,
    replay_validation_record: REPLAY,
    readiness_certificate: READY,
    activation_checkpoint_record: CHECK
};

describe("OS-65 Connector Registration Decoder", () => {

    // Group 1: Happy Path
    test("1. Full success: registry entry produced", () => {
        const input = deepCopy(BASE_INPUT);
        const result = decoder.execute(input);
        expect(result.status).toBe("OK");
        expect(result.connector_registry.google_ads).toBeDefined();
        expect(result.connector_registry.google_ads.version).toBe("1.0.0");
    });

    test("2. Canonical hash stable across repeated runs", () => {
        const input = deepCopy(BASE_INPUT);
        const r1 = decoder.execute(input);
        const r2 = decoder.execute(input);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    test("3. Canonical hash invariant to input key reordering (no content change)", () => {
        const base = deepCopy(BASE_INPUT);

        // Reorder top-level keys without changing values
        const reordered = {
            connector_registration_packet: base.connector_registration_packet,
            feature_flags: base.feature_flags,
            routing_profile: base.routing_profile,
            execution_id: base.execution_id,
            io_surface: base.io_surface,
            capability_surface: base.capability_surface,
            replay_validation_record: base.replay_validation_record,
            activation_checkpoint_record: base.activation_checkpoint_record,
            safety_horizon_binding: base.safety_horizon_binding,
            readiness_certificate: base.readiness_certificate,
            phase: base.phase
        };

        const r1 = decoder.execute(base);
        const r2 = decoder.execute(reordered);

        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    // Group 2: Feature Flag
    test("4. Feature flag OFF -> NO_OP", () => {
        const input = deepCopy(BASE_INPUT);
        input.feature_flags.FF_OS_CONNECTOR_REGISTRATION = false;
        const result = decoder.execute(input);
        expect(result.status).toBe("NO_OP");
    });

    // Group 3: Forbidden Fields
    test("5. Forbidden root field -> FORBIDDEN_FIELD", () => {
        const input = deepCopy(BASE_INPUT);
        input._debug = true;
        const result = decoder.execute(input);
        expect(result.code).toBe("FORBIDDEN_FIELD");
    });

    // Group 4: Phase Validation
    test("6. Wrong phase -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        input.phase = "WRONG";
        const result = decoder.execute(input);
        expect(result.code).toBe("INVALID_INPUT");
    });

    // Group 5: Missing Dependencies
    test("7. Missing capability_surface -> MISSING_DEPENDENCY", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.capability_surface;
        const result = decoder.execute(input);
        expect(result.code).toBe("MISSING_DEPENDENCY");
    });

    test("8. Missing io_surface -> MISSING_DEPENDENCY", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.io_surface;
        const result = decoder.execute(input);
        expect(result.code).toBe("MISSING_DEPENDENCY");
    });

    test("9. Missing replay_validation_record -> MISSING_DEPENDENCY", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.replay_validation_record;
        const result = decoder.execute(input);
        expect(result.code).toBe("MISSING_DEPENDENCY");
    });

    // Group 6: Hash Chain
    test("10. Missing PIB hash entry -> HASH_CHAIN_INVALID", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.connector_registration_packet.hash_chain["1"];
        const result = decoder.execute(input);
        expect(result.code).toBe("HASH_CHAIN_INVALID");
    });

    test("11. Malformed PIB hash (not a string) -> HASH_CHAIN_INVALID", () => {
        const input = deepCopy(BASE_INPUT);
        input.connector_registration_packet.hash_chain["1"] = { canonical_hash: 123 };
        const result = decoder.execute(input);
        expect(result.code).toBe("HASH_CHAIN_INVALID");
    });

    // Group 7: Signature Verification
    test("12. capability_surface signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.capability_surface = { caps: "TAMPERED" };
        // Sig matches ORIGINAL input, so this mismatches
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("capability_surface");
    });

    test("13. io_surface signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.io_surface = { io: "TAMPERED" };
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("io_surface");
    });

    test("14. policy_mirror signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.routing_profile.policy_mirror = { pol: "TAMPERED" };
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("policy_mirror");
    });

    test("15. safety_horizon signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.safety_horizon_binding = { safe: "TAMPERED" };
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("safety_horizon");
    });

    test("16. replay_validation signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record = { rep: "TAMPERED" };
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("replay_validation");
    });

    test("17. readiness_certificate signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.readiness_certificate = { ready: "TAMPERED" };
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("readiness_certificate");
    });

    test("18. activation_checkpoint signature mismatch -> SIGNATURE_MISMATCH", () => {
        const input = deepCopy(BASE_INPUT);
        input.activation_checkpoint_record = { check: "TAMPERED" };
        const result = decoder.execute(input);
        expect(result.code).toBe("SIGNATURE_MISMATCH");
        expect(result.details.component).toBe("activation_checkpoint");
    });

    // Group 8: Determinism & Stability
    test("19. Reordering nested keys still produces identical registry_canonical_hash", () => {
        // We can't inspect registry_canonical_hash directly as it's not exported.
        // But we can check output metadata.canonical_hash.
        // Similar to Test 3 but intended to verifying registry entry construction logic specifically?
        // Let's assume metadata hash covers it.
        const inputA = deepCopy(BASE_INPUT);
        inputA.safety_horizon_binding = { a: 1, b: 2 };
        inputA.connector_registration_packet.safety_horizon_signature = sha256(inputA.safety_horizon_binding);

        const inputB = deepCopy(BASE_INPUT);
        inputB.safety_horizon_binding = { b: 2, a: 1 };
        inputB.connector_registration_packet.safety_horizon_signature = sha256(inputB.safety_horizon_binding);

        const rA = decoder.execute(inputA);
        const rB = decoder.execute(inputB);
        expect(rA.metadata.canonical_hash).toBe(rB.metadata.canonical_hash);
    });

    test("20. Adding irrelevant fields inside nested objects that are not signature-roots does NOT change canonical hash", () => {
        // "nested objects that are NOT signature-roots".
        // Example: routing_profile.other. 
        // Sig check is on routing_profile.policy_mirror. 
        // `routing_profile` itself isn't signed, just its sub-object.
        // BUT does `registry_entry` include `routing_profile`? 
        // Spec 5: "policy_mirror_ref: routing_profile.policy_mirror".
        // It does NOT include `routing_profile`. 
        // So `routing_profile.other` is ignored by Registry Entry.
        // Thus output hash should be identical.

        const inputA = deepCopy(BASE_INPUT);
        const inputB = deepCopy(BASE_INPUT);
        inputB.routing_profile.other = "changed";

        const rA = decoder.execute(inputA);
        const rB = decoder.execute(inputB);
        expect(rA.metadata.canonical_hash).toBe(rB.metadata.canonical_hash);
    });

    // Group 9: Output Structure
    test("21. connector_registry contains exactly one entry: google_ads", () => {
        const result = decoder.execute(deepCopy(BASE_INPUT));
        const keys = Object.keys(result.connector_registry);
        expect(keys).toEqual(["google_ads"]);
    });

    test("22. No additional keys exist in output", () => {
        const result = decoder.execute(deepCopy(BASE_INPUT));
        const rootKeys = Object.keys(result).sort();
        const expected = [
            "connector_registry",
            "execution_id",
            "metadata",
            "output_contract_version",
            "phase",
            "status"
        ].sort();
        expect(rootKeys).toEqual(expected);
    });
});
