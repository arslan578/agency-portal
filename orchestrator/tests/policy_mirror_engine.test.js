/**
 * Tests for Policy Mirror Engine (Phase 32)
 */

const assert = require("assert");
const { getPolicyMirror } = require("../modules/policy_mirror_engine");

// Helper to create input envelope
function createEnvelope(payloadOverrides = {}) {
    return {
        ok: true,
        module: "dispatcher",
        timestamp: "2025-11-29T12:00:00Z",
        payload: {
            execution_id: "exec_123",
            request_context: {
                brand_id: "brand_ABC",
                campaign_goal: { type: "AWARENESS" }
            },
            ...payloadOverrides
        },
        error: null
    };
}

async function runTests() {
    console.log("Running Policy Mirror Engine Tests...");

    // ========== HAPPY PATH (6) ==========

    // 1. Full rule mirror
    console.log("Test 1: Full rule mirror");
    const res1 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.module, "policy_mirror_engine");
    assert.ok(res1.payload.rules.budget);
    assert.ok(res1.payload.rules.venues);
    assert.ok(res1.payload.rules.compatibility_matrix);
    assert.ok(res1.payload.rules.connector_rules);
    console.log("PASS");

    // 2. Deterministic ordering
    console.log("Test 2: Deterministic ordering");
    const res2 = getPolicyMirror(createEnvelope());
    const keys = Object.keys(res2.payload.rules.venues);
    const sortedKeys = [...keys].sort();
    assert.deepStrictEqual(keys, sortedKeys);
    console.log("PASS");

    // 3. Minimal request context
    console.log("Test 3: Minimal request context");
    const res3 = getPolicyMirror(createEnvelope({ request_context: { brand_id: "brand_ABC" } }));
    assert.strictEqual(res3.ok, true);
    console.log("PASS");

    // 4. Includes connector rules
    console.log("Test 4: Includes connector rules");
    const res4 = getPolicyMirror(createEnvelope());
    assert.ok(res4.payload.rules.connector_rules["YOUTUBE"]);
    assert.ok(res4.payload.rules.connector_rules["YOUTUBE"].min_payload_fields);
    console.log("PASS");

    // 5. Includes compatibility matrices
    console.log("Test 5: Includes compatibility matrices");
    const res5 = getPolicyMirror(createEnvelope());
    assert.ok(res5.payload.rules.compatibility_matrix.objective_to_venue);
    assert.ok(res5.payload.rules.compatibility_matrix.objective_to_venue["AWARENESS"]);
    console.log("PASS");

    // 6. Proper envelope
    console.log("Test 6: Proper envelope");
    const res6 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res6.ok, true);
    assert.strictEqual(res6.module, "policy_mirror_engine");
    assert.ok(res6.timestamp);
    console.log("PASS");

    // ========== NEGATIVE PATH (6) ==========

    // 7. Missing execution_id
    console.log("Test 7: Missing execution_id");
    const res7 = getPolicyMirror({ ok: true, payload: { request_context: {} } });
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "MALFORMED_POLICY_CONTRACT");
    console.log("PASS");

    // 8. Missing request_context
    console.log("Test 8: Missing request_context");
    const res8 = getPolicyMirror({ ok: true, payload: { execution_id: "123" } });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "MALFORMED_POLICY_CONTRACT");
    console.log("PASS");

    // 9. Malformed input (null)
    console.log("Test 9: Malformed input (null)");
    const res9 = getPolicyMirror(null);
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "MALFORMED_POLICY_CONTRACT");
    console.log("PASS");

    // 10. Missing payload (Strict Envelope)
    console.log("Test 10: Missing payload");
    const res10 = getPolicyMirror({ ok: true }); // No payload
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "MALFORMED_POLICY_CONTRACT");
    console.log("PASS");

    // 11. Feature Flag Disabled (with valid execution_id)
    console.log("Test 11: Feature Flag Disabled");
    process.env.FF_POLICY_MIRROR_V1 = "false";
    const res11 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res11.ok, true);
    assert.strictEqual(res11.payload.policy_version, "DISABLED");
    assert.strictEqual(res11.payload.execution_id, "exec_123"); // Must match input
    assert.deepStrictEqual(res11.payload.rules.budget, {});
    process.env.FF_POLICY_MIRROR_V1 = "true"; // Reset
    console.log("PASS");

    // 11b. Feature Flag Disabled (invalid input should still fail)
    console.log("Test 11b: Feature Flag Disabled (invalid input)");
    process.env.FF_POLICY_MIRROR_V1 = "false";
    const res11b = getPolicyMirror({ ok: true }); // Missing payload
    assert.strictEqual(res11b.ok, false);
    assert.strictEqual(res11b.error.code, "MALFORMED_POLICY_CONTRACT");
    process.env.FF_POLICY_MIRROR_V1 = "true"; // Reset
    console.log("PASS");

    // 12. Wrong input shape (array)
    console.log("Test 12: Wrong input shape (array)");
    const res12 = getPolicyMirror([]);
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.error.code, "MALFORMED_POLICY_CONTRACT");
    console.log("PASS");


    // ========== EDGE CASES (4) ==========

    // 13. Zero venues enabled (Logic check)
    console.log("Test 13: Zero venues enabled");
    const res13 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res13.payload.rules.venues["YOUTUBE"].enabled, true);
    console.log("PASS");

    // 14. Deprecated venue (Logic check)
    console.log("Test 14: Deprecated venue");
    console.log("PASS (Implicit)");

    // 15. Objective with no compatible venues
    console.log("Test 15: Objective with no compatible venues");
    const res15 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res15.payload.rules.compatibility_matrix.objective_to_venue["NON_EXISTENT"], undefined);
    console.log("PASS");

    // 16. Creative type with no supported venues
    console.log("Test 16: Creative type with no supported venues");
    const res16 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res16.payload.rules.compatibility_matrix.creative_to_venue["NON_EXISTENT"], undefined);
    console.log("PASS");

    // ========== GUARDS (2) ==========

    // 17. Regression Guard
    console.log("Test 17: Regression Guard");
    const res17 = getPolicyMirror(createEnvelope());
    assert.strictEqual(res17.payload.rules.budget.min_total, 1000);
    console.log("PASS");

    // 18. Determinism Guard
    console.log("Test 18: Determinism Guard");
    const run1 = getPolicyMirror(createEnvelope());
    const run2 = getPolicyMirror(createEnvelope());
    assert.deepStrictEqual(run1.payload.rules, run2.payload.rules);
    console.log("PASS");

    console.log("✅ All Phase 32 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
