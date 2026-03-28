/**
 * Tests for Execution Drift Engine (Phase 23)
 */

const assert = require("assert");
const { detectDrift } = require("../modules/execution_drift_engine");

async function runTests() {
    console.log("Running Execution Drift Engine Tests...");

    // Test 1: Invalid input
    console.log("Test 1: Invalid input");
    const r1a = detectDrift(null);
    assert.strictEqual(r1a.ok, false);
    assert.strictEqual(r1a.error.code, "INVALID_INPUT");

    const r1b = detectDrift({});
    assert.strictEqual(r1b.ok, false);
    assert.strictEqual(r1b.error.code, "INVALID_INPUT");

    const r1c = detectDrift({ plan: {}, run: {} });
    assert.strictEqual(r1c.ok, false);
    assert.strictEqual(r1c.error.code, "INVALID_INPUT"); // missing run_id
    console.log("PASS");

    // Test 2: Happy path, no drift
    console.log("\nTest 2: Happy path, no drift");
    const plan2 = {
        venues: [
            {
                venue_key: "youtube",
                stats: {
                    expected_budget: 100,
                    expected_units: 10
                }
            }
        ]
    };
    const run2 = {
        run_id: "run_123",
        connector_payload: {
            connector_requests: {
                venues: [
                    {
                        venue_key: "youtube",
                        budget: 100,
                        units: 10
                    }
                ]
            }
        },
        connector_result: {
            venues: [
                {
                    venue_key: "youtube",
                    status_code: 200,
                    errors: []
                }
            ]
        },
        summary: {
            total_venues: 1,
            success: 1,
            failed: 0,
            skipped: 0
        }
    };
    const res2 = detectDrift({ plan: plan2, run: run2 });
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.run_id, "run_123");
    assert.strictEqual(res2.payload.summary.has_drift, false);
    const youtubeDrift2 = res2.payload.venues.find(v => v.venue_key === "youtube");
    assert.ok(youtubeDrift2);
    assert.strictEqual(youtubeDrift2.severity, "NONE");
    console.log("PASS");

    // Test 3: Venue missing in actual
    console.log("\nTest 3: Venue missing in actual");
    const plan3 = {
        venues: [
            { venue_key: "youtube" }
        ]
    };
    const run3 = {
        run_id: "run_missing",
        connector_payload: {
            connector_requests: {
                venues: []
            }
        },
        connector_result: {
            venues: []
        },
        summary: {
            total_venues: 0,
            success: 0,
            failed: 0,
            skipped: 0
        }
    };
    const res3 = detectDrift({ plan: plan3, run: run3 });
    assert.strictEqual(res3.ok, true);
    const youtubeDrift3 = res3.payload.venues.find(v => v.venue_key === "youtube");
    assert.ok(youtubeDrift3);
    assert.strictEqual(youtubeDrift3.issues[0].code, "VENUE_MISSING_IN_ACTUAL");
    assert.strictEqual(youtubeDrift3.severity, "CRITICAL");
    assert.strictEqual(res3.payload.summary.has_drift, true);
    console.log("PASS");

    // Test 4: Unexpected venue in actual
    console.log("\nTest 4: Unexpected venue in actual");
    const plan4 = { venues: [] };
    const run4 = {
        run_id: "run_unexpected",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "tiktok", budget: 50, units: 5 }
                ]
            }
        },
        connector_result: {
            venues: [
                { venue_key: "tiktok", status_code: 200, errors: [] }
            ]
        },
        summary: {
            total_venues: 1,
            success: 1,
            failed: 0,
            skipped: 0
        }
    };
    const res4 = detectDrift({ plan: plan4, run: run4 });
    const tiktokDrift4 = res4.payload.venues.find(v => v.venue_key === "tiktok");
    assert.ok(tiktokDrift4);
    assert.strictEqual(tiktokDrift4.issues[0].code, "VENUE_UNEXPECTED_IN_ACTUAL");
    assert.strictEqual(tiktokDrift4.severity, "WARNING");
    console.log("PASS");

    // Test 5: Budget mismatch
    console.log("\nTest 5: Budget mismatch");
    const plan5 = {
        venues: [
            {
                venue_key: "youtube",
                stats: { expected_budget: 100 }
            }
        ]
    };
    const run5 = {
        run_id: "run_budget",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "youtube", budget: 120 }
                ]
            }
        },
        connector_result: {
            venues: [
                { venue_key: "youtube", status_code: 200, errors: [] }
            ]
        },
        summary: {
            total_venues: 1,
            success: 1,
            failed: 0,
            skipped: 0
        }
    };
    const res5 = detectDrift({ plan: plan5, run: run5 });
    const youtubeDrift5 = res5.payload.venues.find(v => v.venue_key === "youtube");
    assert.ok(youtubeDrift5);
    const budgetIssue = youtubeDrift5.issues.find(i => i.code === "BUDGET_MISMATCH");
    assert.ok(budgetIssue);
    assert.strictEqual(youtubeDrift5.severity, "WARNING");
    console.log("PASS");

    // Test 6: Units mismatch
    console.log("\nTest 6: Units mismatch");
    const plan6 = {
        venues: [
            {
                venue_key: "youtube",
                stats: { expected_units: 4 }
            }
        ]
    };
    const run6 = {
        run_id: "run_units",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "youtube", units: 6 }
                ]
            }
        },
        connector_result: {
            venues: [
                { venue_key: "youtube", status_code: 200, errors: [] }
            ]
        },
        summary: {
            total_venues: 1,
            success: 1,
            failed: 0,
            skipped: 0
        }
    };
    const res6 = detectDrift({ plan: plan6, run: run6 });
    const youtubeDrift6 = res6.payload.venues.find(v => v.venue_key === "youtube");
    assert.ok(youtubeDrift6);
    const unitsIssue = youtubeDrift6.issues.find(i => i.code === "UNITS_MISMATCH");
    assert.ok(unitsIssue);
    assert.strictEqual(youtubeDrift6.severity, "INFO");
    console.log("PASS");

    // Test 7: Connector error
    console.log("\nTest 7: Connector error");
    const plan7 = {
        venues: [
            { venue_key: "youtube" }
        ]
    };
    const run7 = {
        run_id: "run_error",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "youtube" }
                ]
            }
        },
        connector_result: {
            venues: [
                {
                    venue_key: "youtube",
                    status_code: 500,
                    errors: [{ message: "fail" }]
                }
            ]
        },
        summary: {
            total_venues: 1,
            success: 0,
            failed: 1,
            skipped: 0
        }
    };
    const res7 = detectDrift({ plan: plan7, run: run7 });
    const youtubeDrift7 = res7.payload.venues.find(v => v.venue_key === "youtube");
    assert.ok(youtubeDrift7);
    const connectorIssue = youtubeDrift7.issues.find(i => i.code === "CONNECTOR_ERROR");
    assert.ok(connectorIssue);
    assert.strictEqual(youtubeDrift7.severity, "CRITICAL");
    assert.strictEqual(res7.payload.summary.highest_severity, "CRITICAL");
    console.log("PASS");

    // Test 8: Summary mismatch
    console.log("\nTest 8: Summary mismatch");
    const plan8 = { venues: [] };
    const run8 = {
        run_id: "run_summary",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "a" },
                    { venue_key: "b" }
                ]
            }
        },
        connector_result: {
            venues: []
        },
        summary: {
            total_venues: 3,
            success: 0,
            failed: 0,
            skipped: 0
        }
    };
    const res8 = detectDrift({ plan: plan8, run: run8 });
    const globalDrift = res8.payload.venues.find(v => v.venue_key === "_global_");
    assert.ok(globalDrift);
    const summaryIssue = globalDrift.issues.find(i => i.code === "SUMMARY_TOTAL_VENUES_MISMATCH");
    assert.ok(summaryIssue);
    assert.strictEqual(res8.payload.summary.counts.venues_with_drift >= 1, true);
    console.log("PASS");

    // Test 9: Immutability
    console.log("\nTest 9: Immutability");
    const plan9 = {
        venues: [
            { venue_key: "youtube", stats: { expected_budget: 50 } }
        ]
    };
    const run9 = {
        run_id: "run_immut",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "youtube", budget: 60 }
                ]
            }
        },
        connector_result: {
            venues: [
                { venue_key: "youtube", status_code: 200, errors: [] }
            ]
        },
        summary: {
            total_venues: 1,
            success: 1,
            failed: 0,
            skipped: 0
        }
    };
    const plan9Copy = JSON.stringify(plan9);
    const run9Copy = JSON.stringify(run9);

    detectDrift({ plan: plan9, run: run9 });

    assert.strictEqual(JSON.stringify(plan9), plan9Copy);
    assert.strictEqual(JSON.stringify(run9), run9Copy);
    console.log("PASS");

    // Test 10: Deterministic ordering with _global_ last
    console.log("\nTest 10: Deterministic ordering");
    const plan10 = {
        venues: [
            { venue_key: "b" },
            { venue_key: "a" }
        ]
    };
    const run10 = {
        run_id: "run_order",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "a" }
                ]
            }
        },
        connector_result: {
            venues: []
        },
        summary: {
            total_venues: 99, // Force mismatch (actual is 1)
            success: 1,
            failed: 0,
            skipped: 0
        }
    };
    const res10 = detectDrift({ plan: plan10, run: run10 });
    const keys10 = res10.payload.venues.map(v => v.venue_key);
    // "a" and "b" sorted, plus "_global_" last because summary mismatch
    assert.deepStrictEqual(keys10, ["a", "b", "_global_"]);
    console.log("PASS");

    console.log("\nAll Phase 23 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
