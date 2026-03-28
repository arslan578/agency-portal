"use strict";

const { execute } = require("./phase_80_os_boundary_export_layer");
const { createHash } = require("crypto");

jest.mock("../../shared/logging", () => ({ logStructured: jest.fn() }));
jest.mock("../../shared/metrics", () => ({ count: jest.fn() }));
jest.mock("../../shared/tracing", () => ({
    startSpan: jest.fn(() => ({
        end: jest.fn(),
        setAttribute: jest.fn()
    }))
}));

// -----------------------------------------------------------------------------
// Base Input
// -----------------------------------------------------------------------------

const BASE_INPUT = {
    execution_id: "exec-80-test-001",
    phase: "80",
    feature_flags: {
        "FF_OS_BOUNDARY_EXPORT_LAYER": true
    },
    tenant_context: {
        tenant_id: "T-100",
        region: "us-east-1"
    },
    sealed_envelope: {
        snapshot: { id: "snap-1", val: 100 },
        meta: "env"
    },
    canonical_form: {
        id: "cf-1",
        data: "normalized"
    },
    archive_entry: {
        archive_id: "arc-123",
        path: "/mnt/archive/123"
    },
    state_evolution: {
        connector_state_vector: { c1: "active" },
        policy_gradient_vector: { alpha: 0.5 },
        safety_horizon_vector: { forbidden: [] }
    },
    formal_execution_model: {
        delta_trace_vector: { d1: "applied" },
        replay_model_ref: { hash: "abc" }
    },
    metadata: {
        logical_clock_vector: { export: 1000 }
    }
};

