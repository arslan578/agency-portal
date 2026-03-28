const { execute } = require("./pib_google_phase_4");

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
    execution_id: "test-exec-id-p4-composite-google",
    phase: "PIB_GOOGLE_PHASE_4",
    feature_flags: { FF_PIB_GOOGLE_PHASE_4: true },
    tenant_context: { tenant_id: "system" },
    request_blueprint: {
        operations: [
            { operation: "CREATE_CAMPAIGN", google_api_method_ref: "c.mutate", payload_shape_ref: "c_op", idempotency_key_strategy: "CLIENT_REQUEST_ID", requires_idempotency: true },
            { operation: "GET_CAMPAIGN", google_api_method_ref: "c.get", payload_shape_ref: "c_sel", idempotency_key_strategy: "NONE", requires_idempotency: false }
        ],
        idempotency_matrix: {
            "CREATE_CAMPAIGN": "CLIENT_REQUEST_ID",
            "GET_CAMPAIGN": "NONE"
        },
        payload_registry: {
            "c_op": { present: true, expansion_allowed: false },
            "c_sel": { present: true, expansion_allowed: false }
        }
    }
};

describe("PIB-GOOGLE-PHASE-4 (Composite)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path (Validator + Schema)", () => {
        test("1. Valid composite output OK", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.validator_image).toBeDefined();
            expect(result.transformation_engine_schema).toBeDefined();
            expect(result.output_contract_version).toBe("pib_google_phase_4_output_v2");
        });

        test("2. Validator Image: Operations sorted", () => {
            const result = execute(BASE_INPUT);
            const ops = result.validator_image.operations.map(o => o.operation);
            expect(ops).toEqual(["CREATE_CAMPAIGN", "GET_CAMPAIGN"]);
        });

        test("3. Schema: Objective Map populated", () => {
            const result = execute(BASE_INPUT);
            const mapping = result.transformation_engine_schema.objective_to_bidding;
            const sales = mapping.find(m => m.kaivo_objective === "SALES");
            expect(sales.google_campaign_type).toBe("SEARCH");
            expect(sales.default_strategy).toBe("MAXIMIZE_CONVERSIONS");
        });

        test("4. Schema: Budget Normalization rules", () => {
            const result = execute(BASE_INPUT);
            const budget = result.transformation_engine_schema.budget_normalization;
            expect(budget.modes).toHaveLength(2);
            expect(budget.pacing_rules).toContain("STANDARD");
        });

        test("5. Schema: Decomposition levels", () => {
            const result = execute(BASE_INPUT);
            const levels = result.transformation_engine_schema.decomposition.levels.map(l => l.level);
            expect(levels).toEqual(["CAMPAIGN", "AD_GROUP", "AD"]);
        });

        test("6. Canonical Hash includes both parts", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("7. Determinism: Hash stable across key reordering", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));
            const ent = Object.entries(b.request_blueprint.operations[0]).reverse();
            const re = {}; for (const [k, v] of ent) re[k] = v;
            b.request_blueprint.operations[0] = re;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("8. Schema: Targeting Normalization integrity", () => {
            const result = execute(BASE_INPUT);
            const targeting = result.transformation_engine_schema.targeting_normalization;
            const loc = targeting.segments.find(s => s.kaivo_segment === "LOCATION");
            expect(loc.google_target_type).toBe("geo_target");
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
            expect(result.transformation_engine_schema.objective_to_bidding).toBeDefined();
        });

        test("16. Deduplication of payload shapes in Validator", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations.push({
                operation: "DUP", payload_shape_ref: "c_op", requires_idempotency: false
            });
            const result = execute(input);
            expect(Object.keys(result.validator_image.payload_shapes).length).toBe(2);
        });

        test("17. Schema: Creative Normalization has formats", () => {
            const result = execute(BASE_INPUT);
            expect(result.transformation_engine_schema.creative_normalization.formats).toHaveLength(2);
        });

        test("18. Missing payload_shape_ref in operation", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = [{ operation: "OP_NO_PL", requires_idempotency: false }];
            const result = execute(input);
            expect(result.validator_image.operations[0].payload_shape_ref).toBeNull();
        });
    });
});
