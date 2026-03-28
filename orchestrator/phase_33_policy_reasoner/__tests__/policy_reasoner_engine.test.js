/**
 * Tests for Policy Reasoner Engine (Phase 33)
 */

const assert = require("assert");
const { runPolicyReasoner } = require("../index");
const snapshotValid = require("./fixtures/snapshot_valid.json");
const mirrorValid = require("./fixtures/mirror_valid.json");

// Helper to create input envelope
function createEnvelope(overrides = {}) {
    return {
        ok: true,
        module: "orchestrator",
        execution_id: "exec_123",
        intent: "POLICY_REASONING_V1",
        timestamp: "2025-11-29T12:00:00Z",
        payload: {
            execution_snapshot: JSON.parse(JSON.stringify(snapshotValid)),
            policy_mirror: JSON.parse(JSON.stringify(mirrorValid)),
            ...overrides.payload
        },
        source: {
            phase: 33,
            name: "policy_reasoner_engine"
        },
        ...overrides
    };
}

async function runTests() {
    console.log("Running Policy Reasoner Engine Tests...");

    // ========== HAPPY PATH (4) ==========

    // 1. Allowed single venue (Actually Conditional because TIKTOK is disabled)
    console.log("Test 1: Allowed single venue (Conditional)");
    process.env.FF_POLICY_REASONER_V1 = "true";
    const res1 = runPolicyReasoner(createEnvelope());
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.overall.status, "CONDITIONAL");
    assert.deepStrictEqual(res1.payload.objectives.allowed_venues, ["YOUTUBE"]);
    assert.strictEqual(res1.payload.objectives.blocked_venues.length, 1); // TIKTOK is disabled
    assert(res1.payload.overall.summary_tags.includes("policy_conditional"));
    console.log("PASS");



    // 2. Mixed venues (Conditional)
    console.log("Test 2: Mixed venues (Conditional)");
    // Enable TIKTOK in mirror
    const mirror2 = JSON.parse(JSON.stringify(mirrorValid));
    mirror2.rules.venues.TIKTOK.enabled = true;
    const res2 = runPolicyReasoner(createEnvelope({ payload: { execution_snapshot: snapshotValid, policy_mirror: mirror2 } }));
    // Both allowed? No, wait. TIKTOK enabled.
    // Objective AWARENESS -> [YOUTUBE, TIKTOK].
    // Both enabled.
    // Should be ALLOWED with 2 venues.
    // Wait, let's make one blocked by incompatibility to force CONDITIONAL?
    // Or blocked by something else?
    // Spec says: "If allowed > 0 and blocked > 0 -> CONDITIONAL".
    // In Test 1, we had YOUTUBE allowed, TIKTOK blocked (disabled).
    // So Test 1 should actually be CONDITIONAL?
    // Let's re-read logic:
    // "Else if allowed > 0 and blocked > 0 -> CONDITIONAL"
    // In Test 1: YOUTUBE allowed. TIKTOK blocked (disabled).
    // So Test 1 result should be CONDITIONAL.
    // Let's correct Test 1 assertion if needed.
    // Actually, let's check Test 1 output.
    // YOUTUBE allowed. TIKTOK blocked (VENUE_DISABLED).
    // So status is CONDITIONAL.
    // Let's adjust Test 1 expectation to CONDITIONAL.
    if (res1.payload.overall.status !== "CONDITIONAL") {
        console.error("Test 1 failed: Expected CONDITIONAL, got " + res1.payload.overall.status);
        // assert.strictEqual(res1.payload.overall.status, "CONDITIONAL"); 
        // Wait, if I want ALLOWED, I need NO blocked venues.
        // Let's remove TIKTOK from mirror for Test 1 to be pure ALLOWED.
    }

    // Let's make Test 1 pure ALLOWED by removing TIKTOK from matrix/venues
    const mirror1b = JSON.parse(JSON.stringify(mirrorValid));
    delete mirror1b.rules.venues.TIKTOK;
    mirror1b.rules.compatibility_matrix.objective_to_venue.AWARENESS = ["YOUTUBE"];
    const res1b = runPolicyReasoner(createEnvelope({ payload: { execution_snapshot: snapshotValid, policy_mirror: mirror1b } }));
    assert.strictEqual(res1b.payload.overall.status, "ALLOWED");
    console.log("PASS (Refined)");

    // Test 2: Conditional
    // Use original mirror: YOUTUBE enabled, TIKTOK disabled.
    // Objective AWARENESS -> [YOUTUBE, TIKTOK].
    const res2b = runPolicyReasoner(createEnvelope());
    assert.strictEqual(res2b.payload.overall.status, "CONDITIONAL");
    assert(res2b.payload.overall.summary_tags.includes("policy_conditional"));
    console.log("PASS");

    // 3. Budget too low (Blocked)
    console.log("Test 3: Budget too low");
    const snap3 = JSON.parse(JSON.stringify(snapshotValid));
    snap3.request_context.budget_parameters.total_budget = 500; // Min is 1000
    const res3 = runPolicyReasoner(createEnvelope({ payload: { execution_snapshot: snap3, policy_mirror: mirrorValid } }));
    assert.strictEqual(res3.payload.overall.status, "BLOCKED");
    assert.strictEqual(res3.payload.overall.primary_blocking_reason, "BUDGET_VIOLATION");
    assert(res3.payload.overall.summary_tags.includes("budget_out_of_bounds"));
    console.log("PASS");

    // 4. Feature flag disabled
    console.log("Test 4: Feature flag disabled");
    process.env.FF_POLICY_REASONER_V1 = "false";
    const res4 = runPolicyReasoner(createEnvelope());
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload, null);
    assert.strictEqual(res4.diagnostics.disabled, true);
    process.env.FF_POLICY_REASONER_V1 = "true"; // Reset
    console.log("PASS");

    // ========== NEGATIVE / EDGE (5) ==========

    // 5. Malformed envelope
    console.log("Test 5: Malformed envelope");
    const res5 = runPolicyReasoner({ ok: true }); // Missing payload
    assert.strictEqual(res5.ok, false);
    assert.strictEqual(res5.error.code, "MALFORMED_POLICY_REASONER_CONTRACT");
    console.log("PASS");

    // 6. Invalid mirror shape
    console.log("Test 6: Invalid mirror shape");
    const res6 = runPolicyReasoner(createEnvelope({ payload: { execution_snapshot: snapshotValid, policy_mirror: {} } }));
    assert.strictEqual(res6.ok, false);
    assert.strictEqual(res6.error.code, "INVALID_POLICY_MIRROR_PAYLOAD");
    console.log("PASS");

    // 7. Snapshot structurally invalid
    console.log("Test 7: Snapshot structurally invalid");
    const res7 = runPolicyReasoner(createEnvelope({ payload: { execution_snapshot: null, policy_mirror: mirrorValid } }));
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "MALFORMED_POLICY_REASONER_CONTRACT"); // Validator catches null snapshot first
    console.log("PASS");

    // 8. Strict mode + missing policy entries
    console.log("Test 8: Strict mode error");
    const snap8 = JSON.parse(JSON.stringify(snapshotValid));
    snap8.request_context.campaign_goal.type = "UNKNOWN_GOAL";
    const res8 = runPolicyReasoner(createEnvelope({
        payload: {
            execution_snapshot: snap8,
            policy_mirror: mirrorValid,
            options: { strict_mode: true }
        }
    }));
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INVALID_POLICY_MIRROR_PAYLOAD");
    assert(res8.error.message.includes("Missing policy entries"));
    console.log("PASS");

    // 9. Unknown objective (Non-strict)
    console.log("Test 9: Unknown objective (Non-strict)");
    const res9 = runPolicyReasoner(createEnvelope({
        payload: {
            execution_snapshot: snap8,
            policy_mirror: mirrorValid,
            options: { strict_mode: false }
        }
    }));
    assert.strictEqual(res9.ok, true);
    assert.strictEqual(res9.payload.overall.status, "BLOCKED");
    assert.strictEqual(res9.payload.overall.primary_blocking_reason, "OBJECTIVE_NOT_SUPPORTED");
    assert(res9.payload.diagnostics.evaluation_warnings.includes("MISSING_POLICY_ENTRIES_DETECTED"));
    console.log("PASS");

    // ========== DETERMINISM (1) ==========

    // 10. Determinism check
    console.log("Test 10: Determinism check");
    const input10 = createEnvelope();
    const run1 = runPolicyReasoner(input10);
    const run2 = runPolicyReasoner(input10);
    // Compare payloads (ignoring timestamp in envelope, but payload timestamp is same if mocked or fast enough? 
    // Wait, timestamp is created inside reasonPolicy. So they will differ.
    // We should compare everything EXCEPT timestamp.
    const p1 = { ...run1.payload, timestamp: "IGNORE" };
    const p2 = { ...run2.payload, timestamp: "IGNORE" };
    assert.deepStrictEqual(p1, p2);
    // Also check array order is stable (deepStrictEqual checks this)
    console.log("PASS");

    console.log("✅ All Phase 33 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
