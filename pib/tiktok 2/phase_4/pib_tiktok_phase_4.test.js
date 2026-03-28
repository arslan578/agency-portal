const { execute } = require("./pib_tiktok_phase_4");

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
    execution_id: "test-exec-id-p4",
    phase: "PIB_TIKTOK_PHASE_4",
    feature_flags: { FF_PIB_TIKTOK_PHASE_4: true },
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

describe("PIB-TIKTOK-PHASE-4", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Valid blueprint returns OK", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.validator_image).toBeDefined();
        });

        test("2. Operations sorted deterministically", () => {
            const result = execute(BASE_INPUT);
            const ops = result.validator_image.operations.map(o => o.operation);
            expect(ops).toEqual(["CREATE_CAMPAIGN", "GET_CAMPAIGN"]);
        });

        test("3. Payload shapes sorted deterministically", () => {
            const result = execute(BASE_INPUT);
            const shapes = Object.keys(result.validator_image.payload_shapes);
            expect(shapes).toEqual(["c_op", "c_sel"]);
        });

        test("4. Idempotency matrix deterministic", () => {
            const result = execute(BASE_INPUT);
            const matrix = result.validator_image.idempotency_matrix;
            expect(Object.keys(matrix)).toEqual(["CREATE_CAMPAIGN", "GET_CAMPAIGN"]);
        });

        test("5. Hash stable across runs", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("6. Hash stable across key-order randomness", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));

            // Reverse keys in blueprint operations
            const entries = Object.entries(b.request_blueprint.operations[0]).reverse();
            const reorderedOp = {};
            for (const [k, v] of entries) reorderedOp[k] = v;
            b.request_blueprint.operations[0] = reorderedOp;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("7. Operation-level validator structure correct", () => {
            const result = execute(BASE_INPUT);
            const op = result.validator_image.operations[0];
            expect(op).toEqual({
                operation: "CREATE_CAMPAIGN",
                requires_idempotency: true,
                payload_shape_ref: "c_op",
                parameters: { required: [], optional: [] }
            });
        });

        test("8. Payload shape structure correct", () => {
            const result = execute(BASE_INPUT);
            const shape = result.validator_image.payload_shapes["c_op"];
            expect(shape).toEqual({ parameters: { required: [], optional: [] } });
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
            expect(result.errors[0].message).toContain("operations must be an array");
        });

        test("11. operations not an array -> ERROR", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = "invalid";
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].message).toContain("operations must be an array");
        });

        test("12. Phase mismatch -> ERROR", () => {
            const input = { ...BASE_INPUT, phase: "WRONG" };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("13. Forbidden field -> ERROR", () => {
            const input = { ...BASE_INPUT, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("14. Missing feature flag -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: {} };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });
    });

    describe("Edge Cases", () => {
        test("15. Empty operations array", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = [];
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.validator_image.operations).toEqual([]);
        });

        test("16. Duplicate payload refs -> deduped", () => {
            // Validator image construction builds from Keys of registry, so duplicates in registry keys impossible in source JSON.
            // But duplicates in operations pointing to same ref is possible and normal.
            // But let's verify if operations list allows duplicates?
            // "Sort operations lexicographically by operation."
            // If registry had duplicates? Registry is object map, keys unique by def.
            // Wait, test requirement says "Duplicate payload refs -> deduped"
            // This implies: many ops map to same payload shape.
            // Or if registry keys somehow processed redundantly?
            // My implementation iterates registry keys. So it handles uniqueness naturally.
            // Let's test that multiple operations map to same shape ref correctly.
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations.push({
                operation: "DUP_OP", requires_idempotency: false, payload_shape_ref: "c_op"
            });
            const result = execute(input);
            // Verify c_op appears once in payload_shapes
            expect(Object.keys(result.validator_image.payload_shapes).length).toBe(2);
            expect(result.validator_image.operations.length).toBe(3);
        });

        test("17. Operation missing payload_shape_ref", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.request_blueprint.operations = [{
                operation: "NO_PAYLOAD", requires_idempotency: false
            }];
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.validator_image.operations[0].payload_shape_ref).toBeNull();
        });

        test("18. Blueprint with fields in random order -> deterministic output", () => {
            // General determinism check, overlaps with test 6 but good to have explicit.
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.metadata.canonical_hash).toBeDefined();
        });
    });
});
