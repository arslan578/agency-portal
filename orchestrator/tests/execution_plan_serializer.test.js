/**
 * Tests for Execution Plan Serializer (Phase 18)
 */

const { handle } = require("../modules/execution_plan_serializer");
const assert = require("assert");

// Helper to create minimal test input
function createTestInput(readiness_can_launch = true) {
    return {
        plan: {
            brand_id: "brand_123",
            campaign_id: "camp_456",
            campaign_name: "Test Campaign",
            currency: "USD",
            groups: [
                {
                    group_index: 0,
                    group_id: "g1",
                    venue_key: "meta",
                    role: "PRIMARY",
                    objective: "LEAD_GEN",
                    priority: 1,
                    units: [
                        {
                            unit_id: "u1",
                            audience_ref: "aud_1",
                            creative_ref: "cr_1",
                            budget: { allocated: 100 },
                            schedule: { start_date: "2024-01-01", end_date: "2024-01-31" },
                            tracking: { utm_source: "facebook", utm_medium: "paid", utm_campaign: "test" },
                            index: { global: 0, group: 0, venue: 0 }
                        }
                    ]
                }
            ]
        },
        validation: {
            is_valid: true,
            errors: []
        },
        policy: {
            summary: { is_policy_clean: true },
            issues: []
        },
        readiness: {
            is_launchable: readiness_can_launch,
            worst_level: readiness_can_launch ? "NONE" : "ERROR",
            blocks: [],
            warnings: []
        }
    };
}

