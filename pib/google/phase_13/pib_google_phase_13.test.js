const phase13 = require("./pib_google_phase_13");

// --- MOCKS ---
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const crypto = require('crypto');
function sha256(obj) {
    // Simple helper to match implementation logic for expectations
    // Note: implementation does nested sort.
    // For test expectations, we rely on implementation correctness or pre-calc.
    // But since implementation IS the source of truth for canonicalization, strictly matching "expected" strings
    // implies we need an independent canonicalizer OR we verify properties.
    // Here we will use properties and stability.
    return "ignore_mock_calc";
}

const BASE_INPUT = {
    execution_id: "exec-13",
    phase: "PIB_GOOGLE_PHASE_13",
    feature_flags: { FF_PIB_GOOGLE_PHASE_13: true },

    capability_surface: { caps: "A" },
    io_surface: { io: "B" },
    routing_profile: { policy_mirror: { pol: "C" }, other: "ignore" },
    safety_horizon_binding: { safe: "D" },
    replay_validation_record: { replay: "E" },
    readiness_certificate: { ready: "F", version: "1.0.0" },
    activation_checkpoint_record: { active: "G" },

    pib_phase_hashes: {
        "1": { canonical_hash: "h1" },
        "2": { canonical_hash: "h2" },
        "3": { canonical_hash: "h3" },
        "4": { canonical_hash: "h4" },
        "5": { canonical_hash: "h5" },
        "6": { canonical_hash: "h6" },
        "7": { canonical_hash: "h7" },
        "8": { canonical_hash: "h8" },
        "9": { canonical_hash: "h9" },
        "10": { canonical_hash: "h10" },
        "11": { canonical_hash: "h11" },
        "12": { canonical_hash: "h12" }
    }
};

