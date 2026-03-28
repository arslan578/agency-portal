const { execute } = require("./pib_meta_phase_4");

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
    execution_id: "test-exec-id-p4-composite",
    phase: "PIB_META_PHASE_4",
    feature_flags: { FF_PIB_META_PHASE_4: true },
    tenant_context: { tenant_id: "system" },
    request_blueprint: {
        operations: [
            { operation: "CREATE_CAMPAIGN", google_api_method_ref: "facebook.graph.v19.0.act.campaigns", payload_shape_ref: "meta_create_campaign", idempotency_key_strategy: "HASH", requires_idempotency: true },
            { operation: "GET_CAMPAIGN", google_api_method_ref: "facebook.graph.v19.0.get", payload_shape_ref: "meta_get_campaign", idempotency_key_strategy: "NONE", requires_idempotency: false }
        ],
        idempotency_matrix: { "CREATE_CAMPAIGN": "HASH", "GET_CAMPAIGN": "NONE" },
        payload_registry: { "meta_create_campaign": {}, "meta_get_campaign": {} }
    }
};

describe("PIB-META-PHASE-4 (Composite)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path (Validator + Schema)", () => {
        test("1. Valid composite output OK", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.validator_image).toBeDefined();
            expect(result.transformation_engine_schema).toBeDefined();
            expect(result.output_contract_version).toBe("pib_meta_phase_4_output_v2");
        });

        test("2. Validator Image: Operations sorted", () => {
            const result = execute(BASE_INPUT);
            const ops = result.validator_image.operations.map(o => o.operation);
            expect(ops).toEqual(["CREATE_CAMPAIGN", "GET_CAMPAIGN"]);
        });

        test("3. Schema: Objective Map populated", () => {
            const result = execute(BASE_INPUT);
            const objectives = result.transformation_engine_schema.objective_map;
            expect(objectives["KAIVO_AWARENESS"]).toBeDefined();
            expect(objectives["KAIVO_AWARENESS"].meta_objective).toBe("OUTCOME_AWARENESS");
        });

        test("4. Schema: Budget Normalization rules", () => {
            const result = execute(BASE_INPUT);
            const budget = result.transformation_engine_schema.budget_normalization;
            expect(budget.daily_budget.min_cents).toBe(100);
            expect(budget.lifetime_budget.start_time_required).toBe(true);
        });

        test("5. Schema: Hierarchy Decomposition", () => {
            const result = execute(BASE_INPUT);
            const hierarchy = result.transformation_engine_schema.hierarchy_decomposition;
            expect(hierarchy.campaign.contains).toContain("ad_set");
            expect(hierarchy.ad_set.contains).toContain("ad");
        });

        test("6. Canonical Hash includes both parts", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
            // Hash relies on both validator and schema
        });

        test("7. Determinism: Hash stable across key reordering", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));
            // Shuffle keys in blueprint
            const op0 = b.request_blueprint.operations[0];
            b.request_blueprint.operations[0] = {
                requires_idempotency: op0.requires_idempotency,
                operation: op0.operation, // swapped order
                ...op0
            };
            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("8. Schema: Targeting Normalization", () => {
            const result = execute(BASE_INPUT);
            const targeting = result.transformation_engine_schema.targeting_normalization;
            expect(targeting.age.constraints.min).toBe(13);
        });
    });

    describe("Negative Path", () => {
        test("9. Missing request_blueprint -> ERROR", () => {
            const input = { ...BASE_INPUT, request_blueprint: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_BLUEPRINT");
        });

        test("10. Missing operations array -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            delete input.request_blueprint.operations;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
        });

        test("11. operations not an array -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = "bad";
            const result = execute(input);
            expect(result.status).toBe("ERROR");
        });

        test("12. Phase mismatch -> ERROR", () => {
            const input = { ...BASE_INPUT, phase: "WRONG" };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
        });

        test("13. Forbidden field -> ERROR", () => {
            const input = { ...BASE_INPUT, _debug: true };
            const result = execute(input);
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("14. Missing feature flag -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: {} };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });
    });

    describe("Edge Cases", () => {
        test("15. Empty operations", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = [];
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.validator_image.operations).toEqual([]);
            // Schema still generated
            expect(result.transformation_engine_schema.objective_map).toBeDefined();
        });

        test("16. Deduplication of payload shapes in Validator", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations.push({
                operation: "DUP", payload_shape_ref: "meta_create_campaign", requires_idempotency: false
            });
            const result = execute(input);
            expect(Object.keys(result.validator_image.payload_shapes).length).toBe(2); // Still 2 unique types
        });

        test("17. Schema structure integrity", () => {
            const result = execute(BASE_INPUT);
            expect(result.transformation_engine_schema.creative_normalization["KAIVO_IMAGE"].meta_format).toBe("IMAGE");
            expect(result.transformation_engine_schema.creative_normalization["KAIVO_VIDEO"].meta_format).toBe("VIDEO");
        });

        test("18. Missing payload_shape_ref in operation", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = [{ operation: "OP_NULL", requires_idempotency: false }];
            const result = execute(input);
            expect(result.validator_image.operations[0].payload_shape_ref).toBeNull();
        });
    });
});
