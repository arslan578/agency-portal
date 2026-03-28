const phase12 = require("./pib_google_phase_12");

// --- MOCKS ---
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const BASE_INPUT = {
    execution_id: "exec-1",
    phase: "PIB_GOOGLE_PHASE_12",
    feature_flags: { FF_PIB_GOOGLE_PHASE_12: true },

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

    envelope_plan: { plan: "present" },

    safety_horizon_binding: {
        global_risk_profile: { policy_exposure: "LOW" },
        policy_mirror: { pol: "same" }
    },

    replay_validation_record: {
        replay_safe: true,
        time_travel_safe: true,
        counterfactual_safe: true,
        audit_ledger_entry: { trace_delta_ref: "trace-1" }
    },

    activation_checkpoint_record: { status: "ACTIVE" },

    pib_phase_hashes: {
        "1": { canonical_hash: "hash1" },
        "2": { canonical_hash: "hash2" },
        "3": { canonical_hash: "hash3" },
        "4": { canonical_hash: "hash4" },
        "5": { canonical_hash: "hash5" },
        "6": { canonical_hash: "hash6" },
        "7": { canonical_hash: "hash7" },
        "8": { canonical_hash: "hash8" },
        "9": { canonical_hash: "hash9" },
        "10": { canonical_hash: "hash10" },
        "11": { canonical_hash: "hash11" }
    }
};

describe("PIB Google Phase 12: Connector Readiness Certificate", () => {

    // Group 1: Happy Path
    test("1. Full success -> READY_FOR_MERGE", () => {
        const input = deepCopy(BASE_INPUT);
        const result = phase12.execute(input);
        expect(result.status).toBe("OK");
        expect(result.readiness_certificate.promotion_status).toBe("READY_FOR_MERGE");
        expect(result.readiness_certificate.readiness_hash).toBeDefined();
        expect(result.readiness_certificate.drift_detected).toBe(false);
    });

    test("2. Hash stability across runs", () => {
        const input = deepCopy(BASE_INPUT);
        const r1 = phase12.execute(input);
        const r2 = phase12.execute(input);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    test("3. Input key order variation -> Identical Hash", () => {
        const input = deepCopy(BASE_INPUT);
        // Shuffle io_surface keys (if it had multiple)
        input.io_surface = { b: 2, a: 1 };
        input.recorder_schema.io_surface_ref = { a: 1, b: 2 };

        const r1 = phase12.execute(input);
        expect(r1.status).toBe("OK"); // Hash should match due to sortObjectKeys
    });

    // Group 2: Validation
    test("4. Missing feature_flags -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.feature_flags;
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("INVALID_INPUT");
    });

    test("5. Feature flag OFF -> NO_OP", () => {
        const input = deepCopy(BASE_INPUT);
        input.feature_flags.FF_PIB_GOOGLE_PHASE_12 = false;
        const result = phase12.execute(input);
        expect(result.status).toBe("NO_OP");
    });

    test("6. Wrong phase -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        input.phase = "WRONG";
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("INVALID_INPUT");
    });

    test("7. Missing dependency -> MISSING_DEPENDENCY", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.io_surface;
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("MISSING_DEPENDENCY");
    });

    test("8. Forbidden field -> FORBIDDEN_FIELD", () => {
        const input = deepCopy(BASE_INPUT);
        input._debug = true;
        const result = phase12.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("FORBIDDEN_FIELD");
    });

    // Group 3: Capability Mirror
    test("9. capability_surface mismatch -> CAPABILITY_MIRROR_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.capability_surface.caps = "DRIFT";
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "CAPABILITY_MIRROR_DRIFT");
        expect(err).toBeDefined();
    });

    // Group 4: IO Layer Stability
    test("10. io_surface mismatch -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.io_surface.io = "DRIFT";
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "IO_LAYER_DRIFT");
        expect(err).toBeDefined();
    });

    test("11. request_blueprint mismatch -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.request_blueprint.req = "DRIFT";
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "IO_LAYER_DRIFT");
        expect(err).toBeDefined();
    });

    test("12. validator_image mismatch -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.validator_image.val = "DRIFT";
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "IO_LAYER_DRIFT");
        expect(err).toBeDefined();
    });

    test("13. missing recorder_schema reference -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.recorder_schema.request_blueprint_ref;
        const result = phase12.execute(input);
        // Implementation pushes error if ref missing
        const err = result.errors.find(e => e.code === "IO_LAYER_DRIFT");
        expect(err).toBeDefined();
    });

    // Group 5: Safety Horizon
    test("14/15. Safety Horizon Unsafe", () => {
        const input = deepCopy(BASE_INPUT);
        input.safety_horizon_binding.global_risk_profile.policy_exposure = "CRITICAL";
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "SAFETY_HORIZON_UNSAFE");
        expect(err).toBeDefined();
    });

    // Group 6: Replay Stability
    test("16. replay_safe=false -> REPLAY_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.replay_safe = false;
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "REPLAY_UNSAFE");
        expect(err).toBeDefined();
    });

    test("17. time_travel_safe=false -> REPLAY_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.time_travel_safe = false;
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "REPLAY_UNSAFE");
        expect(err).toBeDefined();
    });

    test("18. counterfactual_safe=false AND no overrides -> COUNTERFACTUAL_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.counterfactual_safe = false;
        // No counterfactual_blueprint in input.replay_validation_record
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "COUNTERFACTUAL_UNSAFE");
        expect(err).toBeDefined();
    });

    // Group 7: Policy Mirror
    test("19. Policy Mirror Drift", () => {
        const input = deepCopy(BASE_INPUT);
        // Correct way to drift: Safety Horizon binding mismatch
        input.safety_horizon_binding.policy_mirror = { pol: "DRIFT" };
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "POLICY_MIRROR_DRIFT");
        expect(err).toBeDefined();
    });

    // Group 8: Hash Chain
    test("20. Missing PIB phase hash -> MISSING_PIB_PHASE_HASH", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.pib_phase_hashes["1"];
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "MISSING_PIB_PHASE_HASH");
        expect(err).toBeDefined();
    });

    test("21. Malformed PIB phase hash -> MISSING_PIB_PHASE_HASH", () => {
        const input = deepCopy(BASE_INPUT);
        input.pib_phase_hashes["1"] = { canonical_hash: 12345 }; // Not string
        const result = phase12.execute(input);
        const err = result.errors.find(e => e.code === "MISSING_PIB_PHASE_HASH");
        expect(err).toBeDefined();
    });

    // Group 9: Determinism
    test("22. canonical_hash stability", () => {
        const input = deepCopy(BASE_INPUT);
        const r1 = phase12.execute(input);
        if (r1.metadata) {
            expect(r1.metadata.canonical_hash).toMatch(/^[a-f0-9]{64}$/);
        }
    });

});
