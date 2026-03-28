/**
 * Tests for Execution Correction Engine (Phase 25)
 */

const assert = require("assert");
const { determineCorrection } = require("../modules/execution_correction_engine");

async function runTests() {
    console.log("Running Execution Correction Engine Tests...");

    // Test 1: Terminal state (global)
    console.log("Test 1: Terminal state (global)");
    const input1 = createInput({ global_is_terminal: true });
    const res1 = determineCorrection(input1);
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.correction.action, "ABORT_EXECUTION");
    assert.strictEqual(res1.payload.correction.is_terminal, true);
    console.log("PASS");

    // Test 2: Terminal state (venue)
    console.log("\nTest 2: Terminal state (venue)");
    const input2 = createInput({
        venues: [{ venue_key: "v1", is_terminal: true, issues: [] }]
    });
    const res2 = determineCorrection(input2);
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.correction.action, "ABORT_EXECUTION");
    assert.strictEqual(res2.payload.correction.is_terminal, true);
    console.log("PASS");

    // Test 3: Global rebuild
    console.log("\nTest 3: Global rebuild");
    const input3 = createInput({ global_requires_rebuild: true });
    const res3 = determineCorrection(input3);
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.correction.action, "REBUILD_CONNECTOR_REQUESTS");
    assert.strictEqual(res3.payload.correction.requires_rebuild, true);
    assert.strictEqual(res3.payload.correction.targets, null);
    console.log("PASS");

    // Test 4: Venue-level rebuild
    console.log("\nTest 4: Venue-level rebuild");
    const input4 = createInput({
        venues: [
            { venue_key: "b", requires_rebuild: true, issues: [] },
            { venue_key: "a", requires_rebuild: true, issues: [] }
        ]
    });
    const res4 = determineCorrection(input4);
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload.correction.action, "REBUILD_CONNECTOR_REQUESTS");
    assert.strictEqual(res4.payload.correction.requires_rebuild, true);
    assert.deepStrictEqual(res4.payload.correction.targets, ["a", "b"]); // Sorted
    console.log("PASS");

    // Test 5: Global retry
    console.log("\nTest 5: Global retry");
    const input5 = createInput({ global_requires_retry: true });
    const res5 = determineCorrection(input5);
    assert.strictEqual(res5.ok, true);
    assert.strictEqual(res5.payload.correction.action, "RETRY_CONNECTOR_IO");
    assert.strictEqual(res5.payload.correction.requires_connector_io, true);
    assert.strictEqual(res5.payload.correction.targets, null);
    console.log("PASS");

    // Test 6: Venue-level retry
    console.log("\nTest 6: Venue-level retry");
    const input6 = createInput({
        venues: [
            { venue_key: "b", requires_retry: true, issues: [] },
            { venue_key: "a", requires_retry: true, issues: [] }
        ]
    });
    const res6 = determineCorrection(input6);
    assert.strictEqual(res6.ok, true);
    assert.strictEqual(res6.payload.correction.action, "RETRY_CONNECTOR_IO");
    assert.strictEqual(res6.payload.correction.requires_connector_io, true);
    assert.deepStrictEqual(res6.payload.correction.targets, ["a", "b"]); // Sorted
    console.log("PASS");

    // Test 7: Default case
    console.log("\nTest 7: Default case");
    const input7 = createInput({});
    const res7 = determineCorrection(input7);
    assert.strictEqual(res7.ok, true);
    assert.strictEqual(res7.payload.correction.action, "NO_ACTION");
    assert.strictEqual(res7.payload.correction.is_terminal, false);
    console.log("PASS");

    // Test 8: Unresolved issues (Terminal)
    console.log("\nTest 8: Unresolved issues (Terminal)");
    const input8 = createInput({
        venues: [
            { venue_key: "v1", issues: [{ code: "SOME_ISSUE" }] } // Issues but no retry/rebuild flags
        ]
    });
    const res8 = determineCorrection(input8);
    assert.strictEqual(res8.ok, true);
    assert.strictEqual(res8.payload.correction.action, "ABORT_EXECUTION");
    assert.strictEqual(res8.payload.correction.is_terminal, true);
    console.log("PASS");

    // Test 9: Input immutability
    console.log("\nTest 9: Input immutability");
    const input9 = createInput({ global_requires_retry: true });
    const inputCopy = JSON.stringify(input9);
    determineCorrection(input9);
    assert.strictEqual(JSON.stringify(input9), inputCopy);
    console.log("PASS");

    // Test 10: Envelope error handling
    console.log("\nTest 10: Envelope error handling");
    const res10 = determineCorrection(null);
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 11: Deterministic output structure
    console.log("\nTest 11: Deterministic output structure");
    const res11 = determineCorrection(createInput({}));
    assert.strictEqual(typeof res11.timestamp, "string");
    assert.strictEqual(res11.module, "execution_correction_engine");
    assert.ok(res11.payload.plan);
    assert.ok(res11.payload.resolution);
    assert.ok(res11.payload.correction);
    console.log("PASS");

    // Test 12: Backward-compat guard for Phase 24 schema
    console.log("\nTest 12: Backward-compat guard for Phase 24 schema");
    // Passing Phase 24 output (DriftResolutionPlan) directly should fail validation
    // because it lacks global_requires_retry etc.
    const phase24Output = {
        plan: {},
        resolution: {
            run_id: "run_1",
            has_drift: true,
            actions: { global: [], venues: {} },
            summary: { requires_rerun: true, requires_rebuild: false }
        }
    };
    const res12 = determineCorrection(phase24Output);
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 13: Terminal Dead-End (Global No Retry/Rebuild)
    console.log("\nTest 13: Terminal Dead-End (Global No Retry/Rebuild)");
    const input13 = createInput({
        venues: [{ venue_key: "v1", issues: [{ code: "SOME_ISSUE" }] }],
        global_requires_retry: false,
        global_requires_rebuild: false
    });
    const res13 = determineCorrection(input13);
    assert.strictEqual(res13.ok, true);
    assert.strictEqual(res13.payload.correction.action, "ABORT_EXECUTION");
    assert.strictEqual(res13.payload.correction.is_terminal, true);
    assert.strictEqual(res13.payload.correction.reason, "terminal_state_detected");
    console.log("PASS");

    // Test 14: No Dead-End When Retry or Rebuild Exists
    console.log("\nTest 14: No Dead-End When Retry or Rebuild Exists");
    const input14 = createInput({
        venues: [{ venue_key: "v1", requires_rebuild: true, issues: [{ code: "SOME_ISSUE" }] }],
        global_requires_retry: false,
        global_requires_rebuild: false
    });
    const res14 = determineCorrection(input14);
    assert.strictEqual(res14.ok, true);
    assert.strictEqual(res14.payload.correction.is_terminal, false);
    assert.strictEqual(res14.payload.correction.action, "REBUILD_CONNECTOR_REQUESTS");
    console.log("PASS");

    console.log("\nAll Phase 25 tests passed.");
}

function createInput(resolutionOverrides) {
    return {
        plan: { venues: [], stats: {} },
        resolution: {
            global_requires_retry: false,
            global_requires_rebuild: false,
            global_is_terminal: false,
            venues: [],
            ...resolutionOverrides
        }
    };
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
