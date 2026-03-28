/**
 * Tests for Execution Policy Engine (Phase 16)
 */

const { run_execution_policy_guard } = require("../modules/execution_policy_engine");
const assert = require("assert");

// Helper to create a minimal valid plan
function createTestPlan(totalBudget, venues) {
    const groups = [];
    let globalIndex = 0;

    for (const [venueKey, venueConfig] of Object.entries(venues)) {
        const units = [];
        for (let i = 0; i < venueConfig.unitCount; i++) {
            units.push({
                unit_id: `u_${venueKey}_${i}`,
                venue_key: venueKey,
                budget: { allocated: venueConfig.budgetPerUnit },
                index: { global: globalIndex++, group: i, venue: i }
            });
        }

        groups.push({
            group_index: groups.length,
            venue_key: venueKey,
            units: units
        });
    }

    // Calculate stats
    const byVenue = {};
    let totalUnits = 0;
    for (const [venueKey, venueConfig] of Object.entries(venues)) {
        byVenue[venueKey] = {
            groups: 1,
            units: venueConfig.unitCount,
            budget: venueConfig.unitCount * venueConfig.budgetPerUnit
        };
        totalUnits += venueConfig.unitCount;
    }

    return {
        brand_id: "test_brand",
        currency: "USD",
        total_budget: totalBudget,
        groups: groups,
        stats: {
            group_count: groups.length,
            unit_count: totalUnits,
            total_budget: totalBudget,
            by_venue: byVenue
        }
    };
}

