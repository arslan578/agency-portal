"use strict";

const { execute } = require("./phase_78_formal_audit_ledger_writer");

// Mocks
jest.mock("../../shared/logging", () => ({ logStructured: jest.fn() }));
jest.mock("../../shared/metrics", () => ({ count: jest.fn() }));
jest.mock("../../shared/tracing", () => ({
    startSpan: jest.fn(() => ({
        end: jest.fn(),
        setAttribute: jest.fn()
    }))
}));

const { logStructured } = require("../../shared/logging");
const metrics = require("../../shared/metrics");
const tracing = require("../../shared/tracing");

const BASE_INPUT = {
    execution_id: "exec_123",
    phase: "78",
    feature_flags: { "FF_FORMAL_AUDIT_LEDGER_WRITER": true },
    tenant_context: { tenant_id: "tenant_abc", currency: "USD" },
    commit_seal: {
        seal_id: "seal_1",
        commit_sha256: "commit_hash",
        canonical_sha256: "canonical_hash",
        structure_sha256: "structure_hash"
    },
    canonical_execution_form: { some: "data" },
    trace_delta_bundle: { deltas: [] },
    deterministic_replay_record: {
        replay_sha256: "replay_hash",
        metadata: { canonical_hash: "replay_hash" }
    },
    cost_expectation_model: { expected_spend_minor: 100 },
    rate_limit_forecast: { window: "P30D" },
    state_time_travel_material: {
        baseline_state_material: {},
        time_travel_variants: []
    }
};

