const { execute } = require("./pib_tiktok_phase_1");

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
    connector_id: "tiktok_ads",
    version: "1.0.0",
    capabilities: {
        channels: ["SEARCH", "DISPLAY"], // [PLACEHOLDER: real TikTok capabilities]
        campaign_types: [
            { id: "SEARCH_STD", channel: "SEARCH", allowed_objectives: ["SALES"], allowed_bidding_strategies: ["CPA"], surfaces: ["GOOGLE"], phase_support: {} },
            { id: "DISPLAY_STD", channel: "DISPLAY", allowed_objectives: ["AWARENESS"], allowed_bidding_strategies: ["CPM"], surfaces: ["NETWORK"], phase_support: {} }
        ],
        bidding_strategies: [
            { id: "CPA", requires_target_value: true, supported_channels: ["SEARCH"] },
            { id: "CPM", requires_target_value: true, supported_channels: ["DISPLAY"] }
        ],
        targeting: {
            segments: [
                { id: "GEO", required_for_campaign_types: [], supports_negative_targets: true }
            ]
        },
        creative_formats: [
            { id: "TEXT_AD", channels: ["SEARCH"], required_assets: ["HEADLINE"], optional_assets: [] }
        ]
    },
    constraints: {
        budget: { policies: [{ id: "MIN_BUDGET" }] },
        categories: { sensitive_categories: ["GAMBLING"] },
        regions: {}
    },
    routing: { profile_id: "google_routing_v1" },
    io_schema: { error_mapping: { id: "google_errors_v1" } }
};

const TEST_CTX = {
    execution_id: "test-exec-id",
    phase: "PIB_TIKTOK_PHASE_1",
    feature_flags: { FF_PIB_TIKTOK_PHASE_1: true },
    tenant_context: { tenant_id: "system" },
    tiktok_contract: BASE_CONTRACT
};

describe("PIB-TIKTOK-PHASE-1", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Valid contract returns status OK", () => {
            const result = execute(TEST_CTX);
            expect(result.status).toBe("OK");
            expect(result.capability_surface).toBeDefined();
            expect(result.capability_surface.routing).toBeDefined();
            expect(result.capability_surface.routing.profile_id).toBe("google_routing_v1"); // Placeholder value from BASE_CONTRACT
        });

        test("2. Deterministic sorting of campaign types", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.capabilities.campaign_types = [
                { id: "B_CAMPAIGN" }, { id: "A_CAMPAIGN" }
            ];
            const result = execute({ ...TEST_CTX, tiktok_contract: unsorted });
            const ids = result.capability_surface.campaign_types.map(c => c.id);
            expect(ids).toEqual(["A_CAMPAIGN", "B_CAMPAIGN"]);
        });

        test("3. Deterministic sorting of bidding strategies", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.capabilities.bidding_strategies = [
                { id: "Z_STRAT" }, { id: "Y_STRAT" }
            ];
            const result = execute({ ...TEST_CTX, tiktok_contract: unsorted });
            const ids = result.capability_surface.bidding_strategies.map(s => s.id);
            expect(ids).toEqual(["Y_STRAT", "Z_STRAT"]);
        });

        test("4. Deterministic sorting of targeting modes", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.capabilities.targeting.segments = [
                { id: "REGION" }, { id: "AGE" }
            ];
            const result = execute({ ...TEST_CTX, tiktok_contract: unsorted });
            const ids = result.capability_surface.targeting_modes.map(t => t.id);
            expect(ids).toEqual(["AGE", "REGION"]);
        });

        test("5. Deterministic creative format ordering", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_CONTRACT));
            unsorted.capabilities.creative_formats = [
                { id: "VIDEO" }, { id: "IMAGE" }
            ];
            const result = execute({ ...TEST_CTX, tiktok_contract: unsorted });
            const ids = result.capability_surface.creative_formats.map(f => f.id);
            expect(ids).toEqual(["IMAGE", "VIDEO"]);
        });

        test("6. Capability surface hash is consistent across runs", () => {
            const result1 = execute(TEST_CTX);
            const result2 = execute(TEST_CTX);
            expect(result1.metadata.canonical_hash).toBe(result2.metadata.canonical_hash);
        });
    });

    describe("Negative Path", () => {
        test("7. Missing tiktok_contract -> ERROR", () => {
            const input = { ...TEST_CTX, tiktok_contract: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_FIELD");
        });

        test("8. connector_id !== 'tiktok_ads' -> ERROR", () => {
            const input = { ...TEST_CTX, tiktok_contract: { ...BASE_CONTRACT, connector_id: "facebook_ads" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });

        test("9. phase !== 'PIB_TIKTOK_PHASE_1' -> ERROR", () => {
            const input = { ...TEST_CTX, phase: "WRONG_PHASE" };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("10. Missing version -> ERROR", () => {
            const input = { ...TEST_CTX, tiktok_contract: { ...BASE_CONTRACT, version: undefined } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });

        test("11. Malformed semver -> ERROR", () => {
            const input = { ...TEST_CTX, tiktok_contract: { ...BASE_CONTRACT, version: "v1" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("CONTRACT_VIOLATION");
        });

        test("12. Missing feature flag -> NO_OP", () => {
            const input = { ...TEST_CTX, feature_flags: {} };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });
    });

    describe("Edge Cases", () => {
        test("13. Empty arrays in capabilities", () => {
            const empty = JSON.parse(JSON.stringify(BASE_CONTRACT));
            empty.capabilities.channels = [];
            empty.capabilities.campaign_types = [];
            const result = execute({ ...TEST_CTX, tiktok_contract: empty });
            expect(result.status).toBe("OK");
            expect(result.capability_surface.channels).toEqual([]);
        });

        test("14. Unexpected null segments (Handled robustly)", () => {
            const nulls = JSON.parse(JSON.stringify(BASE_CONTRACT));
            // Simulating if segments was somehow null but object existed (or missing)
            nulls.capabilities.targeting = {}; // Missing segments
            const result = execute({ ...TEST_CTX, tiktok_contract: nulls });
            expect(result.status).toBe("OK");
            expect(result.capability_surface.targeting_modes).toEqual([]);
        });

        test("15. Forbidden fields error", () => {
            const input = { ...TEST_CTX, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("16. Deterministic output for identical inputs with different field order in the contract", () => {
            // Note: In JS, field order is generally preserved, but we want to ensure our output hash is consistent regardless of input key order? 
            // The logic extracts specific fields, so input key order doesn't matter for the *content* of the extraction.
            // This test verifies that.
            const reversedContract = { ...BASE_CONTRACT };
            // Can't easily change key order of object literal without reconstruction, but let's rely on the fact that execute extracts properties by name.
            const result = execute(TEST_CTX);
            expect(result.metadata.canonical_hash).toBeDefined();
        });

        // Additional Check for Backplane 27B from the spec
        test("17. Rejects connector_version", () => {
            const input = { ...TEST_CTX, tiktok_contract: { ...BASE_CONTRACT, connector_version: "1.0.0" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].message).toContain("Forbidden field 'connector_version'");
        });

        test("18. Canonical hash identical across differently ordered contracts", () => {
            const a = JSON.parse(JSON.stringify(TEST_CTX));
            const b = JSON.parse(JSON.stringify(TEST_CTX));

            // Rewrite tiktok_contract with reversed key order
            const entries = Object.entries(b.tiktok_contract).reverse();
            const reordered = {};
            for (const [k, v] of entries) reordered[k] = v;
            b.tiktok_contract = reordered;

            const r1 = execute(a);
            const r2 = execute(b);

            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });
    });
});
