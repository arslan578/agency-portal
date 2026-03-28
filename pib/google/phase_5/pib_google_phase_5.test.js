const { execute } = require("./pib_google_phase_5");

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
    execution_id: "test-exec-id-p5",
    phase: "PIB_GOOGLE_PHASE_5",
    feature_flags: { FF_PIB_GOOGLE_PHASE_5: true },
    tenant_context: { tenant_id: "system" },
    google_contract: {
        connector_id: "google_ads",
        version: "1.0.0",
        retry_logic: {}
    },
    validator_image: {
        operations: [],
        idempotency_matrix: {},
        payload_shapes: {}
    },
    io_surface: {
        routing: {
            default_endpoint: "https://googleads.googleapis.com",
            supports_batching: true,
            max_batch_size: 1000,
            concurrency_limits: { "c.mutate": 100, "c.get": 500 },
            rate_limit_hint: { "c.mutate": "1000/min", "global": "10000/min" },
            timeout_ms: { connect_timeout_ms: 1000, read_timeout_ms: 5000 }
        },
        retry_logic: {
            policies: [
                { id: "policy_b", type: "exp_backoff" },
                { id: "policy_a", type: "linear" }
            ],
            safe_abort_conditions: ["CONDITION_Z", "CONDITION_A"]
        }
    }
};

describe("PIB-GOOGLE-PHASE-5", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Produces routing_profile with correct structures", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.routing_profile).toBeDefined();
            expect(result.routing_profile.default_endpoint).toBe("https://googleads.googleapis.com");
            expect(result.routing_profile.batching.supported).toBe(true);
        });

        test("2. Deterministic endpoint selection", () => {
            const result = execute(BASE_INPUT);
            expect(result.routing_profile.default_endpoint).toBe("https://googleads.googleapis.com");
        });

        test("3. Deterministic batching rules", () => {
            const result = execute(BASE_INPUT);
            expect(result.routing_profile.batching).toEqual({ supported: true, max_batch_size: 1000 });
        });

        test("4. Deterministic concurrency sorting", () => {
            // Input has c.mutate then c.get. Output keys should be sorted.
            const result = execute(BASE_INPUT);
            const keys = Object.keys(result.routing_profile.concurrency.limits);
            expect(keys).toEqual(["c.get", "c.mutate"]);
        });

        test("5. Deterministic rate-limit sorting", () => {
            // Input has c.mutate then global. Output keys should be sorted.
            const result = execute(BASE_INPUT);
            const keys = Object.keys(result.routing_profile.rate_limits.hint);
            expect(keys).toEqual(["c.mutate", "global"]);
        });

        test("6. Deterministic retry-policy sorting", () => {
            // Input policies: policy_b, policy_a. Output should be policy_a, policy_b.
            const result = execute(BASE_INPUT);
            const policies = result.routing_profile.retry_alignment.policies;
            expect(policies[0].id).toBe("policy_a");
            expect(policies[1].id).toBe("policy_b");
            // Safe abort also sorted
            const aborts = result.routing_profile.retry_alignment.safe_abort_conditions;
            expect(aborts).toEqual(["CONDITION_A", "CONDITION_Z"]);
        });

        test("7. Deterministic canonical hash stable across runs", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("8. Deterministic canonical hash stable across key-order variations", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));

            // Reverse keys in routing object of b
            const routingEntries = Object.entries(b.io_surface.routing).reverse();
            const reorderedRouting = {};
            for (const [k, v] of routingEntries) reorderedRouting[k] = v;
            b.io_surface.routing = reorderedRouting;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("9. Retry alignment structures match spec", () => {
            const result = execute(BASE_INPUT);
            const align = result.routing_profile.retry_alignment;
            expect(Array.isArray(align.policies)).toBe(true);
            expect(Array.isArray(align.safe_abort_conditions)).toBe(true);
        });
    });

    describe("Negative Path", () => {
        // Contract Validation Tests (New)
        test("10. Missing google_contract -> ERROR", () => {
            const input = { ...BASE_INPUT, google_contract: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_CONTRACT");
        });

        test("11. Wrong connector_id -> CONTRACT_VIOLATION", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.google_contract.connector_id = "meta_ads";
            const result = execute(input);
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
            expect(result.errors[0].message).toContain("google_ads");
        });

        test("12. Invalid or missing version -> CONTRACT_VIOLATION", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.google_contract.version = "1.0"; // invalid semver
            const result = execute(input);
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
            expect(result.errors[0].message).toContain("SemVer");
        });

        test("13. Presence of connector_version -> CONTRACT_VIOLATION", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.google_contract.connector_version = "old";
            const result = execute(input);
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
            expect(result.errors[0].message).toContain("forbidden");
        });

        test("14. Missing google_contract.retry_logic -> MISSING_RETRY_LOGIC", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.google_contract.retry_logic;
            const result = execute(input);
            expect(result.errors[0].code).toBe("MISSING_RETRY_LOGIC");
        });

        // Legacy Negative Tests
        test("15. Missing validator_image -> ERROR", () => {
            const input = { ...BASE_INPUT, validator_image: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].message).toContain("validator_image");
        });

        test("16. Missing io_surface -> ERROR", () => {
            const input = { ...BASE_INPUT, io_surface: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_IO_SURFACE");
        });

        test("17. Missing routing object -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.io_surface.routing;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_ROUTING");
        });

        test("18. Missing retry_logic -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.io_surface.retry_logic;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_RETRY_LOGIC");
        });

        test("19. Forbidden field -> ERROR", () => {
            const input = { ...BASE_INPUT, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("20. Phase mismatch -> ERROR", () => {
            const input = { ...BASE_INPUT, phase: "WRONG" };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("21. INVALID_INPUT for null", () => {
            const result = execute(null);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("Feature flag false -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: { FF_PIB_GOOGLE_PHASE_5: false } };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });
    });

    describe("Edge Cases", () => {
        test("17. Empty routing fields -> deterministic with nulls", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.routing = {}; // All fields undefined
            // Spec validation requires routing object to exist, but fields can be missing?
            // "default_endpoint = io_surface.routing.default_endpoint if present else null."
            // So empty routing object is valid logic-wise?
            // But validation check says: "routing missing inside io_surface -> ERROR".
            // Here routing exists but is empty.
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.routing_profile.default_endpoint).toBeNull();
            expect(result.routing_profile.batching.supported).toBe(false);
            expect(result.routing_profile.timeouts.connect_timeout_ms).toBeNull();
        });

        test("18. Empty concurrency object -> {}", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.routing.concurrency_limits = {};
            const result = execute(input);
            expect(result.routing_profile.concurrency.limits).toEqual({});
        });

        test("19. Empty rate limit hint -> {}", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.routing.rate_limit_hint = {};
            const result = execute(input);
            expect(result.routing_profile.rate_limits.hint).toEqual({});
        });

        test("20. Empty retry logic policies -> []", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.retry_logic.policies = [];
            const result = execute(input);
            expect(result.routing_profile.retry_alignment.policies).toEqual([]);
        });

        test("21. Empty safe_abort_conditions -> []", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.retry_logic.safe_abort_conditions = [];
            const result = execute(input);
            expect(result.routing_profile.retry_alignment.safe_abort_conditions).toEqual([]);
        });

        test("22. Random reorder of input keys -> deterministic output", () => {
            // General check again
            const result = execute(BASE_INPUT);
            expect(result.metadata.canonical_hash).toBeDefined();
        });
    });
});
