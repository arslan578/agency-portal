"use strict";

const phase9 = require("./pib_tiktok_phase_9");

// Mocking Shared Infrastructure
jest.mock("../../../orchestrator/shared/logging", () => ({
    logStructured: jest.fn()
}));

jest.mock("../../../orchestrator/shared/metrics", () => ({
    count: jest.fn()
}));

jest.mock("../../../orchestrator/shared/tracing", () => ({
    startSpan: jest.fn(() => ({
        setAttribute: jest.fn(),
        end: jest.fn()
    }))
}));

// Mock dependencies
const mockP1Capabilities = {
    // Injecting fields expected by P9 logic even if current P1 doesn't fully produce them yet
    // This allows verifying P9 logic correctness cleanly.
    channels: ["SEARCH", "DISPLAY"],
    campaign_types: [{ id: "SEARCH_STANDARD" }],
    quota: {
        buckets: [
            { rate: 100, unit: "MINUTE" },
            { rate: 2000, unit: "DAY" }
        ]
    },
    capabilities: ["READ_OPERATION"] // Safe baseline
};

const mockP5Routing = {
    retry_alignment: {
        max_retries: 3,
        policies: [
            { id: "RETRY_ON_503", max_retries: 3 }
        ],
        safe_abort_conditions: ["AUTH_ERROR"]
    },
    default_endpoint: "https://ads.tiktok.com/open_api"
};

const mockP6Normalizer = {
    operations: [
        { operation: "CREATE_CAMPAIGN", normalization_plan: { strip_fields: ["debug"], rename_map: {} } },
        { operation: "GET_CAMPAIGN", normalization_plan: { strip_fields: ["debug"], rename_map: {} } }
    ],
    error_mapping_plan: {
        google_domain_to_category: { "Google.Rpc.Status": "PLATFORM_ERROR" }
    }
};

const mockP7Resolver = {
    resolver_rules: {
        category_to_retry_policy: {
            "PLATFORM_ERROR": "RETRY_ON_503",
            "AUTH_ERROR": null // null implies non-retryable
        },
        safe_abort_categories: ["AUTH_ERROR"]
    }
};

const BASE_INPUT = {
    execution_id: "exec-test-p9",
    phase: "PIB_TIKTOK_PHASE_9",
    feature_flags: { "FF_PIB_TIKTOK_PHASE_9": true },
    tenant_context: { tenant_id: "t1" },
    capability_surface: JSON.parse(JSON.stringify(mockP1Capabilities)),
    routing_profile: JSON.parse(JSON.stringify(mockP5Routing)),
    response_normalizer_spec: JSON.parse(JSON.stringify(mockP6Normalizer)),
    error_resolver_spec: JSON.parse(JSON.stringify(mockP7Resolver))
};

const DEEP_COPY = (obj) => JSON.parse(JSON.stringify(obj));

