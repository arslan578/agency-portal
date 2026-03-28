/**
 * Tests for Platform Payload Engine (Phase 11)
 */

const { buildPlatformPayloads } = require("../modules/platform_payload_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Platform Payload Engine Tests...");

    // Test 1: Happy path with two venues
    console.log("Test 1: Happy path with two venues");
    const input1 = {
        brand_id: "brand_123",
        campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
        venue_execution_plan: {
            brand_id: "brand_123",
            campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
            currency: "USD",
            total_budget: 5000,
            venues: [
                {
                    venue_key: "youtube",
                    role: "PRIMARY",
                    priority: 1,
                    objective: "AWARENESS",
                    primary_kpi: "CPV",
                    spend: { allocated: 3000, share: 0.6 },
                    creative_requirements: { requires_video: true }
                },
                {
                    venue_key: "google_display",
                    role: "SUPPORTING",
                    priority: 2,
                    objective: "TRAFFIC",
                    primary_kpi: "CPC",
                    spend: { allocated: 2000, share: 0.4 },
                    creative_requirements: { requires_image: true }
                }
            ]
        }
    };

    const result1 = await buildPlatformPayloads(input1);
    assert.strictEqual(result1.ok, true, "Result should be ok");
    assert.strictEqual(result1.payload.brand_id, "brand_123");
    assert.strictEqual(result1.payload.venues.length, 2);

    const youtube = result1.payload.venues.find(v => v.venue_key === "youtube");
    assert.strictEqual(youtube.platform_flavor.hierarchy, "CAMPAIGN_ADGROUP_AD");
    assert.strictEqual(youtube.abstract_structure.creative.requirements.requires_video, true);

    const gdn = result1.payload.venues.find(v => v.venue_key === "google_display");
    assert.strictEqual(gdn.platform_flavor.hierarchy, "CAMPAIGN_LINEITEM_CREATIVE");
    console.log("PASS");

    // Test 2: Unknown venue uses default flavor
    console.log("Test 2: Unknown venue uses default flavor");
    const input2 = {
        brand_id: "brand_123",
        campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
        venue_execution_plan: {
            brand_id: "brand_123",
            campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
            currency: "USD",
            total_budget: 1000,
            venues: [
                {
                    venue_key: "unknown_network",
                    role: "PRIMARY",
                    priority: 1,
                    objective: "AWARENESS",
                    primary_kpi: "CPM",
                    spend: { allocated: 1000, share: 1.0 }
                }
            ]
        }
    };

    const result2 = await buildPlatformPayloads(input2);
    assert.strictEqual(result2.ok, true);
    const unknown = result2.payload.venues[0];
    assert.strictEqual(unknown.platform_flavor.hierarchy, "SINGLE_LEVEL");
    assert.ok(unknown.platform_flavor.notes.includes("Generic flavor, unknown venue"));
    console.log("PASS");

    // Test 3: Missing venue_execution_plan fails with INVALID_INPUT
    console.log("Test 3: Missing venue_execution_plan fails");
    const input3 = {
        brand_id: "brand_123",
        campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" }
    };
    const result3 = await buildPlatformPayloads(input3);
    assert.strictEqual(result3.ok, false);
    assert.strictEqual(result3.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 4: Empty venues fails with NO_VENUES
    console.log("Test 4: Empty venues fails");
    const input4 = {
        brand_id: "brand_123",
        campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
        venue_execution_plan: {
            brand_id: "brand_123",
            campaign_goal: { type: "LEAD_GEN", primary_kpi: "CPL" },
            venues: []
        }
    };
    const result4 = await buildPlatformPayloads(input4);
    assert.strictEqual(result4.ok, false);
    assert.strictEqual(result4.error.code, "NO_VENUES");
    console.log("PASS");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
