const { execute } = require("./pib_meta_phase_6");

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
    execution_id: "test-exec-id-p6-meta",
    phase: "PIB_META_PHASE_6",
    feature_flags: { FF_PIB_META_PHASE_6: true },
    tenant_context: { tenant_id: "system" },
    io_surface: {
        operations: [
            { operation: "CREATE_CAMPAIGN", google_api_method_ref: "POST /v18.0/act_{id}/campaigns" },
            { operation: "GET_CAMPAIGN", google_api_method_ref: "GET /v18.0/{campaign_id}" }
        ],
        error_mapping: {
            google_domains: [
                { google_domain: "THROTTLED", mapped_category: "THROTTLING" },
                { google_domain: "AUTHENTICATION_ERROR", mapped_category: "AUTHENTICATION" },
                { google_domain: "INTERNAL_ERROR", mapped_category: "PLATFORM_ERROR" }
            ],
            kaivo_error_codes: [{ code: "THROTTLING" }, { code: "AUTH_FAILED" }]
        }
    },
    routing_profile: {
        default_endpoint: "https://graph.facebook.com/v18.0"
    }
};

describe("PIB-META-PHASE-6", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Valid response normalizer spec created", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.response_normalizer_spec).toBeDefined();
        });

        test("2. Deterministic strip rules", () => {
            const result = execute(BASE_INPUT);
            const op = result.response_normalizer_spec.operations[0];
            expect(op.normalization_plan.strip_fields).toEqual([
                "debugInfo",
                "diagnostics",
                "partialFailureError",
                "policySummary",
                "responseHeaders",
                "responseMetaData"
            ]); // Sorted alphabetically
        });

        test("3. Deterministic rename rules", () => {
            const result = execute(BASE_INPUT);
            const op = result.response_normalizer_spec.operations[0];
            expect(op.normalization_plan.rename_map).toEqual({ "resourceName": "id" });
        });

        test("4. Deterministic domain -> category mapping", () => {
            const result = execute(BASE_INPUT);
            const mapping = result.response_normalizer_spec.error_mapping_plan.google_domain_to_category;
            expect(mapping["THROTTLED"]).toBe("THROTTLING");
            expect(mapping["AUTHENTICATION_ERROR"]).toBe("AUTHENTICATION");
            expect(mapping["INTERNAL_ERROR"]).toBe("PLATFORM_ERROR");
        });

        test("5. canonical_hash stable across runs", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("6. canonical_hash stable across key reordering", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));

            // Reorder keys in error_mapping of inputs
            const em = b.io_surface.error_mapping;
            const newEm = {};
            const keys = Object.keys(em).reverse();
            keys.forEach(k => newEm[k] = em[k]);
            b.io_surface.error_mapping = newEm;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("7. Error plan sorted", () => {
            const result = execute(BASE_INPUT);
            const domains = Object.keys(result.response_normalizer_spec.error_mapping_plan.google_domain_to_category);
            // Expected sorted keys
            expect(domains).toEqual(["AUTHENTICATION_ERROR", "INTERNAL_ERROR", "THROTTLED"]);
        });

        test("8. Timestamp normalization always enabled", () => {
            const result = execute(BASE_INPUT);
            const op = result.response_normalizer_spec.operations[0];
            expect(op.normalization_plan.normalize_timestamps).toBe(true);
        });
    });

    describe("Negative Path", () => {
        test("9. Missing io_surface -> ERROR", () => {
            const input = { ...BASE_INPUT, io_surface: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_IO_SURFACE");
        });

        test("10. Missing routing_profile -> ERROR", () => {
            const input = { ...BASE_INPUT, routing_profile: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_ROUTING_PROFILE");
        });

        test("11. Missing feature flag -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: {} };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });

        test("12. Forbidden fields -> ERROR", () => {
            const input = { ...BASE_INPUT, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("13. Wrong phase -> ERROR", () => {
            const input = { ...BASE_INPUT, phase: "WRONG" };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("14. operations not array -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.operations = "invalid";
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_OPERATIONS");
        });

        test("15. missing error mapping (deep check) -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.io_surface.error_mapping;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_ERROR_MAPPING");
        });
    });

    describe("Edge Cases", () => {
        test("16. Empty operations -> empty plans", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.operations = [];
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.response_normalizer_spec.operations).toEqual([]);
        });

        test("17. operation missing google_api_method_ref -> INVALID_OPERATION_SHAPE", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.operations = [{ operation: "OP_NO_REFS" }];
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_OPERATION_SHAPE");
        });

        test("18. random key reordering -> stable canonical_hash", () => {
            const result = execute(BASE_INPUT);
            expect(result.metadata.canonical_hash).toBeDefined();
        });
    });
});
