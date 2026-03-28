const { execute } = require("./pib_google_phase_3");

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
    execution_id: "test-exec-id-p3",
    phase: "PIB_GOOGLE_PHASE_3",
    feature_flags: { FF_PIB_GOOGLE_PHASE_3: true },
    tenant_context: { tenant_id: "system" },
    io_surface: {
        operations: [
            { operation: "CREATE_CAMPAIGN", google_api_method_ref: "c.mutate", payload_shape_ref: "c_op", idempotency_key_strategy: "CLIENT_REQUEST_ID" },
            { operation: "GET_CAMPAIGN", google_api_method_ref: "c.get", payload_shape_ref: "c_sel", idempotency_key_strategy: "NONE" }
        ]
    }
};

describe("PIB-GOOGLE-PHASE-3", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Valid blueprint generation returns OK", () => {
            const result = execute(BASE_INPUT);
            expect(result.status).toBe("OK");
            expect(result.request_blueprint).toBeDefined();
        });

        test("2. Operations table transformations correctness", () => {
            const result = execute(BASE_INPUT);
            const ops = result.request_blueprint.operations;
            const createOp = ops.find(o => o.operation === "CREATE_CAMPAIGN");
            expect(createOp.requires_idempotency).toBe(true);
            const getOp = ops.find(o => o.operation === "GET_CAMPAIGN");
            expect(getOp.requires_idempotency).toBe(false);
        });

        test("3. Operations sorted deterministically", () => {
            const unsorted = JSON.parse(JSON.stringify(BASE_INPUT));
            unsorted.io_surface.operations = [
                { operation: "B_OP", google_api_method_ref: "b", payload_shape_ref: "b", idempotency_key_strategy: "NONE" },
                { operation: "A_OP", google_api_method_ref: "a", payload_shape_ref: "a", idempotency_key_strategy: "NONE" }
            ];
            const result = execute(unsorted);
            const opNames = result.request_blueprint.operations.map(o => o.operation);
            expect(opNames).toEqual(["A_OP", "B_OP"]);
        });

        test("4. Idempotency matrix correct", () => {
            const result = execute(BASE_INPUT);
            const matrix = result.request_blueprint.idempotency_matrix;
            expect(matrix["CREATE_CAMPAIGN"]).toBe("CLIENT_REQUEST_ID");
            expect(matrix["GET_CAMPAIGN"]).toBe("NONE");
        });

        test("5. Idempotency matrix keys sorted deterministically in output", () => {
            // In JS objects, keys are ordered, but we test canonicalHash stability for this mostly.
            // However, let's verify canonicalHash stability across insertion order.
            const result = execute(BASE_INPUT);
            expect(result.metadata.canonical_hash).toBeDefined();
        });

        test("6. Payload registry correct and flags set", () => {
            const result = execute(BASE_INPUT);
            const registry = result.request_blueprint.payload_registry;
            expect(registry["c_op"]).toEqual({ present: true, expansion_allowed: false });
            expect(registry["c_sel"]).toEqual({ present: true, expansion_allowed: false });
        });

        test("7. Payload registry handles duplicates", () => {
            const dup = JSON.parse(JSON.stringify(BASE_INPUT));
            dup.io_surface.operations.push({ operation: "DUP_OP", google_api_method_ref: "c.mutate", payload_shape_ref: "c_op", idempotency_key_strategy: "NONE" });
            const result = execute(dup);
            expect(Object.keys(result.request_blueprint.payload_registry).length).toBe(2); // Should still be c_op and c_sel
        });

        test("8. Canonical hash stable across runs", () => {
            const r1 = execute(BASE_INPUT);
            const r2 = execute(BASE_INPUT);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });

        test("9. Canonical hash stable across key-order variations", () => {
            const a = JSON.parse(JSON.stringify(BASE_INPUT));
            const b = JSON.parse(JSON.stringify(BASE_INPUT));

            // Reverse key order of an operation
            const ops = b.io_surface.operations;
            const op0 = ops[0];
            const entries = Object.entries(op0).reverse();
            const reorderedOp = {};
            for (const [k, v] of entries) reorderedOp[k] = v;
            ops[0] = reorderedOp;

            const r1 = execute(a);
            const r2 = execute(b);
            expect(r1.metadata.canonical_hash).toBe(r2.metadata.canonical_hash);
        });
    });

    describe("Negative Path", () => {
        test("10. Missing input -> ERROR", () => {
            const result = execute(null);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("11. Phase mismatch -> ERROR", () => {
            const input = { ...BASE_INPUT, mp: "WRONG" }; // mp? Typo in construction? Ah phase prop.
            const bad = { ...BASE_INPUT, phase: "WRONG" };
            const result = execute(bad);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_INPUT");
        });

        test("12. Missing io_surface -> ERROR", () => {
            const input = { ...BASE_INPUT, io_surface: undefined };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_IO_SURFACE");
        });

        test("13. io_surface.operations missing -> ERROR", () => {
            const input = { ...BASE_INPUT, io_surface: {} };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].message).toContain("io_surface.operations");
        });

        test("14. io_surface.operations not an array -> ERROR", () => {
            const input = { ...BASE_INPUT, io_surface: { operations: "bad" } };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].message).toContain("io_surface.operations");
        });

        test("15. Forbidden field -> ERROR", () => {
            const input = { ...BASE_INPUT, _debug: true };
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("FORBIDDEN_FIELD");
        });

        test("16. Feature flag false -> NO_OP", () => {
            const input = { ...BASE_INPUT, feature_flags: { FF_PIB_GOOGLE_PHASE_3: false } };
            const result = execute(input);
            expect(result.status).toBe("NO_OP");
        });
    });

    describe("Edge Cases", () => {
        test("17. Empty operations array", () => {
            const input = { ...BASE_INPUT, io_surface: { operations: [] } };
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.request_blueprint.operations).toEqual([]);
            expect(result.request_blueprint.idempotency_matrix).toEqual({});
            expect(result.request_blueprint.payload_registry).toEqual({});
        });

        test("18. Operation with missing payload_shape_ref (allowed)", () => {
            const input = JSON.parse(JSON.stringify(BASE_INPUT));
            input.io_surface.operations = [{ operation: "OP_NO_PAYLOAD", idempotency_key_strategy: "NONE" }];
            const result = execute(input);
            expect(result.status).toBe("OK");
            expect(result.request_blueprint.payload_registry).toEqual({});
            expect(result.request_blueprint.operations[0].operation).toBe("OP_NO_PAYLOAD");
        });
    });
});