describe("PIB Google Phase 13: Connector Registration Packet Writer", () => {

    // Group 1: Happy Path
    test("1. Full success -> OK with packet", () => {
        const input = deepCopy(BASE_INPUT);
        const result = phase13.execute(input);
        expect(result.status).toBe("OK");
        expect(result.connector_registration_packet).toBeDefined();
        expect(result.connector_registration_packet.connector_id).toBe("google_ads");
    });

    test("2. canonical_hash stable across runs", () => {
        const input = deepCopy(BASE_INPUT);
        const r1 = phase13.execute(input);
        const r2 = phase13.execute(input);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    test("3. canonical_hash invariant to input key reordering", () => {
        const input = deepCopy(BASE_INPUT);
        // Reorder key in a sub-object
        input.capability_surface = { z: 1, a: 2 };
        const input2 = deepCopy(BASE_INPUT);
        input2.capability_surface = { a: 2, z: 1 };

        const r1 = phase13.execute(input);
        const r2 = phase13.execute(input2);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    // Group 2: Validation
    test("4. Missing feature_flags -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.feature_flags;
        const result = phase13.execute(input);
        expect(result.code).toBe("INVALID_INPUT");
    });

    test("5. Feature flag OFF -> NO_OP", () => {
        const input = deepCopy(BASE_INPUT);
        input.feature_flags.FF_PIB_GOOGLE_PHASE_13 = false;
        const result = phase13.execute(input);
        expect(result.status).toBe("NO_OP");
    });

    test("6. Wrong phase -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        input.phase = "WRONG";
        const result = phase13.execute(input);
        expect(result.code).toBe("INVALID_INPUT");
    });

    test("7. Forbidden field -> FORBIDDEN_FIELD", () => {
        const input = deepCopy(BASE_INPUT);
        input._debug = true;
        const result = phase13.execute(input);
        expect(result.code).toBe("FORBIDDEN_FIELD");
    });

    test("8. Missing dependency -> MISSING_DEPENDENCY", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.io_surface;
        const result = phase13.execute(input);
        expect(result.code).toBe("MISSING_DEPENDENCY");
    });

    // Group 3: Hash Chain Integrity
    test("9. Missing pib_phase_hashes entry -> HASH_CHAIN_INVALID", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.pib_phase_hashes["1"];
        const result = phase13.execute(input);
        expect(result.code).toBe("HASH_CHAIN_INVALID");
    });

    test("10. Malformed canonical_hash -> HASH_CHAIN_INVALID", () => {
        const input = deepCopy(BASE_INPUT);
        input.pib_phase_hashes["1"] = { canonical_hash: 123 }; // Not string
        const result = phase13.execute(input);
        expect(result.code).toBe("HASH_CHAIN_INVALID");
    });

    // Group 4: Signature Correctness
    // To verify exact signatures, we need to know the SHA256 of the input components.
    // For this test, we verify they are generated (strings of length 64 hex).
    test("11. capability_surface signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.capability_surface_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test("12. io_surface signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.io_surface_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test("13. policy_mirror signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.policy_mirror_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test("14. safety_horizon signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.safety_horizon_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test("15. readiness_certificate signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.readiness_certificate_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test("16. replay_validation signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.replay_validation_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test("17. activation_checkpoint signature present", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        expect(result.connector_registration_packet.activation_checkpoint_signature).toMatch(/^[a-f0-9]{64}$/);
    });

    // Group 5: Determinism Edge Cases
    test("18. Canonicalization works with nested objects", () => {
        const input = deepCopy(BASE_INPUT);
        input.capability_surface = { b: { d: 4, c: 3 }, a: 1 };
        const result = phase13.execute(input);
        expect(result.status).toBe("OK");
    });

    test("19. Canonicalization stable even with reordered nested keys", () => {
        const input1 = deepCopy(BASE_INPUT);
        input1.capability_surface = { b: { d: 4, c: 3 }, a: 1 };
        const input2 = deepCopy(BASE_INPUT);
        input2.capability_surface = { a: 1, b: { c: 3, d: 4 } };

        const r1 = phase13.execute(input1);
        const r2 = phase13.execute(input2);

        expect(r1.connector_registration_packet.capability_surface_signature).toBe(r2.connector_registration_packet.capability_surface_signature);
    });

    test("20. determinism preserved despite irrelevant modifications (not possible with strict deps? Forbidden check covers extra fields)", () => {
        // Strict inputs means we can't add "extra" root fields.
        // But we CAN add extra fields deep inside objects (e.g. inside capability_surface).
        // These alter the hash! 
        // "determinism preserved after modifying irrelevant non-required fields" -> Wait.
        // If I modify capability_surface, the signature MUST change.
        // If I modify `routing_profile.other`, does `policy_mirror_signature` change? NO.
        // Because `policy_mirror_signature` only looks at `routing_profile.policy_mirror`.

        const input1 = deepCopy(BASE_INPUT);
        const input2 = deepCopy(BASE_INPUT);

        input2.routing_profile.other = "changed"; // Should NOT affect policy_mirror_signature

        const r1 = phase13.execute(input1);
        const r2 = phase13.execute(input2);

        expect(r1.connector_registration_packet.policy_mirror_signature).toBe(r2.connector_registration_packet.policy_mirror_signature);

        // HOWEVER, the overall `metadata.canonical_hash` WILL change because specific inputs changed and that changes `connector_registration_packet`?
        // No, `connector_registration_packet` doesn't include raw inputs, only signatures.
        // Does `input.routing_profile` appear in output? NO.
        // So entire output should be IDENTICAL?
        // Let's check `connector_registration_packet`:
        // connector_id, version, hash_chain, signatures.
        // None of these change if `routing_profile.other` changes.
        // So `canonical_hash` should be STABLE!

        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    // Group 6: Packet Shape
    test("21. connector_registration_packet contains EXACT required keys", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        const keys = Object.keys(result.connector_registration_packet).sort();
        const expected = [
            "activation_checkpoint_signature",
            "capability_surface_signature",
            "connector_id",
            "connector_version",
            "hash_chain",
            "io_surface_signature",
            "policy_mirror_signature",
            "readiness_certificate_signature",
            "replay_validation_signature",
            "safety_horizon_signature"
        ].sort();
        expect(keys).toEqual(expected);
    });

    test("22. No additional keys appear in output", () => {
        const result = phase13.execute(deepCopy(BASE_INPUT));
        const rootKeys = Object.keys(result).sort();
        const expected = [
            "connector_registration_packet",
            "execution_id",
            "metadata",
            "output_contract_version",
            "phase",
            "status"
        ].sort();
        expect(rootKeys).toEqual(expected);
    });

});
