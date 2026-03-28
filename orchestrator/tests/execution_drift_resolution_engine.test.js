/**
 * Tests for Execution Drift Resolution Engine (Phase 24)
 */

const assert = require("assert");
const { resolveDrift } = require("../modules/execution_drift_resolution_engine");

async function runTests() {
    console.log("Running Execution Drift Resolution Engine Tests...");

    // Test 1: Invalid input
    console.log("Test 1: Invalid input");
    const r1a = resolveDrift(null);
    assert.strictEqual(r1a.ok, false);
    assert.strictEqual(r1a.error.code, "INVALID_INPUT");

    const r1b = resolveDrift({});
    assert.strictEqual(r1b.ok, false);
    assert.strictEqual(r1b.error.code, "INVALID_INPUT");

    // Missing plan
    const r1c = resolveDrift({ run: {}, drift: {} });
    assert.strictEqual(r1c.ok, false);
    assert.strictEqual(r1c.error.code, "INVALID_INPUT");

    // Missing run
    const r1d = resolveDrift({ plan: { venues: [], stats: {} }, drift: {} });
    assert.strictEqual(r1d.ok, false);
    assert.strictEqual(r1d.error.code, "INVALID_INPUT");

    // Missing drift
    const r1e = resolveDrift({
        plan: { venues: [], stats: {} },
        run: {
            run_id: "run_1",
            connector_payload: { connector_requests: { venues: [] } },
            connector_result: { venues: [] }
        }
    });
    assert.strictEqual(r1e.ok, false);
    assert.strictEqual(r1e.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 2: No drift scenario
    console.log("\nTest 2: No drift scenario");
    const noDriftInput = {
        plan: { venues: [], stats: {} },
        run: {
            run_id: "run_nodrift",
            connector_payload: { connector_requests: { venues: [] } },
            connector_result: { venues: [] }
        },
        drift: {
            summary: { has_drift: false },
            venues: []
        }
    };
    const res2 = resolveDrift(noDriftInput);
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.has_drift, false);
    assert.strictEqual(res2.payload.highest_severity, "NONE");
    assert.strictEqual(res2.payload.summary.total_actions, 0);
    assert.strictEqual(res2.payload.summary.requires_rerun, false);
    assert.strictEqual(res2.payload.summary.requires_rebuild, false);
    console.log("PASS");

    // Test 3: CRITICAL tests (Rebuild)
    console.log("\nTest 3: CRITICAL tests");
    const criticalCodes = ["VENUE_MISSING_IN_ACTUAL", "VENUE_UNEXPECTED_IN_ACTUAL", "CONNECTOR_ERROR", "SUMMARY_TOTAL_VENUES_MISMATCH"];

    for (const code of criticalCodes) {
        const isGlobal = code === "SUMMARY_TOTAL_VENUES_MISMATCH";
        const venueKey = isGlobal ? "_global_" : "v1";

        const input = {
            plan: { venues: [], stats: {} },
            run: {
                run_id: "run_crit",
                connector_payload: { connector_requests: { venues: [] } },
                connector_result: { venues: [] }
            },
            drift: {
                summary: { has_drift: true },
                venues: [
                    {
                        venue_key: venueKey,
                        issues: [{ code, severity: "CRITICAL" }]
                    }
                ]
            }
        };

        const res = resolveDrift(input);
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.payload.has_drift, true);
        assert.strictEqual(res.payload.highest_severity, "CRITICAL");
        assert.strictEqual(res.payload.summary.requires_rebuild, true);
        assert.strictEqual(res.payload.summary.requires_rerun, false);

        let actions;
        if (isGlobal) {
            actions = res.payload.actions.global;
        } else {
            actions = res.payload.actions.venues[venueKey];
        }

        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].type, "REBUILD_REQUESTS");
        assert.strictEqual(actions[0].severity, "CRITICAL");
        assert.strictEqual(actions[0].source_issue, code);
    }
    console.log("PASS");

    // Test 4: WARNING tests (Retry)
    console.log("\nTest 4: WARNING tests");
    const warningCodes = ["BUDGET_MISMATCH", "UNITS_MISMATCH"]; // UNITS is technically INFO in Phase 23 but mapped to RETRY/WARNING in Phase 24 spec? 
    // Wait, spec says:
    // B. WARNING Drift -> requires_rerun = true
    // Triggering conditions: budget mismatch, units mismatch
    // Emit actions: type: "RETRY", severity: "WARNING"
    // Phase 23 emits UNITS_MISMATCH as INFO severity.
    // Phase 24 logic maps UNITS_MISMATCH code to RETRY/WARNING regardless of input severity?
    // My implementation maps code to action. Let's verify.

    for (const code of warningCodes) {
        const input = {
            plan: { venues: [], stats: {} },
            run: {
                run_id: "run_warn",
                connector_payload: { connector_requests: { venues: [] } },
                connector_result: { venues: [] }
            },
            drift: {
                summary: { has_drift: true },
                venues: [
                    {
                        venue_key: "v1",
                        issues: [{ code, severity: code === "UNITS_MISMATCH" ? "INFO" : "WARNING" }]
                    }
                ]
            }
        };

        const res = resolveDrift(input);
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.payload.summary.requires_rerun, true);
        assert.strictEqual(res.payload.summary.requires_rebuild, false);

        const actions = res.payload.actions.venues["v1"];
        assert.strictEqual(actions[0].type, "RETRY");
        assert.strictEqual(actions[0].severity, "WARNING");
    }
    console.log("PASS");

    // Test 5: INFO tests (Noop)
    console.log("\nTest 5: INFO tests");
    const inputInfo = {
        plan: { venues: [], stats: {} },
        run: {
            run_id: "run_info",
            connector_payload: { connector_requests: { venues: [] } },
            connector_result: { venues: [] }
        },
        drift: {
            summary: { has_drift: true },
            venues: [
                {
                    venue_key: "v1",
                    issues: [{ code: "MINOR_ISSUE", severity: "INFO" }]
                }
            ]
        }
    };
    const resInfo = resolveDrift(inputInfo);
    assert.strictEqual(resInfo.ok, true);
    assert.strictEqual(resInfo.payload.summary.requires_rerun, false);
    assert.strictEqual(resInfo.payload.summary.requires_rebuild, false);
    const actionsInfo = resInfo.payload.actions.venues["v1"];
    assert.strictEqual(actionsInfo[0].type, "NOOP");
    assert.strictEqual(actionsInfo[0].severity, "INFO");
    console.log("PASS");

    // Test 6: Deterministic ordering
    console.log("\nTest 6: Deterministic ordering");
    const inputOrder = {
        plan: { venues: [], stats: {} },
        run: {
            run_id: "run_order",
            connector_payload: { connector_requests: { venues: [] } },
            connector_result: { venues: [] }
        },
        drift: {
            summary: { has_drift: true },
            venues: [
                { venue_key: "b", issues: [{ code: "BUDGET_MISMATCH", severity: "WARNING" }] },
                { venue_key: "a", issues: [{ code: "BUDGET_MISMATCH", severity: "WARNING" }] },
                { venue_key: "_global_", issues: [{ code: "SUMMARY_TOTAL_VENUES_MISMATCH", severity: "CRITICAL" }] }
            ]
        }
    };
    const resOrder = resolveDrift(inputOrder);
    const venueKeys = Object.keys(resOrder.payload.actions.venues);
    assert.deepStrictEqual(venueKeys, ["a", "b"]); // Sorted
    assert.strictEqual(resOrder.payload.actions.global.length, 1); // Global separate
    console.log("PASS");

    // Test 7: Immutability
    console.log("\nTest 7: Immutability");
    const inputImmut = {
        plan: { venues: [], stats: {} },
        run: {
            run_id: "run_immut",
            connector_payload: { connector_requests: { venues: [] } },
            connector_result: { venues: [] }
        },
        drift: {
            summary: { has_drift: true },
            venues: [
                { venue_key: "v1", issues: [{ code: "BUDGET_MISMATCH", severity: "WARNING" }] }
            ]
        }
    };
    const inputCopy = JSON.stringify(inputImmut);
    resolveDrift(inputImmut);
    assert.strictEqual(JSON.stringify(inputImmut), inputCopy);
    console.log("PASS");

    console.log("\nAll Phase 24 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
