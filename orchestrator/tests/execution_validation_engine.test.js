/**
 * Tests for Execution Validation Engine (Phase 15)
 */

const { run } = require("../modules/execution_validation_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Execution Validation Engine Tests...");

    // Test 1: Happy Path - Valid Plan
    console.log("Test 1: Happy Path - Valid Plan");
    const validPlan = {
        brand_id: "brand_123",
        currency: "USD",
        total_budget: 300,
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: [
                    {
                        unit_id: "u1",
                        venue_key: "meta",
                        budget: { allocated: 100 },
                        index: { global: 0, group: 0, venue: 0 }
                    },
                    {
                        unit_id: "u2",
                        venue_key: "meta",
                        budget: { allocated: 100 },
                        index: { global: 1, group: 1, venue: 1 }
                    }
                ]
            },
            {
                group_index: 1,
                venue_key: "youtube",
                units: [
                    {
                        unit_id: "u3",
                        venue_key: "youtube",
                        budget: { allocated: 100 },
                        index: { global: 2, group: 0, venue: 0 }
                    }
                ]
            }
        ],
        stats: {
            group_count: 2,
            unit_count: 3,
            total_budget: 300,
            by_venue: {
                meta: { groups: 1, units: 2, budget: 200 },
                youtube: { groups: 1, units: 1, budget: 100 }
            }
        }
    };

    const result1 = await run({ plan: validPlan });
    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.payload.validation.is_valid, true);
    assert.strictEqual(result1.payload.validation.errors.length, 0);
    console.log("PASS");

    // Test 2: Budget Mismatch
    console.log("Test 2: Budget Mismatch");
    const budgetMismatchPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 500, // Actual is 300
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: [
                    {
                        budget: { allocated: 100 },
                        index: { global: 0, group: 0, venue: 0 },
                        venue_key: "meta"
                    },
                    {
                        budget: { allocated: 200 },
                        index: { global: 1, group: 1, venue: 1 },
                        venue_key: "meta"
                    }
                ]
            }
        ],
        stats: {
            group_count: 1,
            unit_count: 2,
            total_budget: 300
        }
    };

    const result2 = await run({ plan: budgetMismatchPlan });
    assert.strictEqual(result2.ok, true);
    assert.strictEqual(result2.payload.validation.is_valid, false);
    const budgetError = result2.payload.validation.errors.find(e => e.code === "BUDGET_MISMATCH");
    assert.ok(budgetError);
    console.log("PASS");

    // Test 3: Index Gaps
    console.log("Test 3: Index Gaps");
    const indexGapPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 200,
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: [
                    {
                        budget: { allocated: 100 },
                        index: { global: 0, group: 0, venue: 0 },
                        venue_key: "meta"
                    },
                    {
                        budget: { allocated: 100 },
                        index: { global: 2, group: 1, venue: 1 }, // Gap: missing global 1
                        venue_key: "meta"
                    }
                ]
            }
        ],
        stats: {
            group_count: 1,
            unit_count: 2,
            total_budget: 200
        }
    };

    const result3 = await run({ plan: indexGapPlan });
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.validation.is_valid, false);
    const gapError = result3.payload.validation.errors.find(e => e.code === "INDEX_GAP");
    assert.ok(gapError);
    console.log("PASS");

    // Test 4: Duplicate Indexes
    console.log("Test 4: Duplicate Indexes");
    const duplicateIndexPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 200,
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: [
                    {
                        budget: { allocated: 100 },
                        index: { global: 0, group: 0, venue: 0 },
                        venue_key: "meta"
                    },
                    {
                        budget: { allocated: 100 },
                        index: { global: 0, group: 1, venue: 1 }, // Duplicate global 0
                        venue_key: "meta"
                    }
                ]
            }
        ],
        stats: {
            group_count: 1,
            unit_count: 2,
            total_budget: 200
        }
    };

    const result4 = await run({ plan: duplicateIndexPlan });
    assert.strictEqual(result4.ok, true);
    assert.strictEqual(result4.payload.validation.is_valid, false);
    const dupError = result4.payload.validation.errors.find(e => e.code === "INDEX_DUPLICATE");
    assert.ok(dupError);
    console.log("PASS");

    // Test 5: Negative Budget
    console.log("Test 5: Negative Budget");
    const negativeBudgetPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 50,
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: [
                    {
                        budget: { allocated: -50 },
                        index: { global: 0, group: 0, venue: 0 },
                        venue_key: "meta"
                    }
                ]
            }
        ],
        stats: {
            group_count: 1,
            unit_count: 1,
            total_budget: -50
        }
    };

    const result5 = await run({ plan: negativeBudgetPlan });
    assert.strictEqual(result5.ok, true);
    assert.strictEqual(result5.payload.validation.is_valid, false);
    const negError = result5.payload.validation.errors.find(e => e.code === "NEGATIVE_BUDGET");
    assert.ok(negError);
    console.log("PASS");

    // Test 6: Non-numeric Budget
    console.log("Test 6: Non-numeric Budget");
    const nonNumericBudgetPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 100,
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: [
                    {
                        budget: { allocated: "not a number" },
                        index: { global: 0, group: 0, venue: 0 },
                        venue_key: "meta"
                    }
                ]
            }
        ],
        stats: {
            group_count: 1,
            unit_count: 1,
            total_budget: 100
        }
    };

    const result6 = await run({ plan: nonNumericBudgetPlan });
    assert.strictEqual(result6.ok, true);
    assert.strictEqual(result6.payload.validation.is_valid, false);
    const typeError = result6.payload.validation.errors.find(e => e.code === "INVALID_TYPE");
    assert.ok(typeError);
    console.log("PASS");

    // Test 7: Empty Groups
    console.log("Test 7: Empty Groups");
    const emptyGroupsPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 0,
        groups: [],
        stats: {
            group_count: 0,
            unit_count: 0,
            total_budget: 0
        }
    };

    const result7 = await run({ plan: emptyGroupsPlan });
    assert.strictEqual(result7.ok, true);
    assert.strictEqual(result7.payload.validation.is_valid, true);
    assert.strictEqual(result7.payload.validation.errors.length, 0);
    console.log("PASS");

    // Test 8: Empty Group Units (Warning)
    console.log("Test 8: Empty Group Units (Warning)");
    const emptyUnitsPlan = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 0,
        groups: [
            {
                group_index: 0,
                venue_key: "meta",
                units: []
            }
        ],
        stats: {
            group_count: 1,
            unit_count: 0,
            total_budget: 0
        }
    };

    const result8 = await run({ plan: emptyUnitsPlan });
    assert.strictEqual(result8.ok, true);
    assert.strictEqual(result8.payload.validation.is_valid, true); // Valid but has warning
    const emptyWarning = result8.payload.validation.warnings.find(w => w.code === "EMPTY_GROUP");
    assert.ok(emptyWarning);
    console.log("PASS");

    // Test 9: Invalid Input - Null
    console.log("Test 9: Invalid Input - Null");
    const result9 = await run(null);
    assert.strictEqual(result9.ok, false);
    assert.strictEqual(result9.payload, null);
    assert.strictEqual(result9.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 10: Input Immutability
    console.log("Test 10: Input Immutability");
    const plan10 = JSON.parse(JSON.stringify(validPlan));
    const snapshot10 = JSON.parse(JSON.stringify(plan10));
    await run({ plan: plan10 });
    assert.deepStrictEqual(plan10, snapshot10);
    console.log("PASS");

    console.log("All Phase 15 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
