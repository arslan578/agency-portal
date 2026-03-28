/**
 * Tests for Execution Connector Action Engine (Phase 26)
 */

const assert = require("assert");
const { buildConnectorActions } = require("../modules/execution_connector_action_engine");

async function runTests() {
    console.log("Running Execution Connector Action Engine Tests...");

    // Test 1: Happy path — GLOBAL_RETRY
    console.log("Test 1: Happy path — GLOBAL_RETRY");
    const input1 = {
        plan: { venues: [] },
        connector_bundle: {
            venues: [
                {
                    venue_key: "youtube",
                    connector_key: "youtube_ads",
                    requests: [
                        { request_id: "req_1", status: "FAILED" },
                        { request_id: "req_2", status: "SUCCESS" },
                        { request_id: "req_3", status: "TIMEOUT" }
                    ]
                },
                {
                    venue_key: "meta",
                    connector_key: "meta_ads",
                    requests: [
                        { request_id: "req_10" }, // No status = retryable
                        { request_id: "req_11", status: "PENDING" }
                    ]
                }
            ]
        },
        correction: {
            action: "GLOBAL_RETRY",
            reason: "global_retry_required",
            requires_connector_io: true,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const inputCopy1 = JSON.stringify(input1);
    const res1 = buildConnectorActions(input1);

    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.connector_actions.jobs.length, 2);
    assert.strictEqual(res1.payload.connector_actions.jobs[0].venue_key, "meta"); // Sorted
    assert.strictEqual(res1.payload.connector_actions.jobs[1].venue_key, "youtube");
    assert.deepStrictEqual(res1.payload.connector_actions.jobs[1].request_ids, ["req_1", "req_3"]);
    assert.deepStrictEqual(res1.payload.connector_actions.jobs[0].request_ids, ["req_10"]);
    assert.strictEqual(JSON.stringify(input1), inputCopy1); // Immutability
    console.log("PASS");

    // Test 2: Happy path — VENUE_RETRY (single venue)
    console.log("\nTest 2: Happy path — VENUE_RETRY (single venue)");
    const input2 = {
        plan: {},
        connector_bundle: {
            venues: [
                {
                    venue_key: "youtube",
                    connector_key: "youtube_ads",
                    requests: [{ request_id: "req_1", status: "FAILED" }]
                },
                {
                    venue_key: "meta",
                    connector_key: "meta_ads",
                    requests: [{ request_id: "req_2", status: "FAILED" }]
                }
            ]
        },
        correction: {
            action: "VENUE_RETRY",
            reason: "venue_retry_required",
            targets: { venues: ["youtube"] },
            requires_connector_io: true,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const res2 = buildConnectorActions(input2);
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.connector_actions.jobs.length, 1);
    assert.strictEqual(res2.payload.connector_actions.jobs[0].venue_key, "youtube");
    assert.strictEqual(res2.payload.connector_actions.jobs[0].scope, "VENUE");
    console.log("PASS");

    // Test 3: Happy path — GLOBAL_REBUILD
    console.log("\nTest 3: Happy path — GLOBAL_REBUILD");
    const input3 = {
        plan: {},
        connector_bundle: { venues: [] },
        correction: {
            action: "GLOBAL_REBUILD",
            reason: "global_rebuild_required",
            requires_connector_io: false,
            requires_rebuild: true,
            is_terminal: false
        }
    };

    const res3 = buildConnectorActions(input3);
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.connector_actions.jobs.length, 1);
    assert.strictEqual(res3.payload.connector_actions.jobs[0].mode, "REBUILD");
    assert.strictEqual(res3.payload.connector_actions.jobs[0].scope, "GLOBAL");
    assert.deepStrictEqual(res3.payload.connector_actions.jobs[0].request_ids, []);
    console.log("PASS");

    // Test 4: Happy path — VENUE_REBUILD (two venues)
    console.log("\nTest 4: Happy path — VENUE_REBUILD (two venues)");
    const input4 = {
        plan: {},
        connector_bundle: {
            venues: [
                { venue_key: "youtube", connector_key: "youtube_ads", requests: [] },
                { venue_key: "meta", connector_key: "meta_ads", requests: [] }
            ]
        },
        correction: {
            action: "VENUE_REBUILD",
            reason: "venue_rebuild_required",
            targets: { venues: ["youtube", "meta"] },
            requires_connector_io: false,
            requires_rebuild: true,
            is_terminal: false
        }
    };

    const res4 = buildConnectorActions(input4);
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload.connector_actions.jobs.length, 2);
    assert.strictEqual(res4.payload.connector_actions.jobs[0].venue_key, "meta"); // Sorted
    assert.strictEqual(res4.payload.connector_actions.jobs[1].venue_key, "youtube");
    assert.strictEqual(res4.payload.connector_actions.jobs[0].connector_key, "meta_ads");
    assert.strictEqual(res4.payload.connector_actions.jobs[1].connector_key, "youtube_ads");
    console.log("PASS");

    // Test 5: Happy path — ABORT_EXECUTION
    console.log("\nTest 5: Happy path — ABORT_EXECUTION");
    const input5 = {
        plan: {},
        connector_bundle: { venues: [] },
        correction: {
            action: "ABORT_EXECUTION",
            reason: "terminal_state_detected",
            requires_connector_io: false,
            requires_rebuild: false,
            is_terminal: true
        }
    };

    const res5 = buildConnectorActions(input5);
    assert.strictEqual(res5.ok, true);
    assert.strictEqual(res5.payload.connector_actions.is_terminal, true);
    assert.strictEqual(res5.payload.connector_actions.requires_connector_io, false);
    assert.strictEqual(res5.payload.connector_actions.jobs.length, 1);
    assert.strictEqual(res5.payload.connector_actions.jobs[0].mode, "ABORT");
    assert.strictEqual(res5.payload.connector_actions.jobs[0].scope, "GLOBAL");
    console.log("PASS");

    // Test 6: Happy path — NO_ACTION
    console.log("\nTest 6: Happy path — NO_ACTION");
    const input6 = {
        plan: {},
        connector_bundle: { venues: [] },
        correction: {
            action: "NO_ACTION",
            reason: "no_correction_needed",
            requires_connector_io: false,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const res6 = buildConnectorActions(input6);
    assert.strictEqual(res6.ok, true);
    assert.strictEqual(res6.payload.connector_actions.requires_connector_io, false);
    assert.strictEqual(res6.payload.connector_actions.jobs.length, 1);
    assert.strictEqual(res6.payload.connector_actions.jobs[0].mode, "NOOP");
    console.log("PASS");

    // Test 7: Venue missing in connector_bundle
    console.log("\nTest 7: Venue missing in connector_bundle");
    const input7 = {
        plan: {},
        connector_bundle: {
            venues: [
                { venue_key: "youtube", connector_key: "youtube_ads", requests: [] }
            ]
        },
        correction: {
            action: "VENUE_RETRY",
            reason: "venue_retry_required",
            targets: { venues: ["missing_venue"] },
            requires_connector_io: true,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const res7 = buildConnectorActions(input7);
    assert.strictEqual(res7.ok, true);
    assert.strictEqual(res7.payload.connector_actions.jobs.length, 1);
    assert.strictEqual(res7.payload.connector_actions.jobs[0].mode, "NOOP");
    assert.ok(res7.payload.connector_actions.jobs[0].reason.includes("not found"));
    console.log("PASS");

    // Test 8: Invalid action
    console.log("\nTest 8: Invalid action");
    const input8 = {
        plan: {},
        connector_bundle: { venues: [] },
        correction: {
            action: "SOMETHING_ELSE",
            reason: "test",
            requires_connector_io: false,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const res8 = buildConnectorActions(input8);
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "UNSUPPORTED_ACTION");
    console.log("PASS");

    // Test 9: Missing targets for venue scoped actions
    console.log("\nTest 9: Missing targets for venue scoped actions");
    const input9 = {
        plan: {},
        connector_bundle: { venues: [] },
        correction: {
            action: "VENUE_RETRY",
            reason: "test",
            requires_connector_io: true,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const res9 = buildConnectorActions(input9);
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "INVALID_CORRECTION_TARGETS");
    console.log("PASS");

    // Test 10: Input immutability
    console.log("\nTest 10: Input immutability");
    const input10 = {
        plan: { data: "test" },
        connector_bundle: { venues: [] },
        correction: {
            action: "NO_ACTION",
            reason: "test",
            requires_connector_io: false,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const inputCopy10 = JSON.stringify(input10);
    buildConnectorActions(input10);
    assert.strictEqual(JSON.stringify(input10), inputCopy10);
    console.log("PASS");

    // Test 11: Deterministic ordering
    console.log("\nTest 11: Deterministic ordering");
    const input11 = {
        plan: {},
        connector_bundle: {
            venues: [
                { venue_key: "zulu", connector_key: "z", requests: [{ request_id: "r1" }] },
                { venue_key: "alpha", connector_key: "a", requests: [{ request_id: "r2" }] },
                { venue_key: "bravo", connector_key: "b", requests: [{ request_id: "r3" }] }
            ]
        },
        correction: {
            action: "GLOBAL_RETRY",
            reason: "test",
            requires_connector_io: true,
            requires_rebuild: false,
            is_terminal: false
        }
    };

    const res11 = buildConnectorActions(input11);
    assert.strictEqual(res11.ok, true);
    assert.strictEqual(res11.payload.connector_actions.jobs[0].venue_key, "alpha");
    assert.strictEqual(res11.payload.connector_actions.jobs[1].venue_key, "bravo");
    assert.strictEqual(res11.payload.connector_actions.jobs[2].venue_key, "zulu");
    console.log("PASS");

    // Test 12: Error envelope structure
    console.log("\nTest 12: Error envelope structure");
    const res12 = buildConnectorActions(null);
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.payload, null);
    assert.strictEqual(res12.module, "execution_connector_action_engine");
    assert.ok(res12.error);
    assert.ok(res12.error.code);
    console.log("PASS");

    console.log("\nAll Phase 26 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