async function runTests() {
    console.log("Running Execution Policy Engine Tests...");

    // Test 1: Happy Path - No Policy Violations
    console.log("Test 1: Happy Path - No Policy Violations");
    const plan1 = createTestPlan(300, {
        YOUTUBE: { unitCount: 2, budgetPerUnit: 100 },
        TIKTOK: { unitCount: 1, budgetPerUnit: 100 }
    });

    const result1 = await run_execution_policy_guard({ plan: plan1 });
    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.payload.policy.summary.is_policy_clean, true);
    assert.strictEqual(result1.payload.policy.summary.error_count, 0);
    assert.strictEqual(result1.payload.policy.summary.warning_count, 0);
    assert.strictEqual(result1.payload.policy.issues.length, 0);
    console.log("PASS");

    // Test 2: Campaign Budget Over Global Cap
    console.log("Test 2: Campaign Budget Over Global Cap");
    const plan2 = createTestPlan(500, {
        YOUTUBE: { unitCount: 2, budgetPerUnit: 250 }
    });

    const result2 = await run_execution_policy_guard({
        plan: plan2,
        policy_config: { max_campaign_budget: 400 }
    });

    assert.strictEqual(result2.ok, true);
    assert.strictEqual(result2.payload.policy.summary.is_policy_clean, false);
    assert.strictEqual(result2.payload.policy.summary.error_count, 1);
    const issue2 = result2.payload.policy.issues[0];
    assert.strictEqual(issue2.code, "CAMPAIGN_BUDGET_EXCEEDS_MAX");
    assert.strictEqual(issue2.level, "ERROR");
    assert.strictEqual(issue2.path, "/");
    console.log("PASS");

    // Test 3: Venue Below Minimum Budget
    console.log("Test 3: Venue Below Minimum Budget");
    const plan3 = createTestPlan(150, {
        YOUTUBE: { unitCount: 1, budgetPerUnit: 100 },
        TIKTOK: { unitCount: 1, budgetPerUnit: 50 }
    });

    const result3 = await run_execution_policy_guard({
        plan: plan3,
        policy_config: { min_budget_per_venue: 75 }
    });

    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.policy.summary.warning_count, 1);
    const issue3 = result3.payload.policy.issues[0];
    assert.strictEqual(issue3.code, "VENUE_BUDGET_BELOW_MIN");
    assert.strictEqual(issue3.level, "WARNING");
    assert.strictEqual(issue3.details.venue_key, "TIKTOK");
    console.log("PASS");

    // Test 4: Units Exceed Maximum Per Venue
    console.log("Test 4: Units Exceed Maximum Per Venue");
    const plan4 = createTestPlan(500, {
        YOUTUBE: { unitCount: 10, budgetPerUnit: 50 }
    });

    const result4 = await run_execution_policy_guard({
        plan: plan4,
        policy_config: { max_units_per_venue: 5 }
    });

    assert.strictEqual(result4.ok, true);
    assert.strictEqual(result4.payload.policy.summary.is_policy_clean, false);
    assert.strictEqual(result4.payload.policy.summary.error_count, 1);
    const issue4 = result4.payload.policy.issues[0];
    assert.strictEqual(issue4.code, "VENUE_UNITS_EXCEED_MAX");
    assert.strictEqual(issue4.level, "ERROR");
    assert.strictEqual(issue4.details.unit_count, 10);
    assert.strictEqual(issue4.details.max_units_per_venue, 5);
    console.log("PASS");

    // Test 5: Forbidden Venue Rejection
    console.log("Test 5: Forbidden Venue Rejection");
    const plan5 = createTestPlan(200, {
        YOUTUBE: { unitCount: 1, budgetPerUnit: 100 },
        TIKTOK: { unitCount: 1, budgetPerUnit: 100 }
    });

    const result5 = await run_execution_policy_guard({
        plan: plan5,
        policy_config: { forbidden_venues: ["YOUTUBE"] }
    });

    assert.strictEqual(result5.ok, true);
    assert.strictEqual(result5.payload.policy.summary.is_policy_clean, false);
    assert.strictEqual(result5.payload.policy.summary.error_count, 1);
    const issue5 = result5.payload.policy.issues[0];
    assert.strictEqual(issue5.code, "VENUE_FORBIDDEN");
    assert.strictEqual(issue5.level, "ERROR");
    assert.strictEqual(issue5.details.venue_key, "YOUTUBE");
    console.log("PASS");

    // Test 6: Issue Ordering is Deterministic
    console.log("Test 6: Issue Ordering is Deterministic");
    const plan6 = createTestPlan(600, {
        YOUTUBE: { unitCount: 1, budgetPerUnit: 50 },
        TIKTOK: { unitCount: 1, budgetPerUnit: 50 }
    });

    const result6 = await run_execution_policy_guard({
        plan: plan6,
        policy_config: {
            max_campaign_budget: 500,
            min_budget_per_venue: 75,
            forbidden_venues: ["YOUTUBE"]
        }
    });

    assert.strictEqual(result6.ok, true);
    const issues = result6.payload.policy.issues;

    // Verify ERROR issues come before WARNING
    let lastErrorIdx = -1;
    let firstWarningIdx = issues.length;

    issues.forEach((issue, idx) => {
        if (issue.level === "ERROR") lastErrorIdx = idx;
        if (issue.level === "WARNING" && firstWarningIdx === issues.length) firstWarningIdx = idx;
    });

    if (lastErrorIdx >= 0 && firstWarningIdx < issues.length) {
        assert.ok(lastErrorIdx < firstWarningIdx, "ERROR issues must come before WARNING");
    }

    // Verify we have expected issues
    assert.ok(issues.some(i => i.code === "CAMPAIGN_BUDGET_EXCEEDS_MAX"));
    assert.ok(issues.some(i => i.code === "VENUE_FORBIDDEN"));
    assert.ok(issues.some(i => i.code === "VENUE_BUDGET_BELOW_MIN"));
    console.log("PASS");

    // Test 7: Envelope Structure
    console.log("Test 7: Envelope Structure");
    const plan7 = createTestPlan(100, {
        YOUTUBE: { unitCount: 1, budgetPerUnit: 100 }
    });

    const result7 = await run_execution_policy_guard({ plan: plan7 });
    assert.strictEqual(result7.ok, true);
    assert.strictEqual(result7.module, "execution_policy_engine");
    assert.ok(result7.timestamp);
    assert.ok(result7.payload.plan);
    assert.ok(result7.payload.policy);
    assert.ok(result7.payload.policy.summary);
    assert.deepStrictEqual(result7.payload.plan, plan7);
    console.log("PASS");

    // Test 8: Invalid Input - Null
    console.log("Test 8: Invalid Input - Null");
    const result8 = await run_execution_policy_guard(null);
    assert.strictEqual(result8.ok, false);
    assert.strictEqual(result8.payload, null);
    assert.strictEqual(result8.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 9: Missing Stats Handling
    console.log("Test 9: Missing Stats Handling");
    const result9 = await run_execution_policy_guard({ plan: { brand_id: "test" } });
    assert.strictEqual(result9.ok, false);
    assert.strictEqual(result9.error.code, "STATS_MISSING");
    console.log("PASS");

    // Test 10: Input Immutability
    console.log("Test 10: Input Immutability");
    const plan10 = createTestPlan(200, {
        YOUTUBE: { unitCount: 2, budgetPerUnit: 100 }
    });
    const input10 = {
        plan: plan10,
        policy_config: { max_campaign_budget: 300 }
    };
    const snapshot10 = JSON.parse(JSON.stringify(input10));

    await run_execution_policy_guard(input10);
    assert.deepStrictEqual(input10, snapshot10);
    console.log("PASS");

    console.log("All Phase 16 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
