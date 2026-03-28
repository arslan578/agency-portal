/**
 * Tests for Execution Assembly Engine (Phase 12)
 */

const { run_execution_assembly } = require("../modules/execution_assembly_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Execution Assembly Engine Tests...");

    // Test 1: Happy Path (Single Venue)
    console.log("Test 1: Happy Path (Single Venue)");
    const context1 = {
        venue_execution_plan: {
            brand_id: "brand_123",
            campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
            currency: "USD",
            total_budget: 1000,
            venues: [
                {
                    venue_key: "meta",
                    role: "PRIMARY",
                    priority: 1,
                    objective: "LEAD_GEN",
                    primary_kpi: "CPL",
                    spend: { allocated: 1000, share: 1.0 },
                    schedule: { start_date: "2023-01-01", end_date: "2023-01-31" }
                }
            ]
        },
        creative_plan: { creatives: [{ id: "cr_1" }] },
        audience_plan: { audiences: [{ id: "aud_1" }] }
    };

    const result1 = await run_execution_assembly(context1);
    assert.strictEqual(result1.ok, true, "Result should be ok");
    assert.ok(result1.payload, "Payload should exist");
    assert.strictEqual(result1.payload.brand_id, "brand_123");
    assert.strictEqual(result1.payload.total_budget, 1000);
    assert.strictEqual(result1.payload.venues.length, 1);

    let venue = result1.payload.venues[0];
    assert.strictEqual(venue.venue_key, "meta");
    assert.strictEqual(venue.execution_units.length, 1);

    let unit = venue.execution_units[0];
    assert.strictEqual(unit.budget.amount, 1000);
    assert.strictEqual(unit.budget.type, "LIFETIME");
    assert.strictEqual(unit.unit_id, "brand_123__meta__unit_0");
    assert.strictEqual(unit.name, "META_LEAD_GEN_PRIMARY_UNIT_0");
    assert.strictEqual(unit.unit_kind, "GROUP");
    assert.strictEqual(unit.audience_ref, "aud_1");
    assert.strictEqual(unit.creative_refs[0], "cr_1");
    console.log("PASS");

    // Test 2: Missing Inputs (no venue_execution_plan)
    console.log("Test 2: Missing Inputs");
    const result2 = await run_execution_assembly({});
    assert.strictEqual(result2.ok, false);
    assert.ok(result2.error);
    assert.strictEqual(result2.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 3: Deterministic IDs
    console.log("Test 3: Deterministic IDs");
    const result3a = await run_execution_assembly(context1);
    const result3b = await run_execution_assembly(context1);
    const idA = result3a.payload.venues[0].execution_units[0].unit_id;
    const idB = result3b.payload.venues[0].execution_units[0].unit_id;
    assert.strictEqual(idA, idB);
    console.log("PASS");

    // Test 4: No creative_plan or audience_plan
    console.log("Test 4: No Creative or Audience Plans");
    const context4 = {
        venue_execution_plan: {
            brand_id: "brand_456",
            campaign_goal: { type: "AWARENESS", primary_kpi: "CPM" },
            currency: "EUR",
            total_budget: 500,
            venues: [
                {
                    venue_key: "tiktok",
                    role: "PRIMARY",
                    priority: 1,
                    objective: "AWARENESS",
                    primary_kpi: "CPM",
                    spend: { allocated: 500, share: 1.0 }
                    // no schedule
                }
            ]
        }
        // no creative_plan, no audience_plan
    };

    const result4 = await run_execution_assembly(context4);
    assert.strictEqual(result4.ok, true);
    venue = result4.payload.venues[0];
    unit = venue.execution_units[0];
    assert.strictEqual(unit.audience_ref, null, "Audience should be null when no audience_plan");
    assert.deepStrictEqual(unit.creative_refs, [], "Creative refs should be empty when no creative_plan");
    console.log("PASS");

    // Test 5: Missing schedule should default to nulls
    console.log("Test 5: Missing Schedule Defaults");
    const result5 = await run_execution_assembly(context4);
    venue = result5.payload.venues[0];
    unit = venue.execution_units[0];
    assert.strictEqual(unit.schedule.start_date, null);
    assert.strictEqual(unit.schedule.end_date, null);
    console.log("PASS");

    // Test 6: Multiple venues each get one unit and correct budgets
    console.log("Test 6: Multiple Venues, One Unit Each");
    const context6 = {
        venue_execution_plan: {
            brand_id: "brand_multi",
            campaign_goal: { type: "SALES", primary_kpi: "ROAS" },
            currency: "USD",
            total_budget: 3000,
            venues: [
                {
                    venue_key: "meta",
                    role: "PRIMARY",
                    priority: 1,
                    objective: "SALES",
                    primary_kpi: "ROAS",
                    spend: { allocated: 2000, share: 2 / 3 }
                },
                {
                    venue_key: "youtube",
                    role: "SUPPORTING",
                    priority: 2,
                    objective: "AWARENESS",
                    primary_kpi: "CPM",
                    spend: { allocated: 1000, share: 1 / 3 }
                }
            ]
        }
    };

    const result6 = await run_execution_assembly(context6);
    assert.strictEqual(result6.ok, true);
    assert.strictEqual(result6.payload.venues.length, 2);

    const vMeta = result6.payload.venues.find(v => v.venue_key === "meta");
    const vYouTube = result6.payload.venues.find(v => v.venue_key === "youtube");
    assert.ok(vMeta);
    assert.ok(vYouTube);

    assert.strictEqual(vMeta.execution_units.length, 1);
    assert.strictEqual(vYouTube.execution_units.length, 1);
    assert.strictEqual(vMeta.execution_units[0].budget.amount, 2000);
    assert.strictEqual(vYouTube.execution_units[0].budget.amount, 1000);
    console.log("PASS");

    // Test 7: Zero budget should still produce a unit with zero amount
    console.log("Test 7: Zero Budget Venue");
    const context7 = {
        venue_execution_plan: {
            brand_id: "brand_zero",
            campaign_goal: { type: "AWARENESS", primary_kpi: "CPM" },
            currency: "USD",
            total_budget: 0,
            venues: [
                {
                    venue_key: "reddit",
                    role: "PRIMARY",
                    priority: 1,
                    objective: "AWARENESS",
                    primary_kpi: "CPM",
                    spend: { allocated: 0, share: 0 }
                }
            ]
        }
    };

    const result7 = await run_execution_assembly(context7);
    assert.strictEqual(result7.ok, true);
    venue = result7.payload.venues[0];
    unit = venue.execution_units[0];
    assert.strictEqual(unit.budget.amount, 0);
    console.log("PASS");

    // Test 8: Audience present but first audience lacks id
    console.log("Test 8: Audience Without ID");
    const context8 = {
        venue_execution_plan: context1.venue_execution_plan,
        creative_plan: context1.creative_plan,
        audience_plan: { audiences: [{ name: "No ID audience" }] }
    };

    const result8 = await run_execution_assembly(context8);
    venue = result8.payload.venues[0];
    unit = venue.execution_units[0];
    assert.strictEqual(unit.audience_ref, null, "Audience ref should be null if no ID");
    console.log("PASS");

    // Test 9: Creative present but first creative lacks id
    console.log("Test 9: Creative Without ID");
    const context9 = {
        venue_execution_plan: context1.venue_execution_plan,
        creative_plan: { creatives: [{ label: "No ID creative" }] },
        audience_plan: context1.audience_plan
    };

    const result9 = await run_execution_assembly(context9);
    venue = result9.payload.venues[0];
    unit = venue.execution_units[0];
    assert.strictEqual(unit.creative_refs.length, 0, "Creative refs should be empty if no ID");
    console.log("PASS");

    // Test 10: Meta block exists and is well-formed
    console.log("Test 10: Meta Block Shape");
    const result10 = await run_execution_assembly(context1);
    const meta = result10.payload.meta;
    assert.ok(meta, "Meta should exist");
    assert.strictEqual(meta.created_by_phase, "PHASE_12_EXECUTION_ASSEMBLY_V1");
    assert.ok(typeof meta.version === "string");
    assert.ok(Array.isArray(meta.notes));
    console.log("PASS");

    // Test 11: Envelope structure on success
    console.log("Test 11: Envelope Structure (Success)");
    assert.strictEqual(result10.ok, true);
    assert.strictEqual(result10.module, "execution_assembly");
    assert.ok(typeof result10.timestamp === "string");
    assert.ok(result10.payload);
    assert.strictEqual(result10.error, undefined);
    console.log("PASS");

    // Test 12: Envelope structure on failure for non-object context
    console.log("Test 12: Envelope Structure (Non-object Context)");
    const result12 = await run_execution_assembly(null);
    assert.strictEqual(result12.ok, false);
    assert.strictEqual(result12.module, "execution_assembly");
    assert.ok(result12.error);
    assert.strictEqual(result12.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 13: Invalid venues type yields INVALID_INPUT
    console.log("Test 13: Invalid Venues Type");
    const context13 = {
        venue_execution_plan: {
            brand_id: "brand_invalid",
            campaign_goal: { type: "TEST", primary_kpi: "TEST" },
            currency: null,
            total_budget: 100,
            venues: "not-an-array"
        }
    };
    const result13 = await run_execution_assembly(context13);
    assert.strictEqual(result13.ok, false);
    assert.ok(result13.error);
    assert.strictEqual(result13.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 14: Deterministic names as well as IDs
    console.log("Test 14: Deterministic Names");
    const result14a = await run_execution_assembly(context1);
    const result14b = await run_execution_assembly(context1);
    const nameA = result14a.payload.venues[0].execution_units[0].name;
    const nameB = result14b.payload.venues[0].execution_units[0].name;
    assert.strictEqual(nameA, nameB);
    console.log("PASS");

    // Test 15: Input context does not get mutated
    console.log("Test 15: Context Is Not Mutated");
    const context15 = {
        venue_execution_plan: JSON.parse(JSON.stringify(context1.venue_execution_plan)),
        creative_plan: JSON.parse(JSON.stringify(context1.creative_plan)),
        audience_plan: JSON.parse(JSON.stringify(context1.audience_plan))
    };
    const snapshot15 = JSON.parse(JSON.stringify(context15));
    await run_execution_assembly(context15);
    assert.deepStrictEqual(context15, snapshot15, "Context should not be mutated by module");
    console.log("PASS");

    // Test 16: unit_kind constrained to GROUP
    console.log("Test 16: unit_kind Must Be GROUP");
    const result16 = await run_execution_assembly(context1);
    venue = result16.payload.venues[0];
    unit = venue.execution_units[0];
    assert.strictEqual(unit.unit_kind, "GROUP");
    console.log("PASS");

    // Test 17: Tracking object exists and is an object
    console.log("Test 17: Tracking Object Shape");
    const result17 = await run_execution_assembly(context1);
    venue = result17.payload.venues[0];
    unit = venue.execution_units[0];
    assert.ok(unit.hasOwnProperty("tracking"));
    assert.ok(typeof unit.tracking === "object");
    console.log("PASS");

    console.log("All Phase 12 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
