const { execute } = require("./pib_meta_phase_2");

// Mocks
jest.mock("../../../orchestrator/shared/logging", () => ({ logStructured: jest.fn() }));
jest.mock("../../../orchestrator/shared/metrics", () => ({ count: jest.fn() }));
jest.mock("../../../orchestrator/shared/tracing", () => ({
    startSpan: jest.fn(() => ({
        setAttribute: jest.fn(),
        end: jest.fn()
    }))
}));

const BASE_CONTRACT = {
    connector_id: "meta_ads",
    version: "1.0.0",
    io_schema: {
        request_contract: {
            operations: [
                { operation: "CREATE_CAMPAIGN", google_api_method_ref: "facebook.graph.v19.0.act_account_id.campaigns.POST", payload_shape_ref: "meta_ads_create_campaign_payload_v1", idempotency_key_strategy: "HASH(tenant_id, workspace_id, campaign_external_reference)" },
                { operation: "CREATE_AD_GROUP", google_api_method_ref: "facebook.graph.v19.0.act_account_id.adsets.POST", payload_shape_ref: "meta_ads_create_ad_group_payload_v1", idempotency_key_strategy: "HASH(tenant_id, workspace_id, ad_group_external_reference)" }
            ]
        },
        error_mapping: {
            domains: [
                { google_domain: "OAuthException", mapped_category: "AUTH", default_retry_policy: "NO_RETRY" },
                { google_domain: "Throttling", mapped_category: "RATE_LIMIT", default_retry_policy: "RETRY_WITH_BACKOFF" }
            ],
            kaivo_error_codes: [
                { code: "META_RATE_LIMITED", category: "RATE_LIMIT", retry_policy: "RETRY_WITH_BACKOFF" },
                { code: "META_INVALID_REQUEST", category: "REQUEST", retry_policy: "NO_RETRY" }
            ]
        }
    },
    routing: {
        default_endpoint: "https://graph.facebook.com/v19.0",
        supports_batching: true,
        max_batch_size: 50,
        concurrency_limits: { per_workspace_max_in_flight: 10, per_tenant_max_in_flight: 50 },
        rate_limit_hint: { tokens_per_second_soft_ceiling: 5, burst_size_soft_ceiling: 10 },
        timeout_ms: { connect_timeout_ms: 3000, read_timeout_ms: 60000 }
    },
    retry_logic: {
        policies: [
            { id: "RETRY_WITH_BACKOFF", max_attempts: 5, backoff_strategy: "EXPONENTIAL" },
            { id: "NO_RETRY", max_attempts: 1, backoff_strategy: "NONE" }
        ],
        safe_abort_conditions: ["AUTH", "POLICY", "INVALID_REQUEST"]
    }
};

const TEST_CTX = {
    execution_id: "test-exec-id-p2",
    phase: "PIB_META_PHASE_2",
    feature_flags: { FF_PIB_META_PHASE_2: true },
    tenant_context: { tenant_id: "system" },
    meta_contract: BASE_CONTRACT
};

