/**
 * Tests for Execution Split Engine (Phase 13)
 */

const { execute } = require("../modules/execution_split_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Execution Split Engine Tests...");

    // Test 1: 1x1 Happy Path
    console.log("Test 1: 1x1 Happy Path");
    const payload1 = {
        brand_id: "brand_123",
        campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
        currency: "USD",
        total_budget: 1000,
        venues: [{
            venue_key: "meta",
            execution_units: [{
                unit_id: "brand_123__meta__unit_0",
                name: "META_LEAD_GEN_PRIMARY_UNIT_0",
                unit_kind: "GROUP",
                venue_key: "meta",
                audience_ref: "aud_1",
                creative_refs: ["cr_1"],
                budget: { type: "LIFETIME", amount: 1000 },
                schedule: { start_date: "2023-01-01", end_date: "2023-01-31" },
                tracking: {}
            }]
        }]
    };

    const result1 = await execute(payload1);
    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.payload.unit_kind, "UNIT");
    assert.strictEqual(result1.payload.source_group_kind, "GROUP");
    assert.strictEqual(result1.payload.summary.total_groups, 1);
    assert.strictEqual(result1.payload.summary.total_units, 1);
    assert.strictEqual(result1.payload.summary.max_units_per_group, 12);

    const group = result1.payload.groups[0];
    assert.strictEqual(group.split_strategy, "SINGLE_UNIT");
    assert.strictEqual(group.units.length, 1);

    const unit = group.units[0];
    assert.strictEqual(unit.budget.allocated, 1000);
    assert.strictEqual(unit.budget.share, 1);
    assert.strictEqual(unit.audience_ref, "aud_1");
    assert.strictEqual(unit.creative_ref, "cr_1");
    console.log("PASS");

    // Test 2: 1 Audience x Multiple Creatives
    console.log("Test 2: 1 Audience x 3 Creatives");
    const payload2 = {
        brand_id: "brand_123",
        campaign_goal: { type: "AWARENESS", primary_kpi: "CPM" },
        currency: "USD",
        total_budget: 300,
        venues: [{
            venue_key: "tiktok",
            execution_units: [{
                unit_id: "brand_123__tiktok__unit_0",
                name: "TIKTOK_AWARENESS",
                unit_kind: "GROUP",
                venue_key: "tiktok",
                audience_ref: "aud_1",
                creative_refs: ["cr_1", "cr_2", "cr_3"],
                budget: { amount: 300 },
                schedule: { start_date: null, end_date: null },
                tracking: {}
            }]
        }]
    };

    const result2 = await execute(payload2);
    assert.strictEqual(result2.ok, true);
    assert.strictEqual(result2.payload.summary.total_units, 3);

    const group2 = result2.payload.groups[0];
    assert.strictEqual(group2.split_strategy, "EVEN_CROSS_PRODUCT");
    assert.strictEqual(group2.units.length, 3);

    // Verify budget allocation (300 / 3 = 100 each)
    assert.strictEqual(group2.units[0].budget.allocated, 100);
    assert.strictEqual(group2.units[1].budget.allocated, 100);
    assert.strictEqual(group2.units[2].budget.allocated, 100);
    console.log("PASS");

    // Test 3: Multiple Audiences x 1 Creative
    console.log("Test 3: 2 Audiences x 1 Creative");
    const payload3 = {
        brand_id: "brand_456",
        campaign_goal: { type: "SALES", primary_kpi: "ROAS" },
        currency: "EUR",
        total_budget: 200,
        venues: [{
            venue_key: "meta",
            execution_units: [{
                unit_id: "brand_456__meta__unit_0",
                name: "META_SALES",
                unit_kind: "GROUP",
                venue_key: "meta",
                audience_ref: "aud_1", // Phase 12 only has single audience_ref
                creative_refs: ["cr_1", "cr_2"],
                budget: { amount: 200 },
                schedule: {},
                tracking: {}
            }]
        }]
    };

    const result3 = await execute(payload3);
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.summary.total_units, 2);
    console.log("PASS");

    // Test 4: Cardinality Limit Enforcement
    console.log("Test 4: Cardinality Limit (5 creatives, should stay at 5)");
    const payload4 = {
        brand_id: "brand_789",
        campaign_goal: {},
        currency: "USD",
        total_budget: 1200,
        venues: [{
            venue_key: "youtube",
            execution_units: [{
                unit_id: "brand_789__youtube__unit_0",
                name: "YOUTUBE_TEST",
                unit_kind: "GROUP",
                venue_key: "youtube",
                audience_ref: "aud_1",
                creative_refs: ["cr_1", "cr_2", "cr_3", "cr_4", "cr_5"],
                budget: { amount: 1200 },
                schedule: {},
                tracking: {}
            }]
        }]
    };

    const result4 = await execute(payload4);
    assert.strictEqual(result4.ok, true);
    assert.strictEqual(result4.payload.summary.total_units, 5);

    // Budget: 1200 / 5 = 240 each
    const units4 = result4.payload.groups[0].units;
    units4.forEach(u => {
        assert.strictEqual(u.budget.allocated, 240);
    });
    console.log("PASS");

    // Test 5: Zero Budget Handling
    console.log("Test 5: Zero Budget");
    const payload5 = {
        brand_id: "brand_zero",
        currency: "USD",
        total_budget: 0,
        venues: [{
            venue_key: "reddit",
            execution_units: [{
                unit_id: "brand_zero__reddit__unit_0",
                name: "REDDIT_ZERO",
                unit_kind: "GROUP",
                venue_key: "reddit",
                audience_ref: "aud_1",
                creative_refs: ["cr_1", "cr_2"],
                budget: { amount: 0 },
                schedule: {},
                tracking: {}
            }]
        }]
    };

    const result5 = await execute(payload5);
    assert.strictEqual(result5.ok, true);
    const group5 = result5.payload.groups[0];
    assert.strictEqual(group5.split_strategy, "NO_BUDGET");
    group5.units.forEach(u => {
        assert.strictEqual(u.budget.allocated, 0);
        assert.strictEqual(u.budget.share, 0);
    });
    console.log("PASS");

    // Test 6: Missing Audience
    console.log("Test 6: Missing Audience");
    const payload6 = {
        brand_id: "brand_test",
        currency: "USD",
        venues: [{
            venue_key: "meta",
            execution_units: [{
                unit_id: "test_id",
                name: "TEST",
                unit_kind: "GROUP",
                venue_key: "meta",
                audience_ref: null,
                creative_refs: ["cr_1", "cr_2"],
                budget: { amount: 100 },
                schedule: {},
                tracking: {}
            }]
        }]
    };

    const result6 = await execute(payload6);
    assert.strictEqual(result6.ok, true);
    assert.strictEqual(result6.payload.summary.total_units, 2);
    result6.payload.groups[0].units.forEach(u => {
        assert.strictEqual(u.audience_ref, null);
    });
    console.log("PASS");

    // Test 7: Missing Creatives
    console.log("Test 7: Missing Creatives");
    const payload7 = {
        brand_id: "brand_test",
        currency: "USD",
        venues: [{
            venue_key: "meta",
            execution_units: [{
                unit_id: "test_id_7",
                name: "TEST_7",
                unit_kind: "GROUP",
                venue_key: "meta",
                audience_ref: "aud_1",
                creative_refs: [],
                budget: { amount: 100 },
                schedule: {},
                tracking: {}
            }]
        }]
    };

    const result7 = await execute(payload7);
    assert.strictEqual(result7.ok, true);
    assert.strictEqual(result7.payload.summary.total_units, 1);
    assert.strictEqual(result7.payload.groups[0].units[0].creative_ref, null);
    console.log("PASS");

    // Test 8: Both Missing (Fallback)
    console.log("Test 8: Both Missing (Fallback)");
    const payload8 = {
        brand_id: "brand_test",
        currency: "USD",
        venues: [{
            venue_key: "meta",
            execution_units: [{
                unit_id: "test_id_8",
                name: "TEST_8",
                unit_kind: "GROUP",
                venue_key: "meta",
                audience_ref: null,
                creative_refs: [],
                budget: { amount: 50 },
                schedule: {},
                tracking: {}
            }]
        }]
    };

    const result8 = await execute(payload8);
    assert.strictEqual(result8.ok, true);
    assert.strictEqual(result8.payload.summary.total_units, 1);
    const unit8 = result8.payload.groups[0].units[0];
    assert.strictEqual(unit8.audience_ref, null);
    assert.strictEqual(unit8.creative_ref, null);
    assert.strictEqual(unit8.budget.allocated, 50);
    console.log("PASS");

    // Test 9: Input Immutability
    console.log("Test 9: Input Immutability");
    const payload9 = JSON.parse(JSON.stringify(payload1));
    const snapshot9 = JSON.parse(JSON.stringify(payload9));
    await execute(payload9);
    assert.deepStrictEqual(payload9, snapshot9);
    console.log("PASS");

    // Test 10: Error Handling - Missing Payload
    console.log("Test 10: Error Handling - Missing Payload");
    const result10 = await execute(null);
    assert.strictEqual(result10.ok, false);
    assert.strictEqual(result10.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 11: Envelope and Meta
    console.log("Test 11: Envelope and Meta");
    const result11 = await execute(payload1);
    assert.strictEqual(result11.module, "execution_split_engine");
    assert.ok(result11.timestamp);
    assert.strictEqual(result11.meta.source_phase, "PHASE_13");
    assert.strictEqual(result11.meta.version, "v0.1");
    console.log("PASS");

    console.log("All Phase 13 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
