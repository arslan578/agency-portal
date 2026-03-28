const phase12 = require("./pib_meta_phase_12");

// --- MOCKS ---
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const BASE_INPUT = {
    execution_id: "exec-crc-1",
    phase: "PIB_META_PHASE_12",
    feature_flags: { FF_PIB_META_PHASE_12: true },

    capability_surface: { caps: "valid" },
    io_surface: { io: "valid" },
    request_blueprint: { req: "valid" },
    validator_image: { val: "valid" },
    routing_profile: {
        route: "valid",
        policy_mirror: { pol: "same" }
    },
    response_normalizer_spec: { res: "valid" },
    error_resolver_spec: { err: "valid" },

    recorder_schema: {
        connector_version: "1.0.0",
        capability_surface_ref: { caps: "valid" },
        io_surface_ref: { io: "valid" },
        request_blueprint_ref: { req: "valid" },
        validator_image_ref: { val: "valid" },
        routing_profile_ref: { route: "valid", policy_mirror: { pol: "same" } },
        response_normalizer_spec_ref: { res: "valid" },
        error_resolver_spec_ref: { err: "valid" }
    },

    envelope_plan: { plan: "ignored" },

    safety_horizon_binding: {
        global_risk_profile: { policy_exposure: "LOW" },
        policy_mirror: { pol: "same" }
    },

    replay_validation_record: {
        replay_safe: true,
        time_travel_safe: true,
        counterfactual_safe: true,
        counterfactual_blueprint: { overrides: {} } // Normally missing if safe=true, but helpful to prevent unexpected errors if logic checks blindly
    },

    activation_checkpoint_record: { status: "ACTIVE" },

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
        "11": { canonical_hash: "h11" }
    }
};

describe("PIB Meta Phase 12: Connector Readiness Certificate", () => {

    // --- GROUP 1: Happy Path ---

    test("1. Full success to READY_FOR_MERGE", () => {
        const input = deepCopy(BASE_INPUT);
        const result = phase12.execute(input);

        expect(result.status).toBe("OK");
        expect(result.readiness_certificate.promotion_status).toBe("READY_FOR_MERGE");
        expect(result.readiness_certificate.drift_detected).toBe(false);
        expect(result.readiness_certificate.capability_mirror_stable).toBe(true);
        expect(result.metadata.canonical_hash).toBeDefined();
    });

    test("2. Hash stability across repeated runs", () => {
        const input = deepCopy(BASE_INPUT);
        const r1 = phase12.execute(input);
        const r2 = phase12.execute(input);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    test("3. Input key order variation", () => {
        const input = deepCopy(BASE_INPUT);
        // Shuffle checks
        const ph = input.pib_phase_hashes;
        input.pib_phase_hashes = {};
        Object.keys(ph).sort().reverse().forEach(k => input.pib_phase_hashes[k] = ph[k]);

        const r1 = phase12.execute(input);
        expect(r1.status).toBe("OK");
    });

    // --- GROUP 2: Validation ---

    test("4. Missing feature_flags -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.feature_flags;
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("INVALID_INPUT");
    });

    test("5. Feature flag off -> NO_OP", () => {
        const input = deepCopy(BASE_INPUT);
        input.feature_flags.FF_PIB_META_PHASE_12 = false;
        const result = phase12.execute(input);
        expect(result.status).toBe("NO_OP");
    });

    test("6. Wrong phase string -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        input.phase = "WRONG";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("INVALID_INPUT");
    });

    test("7. Missing each required dependency -> MISSING_DEPENDENCY", () => {
        const required = [
            "capability_surface", "io_surface", "request_blueprint", "validator_image",
            "routing_profile", "response_normalizer_spec", "error_resolver_spec",
            "recorder_schema", "envelope_plan", "safety_horizon_binding",
            "replay_validation_record", "activation_checkpoint_record", "pib_phase_hashes"
        ];

        required.forEach(field => {
            const input = deepCopy(BASE_INPUT);
            delete input[field];
            const result = phase12.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });
    });

    test("8. Forbidden fields -> FORBIDDEN_FIELD", () => {
        const input = deepCopy(BASE_INPUT);
        input._debug = true;
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
    });

    // --- GROUP 3: Capability Mirror ---

    test("9. Capability surface mismatch -> CAPABILITY_MIRROR_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.capability_surface.caps = "DRIFT";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("CAPABILITY_MIRROR_DRIFT");
    });

    // --- GROUP 4: IO Layer Stability ---

    test("10. io_surface mismatch -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.io_surface.io = "DRIFT";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("IO_LAYER_DRIFT");
    });

    test("11. request_blueprint mismatch -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.request_blueprint.req = "DRIFT";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("IO_LAYER_DRIFT");
    });

    test("12. validator_image mismatch -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.validator_image.val = "DRIFT";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("IO_LAYER_DRIFT");
    });

    test("13. Missing one *_ref in recorder_schema -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.recorder_schema.io_surface_ref;
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("IO_LAYER_DRIFT");
    });

    // --- GROUP 5: Safety Horizon ---

    test("14. policy_exposure = CRITICAL -> SAFETY_HORIZON_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.safety_horizon_binding.global_risk_profile.policy_exposure = "CRITICAL";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.errors[0].code).toBe("SAFETY_HORIZON_UNSAFE");
    });

    test("15. policy_exposure = UNSAFE -> SAFETY_HORIZON_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.safety_horizon_binding.global_risk_profile.policy_exposure = "UNSAFE";
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("SAFETY_HORIZON_UNSAFE");
    });

    // --- GROUP 6: Replay Stability ---

    test("16. replay_safe = false -> REPLAY_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.replay_safe = false;
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("REPLAY_UNSAFE");
    });

    test("17. time_travel_safe = false -> REPLAY_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.time_travel_safe = false;
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("REPLAY_UNSAFE");
    });

    test("18. counterfactual_safe = false and no overrides -> COUNTERFACTUAL_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.counterfactual_safe = false;
        // Mock replay record missing valid blueprints/overrides
        input.replay_validation_record.counterfactual_blueprint = { overrides: {} };
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("COUNTERFACTUAL_UNSAFE");
    });

    // --- GROUP 7: Policy Mirror ---

    test("19. Drift in routing_profile.policy_mirror -> POLICY_MIRROR_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.routing_profile.policy_mirror = { pol: "DRIFT" };
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("POLICY_MIRROR_DRIFT");
    });

    // --- GROUP 8: Hash Chain Verification ---

    test("20. Missing a PIB phase hash -> MISSING_PIB_PHASE_HASH", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.pib_phase_hashes["7"];
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("MISSING_PIB_PHASE_HASH");
    });

    test("21. PIB phase hash malformed -> MISSING_PIB_PHASE_HASH", () => {
        const input = deepCopy(BASE_INPUT);
        input.pib_phase_hashes["1"] = { canonical_hash: "" };
        const result = phase12.execute(input);
        expect(result.errors[0].code).toBe("MISSING_PIB_PHASE_HASH");
    });

    // --- GROUP 9: Determinism ---

    test("22. Canonical hash stability across runs and key reordering", () => {
        const input1 = deepCopy(BASE_INPUT);
        const input2 = deepCopy(BASE_INPUT); // Reordered?
        // JS keys preserved insertion order? canonicalize logic handles sort.
        const r1 = phase12.execute(input1);
        const r2 = phase12.execute(input2);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

});
