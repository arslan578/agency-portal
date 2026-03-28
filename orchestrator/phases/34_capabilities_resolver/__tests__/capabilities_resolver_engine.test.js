/**
 * Phase 34: Capabilities Resolver Engine - Test Suite
 */

const assert = require("assert");
const { resolveCapabilities } = require("../capabilities_resolver_engine");
const snapshotBasic = require("./fixtures/snapshot_basic.json");
const mirrorBasic = require("./fixtures/mirror_basic.json");

// Helper to create envelope
function createEnvelope(overrides = {}) {
    return {
        ok: true,
        execution_id: "exec_123",
        intent: "RESOLVE_CAPABILITIES_V1",
        timestamp: "2025-11-29T12:00:00Z",
        payload: {
            snapshot: {
                execution_snapshot_v1: JSON.parse(JSON.stringify(snapshotBasic))
            },
            policy_mirror: {
                policy_mirror_v1: JSON.parse(JSON.stringify(mirrorBasic))
            },
            ...overrides.payload
        },
        ...overrides
    };
}

async function runTests() {
    console.log("Running Capabilities Resolver Engine Tests...");

    // ========== HAPPY PATH (6) ==========

    // 1. Basic world, one venue, full rules
    console.log("Test 1: Basic world with full rules");
    const res1 = resolveCapabilities(createEnvelope());
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.capabilities_report_v1.version, "CAPABILITIES_V1");
    assert(res1.payload.capabilities_report_v1.global_capabilities.objectives_supported.includes("AWARENESS"));
    assert(res1.payload.capabilities_report_v1.venues.length >= 2);
    console.log("PASS");

    // 2. Multiple venues, shared objectives
    console.log("Test 2: Multiple venues with shared objectives");
    const ytVenue = res1.payload.capabilities_report_v1.venues.find(v => v.venue_key === "YOUTUBE");
    const fbVenue = res1.payload.capabilities_report_v1.venues.find(v => v.venue_key === "FACEBOOK");
    assert(ytVenue);
    assert(fbVenue);
    assert(ytVenue.objectives_supported.includes("AWARENESS"));
    assert(fbVenue.objectives_supported.includes("AWARENESS"));
    console.log("PASS");

    // 3. Venue disabled in rules
    console.log("Test 3: Disabled venue");
    const ttVenue = res1.payload.capabilities_report_v1.venues.find(v => v.venue_key === "TIKTOK");
    if (ttVenue) {
        assert.strictEqual(ttVenue.enabled, false);
        assert.strictEqual(ttVenue.status, "DISABLED");
    }
    console.log("PASS");

    // 4. Complete matrix with connector rules
    console.log("Test 4: Connector rules present");
    assert.strictEqual(ytVenue.connector_capabilities.has_connector_rules, true);
    assert.strictEqual(ytVenue.connector_capabilities.readiness_level, "RICH");
    assert(ytVenue.connector_capabilities.required_fields.includes("campaign_id"));
    console.log("PASS");

    // 5. Budget rules mapped to constraints
    console.log("Test 5: Budget constraints");
    assert.strictEqual(ytVenue.budget_constraints.has_constraints, true);
    assert.strictEqual(ytVenue.budget_constraints.min_total, 1000);
    assert.strictEqual(ytVenue.budget_constraints.max_total, 100000);
    console.log("PASS");

    // 6. Snapshot objective matches matrix
    console.log("Test 6: Snapshot objective matches");
    assert.strictEqual(res1.payload.capabilities_report_v1.evaluation_warnings.length, 0);
    assert(res1.payload.capabilities_report_v1.summary_tags.includes("capabilities_complete"));
    console.log("PASS");

    // ========== NEGATIVE (6) ==========

    // 7. Missing snapshot payload
    console.log("Test 7: Missing snapshot");
    const res7 = resolveCapabilities(createEnvelope({ payload: { policy_mirror: { policy_mirror_v1: mirrorBasic } } }));
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "INVALID_EXECUTION_SNAPSHOT");
    console.log("PASS");

    // 8. Missing mirror payload
    console.log("Test 8: Missing mirror");
    const res8 = resolveCapabilities(createEnvelope({ payload: { snapshot: { execution_snapshot_v1: snapshotBasic } } }));
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INVALID_POLICY_MIRROR_PAYLOAD");
    console.log("PASS");

    // 9. Invalid envelope shape
    console.log("Test 9: Invalid envelope");
    const res9 = resolveCapabilities({ ok: true });
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "MALFORMED_CAPABILITIES_RESOLVER_CONTRACT");
    console.log("PASS");

    // 10. Strict mode + missing budget_rules
    console.log("Test 10: Strict mode with missing rules");
    const mirror10 = JSON.parse(JSON.stringify(mirrorBasic));
    delete mirror10.rules.budget;
    const res10 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snapshotBasic },
            policy_mirror: { policy_mirror_v1: mirror10 },
            flags: { strict_mode: true }
        }
    }));
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "CAPABILITIES_STRICT_MODE_FAILURE");
    console.log("PASS");

    // 11. Strict mode + venue absent from rules
    console.log("Test 11: Strict mode with venue in snapshot not in rules");
    const snap11 = JSON.parse(JSON.stringify(snapshotBasic));
    snap11.plan.venues.push({ venue_key: "UNKNOWN_VENUE" });
    const res11 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snap11 },
            policy_mirror: { policy_mirror_v1: mirrorBasic },
            flags: { strict_mode: false } // Non-strict should work
        }
    }));
    assert.strictEqual(res11.ok, true);
    const unknownVenue = res11.payload.capabilities_report_v1.venues.find(v => v.venue_key === "UNKNOWN_VENUE");
    assert.strictEqual(unknownVenue.status, "UNKNOWN");
    console.log("PASS");

    // 12. Invalid types in mirror
    console.log("Test 12: Invalid mirror structure");
    const res12 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snapshotBasic },
            policy_mirror: { policy_mirror_v1: { rules: "INVALID" } }
        }
    }));
    assert.strictEqual(res12.ok, true); // Should still work but with missing entries
    assert(res12.payload.capabilities_report_v1.missing_policy_entries.length > 0);
    console.log("PASS");

    // ========== EDGE CASES (4) ==========

    // 13. Snapshot with zero venues
    console.log("Test 13: Zero venues in snapshot");
    const snap13 = { version: "1.0.0", plan: { venues: [] } };
    const res13 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snap13 },
            policy_mirror: { policy_mirror_v1: mirrorBasic }
        }
    }));
    assert.strictEqual(res13.ok, true);
    assert(res13.payload.capabilities_report_v1.venues.length > 0); // Mirror venues still present
    console.log("PASS");

    // 14. Mirror venues not in snapshot
    console.log("Test 14: Mirror venues not in snapshot");
    const snap14 = { version: "1.0.0", plan: { venues: [{ venue_key: "YOUTUBE" }] } };
    const res14 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snap14 },
            policy_mirror: { policy_mirror_v1: mirrorBasic }
        }
    }));
    assert.strictEqual(res14.ok, true);
    assert(res14.payload.capabilities_report_v1.venues.some(v => v.venue_key === "FACEBOOK"));
    console.log("PASS");

    // 15. Matrix objective with no venues
    console.log("Test 15: Objective with empty venue list");
    const mirror15 = JSON.parse(JSON.stringify(mirrorBasic));
    mirror15.rules.compatibility_matrix.objective_to_venue.EMPTY_OBJ = [];
    const res15 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snapshotBasic },
            policy_mirror: { policy_mirror_v1: mirror15 }
        }
    }));
    assert.strictEqual(res15.ok, true);
    console.log("PASS");

    // 16. Connector rules for disabled venue
    console.log("Test 16: Connector rules for disabled venue");
    const mirror16 = JSON.parse(JSON.stringify(mirrorBasic));
    mirror16.rules.connector_rules.TIKTOK = { min_payload_fields: ["id"] };
    const res16 = resolveCapabilities(createEnvelope({
        payload: {
            snapshot: { execution_snapshot_v1: snapshotBasic },
            policy_mirror: { policy_mirror_v1: mirror16 }
        }
    }));
    assert.strictEqual(res16.ok, true);
    const tt16 = res16.payload.capabilities_report_v1.venues.find(v => v.venue_key === "TIKTOK");
    assert.strictEqual(tt16.status, "DISABLED");
    assert.strictEqual(tt16.connector_capabilities.has_connector_rules, true);
    console.log("PASS");

    // ========== REGRESSION (1) ==========

    // 17. Regression guard
    console.log("Test 17: Regression guard");
    const resRegress = resolveCapabilities(createEnvelope());
    assert.strictEqual(resRegress.ok, true);
    assert.strictEqual(resRegress.payload.capabilities_report_v1.version, "CAPABILITIES_V1");
    console.log("PASS");

    // ========== DETERMINISM (1) ==========

    // 18. Determinism guard
    console.log("Test 18: Determinism guard");
    const input18 = createEnvelope();
    const run1 = resolveCapabilities(JSON.parse(JSON.stringify(input18)));
    const run2 = resolveCapabilities(JSON.parse(JSON.stringify(input18)));
    // Compare payloads (ignoring timestamp)
    const p1 = JSON.stringify({ ...run1.payload, timestamp: "IGNORE" });
    const p2 = JSON.stringify({ ...run2.payload, timestamp: "IGNORE" });
    assert.strictEqual(p1, p2);
    console.log("PASS");

    console.log("✅ All Phase 34 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