describe("Phase 78: Formal Audit Ledger Writer", () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // Happy Path (6)
    // -------------------------------------------------------------------------

    test("HP1: Minimal valid baseline execution", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out = execute(input);

        expect(out.status).toBe("OK");
        expect(out.ledger_batch.entries.length).toBe(1);
        expect(out.ledger_batch.entries[0].category).toBe("EXECUTION");
        expect(out.ledger_batch.entries[0].subcategory).toBe("BASELINE");
        expect(out.ledger_batch.entries[0].ledger_entry_id).toBeDefined();
        expect(out.ledger_batch.batch_sha256).toBeDefined();

        const entry = out.ledger_batch.entries[0];

        expect(entry.policy_summary).toBeNull();
        expect(entry.safety_summary).toBeNull();

        expect(entry.trace_delta_ref).toBeDefined();
        expect(typeof entry.trace_delta_ref).toBe("string");

        expect(entry.replay_ref).toEqual({
            replay_sha256: "replay_hash",
            scenario_type: "BASELINE"
        });
    });

    test("HP2: Baseline + one counterfactual scenario", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.counterfactual_scenarios = [{ name: "sim_1", data: "val" }];

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.ledger_batch.entries.length).toBe(2);

        // Order: Baseline first?
        // Sequence should start at 1.
        expect(out.ledger_batch.entries[0].sequence_no).toBe(1);
        expect(out.ledger_batch.entries[1].sequence_no).toBe(2);
        expect(out.ledger_batch.entries[1].category).toBe("EXECUTION");
        expect(out.ledger_batch.entries[1].subcategory).toBe("COUNTERFACTUAL");

        const cfEntry = out.ledger_batch.entries[1];
        expect(cfEntry.replay_ref).toEqual({
            replay_sha256: "replay_hash",
            scenario_type: "COUNTERFACTUAL"
        });
        expect(cfEntry.trace_delta_ref).toBeDefined();
    });

    test("HP3: Baseline + multiple time travel variants", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.state_time_travel_material.time_travel_variants = [
            { type: "FORK", id: "v1" },
            { type: "RESTORE", id: "v2" }
        ];

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.ledger_batch.entries.length).toBe(3); // 1 baseline + 2 variants

        const e1 = out.ledger_batch.entries[1];
        const e2 = out.ledger_batch.entries[2];

        expect(e1.category).toBe("STATE_TIME_TRAVEL");
        expect(e2.category).toBe("STATE_TIME_TRAVEL");

        expect(e1.subcategory).toBe("FORK");
        expect(e2.subcategory).toBe("RESTORE");

        expect(e1.time_travel_ref).toEqual(expect.objectContaining({
            variant_id: "v1",
            origin_snapshot_id: null
        }));
        expect(e2.time_travel_ref).toEqual(expect.objectContaining({
            variant_id: "v2",
            origin_snapshot_id: null
        }));
    });

    test("HP4: Integrated cost and rate limit projection", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.cost_expectation_model = { val: 999 };
        input.rate_limit_forecast = { limit: 50 };

        const out = execute(input);
        expect(out.status).toBe("OK");
        const entry = out.ledger_batch.entries[0];
        expect(entry.cost_projection).toEqual({ val: 999 });
        expect(entry.rate_limit_projection).toEqual({ limit: 50 });
    });

    test("HP5: Tenant and currency propagation", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.tenant_context = { tenant_id: "T-999", currency: "EUR" };

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.ledger_batch.tenant_id).toBe("T-999");
        expect(out.ledger_batch.currency).toBe("EUR");
        expect(out.ledger_batch.entries[0].tenant_id).toBe("T-999");
    });

    test("HP6: Observability emitted on success", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out = execute(input);

        expect(out.status).toBe("OK");
        expect(tracing.startSpan).toHaveBeenCalledWith("phase_78_formal_audit_ledger_writer", expect.objectContaining({
            phase: "78",
            execution_id: "exec_123",
            tenant_id: "tenant_abc"
        }));
        expect(logStructured).toHaveBeenCalledWith("phase_78_formal_audit_ledger_writer", expect.objectContaining({
            status: "OK",
            entry_count: 1
        }));
        expect(metrics.count).toHaveBeenCalledWith("kaivo_phase_78_invocations_total", 1, expect.any(Object));
        expect(metrics.count).toHaveBeenCalledWith("kaivo_phase_78_entries_written_total", 1, expect.any(Object));
    });

    // -------------------------------------------------------------------------
    // Negative Path (6)
    // -------------------------------------------------------------------------

    test("NG1: Null input", () => {
        const out = execute(null);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_INPUT");
    });

    test("NG2: Missing tenant_id", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.tenant_context.tenant_id;
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("MISSING_FIELD"); // Implementation uses generic MISSING_FIELD. Spec example "INVALID_INPUT" was illustrative or I should align? 
        // Implementation: return validationError(input, 'MISSING_FIELD', 'tenant_context.tenant_id is required', ...);
        // Prompt Spec 1.4 Error Shape example says code: "INVALID_INPUT", message "tenant_context.tenant_id is required". 
        // But prompt 2.5 Error-as-Value lists: INVALID_INPUT, MISSING_FIELD, FORBIDDEN_FIELD. 
        // I used MISSING_FIELD in implementation for required fields as instructed in 2.5 list. 
        // So expectation here is MISSING_FIELD is correct per 2.5.
    });

    test("NG3: Wrong phase value", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.phase = "77";
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_PHASE");
    });

    test("NG4: Forbidden top-level debug field", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input._debug = true;
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("FORBIDDEN_FIELD");
    });

    test("NG5: Non-serializable value in input", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // JSON.stringify cleans functions, so we assign after parse
        input.metadata = { fn: () => { } };
        // Wait, if I pass an object with a function to logic, logic sees the function.
        // My test setup needs to pass actual function object.

        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("NON_SERIALIZABLE_VALUE");
    });

    test("NG6: Feature flag enabled but internal helper throws", () => {
        // We'll mock tracing.startSpan to throw, verifying the catch block protection.
        tracing.startSpan.mockImplementationOnce(() => {
            throw new Error("Kaboom");
        });

        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out = execute(input);

        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("UNEXPECTED_ERROR");
        expect(out.errors[0].message).toContain("Kaboom");
    });

    // -------------------------------------------------------------------------
    // Edge Cases (4)
    // -------------------------------------------------------------------------

    test("EC1: Empty counterfactual and time travel arrays", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.counterfactual_scenarios = [];
        input.state_time_travel_material.time_travel_variants = [];

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.ledger_batch.entries.length).toBe(1);
    });

    test("EC2: Large but valid number of variants", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.state_time_travel_material.time_travel_variants = Array(20).fill({ type: "FORK", id: "v" });

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.ledger_batch.entries.length).toBe(21); // 1 baseline + 20
        // Check order - sequence numbers
        expect(out.ledger_batch.entries[20].sequence_no).toBe(21);
    });

    test("EC3: Feature flag disabled", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.feature_flags["FF_FORMAL_AUDIT_LEDGER_WRITER"] = false;

        const out = execute(input);
        expect(out.status).toBe("DISABLED");
        expect(out.ledger_batch.entries.length).toBe(0);
        expect(out.errors.length).toBe(0);

        expect(logStructured).toHaveBeenCalledWith("phase_78_formal_audit_ledger_writer", expect.objectContaining({
            status: "DISABLED",
            entry_count: 0
        }));
        expect(metrics.count).toHaveBeenCalledWith("kaivo_phase_78_invocations_total", 1, expect.objectContaining({ status: "DISABLED" }));
    });

    test("EC4: Previous ledger context ignored for determinism", () => {
        const input1 = JSON.parse(JSON.stringify(BASE_INPUT));
        const input2 = JSON.parse(JSON.stringify(BASE_INPUT));

        input1.previous_ledger_context = { something: "A" };
        input2.previous_ledger_context = { something: "B" };

        const out1 = execute(input1);
        const out2 = execute(input2);

        expect(out1.ledger_batch.batch_sha256).toEqual(out2.ledger_batch.batch_sha256);
    });

    // -------------------------------------------------------------------------
    // Regression Guard Test (1)
    // -------------------------------------------------------------------------

    test("RG1: Commit seal and canonical hashes preserved", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.commit_seal.commit_sha256 = "ABC";
        input.commit_seal.canonical_sha256 = "DEF";
        input.commit_seal.structure_sha256 = "GHI";

        const out = execute(input);
        expect(out.status).toBe("OK");
        const entry = out.ledger_batch.entries[0];
        expect(entry.commit_sha256).toBe("ABC");
        expect(entry.canonical_sha256).toBe("DEF");
        expect(entry.structure_sha256).toBe("GHI");
    });

    // -------------------------------------------------------------------------
    // Determinism Guard Test (1)
    // -------------------------------------------------------------------------

    test("DG1: 100x determinism", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.counterfactual_scenarios = [{ name: "CF1" }];

        const results = [];
        for (let i = 0; i < 100; i++) {
            results.push(execute(input));
        }

        const firstHash = results[0].ledger_batch.batch_sha256;
        const firstEntryId = results[0].ledger_batch.entries[0].ledger_entry_id;

        for (let i = 1; i < 100; i++) {
            expect(results[i].ledger_batch.batch_sha256).toBe(firstHash);
            expect(results[i].ledger_batch.entries[0].ledger_entry_id).toBe(firstEntryId);
            // Deep equality check
            expect(JSON.stringify(results[i])).toBe(JSON.stringify(results[0]));
        }
    });

    // -------------------------------------------------------------------------
    // Additional Sanity Tests (2)
    // -------------------------------------------------------------------------

    test("ST1: Entry ordering invariant", () => {
        // Since we can't shuffle internal logic easily without mocks, we verify logic output is sorted correctly.
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // Logic hardcodes push order: Baseline, then CF, then TT.
        // Sequence # assigned in that order. 
        // Sort uses Tenant, Exec, Seq.
        // Tenant/Exec are same for all entries in single execution.
        // So Seq is the determinant.
        input.counterfactual_scenarios = [{ name: "CF1" }];

        const out = execute(input);
        expect(out.ledger_batch.entries[0].sequence_no).toBe(1);
        expect(out.ledger_batch.entries[1].sequence_no).toBe(2);
    });

    test("ST2: Observability on error", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.tenant_context.tenant_id; // Trigger ERROR

        const out = execute(input);
        expect(out.status).toBe("ERROR");

        expect(logStructured).toHaveBeenCalledWith("phase_78_formal_audit_ledger_writer", expect.objectContaining({
            status: "ERROR"
            // Start span was called before validation? No, in execute: 
            // 2. Start span
            // 3. Validate
            // So span should exist.
        }));
        expect(metrics.count).toHaveBeenCalledWith("kaivo_phase_78_errors_total", 1, expect.objectContaining({ status: "ERROR" }));
    });
});
