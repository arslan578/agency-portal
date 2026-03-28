const { execute } = require("./pib_google_phase_7");

// Mocks
jest.mock("../../../orchestrator/shared/logging", () => ({ logStructured: jest.fn() }));
jest.mock("../../../orchestrator/shared/metrics", () => ({ count: jest.fn() }));
jest.mock("../../../orchestrator/shared/tracing", () => ({
    startSpan: jest.fn(() => ({
        setAttribute: jest.fn(),
        end: jest.fn()
    }))
}));

const BASE_INPUT = {
    execution_id: "test-exec-id-p7",
    phase: "PIB_GOOGLE_PHASE_7",
    feature_flags: { FF_PIB_GOOGLE_PHASE_7: true },
    tenant_context: { tenant_id: "system" },
    io_surface: {
        error_mapping: {
            google_domains: ["QUOTA"],
            kaivo_error_codes: [{ code: "THROTTLING" }] // Ignored by Spec, but required struct
        }
    },
    routing_profile: {
        retry_alignment: {
            policies: [
                { id: "THROTTLING" },
                { id: "TRANSIENT" }
            ],
            safe_abort_conditions: ["AUTH_FAILED"]
        }
    },
    response_normalizer_spec: {
        error_mapping_plan: {
            google_domain_to_category: {
                "QUOTA": "THROTTLING",
                "BAD_TOKEN": "AUTH_FAILED",
                "UNKNOWN": "PLATFORM_ERROR"
            }
        }
    }
};

