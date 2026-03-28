const phase11 = require("./pib_google_phase_11");

// --- MOCKS ---
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const BASE_INPUT = {
    execution_id: "exec-1",
    phase: "PIB_GOOGLE_PHASE_11",
    feature_flags: { FF_PIB_GOOGLE_PHASE_11: true },

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
        // Refs matching the objects above
        capability_surface_ref: { caps: "valid" },
        io_surface_ref: { io: "valid" },
        request_blueprint_ref: { req: "valid" },
        validator_image_ref: { val: "valid" },
        routing_profile_ref: { route: "valid", policy_mirror: { pol: "same" } },
        response_normalizer_spec_ref: { res: "valid" },
        error_resolver_spec_ref: { err: "valid" }
    },

    envelope_plan: { plan: "ignored_but_present" },

    safety_horizon_binding: {
        global_risk_profile: { policy_exposure: "LOW" },
        policy_mirror: { pol: "same" }
    },

    replay_validation_record: {
        replay_safe: true,
        time_travel_safe: true,
        counterfactual_safe: true,
        // counterfactual_blueprint usually not here in PIB-10 output, 
        // but required by PIB-11 logic if safe=false.
        audit_ledger_entry: {}
    }
};

describe("PIB Google Phase 11: Activation Checkpoint", () => {

    // 1. Happy Path
    test("1. Full success -> ACTIVE", () => {
        const input = deepCopy(BASE_INPUT);
        const result = phase11.execute(input);
        expect(result.status).toBe("OK");
        expect(result.activation_status).toBe("ACTIVE");
        expect(result.activation_details.drift_detected).toBe(false);
    });

    // 2. Feature Flag
    test("2. Feature flag off -> NO_OP", () => {
        const input = deepCopy(BASE_INPUT);
        input.feature_flags.FF_PIB_GOOGLE_PHASE_11 = false;
        const result = phase11.execute(input);
        expect(result.status).toBe("NO_OP");
        expect(result.execution_id).toBe("exec-1");
    });

    // 3. Wrong Phase
    test("3. Wrong phase -> INVALID_INPUT", () => {
        const input = deepCopy(BASE_INPUT);
        input.phase = "WRONG";
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("INVALID_INPUT");
    });

    // 4. Missing Dependencies
    test("4. Missing Dependencies -> MISSING_DEPENDENCY", () => {
        const required = [
            "capability_surface", "io_surface", "request_blueprint",
            "validator_image", "routing_profile", "response_normalizer_spec",
            "error_resolver_spec", "recorder_schema", "envelope_plan",
            "safety_horizon_binding", "replay_validation_record"
        ];

        required.forEach(field => {
            const input = deepCopy(BASE_INPUT);
            delete input[field];
            const result = phase11.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.code).toBe("MISSING_DEPENDENCY");
        });
    });

    // 5. Capability Mirror Drift
    test("5. Capability Mirror Drift -> CAPABILITY_MIRROR_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.capability_surface.caps = "DRIFT";
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("CAPABILITY_MIRROR_DRIFT");
    });

    // 6. IO Layer Drift (Test one representative)
    test("6. IO Layer Drift -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        input.io_surface.io = "DRIFT";
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("IO_LAYER_DRIFT");
    });

    test("7. Missing Ref in Recorder Schema -> IO_LAYER_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        delete input.recorder_schema.request_blueprint_ref;
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        // Impl returns DRIFT for missing ref too
        expect(result.code).toBe("IO_LAYER_DRIFT");
    });

    // 7. Safety Horizon Unsafe
    test("8. Safety Horizon UNSAFE -> SAFETY_HORIZON_UNSAFE", () => {
        const levels = ["CRITICAL", "BLOCKING", "UNSAFE"];
        levels.forEach(lvl => {
            const input = deepCopy(BASE_INPUT);
            input.safety_horizon_binding.global_risk_profile.policy_exposure = lvl;
            const result = phase11.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.code).toBe("SAFETY_HORIZON_UNSAFE");
        });
    });

    // 8. Replay Unsafe
    test("9. Replay safe false -> REPLAY_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.replay_safe = false;
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("REPLAY_UNSAFE");
    });

    test("10. Time Travel safe false -> REPLAY_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.time_travel_safe = false;
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("REPLAY_UNSAFE");
    });

    // 9. Counterfactual Unsafe
    test("11. Counterfactual safe false AND no overrides -> COUNTERFACTUAL_UNSAFE", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.counterfactual_safe = false;
        // No blueprint in record by default mock
        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("COUNTERFACTUAL_UNSAFE");
    });

    test("12. Counterfactual safe false BUT overrides present -> Active", () => {
        const input = deepCopy(BASE_INPUT);
        input.replay_validation_record.counterfactual_safe = false;
        input.replay_validation_record.counterfactual_blueprint = {
            overrides: { allow: true }
        };
        const result = phase11.execute(input);
        expect(result.status).toBe("OK");
        expect(result.activation_status).toBe("ACTIVE");
    });

    // 10. Policy Mirror Drift
    test("13. Policy Mirror Drift -> POLICY_MIRROR_DRIFT", () => {
        const input = deepCopy(BASE_INPUT);
        // Perturb Safety Horizon Binding Policy Mirror (to skip IO Check failure)
        // IO Check compares routing_profile to recorder_schema.routing_profile_ref (Stable)
        // Policy Check compares routing_profile.policy_mirror vs safety_horizon.policy_mirror
        input.safety_horizon_binding.policy_mirror = { pol: "DRIFT" };

        const result = phase11.execute(input);
        expect(result.status).toBe("ERROR");
        expect(result.code).toBe("POLICY_MIRROR_DRIFT");
    });

    // 11. Determinism
    test("14. Output stability", () => {
        const input = deepCopy(BASE_INPUT);
        const r1 = phase11.execute(input);
        const r2 = phase11.execute(input);
        expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
    });

    test("15. Forbidden Fields", () => {
        const input = deepCopy(BASE_INPUT);
        input._debug = true;
        const result = phase11.execute(input);
        expect(result.code).toBe("FORBIDDEN_FIELD");
    });

});