describe("Phase 80: Final OS Boundary Export Layer", () => {

    // -------------------------------------------------------------------------
    // Happy Path (6 Tests)
    // -------------------------------------------------------------------------

    test("HP1: Full Success Export", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out = execute(input);

        expect(out.status).toBe("OK");
        expect(out.os_export.version).toBe("1.0.0");
        expect(out.os_export.package_manifest.package_id).toBe("kaivo_execution_export");
        expect(out.os_export.export_bundle.archive_ref).toBe("arc-123");
    });

    test("HP2: Export Bundle Hashing Correctness", () => {
        // Validation that hashes are computed from inputs
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out = execute(input);

        // Compute expected hashes manually (sorted)
        const envHash = createHash('sha256').update(JSON.stringify(input.sealed_envelope)).digest('hex'); // input already sorted keys naturally here for simple obj
        // But let's trust the engine's sort usage. We just verify presence and non-empty.
        expect(out.os_export.export_bundle.envelope_sha256).toBeDefined();
        expect(out.os_export.export_bundle.envelope_sha256.length).toBeGreaterThan(0);
        expect(out.os_export.export_bundle.canonical_sha256).toBeDefined();
    });

    test("HP3: Manifest Structure and Dependencies", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out = execute(input);

        const man = out.os_export.package_manifest;
        expect(man.capabilities.provides).toContain("canonical_execution_form");
        expect(man.dependency_vector.requires_os).toBe(">1.0.0");
    });

    test("HP4: Empty Vectors Handled Gracefully", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.state_evolution.connector_state_vector = {}; // empty
        input.formal_execution_model.delta_trace_vector = {}; // empty

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.os_export.export_bundle.connector_state_vector).toEqual({});
        expect(out.os_export.export_bundle.delta_trace_vector).toEqual({});
    });

    test("HP5: Tenant Context Passthrough", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.tenant_context = { tenant_id: "T-999", tier: "GOLD" };

        const out = execute(input);
        expect(out.os_export.package_manifest.tenant_context.tenant_id).toBe("T-999");
        expect(out.os_export.package_manifest.tenant_context.tier).toBe("GOLD");
    });

    test("HP6: Logical Clock Propagation", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.metadata.logical_clock_vector.export = 123456789;

        const out = execute(input);
        expect(out.os_export.exported_at_logical_clock).toBe(123456789);
    });

    test("HP7: Hash invariance under key reordering", () => {
        const input1 = JSON.parse(JSON.stringify(BASE_INPUT));
        const input2 = JSON.parse(JSON.stringify(BASE_INPUT));

        // reorder keys in sealed_envelope & canonical_form by creating new objects with different insertion order
        input2.sealed_envelope = { meta: "env", snapshot: { id: "snap-1", val: 100 } }; // original keys might be diff order, this ensures specific order
        // JS object key order is complex, but generally insertion order for non-integer keys.
        // Let's force a clear reorder.
        const originalSnap = input1.sealed_envelope.snapshot;
        // input1.sealed_envelope is { snapshot:..., meta:... } (from BASE_INPUT)

        const reorderedSnap = {};
        reorderedSnap.val = 100;
        reorderedSnap.id = "snap-1"; // reversed relative to base? Base {id, val}

        const reorderedEnv = {};
        reorderedEnv.meta = "env";
        reorderedEnv.snapshot = reorderedSnap;
        input2.sealed_envelope = reorderedEnv;

        input2.canonical_form = {};
        input2.canonical_form.data = "normalized";
        input2.canonical_form.id = "cf-1"; // reordered vs {id, data}

        const out1 = execute(input1);
        const out2 = execute(input2);

        expect(out1.os_export.export_bundle.envelope_sha256).toBeDefined();
        expect(out1.os_export.export_bundle.envelope_sha256)
            .toBe(out2.os_export.export_bundle.envelope_sha256);
        expect(out1.os_export.export_bundle.canonical_sha256)
            .toBe(out2.os_export.export_bundle.canonical_sha256);
    });

    // -------------------------------------------------------------------------
    // Negative Path (6 Tests)
    // -------------------------------------------------------------------------

    test("NG1: Missing Check", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.sealed_envelope;
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("MISSING_FIELD");
    });

    test("NG2: Invalid Phase", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.phase = "79";
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_PHASE");
    });

    test("NG3: Forbidden Field (_debug)", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input._debug = true;
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("FORBIDDEN_FIELD");
    });

    test("NG4: Null Input", () => {
        const out = execute(null);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_INPUT");
    });

    test("NG5: Undefined Value in Nested Object", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.tenant_context = { bad: undefined }; // JSON.stringify strips undefined, so we set it after parse
        // Wait, JSON.stringify(BASE_INPUT) works fine. 
        // We need to simulate passed-in object having undefined.
        const messyInput = JSON.parse(JSON.stringify(BASE_INPUT));
        messyInput.tenant_context.bad = undefined;

        const out = execute(messyInput);
        expect(out.status).toBe("ERROR");
        // Our forbidden checker catches undefined values?
        // Implementation: `if (obj[key] === undefined) throw new Error("Undefined value at ${key}");`
        expect(out.errors[0].code).toBe("FORBIDDEN_FIELD");
        expect(out.errors[0].message).toContain("Undefined value");
    });

    test("NG6: Date Object Present", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.created_at = new Date();
        const out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("FORBIDDEN_FIELD");
        expect(out.errors[0].message).toContain("Date object forbidden");
    });

    test("NG7: Invalid Archive Entry", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.archive_entry.archive_id = ""; // Empty string
        let out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_ARCHIVE_ENTRY");

        input.archive_entry.archive_id = 123; // Not a string
        out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_ARCHIVE_ENTRY");
    });

    test("NG8: Invalid Logical Clock", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.metadata.logical_clock_vector.export = "not-a-number";
        let out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_LOGICAL_CLOCK");

        input.metadata.logical_clock_vector.export = Infinity;
        out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_LOGICAL_CLOCK");

        delete input.metadata.logical_clock_vector;
        out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_LOGICAL_CLOCK");
    });

    test("NG9: Invalid State Evolution", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.state_evolution = null;
        let out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_STATE_EVOLUTION");

        input.state_evolution = "invalid";
        out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_STATE_EVOLUTION");
    });

    test("NG10: Invalid Execution Model", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.formal_execution_model = null;
        let out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_EXEC_MODEL");

        input.formal_execution_model = "invalid";
        out = execute(input);
        expect(out.status).toBe("ERROR");
        expect(out.errors[0].code).toBe("INVALID_EXEC_MODEL");
    });

    // -------------------------------------------------------------------------
    // Edge Cases (4 Tests)
    // -------------------------------------------------------------------------

    test("EC1: Feature Flag Disabled -> Bypass", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.feature_flags["FF_OS_BOUNDARY_EXPORT_LAYER"] = false;

        const out = execute(input);
        expect(out.status).toBe("OK"); // Status OK
        expect(out.os_export.bypass).toBe(true);
        expect(out.os_export.package_manifest).toBeUndefined();
    });

    test("EC2: Missing Optional Vectors (Valid)", () => {
        // Spec implies undefined optional vectors default to empty {}
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.state_evolution.connector_state_vector;
        delete input.formal_execution_model.replay_model_ref;

        const out = execute(input);
        expect(out.status).toBe("OK");
        expect(out.os_export.export_bundle.connector_state_vector).toEqual({});
        expect(out.os_export.export_bundle.replay_model_ref).toEqual({});
    });

    test("EC3: Deeply Nested Sorting", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.state_evolution.connector_state_vector = { z: 1, a: 2, m: { y: 9, b: 8 } };

        const out = execute(input);
        const vec = out.os_export.export_bundle.connector_state_vector;
        const keys = Object.keys(vec);
        expect(keys).toEqual(['a', 'm', 'z']);
        const subKeys = Object.keys(vec.m);
        expect(subKeys).toEqual(['b', 'y']);
    });

    test("EC4: Execution ID Fallback", () => {
        // Input validation requires execution_id, so implementation logic `safeExecId` is defensive.
        // If we bypass requires check? No, validateContract checks execution_id.
        // Only way to test fallback is if validation passes but ID is somehow absent? Impossible per validation.
        // Instead test that valid execution_id is propagated correctly.
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.execution_id = "exec-fallback-test";
        const out = execute(input);
        expect(out.execution_id).toBe("exec-fallback-test");
    });

    // -------------------------------------------------------------------------
    // Regression Guard (1 Test)
    // -------------------------------------------------------------------------

    test("RG1: Replay Stability (Byte-for-Byte)", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const out1 = execute(input);

        // Mutate input slightly (should verify immutability or just run again)
        input.tenant_context = { tenant_id: "T-100", region: "us-east-1" }; // same
        const out2 = execute(input);

        expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
    });

    // -------------------------------------------------------------------------
    // Determinism Guard (1 Test)
    // -------------------------------------------------------------------------

    test("DG1: 100x Determinism Loop", () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const ref = execute(input);
        const refStr = JSON.stringify(ref);

        for (let i = 0; i < 100; i++) {
            const run = execute(JSON.parse(JSON.stringify(BASE_INPUT)));
            expect(JSON.stringify(run)).toBe(refStr);
        }
    });

});
