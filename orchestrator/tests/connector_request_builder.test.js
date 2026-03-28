/**
 * Tests for Connector Request Builder Engine (Phase 20)
 */

const { run } = require("../modules/connector_request_builder");
const assert = require("assert");

// Helper to create minimal valid input from Phase 19
function createTestInput() {
    return {
        plan: { brand_id: "test", groups: [] },
        readiness: { is_launchable: true },
        validation: { is_valid: true },
        policy: { summary: { is_policy_clean: true } },
        connector_contracts: {
            venues: [
                {
                    venue_key: "meta",
                    is_connector_ready: true,
                    can_submit: true,
                    objective: { normalized_type: "AWARENESS" },
                    budget_total_minor: 5000,
                    currency: "USD",
                    schedule: {
                        start_time: "2024-01-01T00:00:00Z",
                        end_time: "2024-01-31T23:59:59Z"
                    },
                    effective_bid: 500,
                    raw_bid: 500,
                    audience: { id: "aud_1" },
                    creative: { id: "cr_1" },
                    tracking: { utm_source: "facebook" }
                }
            ]
        }
    };
}

async function runTests() {
    console.log("Running Connector Request Builder Tests...");

    // Test 1: Invalid Payload Type
    console.log("Test 1: Invalid Payload Type");
    const result1 = await run(null);
    assert.strictEqual(result1.ok, false);
    assert.strictEqual(result1.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 2: Missing connector_contracts.venues
    console.log("Test 2: Missing connector_contracts.venues");
    const result2 = await run({ plan: {}, connector_contracts: {} });
    assert.strictEqual(result2.ok, false);
    assert.strictEqual(result2.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 3: Venue Not Ready - SKIPPED Status
    console.log("Test 3: Venue Not Ready - SKIPPED Status");
    const input3 = createTestInput();
    input3.connector_contracts.venues[0].is_connector_ready = false;

    const result3 = await run(input3);
    assert.strictEqual(result3.ok, true);
    const venueReq3 = result3.payload.connector_requests.venues[0];
    assert.strictEqual(venueReq3.status, "SKIPPED");
    assert.strictEqual(venueReq3.can_build_request, false);
    assert.strictEqual(venueReq3.requests.primary, null);
    const notReadyWarning = venueReq3.warnings.find(
        (w) => w.code === "NOT_READY"
    );
    assert.ok(notReadyWarning);
    console.log("PASS");

    // Test 4: Meta Venue with Complete Data
    console.log("Test 4: Meta Venue with Complete Data");
    const input4 = createTestInput();

    const result4 = await run(input4);
    assert.strictEqual(result4.ok, true);
    const venueReq4 = result4.payload.connector_requests.venues[0];
    assert.strictEqual(venueReq4.status, "READY");
    assert.strictEqual(venueReq4.can_build_request, true);
    assert.ok(venueReq4.requests.primary);
    assert.strictEqual(
        venueReq4.requests.primary.campaign.objective,
        "AWARENESS"
    );
    assert.strictEqual(
        venueReq4.requests.primary.ad_set.daily_budget_minor,
        5000
    );
    console.log("PASS");

    // Test 5: Meta Venue Missing Budget
    console.log("Test 5: Meta Venue Missing Budget");
    const input5 = createTestInput();
    input5.connector_contracts.venues[0].budget_total_minor = null;

    const result5 = await run(input5);
    assert.strictEqual(result5.ok, true);
    const venueReq5 = result5.payload.connector_requests.venues[0];
    assert.strictEqual(venueReq5.status, "ERROR");
    assert.strictEqual(venueReq5.can_build_request, false);
    const missingBudgetError = venueReq5.errors.find(
        (e) => e.code === "MISSING_BUDGET"
    );
    assert.ok(missingBudgetError);
    console.log("PASS");

    // Test 6: Google Venue with Complete Data
    console.log("Test 6: Google Venue with Complete Data");
    const input6 = createTestInput();
    input6.connector_contracts.venues[0].venue_key = "google_ads";
    input6.connector_contracts.venues[0].objective.normalized_type = "TRAFFIC";

    const result6 = await run(input6);
    assert.strictEqual(result6.ok, true);
    const venueReq6 = result6.payload.connector_requests.venues[0];
    assert.strictEqual(venueReq6.status, "READY");
    assert.strictEqual(venueReq6.platform_kind, "GOOGLE_ADS");
    assert.ok(venueReq6.requests.primary);
    assert.strictEqual(
        venueReq6.requests.primary.campaign.objective,
        "TRAFFIC"
    );
    assert.strictEqual(
        venueReq6.requests.primary.campaign.budget_minor,
        5000
    );
    console.log("PASS");

    // Test 7: TikTok Venue with Complete Data
    console.log("Test 7: TikTok Venue with Complete Data");
    const input7 = createTestInput();
    input7.connector_contracts.venues[0].venue_key = "tiktok";
    input7.connector_contracts.venues[0].objective.normalized_type = "SALES";

    const result7 = await run(input7);
    assert.strictEqual(result7.ok, true);
    const venueReq7 = result7.payload.connector_requests.venues[0];
    assert.strictEqual(venueReq7.status, "READY");
    assert.strictEqual(venueReq7.platform_kind, "TIKTOK");
    assert.ok(venueReq7.requests.primary);
    assert.strictEqual(
        venueReq7.requests.primary.campaign.objective,
        "SALES"
    );
    assert.strictEqual(
        venueReq7.requests.primary.campaign.budget_minor,
        5000
    );
    console.log("PASS");

    // Test 8: Unknown Platform - Generic Builder
    console.log("Test 8: Unknown Platform - Generic Builder");
    const input8 = createTestInput();
    input8.connector_contracts.venues[0].venue_key = "unknown_platform";

    const result8 = await run(input8);
    assert.strictEqual(result8.ok, true);
    const venueReq8 = result8.payload.connector_requests.venues[0];
    assert.strictEqual(venueReq8.status, "READY");
    assert.strictEqual(venueReq8.platform_kind, "GENERIC");
    assert.ok(venueReq8.requests.primary);
    assert.strictEqual(venueReq8.requests.primary.venue_key, "unknown_platform");
    console.log("PASS");

    // Test 9: Determinism
    console.log("Test 9: Determinism");
    const input9 = createTestInput();

    const resultA = await run(input9);
    const resultB = await run(input9);

    // Remove timestamps for comparison
    delete resultA.timestamp;
    delete resultB.timestamp;

    assert.deepStrictEqual(
        resultA.payload.connector_requests,
        resultB.payload.connector_requests
    );
    console.log("PASS");

    // Test 10: Input Immutability
    console.log("Test 10: Input Immutability");
    const input10 = createTestInput();
    const snapshot10 = JSON.parse(JSON.stringify(input10));

    await run(input10);
    assert.deepStrictEqual(input10, snapshot10);
    console.log("PASS");

    // Test 11: Mixed Venues
    console.log("Test 11: Mixed Venues");
    const input11 = createTestInput();
    input11.connector_contracts.venues.push({
        venue_key: "google",
        is_connector_ready: false,
        can_submit: true,
        objective: { normalized_type: "LEADS" },
        budget_total_minor: 3000
    });
    input11.connector_contracts.venues.push({
        venue_key: "tiktok",
        is_connector_ready: true,
        can_submit: true,
        objective: { normalized_type: "AWARENESS" },
        budget_total_minor: 2000
    });

    const result11 = await run(input11);
    assert.strictEqual(result11.ok, true);
    const venues11 = result11.payload.connector_requests.venues;
    assert.strictEqual(venues11[0].status, "READY"); // meta ready
    assert.strictEqual(venues11[1].status, "SKIPPED"); // google not ready
    assert.strictEqual(venues11[2].status, "READY"); // tiktok ready
    console.log("PASS");

    // Test 12: platform_kind Derivation
    console.log("Test 12: platform_kind Derivation");
    const input12 = createTestInput();
    input12.connector_contracts.venues[0].objective = {
        platform_kind: "META_CUSTOM"
    };

    const result12 = await run(input12);
    assert.strictEqual(result12.ok, true);
    const venueReq12 = result12.payload.connector_requests.venues[0];
    // Prefers objective.platform_kind over venue_key heuristics
    assert.strictEqual(venueReq12.platform_kind, "META_CUSTOM");
    console.log("PASS");

    console.log("All Phase 20 tests passed.");
}

runTests().catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
});
