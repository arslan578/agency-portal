/**
 * Tests for Execution Index Engine (Phase 14)
 */

const { buildExecutionIndexedPlan } = require("../modules/execution_index_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Execution Index Engine Tests...");

    // Test 1: Single Group Happy Path
    console.log("Test 1: Single Group Happy Path");
    const payload1 = {
        brand_id: "brand_123",
        campaign_goal: { type: "LEAD_GEN" },
        currency: "USD",
        total_budget: 200,
        groups: [{
            group_id: "g1",
            venue_key: "meta",
            units: [
                {
                    unit_id: "u1",
                    venue_key: "meta",
                    audience_ref: "aud_1",
                    creative_ref: "cr_1",
                    budget: { allocated: 100, currency: "USD" },
                    schedule: {}
                },
                {
                    unit_id: "u2",
                    venue_key: "meta",
                    audience_ref: "aud_2",
                    creative_ref: "cr_2",
                    budget: { allocated: 100, currency: "USD" },
                    schedule: {}
                }
            ]
        }]
    };

    const result1 = await buildExecutionIndexedPlan(payload1);
    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.module, "execution_index_engine");

    const group1 = result1.payload.groups[0];
    assert.strictEqual(group1.group_index, 0);
    assert.strictEqual(group1.units.length, 2);

    const unit0 = group1.units[0];
    assert.strictEqual(unit0.index.global, 0);
    assert.strictEqual(unit0.index.group, 0);
    assert.strictEqual(unit0.index.venue, 0);
    assert.strictEqual(unit0.group_index, 0);
    assert.strictEqual(unit0.venue_index, 0);

    const unit1 = group1.units[1];
    assert.strictEqual(unit1.index.global, 1);
    assert.strictEqual(unit1.index.group, 1);
    assert.strictEqual(unit1.index.venue, 1);

    const stats1 = result1.payload.stats;
    assert.strictEqual(stats1.group_count, 1);
    assert.strictEqual(stats1.unit_count, 2);
    assert.strictEqual(stats1.total_budget, 200);
    assert.strictEqual(stats1.by_venue.meta.groups, 1);
    assert.strictEqual(stats1.by_venue.meta.units, 2);
    assert.strictEqual(stats1.by_venue.meta.budget, 200);
    console.log("PASS");

    // Test 2: Multiple Groups and Venues
    console.log("Test 2: Multiple Groups and Venues");
    const payload2 = {
        brand_id: "brand_456",
        campaign_goal: {},
        currency: "EUR",
        total_budget: 600,
        groups: [
            {
                group_id: "g1",
                venue_key: "meta",
                units: [
                    { unit_id: "u1", venue_key: "meta", budget: { allocated: 100 }, schedule: {} },
                    { unit_id: "u2", venue_key: "meta", budget: { allocated: 100 }, schedule: {} }
                ]
            },
            {
                group_id: "g2",
                venue_key: "youtube",
                units: [
                    { unit_id: "u3", venue_key: "youtube", budget: { allocated: 150 }, schedule: {} }
                ]
            },
            {
                group_id: "g3",
                venue_key: "meta",
                units: [
                    { unit_id: "u4", venue_key: "meta", budget: { allocated: 250 }, schedule: {} }
                ]
            }
        ]
    };

    const result2 = await buildExecutionIndexedPlan(payload2);
    assert.strictEqual(result2.ok, true);

    // Verify group indexes
    assert.strictEqual(result2.payload.groups[0].group_index, 0);
    assert.strictEqual(result2.payload.groups[1].group_index, 1);
    assert.strictEqual(result2.payload.groups[2].group_index, 2);

    // Verify global indexes are sequential
    assert.strictEqual(result2.payload.groups[0].units[0].index.global, 0);
    assert.strictEqual(result2.payload.groups[0].units[1].index.global, 1);
    assert.strictEqual(result2.payload.groups[1].units[0].index.global, 2);
    assert.strictEqual(result2.payload.groups[2].units[0].index.global, 3);

    // Verify venue indexes (meta appears in group 0 and 2)
    assert.strictEqual(result2.payload.groups[0].units[0].index.venue, 0);
    assert.strictEqual(result2.payload.groups[0].units[1].index.venue, 1);
    assert.strictEqual(result2.payload.groups[2].units[0].index.venue, 2); // continues from 0,1

    // Verify youtube venue index
    assert.strictEqual(result2.payload.groups[1].units[0].index.venue, 0);

    // Verify stats
    const stats2 = result2.payload.stats;
    assert.strictEqual(stats2.group_count, 3);
    assert.strictEqual(stats2.unit_count, 4);
    assert.strictEqual(stats2.total_budget, 600);
    assert.strictEqual(stats2.by_venue.meta.groups, 2);
    assert.strictEqual(stats2.by_venue.meta.units, 3);
    assert.strictEqual(stats2.by_venue.meta.budget, 450);
    assert.strictEqual(stats2.by_venue.youtube.groups, 1);
    assert.strictEqual(stats2.by_venue.youtube.units, 1);
    assert.strictEqual(stats2.by_venue.youtube.budget, 150);
    console.log("PASS");

    // Test 3: Empty Groups
    console.log("Test 3: Empty Groups");
    const payload3 = {
        brand_id: "brand_empty",
        campaign_goal: {},
        currency: "USD",
        total_budget: 0,
        groups: []
    };

    const result3 = await buildExecutionIndexedPlan(payload3);
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.stats.group_count, 0);
    assert.strictEqual(result3.payload.stats.unit_count, 0);
    assert.strictEqual(result3.payload.stats.total_budget, 0);
    assert.deepStrictEqual(result3.payload.stats.by_venue, {});
    console.log("PASS");

    // Test 4: Group with Empty Units
    console.log("Test 4: Group with Empty Units");
    const payload4 = {
        brand_id: "brand_test",
        currency: "USD",
        total_budget: 0,
        groups: [
            { group_id: "g1", venue_key: "meta", units: [] },
            { group_id: "g2", venue_key: "youtube", units: [] }
        ]
    };

    const result4 = await buildExecutionIndexedPlan(payload4);
    assert.strictEqual(result4.ok, true);
    assert.strictEqual(result4.payload.stats.group_count, 2);
    assert.strictEqual(result4.payload.stats.unit_count, 0);
    assert.strictEqual(result4.payload.stats.total_budget, 0);
    console.log("PASS");

    // Test 5: Invalid Payload Type
    console.log("Test 5: Invalid Payload Type");
    const result5 = await buildExecutionIndexedPlan(null);
    assert.strictEqual(result5.ok, false);
    assert.strictEqual(result5.payload, null);
    assert.strictEqual(result5.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 6: Missing Groups
    console.log("Test 6: Missing Groups");
    const payload6 = {
        brand_id: "brand_test",
        currency: "USD"
    };

    const result6 = await buildExecutionIndexedPlan(payload6);
    assert.strictEqual(result6.ok, false);
    assert.strictEqual(result6.error.code, "INVALID_INPUT");
    assert.ok(result6.error.message.includes("groups"));
    console.log("PASS");

    // Test 7: Input Immutability
    console.log("Test 7: Input Immutability");
    const payload7 = JSON.parse(JSON.stringify(payload1));
    const snapshot7 = JSON.parse(JSON.stringify(payload7));
    await buildExecutionIndexedPlan(payload7);
    assert.deepStrictEqual(payload7, snapshot7);
    console.log("PASS");

    // Test 8: Determinism
    console.log("Test 8: Determinism");
    const result8a = await buildExecutionIndexedPlan(payload1);
    const result8b = await buildExecutionIndexedPlan(payload1);

    // Remove timestamps for comparison
    delete result8a.timestamp;
    delete result8b.timestamp;

    assert.deepStrictEqual(result8a.payload, result8b.payload);
    console.log("PASS");

    console.log("All Phase 14 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