async function runTests() {
    console.log("Running Execution Plan Serializer Tests...");

    // Test 1: Happy Path
    console.log("Test 1: Happy Path");
    const input1 = createTestInput(true);
    const result1 = await handle(input1);

    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.module, "execution_plan_serializer");
    assert.strictEqual(result1.payload.can_submit, true);
    assert.strictEqual(result1.payload.global_status, "READY");
    assert.strictEqual(result1.payload.brand_id, "brand_123");
    assert.strictEqual(result1.payload.venues.length, 1);
    assert.strictEqual(result1.payload.venues[0].venue_key, "meta");
    assert.strictEqual(result1.payload.venues[0].can_submit, true);
    assert.strictEqual(result1.payload.venues[0].payload.groups.length, 1);
    assert.strictEqual(result1.payload.venues[0].payload.groups[0].units.length, 1);
    console.log("PASS");

    // Test 2: Global Block
    console.log("Test 2: Global Block");
    const input2 = createTestInput(false);
    const result2 = await handle(input2);

    assert.strictEqual(result2.ok, true);
    assert.strictEqual(result2.payload.can_submit, false);
    assert.strictEqual(result2.payload.global_status, "BLOCKED");
    assert.strictEqual(result2.payload.reasons.readiness_can_launch, false);
    console.log("PASS");

    // Test 3: Validation Failure
    console.log("Test 3: Validation Failure");
    const input3 = createTestInput(true);
    input3.validation.is_valid = false;
    input3.validation.errors = [{ code: "VAL_ERR", message: "Validation error" }];

    const result3 = await handle(input3);
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.can_submit, false);
    assert.strictEqual(result3.payload.reasons.validation_is_valid, false);
    assert.strictEqual(result3.payload.summary.validation_error_count, 1);
    console.log("PASS");

    // Test 4: Policy Failure
    console.log("Test 4: Policy Failure");
    const input4 = createTestInput(true);
    input4.policy.summary.is_policy_clean = false;
    input4.policy.issues = [{ level: "ERROR", code: "POL_ERR", message: "Policy error" }];

    const result4 = await handle(input4);
    assert.strictEqual(result4.ok, true);
    assert.strictEqual(result4.payload.can_submit, false);
    assert.strictEqual(result4.payload.reasons.policy_is_clean, false);
    assert.strictEqual(result4.payload.summary.policy_error_count, 1);
    console.log("PASS");

    // Test 5: Venue Readiness Block
    console.log("Test 5: Venue Readiness Block");
    const input5 = createTestInput(true);
    input5.readiness.blocks = [
        { code: "VENUE_BLOCK", message: "Venue blocked", venue_key: "meta", fix: null }
    ];
    input5.readiness.worst_level = "ERROR";

    const result5 = await handle(input5);
    assert.strictEqual(result5.ok, true);
    assert.strictEqual(result5.payload.venues[0].can_submit, false);
    assert.strictEqual(result5.payload.venues[0].status, "BLOCKED");
    assert.strictEqual(result5.payload.venues[0].issues.blocks.length, 1);
    console.log("PASS");

    // Test 6: Missing Plan
    console.log("Test 6: Missing Plan");
    const result6 = await handle({ validation: {}, policy: {}, readiness: {} });
    assert.strictEqual(result6.ok, false);
    assert.strictEqual(result6.error.code, "MISSING_PLAN");
    console.log("PASS");

    // Test 7: Missing Readiness
    console.log("Test 7: Missing Readiness");
    const result7 = await handle({ plan: { groups: [] }, validation: {}, policy: {} });
    assert.strictEqual(result7.ok, false);
    assert.strictEqual(result7.error.code, "MISSING_READINESS_REPORT");
    console.log("PASS");

    // Test 8: Null Schedule and Tracking
    console.log("Test 8: Null Schedule and Tracking");
    const input8 = createTestInput(true);
    input8.plan.groups[0].units[0].schedule = null;
    input8.plan.groups[0].units[0].tracking = null;

    const result8 = await handle(input8);
    assert.strictEqual(result8.ok, true);
    const unit8 = result8.payload.venues[0].payload.groups[0].units[0];
    assert.strictEqual(unit8.schedule.start_date, null);
    assert.strictEqual(unit8.schedule.end_date, null);
    assert.strictEqual(unit8.tracking.utm_source, null);
    console.log("PASS");

    // Test 9: Input Immutability
    console.log("Test 9: Input Immutability");
    const input9 = createTestInput(true);
    const snapshot9 = JSON.parse(JSON.stringify(input9));

    await handle(input9);
    assert.deepStrictEqual(input9, snapshot9);
    console.log("PASS");

    // Test 10: Deterministic Ordering
    console.log("Test 10: Deterministic Ordering");
    const input10 = {
        plan: {
            brand_id: "brand_123",
            currency: "USD",
            groups: [
                {
                    group_index: 1,
                    group_id: "g2",
                    venue_key: "youtube",
                    units: [{ unit_id: "u3", budget: { allocated: 50 }, index: { group: 0 } }]
                },
                {
                    group_index: 0,
                    group_id: "g1",
                    venue_key: "meta",
                    units: [{ unit_id: "u1", budget: { allocated: 100 }, index: { group: 0 } }]
                },
                {
                    group_index: 2,
                    group_id: "g3",
                    venue_key: "meta",
                    units: [{ unit_id: "u2", budget: { allocated: 75 }, index: { group: 0 } }]
                }
            ]
        },
        validation: { is_valid: true, errors: [] },
        policy: { summary: { is_policy_clean: true }, issues: [] },
        readiness: { is_launchable: true, worst_level: "NONE", blocks: [], warnings: [] }
    };

    const result10 = await handle(input10);
    assert.strictEqual(result10.ok, true);

    // Verify venues are sorted by venue_key
    assert.strictEqual(result10.payload.venues[0].venue_key, "meta");
    assert.strictEqual(result10.payload.venues[1].venue_key, "youtube");

    // Verify groups within meta are sorted by group_index
    const metaGroups = result10.payload.venues[0].payload.groups;
    assert.strictEqual(metaGroups[0].group_index, 0);
    assert.strictEqual(metaGroups[1].group_index, 2);
    console.log("PASS");

    // Test 11: Global can_submit false must not yield READY venue status
    console.log("Test 11: Global false, venue status not READY");
    const input11 = createTestInput(true);
    // Simulate a global readiness block with no venue_key
    input11.readiness.is_launchable = false;
    input11.readiness.worst_level = "ERROR";
    input11.readiness.blocks = [
        { code: "GLOBAL_BLOCK", message: "Global block", venue_key: null, fix: null }
    ];

    const result11 = await handle(input11);
    assert.strictEqual(result11.ok, true);
    assert.strictEqual(result11.payload.can_submit, false);
    assert.strictEqual(result11.payload.global_status, "BLOCKED");

    const venue11 = result11.payload.venues[0];
    assert.strictEqual(venue11.can_submit, false);
    // After the patch, status should not be READY when global is BLOCKED
    assert.notStrictEqual(venue11.status, "READY");
    console.log("PASS");

    console.log("All Phase 18 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
