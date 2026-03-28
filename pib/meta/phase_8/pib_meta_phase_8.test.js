const { execute } = require("./pib_meta_phase_8");

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
    execution_id: "exec-p8-test",
    phase: "PIB_META_PHASE_8",
    feature_flags: { FF_PIB_META_PHASE_8: true },
    tenant_context: { tenant_id: "t1" },
    request_blueprint: {
        blueprint_id: "bp-1",
        // P8 is now strictly single-op execution
        operation: "CREATE_CAMPAIGN"
    },
    validator_image: { payload_schema_ref: "schema-v1" },
    routing_profile: { default_endpoint: "https://graph.facebook.com/v18.0" },
    response_normalizer_spec: {
        operations: [
            {
                operation: "CREATE_CAMPAIGN",
                normalization_plan: {
                    strip_fields: ["debug"],
                    rename_map: { "id": "uuid" },
                    drop_nulls: true,
                    normalize_timestamps: true,
                    normalize_ids: false
                }
            },
            {
                operation: "GET_CAMPAIGN",
                normalization_plan: { strip_fields: ["meta"], rename_map: {} }
            }
        ]
    },
    error_resolver_spec: { id: "error-spec-v1", policies: [] }
};

const DEEP_COPY = (obj) => JSON.parse(JSON.stringify(obj));

describe("PIB-META-PHASE-8", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Happy Path", () => {
        test("1. Returns OK status", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            expect(result.status).toBe("OK");
            expect(result.phase).toBe("PIB_META_PHASE_8");
        });

        test("2. Includes correct output contract version", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            expect(result.output_contract_version).toBe("pib_meta_phase_8_output_v1");
        });

        test("3. Generates recorder schema for single operation", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            const schema = result.recorder_schema;
            expect(schema.request_section).toBeDefined();
            expect(schema.response_section).toBeDefined();
            expect(schema.request_section.operation_id).toBe("CREATE_CAMPAIGN");
        });

        test("4. Request section contains correct IDs and timestamp", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            const req = result.recorder_schema.request_section;
            expect(req.operation_id).toBe("CREATE_CAMPAIGN");
            expect(req.request_id_format).toBe("REQ-CREATE_CAMPAIGN");
            expect(req.timestamp_placeholder).toBe("DETERMINISTIC_TIMESTAMP");
        });

        test("5. Response section mirrors Phase 6 normalization plan", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            const resp = result.recorder_schema.response_section;
            expect(resp.strip_fields).toEqual(["debug"]);
            expect(resp.rename_map).toEqual({ "id": "uuid" });
            expect(resp.drop_nulls).toBe(true);
            expect(resp.normalize_timestamps).toBe(true);
            expect(resp.normalize_ids).toBe(false); // Mirrored false
        });

        test("6. Envelope plan includes canonical envelope_shape bindings", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            const shape = result.envelope_plan.envelope_shape;
            expect(shape.connector_id).toBe("meta_ads"); // Meta
            expect(shape.tenant_id).toBe("t1");
            expect(shape.execution_id).toBe("exec-p8-test");
            expect(shape.phase).toBe("PIB_META_PHASE_8");
            expect(shape.request).toEqual({ section: "request_section", type: "OBJECT" });
            expect(shape.response).toEqual({ section: "response_section", type: "OBJECT" });
        });

        test("7. Routing decision prefers routing_profile.method when present", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.routing_profile.method = "GET";
            const result = execute(input);
            expect(result.recorder_schema.request_section.routing_decision.method).toBe("GET");
        });

        test("8. Routing decision defaults to POST", () => {
            const result = execute(DEEP_COPY(BASE_INPUT));
            expect(result.recorder_schema.request_section.routing_decision.method).toBe("POST");
        });
    });

    describe("Patch Validation (Errors)", () => {
        test("9. Missing operation in P3 -> INVALID_REQUEST_BLUEPRINT", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.request_blueprint.operation;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("INVALID_REQUEST_BLUEPRINT");
        });

        test("10. Missing operation in response_normalizer_spec -> MISSING_OPERATION_SPEC", () => {
            const input = DEEP_COPY(BASE_INPUT);
            input.request_blueprint.operation = "UNKNOWN_OP";
            // P6 has only CREATE_CAMPAIGN and GET_CAMPAIGN
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_OPERATION_SPEC");
        });
    });

    describe("Negative Path", () => {
        test("11. Missing request_blueprint -> MISSING_DEPENDENCY", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.request_blueprint;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });

        test("12. Missing validator_image -> MISSING_DEPENDENCY", () => {
            const input = DEEP_COPY(BASE_INPUT);
            delete input.validator_image;
            const result = execute(input);
            expect(result.status).toBe("ERROR");
            expect(result.errors[0].code).toBe("MISSING_DEPENDENCY");
        });
    });

    describe("Determinism", () => {
        test("13. Canonical Hash is stable", () => {
            const result1 = execute(DEEP_COPY(BASE_INPUT));
            const result2 = execute(DEEP_COPY(BASE_INPUT));
            expect(result1.metadata.canonical_hash).toBe(result2.metadata.canonical_hash);
        });
    });
});