describe("PIB-GOOGLE-PHASE-7", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Valid error resolver spec created", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.error_resolver_spec).toBeDefined();
        });

        test("2. Domain category map matches input", () => {
            const result = execute(BASE_INPUT);
            const map = result.error_resolver_spec.domain_category_map;
            expect(map).toEqual({
                "BAD_TOKEN": "AUTH_FAILED",
                "QUOTA": "THROTTLING",
                "UNKNOWN": "PLATFORM_ERROR"
            });
        });

        test("3. Category set includes all sources", () => {
            // Sources: 
            // - Map values: THROTTLING, AUTH_FAILED, PLATFORM_ERROR
            // - Safe Abort: AUTH_FAILED
            // - Fallback: PLATFORM_ERROR
            // Union: THROTTLING, AUTH_FAILED, PLATFORM_ERROR
            const result = execute(BASE_INPUT);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            expect(Object.keys(rules)).toEqual(["AUTH_FAILED", "PLATFORM_ERROR", "THROTTLING"]);
        });

        test("4. Safe abort precedence", () => {
            // AUTH_FAILED is in safe_abort_conditions
            // It might or might not have a policy with same ID (not in this input, but let's test rule)
            // Rule: "If category in safe_abort_conditions : retry_policy = null"
            const result = execute(BASE_INPUT);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            expect(rules["AUTH_FAILED"]).toBeNull();
        });

        test("5. Policy match resolution", () => {
            // THROTTLING is NOT in safe aborts.
            // THROTTLING is in policies list.
            // Should resolve to "THROTTLING".
            const result = execute(BASE_INPUT);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            expect(rules["THROTTLING"]).toBe("THROTTLING");
        });

        test("6. No policy match -> default policy id", () => {
            // PLATFORM_ERROR is not in safe aborts.
            // PLATFORM_ERROR is not in policies list (only THROTTLING, TRANSIENT).
            // We now map it to the alphabetically first policy id as deterministic default.
            const result = execute(BASE_INPUT);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            expect(rules["PLATFORM_ERROR"]).toBe("THROTTLING"); // policies: THROTTLING, TRANSIENT -> THROTTLING is first
        });

        test("7. Fallback category is PLATFORM_ERROR", () => {
            const result = execute(BASE_INPUT);
            expect(result.error_resolver_spec.resolver_rules.fallback_category).toBe("PLATFORM_ERROR");
        });

        test("8. Safe abort categories sorted", () => {
            const result = execute(BASE_INPUT);
            expect(result.error_resolver_spec.resolver_rules.safe_abort_categories).toEqual(["AUTH_FAILED"]);
        });

        test("9. Canonical hash stable across runs", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("10. Canonical hash stable across key reordering", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));

            // Reorder keys in google_domain_to_category
            const map = b.response_normalizer_spec.error_mapping_plan.google_domain_to_category;
            const newMap = {};
            // Reverse keys
            Object.keys(map).reverse().forEach(k => newMap[k] = map[k]);
            b.response_normalizer_spec.error_mapping_plan.google_domain_to_category = newMap;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });
    });

    describe("Negative Path", () => {
        test("11. Missing io_surface -> MISSING_IO_SURFACE", () => {
            const input = { ...BASE_INPUT, io_surface: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_IO_SURFACE");
        });

        test("12. Missing error_mapping -> MISSING_ERROR_MAPPING", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.io_surface.error_mapping;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_ERROR_MAPPING");
        });

        test("13. Missing routing_profile -> MISSING_ROUTING_PROFILE", () => {
            const input = { ...BASE_INPUT, routing_profile: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_ROUTING_PROFILE");
        });

        test("14. Missing response_normalizer_spec -> MISSING_RESPONSE_NORMALIZER", () => {
            const input = { ...BASE_INPUT, response_normalizer_spec: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_RESPONSE_NORMALIZER");
        });

        test("15. Missing error_mapping_plan -> MISSING_ERROR_MAPPING_PLAN", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.response_normalizer_spec.error_mapping_plan;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_ERROR_MAPPING_PLAN");
        });

        test("16. Wrong phase -> INVALID_INPUT", () => {
            const input = { ...BASE_INPUT, phase: "WRONG" };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("17. Forbidden field -> FORBIDDEN_FIELD", () => {
            const input = { ...BASE_INPUT, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("18. Missing feature flag key -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: {} };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });

        test("Feature flag false -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: { FF_PIB_GOOGLE_PHASE_7: false } };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });

        test("Missing feature flag object -> INVALID_INPUT", () => {
            const input = { ...BASE_INPUT, feature_flags: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });
    });

    describe("Edge Cases", () => {
        test("19. Empty maps (io_surface/routing provided but empty content)", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.routing_profile.retry_alignment = { policies: [], safe_abort_conditions: [] };
            input.response_normalizer_spec.error_mapping_plan.google_domain_to_category = {};

            const result = execute(input);
            expect(result.status).toBe("OK");
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            // Only fallback category should remain
            expect(rules).toEqual({ "PLATFORM_ERROR": null });
        });

        test("20. Disjoint sets (categories don't overlap with policies)", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            // Categories: FOO
            input.response_normalizer_spec.error_mapping_plan.google_domain_to_category = { "D": "FOO" };
            // Policies: BAR
            input.routing_profile.retry_alignment.policies = [{ id: "BAR" }];

            const result = execute(input);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            // FOO -> default policy (BAR)
            expect(rules["FOO"]).toBe("BAR");
        });

        test("21. Safe abort matches category but no policy exists (should be null anyway)", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.response_normalizer_spec.error_mapping_plan.google_domain_to_category = { "D": "ABORT_ME" };
            input.routing_profile.retry_alignment.safe_abort_conditions = ["ABORT_ME"];
            input.routing_profile.retry_alignment.policies = [];

            const result = execute(input);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            expect(rules["ABORT_ME"]).toBeNull();
        });

        test("22. Category matches BOTH safe abort AND policy -> Safe Abort wins (null)", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.response_normalizer_spec.error_mapping_plan.google_domain_to_category = { "D": "CONFLICT" };
            input.routing_profile.retry_alignment.safe_abort_conditions = ["CONFLICT"];
            input.routing_profile.retry_alignment.policies = [{ id: "CONFLICT" }];

            const result = execute(input);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            expect(rules["CONFLICT"]).toBeNull();
        });

        test("23. Disjoint categories with policies -> categories use default policy id", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.response_normalizer_spec.error_mapping_plan.google_domain_to_category = { "D": "FOO" };
            input.routing_profile.retry_alignment = {
                policies: [{ id: "BAR" }, { id: "ZED" }],
                safe_abort_conditions: []
            };

            const result = execute(input);
            const rules = result.error_resolver_spec.resolver_rules.category_to_retry_policy;
            // Alphabetically first policy id is "BAR"
            expect(rules["FOO"]).toBe("BAR");
        });
    });
});
