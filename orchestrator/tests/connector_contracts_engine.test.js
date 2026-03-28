/**
 * Tests for Connector Contracts Engine (Phase 19)
 */

const { run } = require("../modules/connector_contracts_engine");
const assert = require("assert");

// Helper to create minimal valid input
function createTestInput() {
    return {
        submission_id: "sub_123",
        brand_id: "brand_456",
        goal: {
            type: "LEADS",
            primary_kpi: "CONVERSIONS",
            secondary_kpi: null
        },
        currency: "USD",
        total_budget: 5000,
        readiness: {
            global_status: "READY",
            can_launch: true
        },
        venues: [
            {
                venue_key: "meta",
                role: "PRIMARY",
                objective: "LEADS",
                status: "READY",
                can_submit: true,
                budget: { allocated: 3000 },
                schedule: {
                    start_date: "2024-01-01",
                    end_date: "2024-01-31",
                    timezone: "America/Los_Angeles"
                },
                units: [
                    {
                        unit_id: "u1",
                        unit_index: 0,
                        audience_ref: "aud_1",
                        creative_ref: "cr_1",
                        bid: 5.0,
                        schedule: {
                            start_date: "2024-01-01",
                            end_date: "2024-01-31",
                            timezone: "America/Los_Angeles"
                        }
                    }
                ]
            }
        ]
    };
}