describe("PIB TikTok Phase 9: Safety Horizon Binding", () => {

    describe("Happy Path", () => {
        test("1. Produces OK status with valid input", () => {
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            expect(result.status).toBe("OK");
            expect(result.execution_id).toBe("exec-test-p9");
            expect(result.phase).toBe("PIB_TIKTOK_PHASE_9");
            expect(result.output_contract_version).toBe("pib_tiktok_phase_9_output_v1");
        });

        test("2. Computes deterministic Quota Pressure (LOW > 10)", () => {
            // Mock has rate 100 -> LOW
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            expect(result.safety_horizon_binding.global_risk_profile.quota_class).toBe("DAILY_RESET"); // Mock has DAY unit -> DAILY_RESET (Patch 1)
            // Check operation projection
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].quota_pressure).toBe("LOW");
        });

        test("3. Computes deterministic Routing Risk (LOW > 2)", () => {
            // Mock has max_retries 3 -> LOW
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].routing_risk).toBe("LOW");
        });

        test("4. Computes deterministic Policy Risks (NO_MUTATION default)", () => {
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].policy_risks).toEqual(["NO_MUTATION"]);
        });

        test("5. Computes deterministic Failure Modes (Patch 3: Mapped)", () => {
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            const modes = result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].failure_modes;
            expect(modes).toContain("NORMALIZATION_FAILURE");
            expect(modes).toContain("RETRY_ON_503"); // Was PLATFORM_ERROR, now mapped
            expect(modes).toContain("AUTH_ERROR");
            // Check sorted
            expect(modes).toEqual([...modes].sort());
        });

        test("6. Computes Enforcement Grade (LENIENT)", () => {
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].enforcement_grade).toBe("LENIENT");
        });

        test("7. Computes Connector Stability (STABLE)", () => {
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            expect(result.safety_horizon_binding.global_risk_profile.connector_stability).toBe("STABLE");
        });

        test("8. Canonical Hash is stable", () => {
            const i1 = DEEP_COPY(BASE_INPUT);
            const i2 = DEEP_COPY(BASE_INPUT);
            // Scramble key order in i2
            i2.feature_flags = { "FF_PIB_TIKTOK_PHASE_9": true, "OTHER": false }; // different key order potential if JS engine varied, but we rely on Phase 9 internal sort

            const r1 = phase9.execute(i1);
            const r2 = phase9.execute(i2); // Logic should normalize input differences if they are irrelevant? No, phase 9 hashes OUTPUT.
            // If inputs are identical, output hash is identical.
            // But let's verify re-running produces exact same hash.
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("9. Canonical Hash changes on input change", () => {
            const r1 = phase9.execute(DEEP_COPY(BASE_INPUT));
            const input2 = DEEP_COPY(BASE_INPUT);
            input2.routing_profile.retry_alignment.max_retries = 0; // Changes logic -> routing risk HIGH
            const r2 = phase9.execute(input2);
            expect(r1.metadata.canonical_hash).not.toBe(r2.metadata.canonical_hash);
        });

        test("10. Fully sorted output keys", () => {
            const result = phase9.execute(DEEP_COPY(BASE_INPUT));
            const keys = Object.keys(result.safety_horizon_binding.operation_safety);
            expect(keys).toEqual([...keys].sort());
        });
    });

    describe("Edge Cases / Rule Verification", () => {
        // Patch 1 Tests
        test("Edge 1a: Quota Missing -> UNBOUNDED (Patch 1)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.capability_surface.quota;
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.global_risk_profile.quota_class).toBe("UNBOUNDED");
        });

        test("Edge 1b: Quota with DAY unit -> DAILY_RESET (Patch 1)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.capability_surface.quota.buckets.push({ rate: 1000, unit: "DAY" });
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.global_risk_profile.quota_class).toBe("DAILY_RESET");
        });

        test("Edge 1c: Quota present but no DAY -> FIXED (Patch 1)", () => {
            // BASE_INPUT mock has MINUTE and DAY, let's make it only MINUTE
            const input = DEEP_COPY(BASE_INPUT);
            input.capability_surface.quota.buckets = [{ rate: 100, unit: "MINUTE" }];
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.global_risk_profile.quota_class).toBe("FIXED");
        });

        test("Edge 2: Routing Max Retries Missing (Validation of No Inference - Patch 2)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            // Remove max_retries from alignment AND policies
            delete input.routing_profile.retry_alignment.max_retries;
            input.routing_profile.retry_alignment.policies = [];

            const result = phase9.execute(input);
            // Should fallback to MEDIUM, NOT infer from policies[0] if it existed (though here we removed policies to be sure input doesn't trigger happy path)
            // Let's test the specific "No Inference" case:
            const input2 = DEEP_COPY(BASE_INPUT);
            delete input2.routing_profile.retry_alignment.max_retries;
            // Policies exist, but we should NOT use them
            const result2 = phase9.execute(input2);
            expect(result2.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].routing_risk).toBe("MEDIUM");
        });

        test("Edge 3: Routing Max Retries = 0 -> HIGH Risk", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.routing_profile.retry_alignment.max_retries = 0;
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].routing_risk).toBe("HIGH");
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].enforcement_grade).toBe("STRICT"); // High Routing -> STRICT
            expect(result.safety_horizon_binding.global_risk_profile.connector_stability).toBe("DEGRADED"); // High Routing -> DEGRADED
        });

        test("Edge 4: Failure Mode Mapping (Patch 3)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            // Verify mapping: PLATFORM_ERROR -> RETRY_ON_503, AUTH_ERROR -> AUTH_ERROR (null policy)
            const result = phase9.execute(input);
            const modes = result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].failure_modes;
            expect(modes).toContain("RETRY_ON_503"); // Mapped
            expect(modes).not.toContain("PLATFORM_ERROR"); // Original category replaced
            expect(modes).toContain("AUTH_ERROR"); // Null policy keeps category
        });

        test("Edge 5: Retry Sensitive Domains (Patch 4)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            const result = phase9.execute(input); // Execute to get the result object
            const domains = result.safety_horizon_binding.safety_hints.retry_sensitive_domains;
            // Google.Rpc.Status maps to PLATFORM_ERROR which maps to RETRY_ON_503 (retryable)
            expect(domains).toContain("Google.Rpc.Status");
        });

        test("Edge 6: Normalization Health (Patch 5)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            // Break normalization plan
            input.response_normalizer_spec.operations[0].normalization_plan = null;
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.safety_hints.normalization_health).toBe("IMPAIRED");

            const inputGood = DEEP_COPY(BASE_INPUT);
            const resultGood = phase9.execute(inputGood);
            expect(resultGood.safety_horizon_binding.safety_hints.normalization_health).toBe("GOOD");
        });

        test("Edge 7: Quota Rate < 5 -> HIGH Pressure", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.capability_surface.quota.buckets = [{ rate: 4, unit: "MINUTE" }];
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].quota_pressure).toBe("HIGH");
            expect(result.safety_horizon_binding.global_risk_profile.connector_stability).toBe("UNSTABLE"); // High Quota -> Unstable
        });

        test("Edge 8: Policy Risks - STATE_MUTATION", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.capability_surface.capabilities = ["WRITE_OPERATION"];
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].policy_risks).toContain("STATE_MUTATION");
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].enforcement_grade).toBe("MODERATE"); // Mutation -> MODERATE
            expect(result.safety_horizon_binding.global_risk_profile.policy_exposure).toBe("HIGH");
        });

        test("Edge 9: Policy Risks - IRREVERSIBLE_CHANGE", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.capability_surface.capabilities = ["DELETE_OPERATION"];
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].policy_risks).toContain("IRREVERSIBLE_CHANGE");
        });

        test("Edge 10: Missing P1 Capabilities -> NO_MUTATION (Fallback)", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.capability_surface.capabilities = undefined;
            const result = phase9.execute(input);
            expect(result.safety_horizon_binding.operation_safety["CREATE_CAMPAIGN"].policy_risks).toEqual(["NO_MUTATION"]);
        });
    });

    describe("Negative Path", () => {
        test("11. Missing capability_surface -> MISSING_DEPENDENCY", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.capability_surface;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });

        test("12. Missing routing_profile -> MISSING_DEPENDENCY", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.routing_profile;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });

        test("13. Missing response_normalizer_spec -> MISSING_DEPENDENCY", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.response_normalizer_spec;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });

        test("14. Missing error_resolver_spec -> MISSING_DEPENDENCY", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.error_resolver_spec;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });

        test("15. Missing tenant_context -> INVALID_INPUT", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.tenant_context;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("16. Forbidden fields -> FORBIDDEN_FIELD", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input._debug = true;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("17. Wrong Phase -> INVALID_INPUT", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.phase = "WRONG_PHASE";
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("18. Missing feature flags -> INVALID_INPUT", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.feature_flags;
            const result = phase9.execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });
    });

    describe("Feature Flag", () => {
        test("19. Feature flag OFF -> NO_OP", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.feature_flags["FF_PIB_TIKTOK_PHASE_9"] = false;
            const result = phase9.execute(input);
            expect(result.status).toBe("NO_OP");
            expect(result.safety_horizon_binding).toBeUndefined();
        });
    });
});