describe("PIB-META-PHASE-2", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Valid extraction returns OK", () => {
            const result = execute(TEST_CTX);
            expect(result.status).toBe("OK");
            expect(result.io_surface).toBeDefined();
        });

        test("2. Operations sorted deterministically", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.io_schema.request_contract.operations = [
                { operation: "B_OP", google_api_method_ref: "b", payload_shape_ref: "b", idempotency_key_strategy: "NONE" },
                { operation: "A_OP", google_api_method_ref: "a", payload_shape_ref: "a", idempotency_key_strategy: "NONE" }
            ];
            const result = execute({ ...TEST_CTX, meta_contract: unsorted });
            const ops = result.io_surface.operations.map(o => o.operation);
            expect(ops).toEqual(["A_OP", "B_OP"]);
        });

        test("3. Payload shapes extracted deterministically", () => {
            const result = execute(TEST_CTX);
            const shapes = Object.keys(result.io_surface.payload_shapes).sort();
            expect(shapes).toEqual(["meta_ads_create_ad_group_payload_v1", "meta_ads_create_campaign_payload_v1"]);
        });

        test("4. Routing profile normalization correct", () => {
            const result = execute(TEST_CTX);
            expect(result.io_surface.routing.default_endpoint).toBe("https://graph.facebook.com/v19.0");
            expect(Object.keys(result.io_surface.routing.concurrency_limits).sort()).toEqual(["per_tenant_max_in_flight", "per_workspace_max_in_flight"]);
        });

        test("5. Error mapping sorted deterministically", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.io_schema.error_mapping.domains = [
                { google_domain: "z_domain" },
                { google_domain: "a_domain" }
            ];
            const result = execute({ ...TEST_CTX, meta_contract: unsorted });
            const domains = result.io_surface.error_mapping.google_domains.map(d => d.google_domain);
            expect(domains).toEqual(["a_domain", "z_domain"]);
        });

        test("6. Retry logic sorted deterministically", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.retry_logic.policies = [
                { id: "Z_POL" }, { id: "A_POL" }
            ];
            const result = execute({ ...TEST_CTX, meta_contract: unsorted });
            const pols = result.io_surface.retry_logic.policies.map(p => p.id);
            expect(pols).toEqual(["A_POL", "Z_POL"]);
        });

        test("7. Canonical hash stable across runs", () => {
            const result1 = execute(TEST_CTX);
            const result2 = execute(TEST_CTX);
            expect(result1.metadata.canonical_hash).toBe(result2.metadata.canonical_hash);
        });

        test("8. Canonical hash stable across key-order variations", () => {
            const a = JSON.parse(JSON.stringify(TEST_CTX));
            const b = JSON.parse(JSON.stringify(TEST_CTX));

            // Reverse key order of the contract object
            const entries = Object.entries(b.meta_contract).reverse();
            const reordered = {};
            for (const [k, v] of entries) reordered[k] = v;
            b.meta_contract = reordered;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });
    });

    describe("Negative Path", () => {
        test("9. Missing meta_contract", () => {
            const input = { ...TEST_CTX, meta_contract: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_FIELD");
        });

        test("10. Missing version", () => {
            const input = { ...TEST_CTX, meta_contract: { ...BASE_CONTRACT, version: undefined } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });

        test("11. Invalid semver", () => {
            const input = { ...TEST_CTX, meta_contract: { ...BASE_CONTRACT, version: "v1.0" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });

        test("12. Wrong connector_id", () => {
            const input = { ...TEST_CTX, meta_contract: { ...BASE_CONTRACT, connector_id: "google_ads" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });

        test("13. Missing feature flag -> NO_OP", () => {
            const input = { ...TEST_CTX, feature_flags: {} };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });

        test("14. Forbidden field at top-level", () => {
            const input = { ...TEST_CTX, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("15. connector_version present -> ERROR", () => {
            const input = { ...TEST_CTX, meta_contract: { ...BASE_CONTRACT, connector_version: "1.0.0" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });
    });

    describe("Edge Cases", () => {
        test("16. Missing operations array", () => {
            const empty = JSON.parse(JSON.stringify(BASE_CONTRACT));
            delete empty.io_schema.request_contract.operations;
            const result = execute({ ...TEST_CTX, meta_contract: empty });
            expect(result.status).toBe("OK");
            expect(result.io_surface.operations).toEqual([]);
        });

        test("17. Missing retry logic -> ERROR", () => {
            const empty = JSON.parse(JSON.stringify(BASE_CONTRACT));
            delete empty.retry_logic;
            const result = execute({ ...TEST_CTX, meta_contract: empty });
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_RETRY_LOGIC");
        });

        test("18. Missing routing fields (should handle gracefully but remain deterministic)", () => {
            const empty = JSON.parse(JSON.stringify(BASE_CONTRACT));
            delete empty.routing;
            const result = execute({ ...TEST_CTX, meta_contract: empty });
            expect(result.status).toBe("OK");
            expect(result.io_surface.routing.default_endpoint).toBeUndefined();
            // Check stability
            const r2 = execute({ ...TEST_CTX, meta_contract: empty });
            expect(result.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });
    });
});