async function runTests() {
    console.log("Running Connector Contracts Engine Tests...");

    // Test 1: Happy Path - Multi-venue Bundle
    console.log("Test 1: Happy Path - Multi-venue Bundle");
    const input1 = createTestInput();
    input1.venues.push({
        venue_key: "tiktok",
        role: "SUPPORTING",
        objective: "AWARENESS",
        status: "READY",
        can_submit: true,
        budget: { allocated: 2000 },
        schedule: { start_date: "2024-01-01", end_date: "2024-01-31", timezone: null },
        units: [
            {
                unit_id: "u2",
                unit_index: 0,
                audience_ref: "aud_2",
                creative_ref: "cr_2",
                bid: null,
                schedule: { start_date: null, end_date: null, timezone: null }
            }
        ]
    });

    const result1 = await run(input1);
    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.module, "connector_contracts_engine");
    assert.strictEqual(result1.payload.connector_contracts.is_connector_ready, true);
    assert.strictEqual(result1.payload.connector_contracts.summary.venue_count, 2);
    assert.strictEqual(result1.payload.connector_contracts.venues[0].connector_key, "META_ADS");
    assert.strictEqual(result1.payload.connector_contracts.venues[1].connector_key, "TIKTOK_ADS");
    console.log("PASS");

    // Test 2: Missing Required Top-level Fields
    console.log("Test 2: Missing Required Top-level Fields");
    const result2a = await run(null);
    assert.strictEqual(result2a.ok, false);
    assert.strictEqual(result2a.error.code, "INVALID_INPUT");

    const result2b = await run({ brand_id: "test" });
    assert.strictEqual(result2b.ok, false);
    assert.strictEqual(result2b.error.code, "INVALID_INPUT");

    const result2c = await run({ submission_id: "test" });
    assert.strictEqual(result2c.ok, false);
    assert.strictEqual(result2c.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 3: Venue with Negative Budget
    console.log("Test 3: Venue with Negative Budget");
    const input3 = createTestInput();
    input3.venues[0].budget.allocated = -1000;

    const result3 = await run(input3);
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.connector_contracts.is_connector_ready, false);
    const venue3 = result3.payload.connector_contracts.venues[0];
    assert.strictEqual(venue3.can_submit, false);
    const negBudgetError = venue3.errors.find(e => e.code === "NEGATIVE_BUDGET");
    assert.ok(negBudgetError);
    console.log("PASS");

    // Test 4: Venue Ready but Has Zero Units
    console.log("Test 4: Venue Ready but Has Zero Units");
    const input4 = createTestInput();
    input4.venues[0].units = [];

    const result4 = await run(input4);
    assert.strictEqual(result4.ok, true);
    const venue4 = result4.payload.connector_contracts.venues[0];
    assert.strictEqual(venue4.can_submit, false);
    const missingUnitsError = venue4.errors.find(e => e.code === "MISSING_UNITS_FOR_VENUE");
    assert.ok(missingUnitsError);
    assert.strictEqual(result4.payload.connector_contracts.is_connector_ready, false);
    console.log("PASS");

    // Test 5: Unit with Missing creative_ref
    console.log("Test 5: Unit with Missing creative_ref");
    const input5 = createTestInput();
    input5.venues[0].units[0].creative_ref = null;

    const result5 = await run(input5);
    assert.strictEqual(result5.ok, true);
    const unit5 = result5.payload.connector_contracts.venues[0].units[0];
    assert.strictEqual(unit5.is_connector_ready, false);
    assert.ok(unit5.missing_fields.includes("creative_ref"));
    const missingFieldError = unit5.errors.find(e => e.code === "MISSING_REQUIRED_FIELD");
    assert.ok(missingFieldError);
    console.log("PASS");

    // Test 6: Unknown venue_key Mapping
    console.log("Test 6: Unknown venue_key Mapping");
    const input6 = createTestInput();
    input6.venues[0].venue_key = "some_unknown_venue";

    const result6 = await run(input6);
    assert.strictEqual(result6.ok, true);
    const venue6 = result6.payload.connector_contracts.venues[0];
    assert.strictEqual(venue6.connector_key, "UNKNOWN");
    const unknownWarning = venue6.warnings.find(w => w.code === "UNKNOWN_CONNECTOR_KEY");
    assert.ok(unknownWarning);
    console.log("PASS");

    // Test 7: Objective Normalization
    console.log("Test 7: Objective Normalization");
    const input7 = createTestInput();
    input7.venues = [
        { ...input7.venues[0], objective: "Reach", venue_key: "meta" },
        { ...createTestInput().venues[0], objective: "traffic", venue_key: "google" },
        { ...createTestInput().venues[0], objective: "Lead_Gen", venue_key: "tiktok" },
        { ...createTestInput().venues[0], objective: "purchase", venue_key: "roku" }
    ];

    const result7 = await run(input7);
    assert.strictEqual(result7.ok, true);
    const venues7 = result7.payload.connector_contracts.venues;
    assert.strictEqual(venues7[0].normalized_objective, "AWARENESS");
    assert.strictEqual(venues7[1].normalized_objective, "TRAFFIC");
    assert.strictEqual(venues7[2].normalized_objective, "LEADS");
    assert.strictEqual(venues7[3].normalized_objective, "SALES");
    console.log("PASS");

    // Test 8: Currency Normalization
    console.log("Test 8: Currency Normalization");
    const input8 = createTestInput();
    input8.currency = "usd";
    input8.venues[0].budget.currency = "Eur";

    const result8 = await run(input8);
    assert.strictEqual(result8.ok, true);
    const venue8 = result8.payload.connector_contracts.venues[0];
    assert.strictEqual(venue8.normalized_currency, "EUR");

    // Test with null currency
    const input8b = createTestInput();
    input8b.currency = null;
    const result8b = await run(input8b);
    assert.strictEqual(result8b.ok, true);
    assert.strictEqual(result8b.payload.connector_contracts.venues[0].normalized_currency, null);
    console.log("PASS");

    // Test 9: Input Immutability
    console.log("Test 9: Input Immutability");
    const input9 = createTestInput();
    const snapshot9 = JSON.parse(JSON.stringify(input9));

    await run(input9);
    assert.deepStrictEqual(input9, snapshot9);
    console.log("PASS");

    // Test 10: Deterministic Error Paths
    console.log("Test 10: Deterministic Error Paths");
    const input10 = createTestInput();
    input10.venues[0].units[0].creative_ref = null;

    const resultA = await run(input10);
    const resultB = await run(input10);

    // Remove timestamps for comparison
    delete resultA.timestamp;
    delete resultB.timestamp;

    assert.deepStrictEqual(resultA.payload.connector_contracts, resultB.payload.connector_contracts);
    console.log("PASS");

    // Test 11: Preserve Raw Bid Value (Improvement A)
    console.log("Test 11: Preserve Raw Bid Value");
    const input11 = createTestInput();
    input11.venues[0].units[0].bid = 0; // Explicit zero

    const result11 = await run(input11);
    assert.strictEqual(result11.ok, true);
    const unit11 = result11.payload.connector_contracts.venues[0].units[0];
    assert.strictEqual(unit11.bid, 0); // Preserves explicit zero
    assert.strictEqual(unit11.effective_bid, null); // effective_bid is null for non-positive
    console.log("PASS");

    // Test 12: Duplicate Unit Index (Improvement B)
    console.log("Test 12: Duplicate Unit Index");
    const input12 = createTestInput();
    input12.venues[0].units.push({
        unit_id: "u_dup",
        unit_index: 0, // Same as first unit
        audience_ref: "aud_2",
        creative_ref: "cr_2",
        bid: null,
        schedule: { start_date: null, end_date: null, timezone: null }
    });

    const result12 = await run(input12);
    assert.strictEqual(result12.ok, true);
    assert.strictEqual(result12.payload.connector_contracts.is_connector_ready, false);
    const venue12 = result12.payload.connector_contracts.venues[0];
    assert.strictEqual(venue12.can_submit, false);
    const dupIndexError = venue12.errors.find(e => e.code === "DUPLICATE_UNIT_INDEX");
    assert.ok(dupIndexError);
    console.log("PASS");

    // Test 13: Empty Venues with can_launch=true (Improvement C)
    console.log("Test 13: Empty Venues with can_launch=true");
    const input13 = {
        submission_id: "sub_123",
        brand_id: "brand_456",
        readiness: { can_launch: true, global_status: "READY" },
        venues: []
    };

    const result13 = await run(input13);
    assert.strictEqual(result13.ok, false);
    assert.strictEqual(result13.error.code, "INVALID_INPUT");
    assert.ok(result13.error.message.includes("venues array is empty"));
    console.log("PASS");

    // Test 14: Per-Venue connector_ready Flag (Improvement D)
    console.log("Test 14: Per-Venue connector_ready Flag");
    const input14 = createTestInput();
    const result14 = await run(input14);

    assert.strictEqual(result14.ok, true);
    const venue14 = result14.payload.connector_contracts.venues[0];
    assert.strictEqual(venue14.is_connector_ready, true);

    // Test with error - should set is_connector_ready to false
    const input14b = createTestInput();
    input14b.venues[0].units[0].creative_ref = null;
    const result14b = await run(input14b);
    const venue14b = result14b.payload.connector_contracts.venues[0];
    assert.strictEqual(venue14b.is_connector_ready, false);
    console.log("PASS");

    console.log("All Phase 19 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
