/**
 * Tests for Execution Health Score Engine (Phase 31)
 */

const assert = require("assert");
const { computeHealthScore } = require("../modules/execution_health_engine");

// Helper to create input envelope
function createEnvelope(payloadOverrides = {}) {
    return {
        ok: true,
        module: "execution_incident_engine",
        timestamp: "2025-11-29T12:00:00Z",
        payload: {
            execution_id: "exec_123",
            incident_summary: {
                severity_score: 0,
                severity_level: "NONE",
                incident_tags: [],
                counts: {
                    total_incidents: 0,
                    validation_errors: 0,
                    policy_blocks: 0,
                    readiness_failures: 0,
                    connector_failures: 0,
                    drift_events: 0
                }
            },
            drift_report: {
                drift_score: 0,
                drift_tags: [],
                counts: { total_drifts: 0 }
            },
            policy_findings: {
                policy_burden_score: 0,
                policy_tags: []
            },
            connector_findings: {
                connector_flake_score: 0,
                connector_tags: [],
                failure_rate: 0
            },
            health_scoring_config: null,
            ...payloadOverrides
        },
        error: null
    };
}

async function runTests() {
    console.log("Running Execution Health Engine Tests...");

    // ========== HAPPY PATH (6) ==========

    // 1. Perfect run
    console.log("Test 1: Perfect run");
    const res1 = computeHealthScore(createEnvelope());
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.health_score, 100);
    assert.strictEqual(res1.payload.health_category, "GOOD");
    assert(res1.payload.health_tags.includes("HEALTH_SCORE_GOOD"));
    console.log("PASS");

    // 2. Moderate incident (WARN)
    console.log("Test 2: Moderate incident (WARN)");
    const res2 = computeHealthScore(createEnvelope({
        incident_summary: {
            severity_score: 0.4,
            severity_level: "MEDIUM",
            incident_tags: ["INCIDENT_OCCURRED"],
            counts: { total_incidents: 1, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 }
        }
    }));
    // Stability score: 100 - (0.4 * 100) = 60
    // Weighted: 60 * 0.3 + 100 * 0.7 = 18 + 70 = 88
    // Wait, let's check weights: stability 0.3, others 0.7 total.
    // Stability=60, Policy=100, Budget=100, Connectors=100, Drift=100
    // Score = (60*0.3) + (100*0.2) + (100*0.2) + (100*0.2) + (100*0.1)
    // Score = 18 + 20 + 20 + 20 + 10 = 88
    // 88 is GOOD (>80). Let's increase severity to hit WARN.
    // Try severity 0.8. Stability = 20.
    // Score = (20*0.3) + 70 = 6 + 70 = 76. WARN.
    const res2b = computeHealthScore(createEnvelope({
        incident_summary: {
            severity_score: 0.8,
            severity_level: "HIGH",
            incident_tags: ["INCIDENT_OCCURRED"],
            counts: { total_incidents: 1, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 }
        }
    }));
    assert.strictEqual(res2b.payload.health_category, "WARN");
    assert(res2b.payload.health_tags.includes("DIM_STABILITY_WEAK"));
    console.log("PASS");

    // 3. Critical failure
    console.log("Test 3: Critical failure");
    const res3 = computeHealthScore(createEnvelope({
        incident_summary: {
            severity_score: 1.0,
            severity_level: "CRITICAL",
            incident_tags: [],
            counts: { total_incidents: 1, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 }
        },
        connector_findings: {
            connector_flake_score: 1.0,
            connector_tags: [],
            failure_rate: 1.0
        }
    }));
    // Stability=0, Connectors=0.
    // Score = (0*0.3) + (100*0.2) + (100*0.2) + (0*0.2) + (100*0.1)
    // Score = 0 + 20 + 20 + 0 + 10 = 50.
    // 50 is WARN (>=50). Wait, critical_min is 0.
    // If I want CRITICAL, I need score < 50.
    // Let's add Policy burden.
    const res3b = computeHealthScore(createEnvelope({
        incident_summary: { severity_score: 1.0, severity_level: "CRITICAL", incident_tags: [], counts: { total_incidents: 1, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 } },
        connector_findings: { connector_flake_score: 1.0, connector_tags: [], failure_rate: 1.0 },
        policy_findings: { policy_burden_score: 1.0, policy_tags: [] }
    }));
    // Policy=20 (100 - 80*1.0).
    // Score = 0 + 4 + 20 + 0 + 10 = 34. CRITICAL.
    assert.strictEqual(res3b.payload.health_category, "CRITICAL");
    console.log("PASS");

    // 4. Policy heavy run
    console.log("Test 4: Policy heavy run");
    const res4 = computeHealthScore(createEnvelope({
        policy_findings: { policy_burden_score: 1.0, policy_tags: ["POLICY_HEAVY"] }
    }));
    // Policy Score = 100 - 80 = 20.
    // Weighted impact: (20 * 0.2) = 4. Lost 16 points.
    // Total = 100 - 16 = 84. Still GOOD.
    // Tag check.
    assert(res4.payload.health_tags.includes("DIM_POLICY_HEAVY"));
    console.log("PASS");

    // 5. Drift dominated run
    console.log("Test 5: Drift dominated run");
    const res5 = computeHealthScore(createEnvelope({
        drift_report: { drift_score: 1.0, drift_tags: ["DRIFT_HIGH"], counts: { total_drifts: 1 } }
    }));
    // Drift Score = 100 - 60 = 40.
    // Budget Score (uses drift score) = 100 - 80 = 20.
    // Weighted: Drift(0.1) -> 4. Budget(0.2) -> 4.
    // Lost: Drift(6 pts), Budget(16 pts). Total lost 22.
    // Score = 78. WARN.
    assert.strictEqual(res5.payload.health_category, "WARN");
    assert(res5.payload.health_tags.includes("DIM_DRIFT_HIGH"));
    assert(res5.payload.health_tags.includes("DIM_BUDGET_UNSTABLE"));
    console.log("PASS");

    // 6. Custom Config
    console.log("Test 6: Custom Config");
    const res6 = computeHealthScore(createEnvelope({
        health_scoring_config: {
            version: "CUSTOM_V1",
            dimension_weights: { stability: 1.0, policy: 0, budget: 0, connectors: 0, drift: 0 },
            category_thresholds: { good_min: 90, warn_min: 50, critical_min: 0 },
            penalties: {
                stability: { max_penalty: 100 },
                policy: { max_penalty: 0 },
                budget: { max_penalty: 0 },
                connectors: { max_penalty: 0 },
                drift: { max_penalty: 0 }
            }
        },
        incident_summary: { severity_score: 0.2, severity_level: "LOW", incident_tags: [], counts: { total_incidents: 0, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 } }
    }));
    // Stability = 80. Weight 1.0. Total 80.
    // Threshold 90. So 80 is WARN.
    assert.strictEqual(res6.payload.health_score, 80);
    assert.strictEqual(res6.payload.health_category, "WARN");
    console.log("PASS");

    // ========== NEGATIVE PATH (6) ==========

    // 7. Invalid input (null)
    console.log("Test 7: Invalid input (null)");
    const res7 = computeHealthScore(null);
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "INVALID_INPUT");
    console.log("PASS");

    // 8. Input payload null
    console.log("Test 8: Input payload null");
    const res8 = computeHealthScore({ ok: true, payload: null });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INVALID_INPUT");
    console.log("PASS");

    // 9. Missing incident_summary
    console.log("Test 9: Missing incident_summary");
    const res9 = computeHealthScore({ ok: true, payload: {} });
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "MALFORMED_INCIDENT_REPORT");
    console.log("PASS");

    // 10. Non-numeric severity
    console.log("Test 10: Non-numeric severity");
    const res10 = computeHealthScore({ ok: true, payload: { incident_summary: { severity_score: "high" } } });
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "MALFORMED_INCIDENT_REPORT");
    console.log("PASS");

    // 10b. NaN severity score (Strict validation)
    console.log("Test 10b: NaN severity score");
    const res10b = computeHealthScore({ ok: true, payload: { incident_summary: { severity_score: NaN } } });
    assert.strictEqual(res10b.ok, false);
    assert.strictEqual(res10b.error.code, "MALFORMED_INCIDENT_REPORT");
    assert.strictEqual(res10b.error.message, "severity_score must be a valid number");
    console.log("PASS");

    // 11. Input ok: false
    console.log("Test 11: Input ok: false");
    const res11 = computeHealthScore({ ok: false });
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.error.code, "INVALID_INPUT");
    console.log("PASS");

    // 12. Malformed config (internal error handling)
    console.log("Test 12: Malformed config");
    // If config is present but missing weights, accessing them might throw.
    const res12 = computeHealthScore(createEnvelope({
        health_scoring_config: { version: "BAD", dimension_weights: null } // This will cause throw
    }));
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.error.code, "HEALTH_ENGINE_INTERNAL_ERROR");
    console.log("PASS");

    // ========== EDGE CASES (4) ==========

    // 13. All metrics 1.0
    console.log("Test 13: All metrics 1.0");
    const res13 = computeHealthScore(createEnvelope({
        incident_summary: { severity_score: 1.0, severity_level: "CRITICAL", incident_tags: [], counts: { total_incidents: 0, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 } },
        drift_report: { drift_score: 1.0, drift_tags: [], counts: { total_drifts: 0 } },
        policy_findings: { policy_burden_score: 1.0, policy_tags: [] },
        connector_findings: { connector_flake_score: 1.0, connector_tags: [], failure_rate: 1.0 }
    }));
    // Stability=0, Policy=20, Budget=20, Connectors=0, Drift=40.
    // Weighted: 0 + 4 + 4 + 0 + 4 = 12.
    assert.strictEqual(res13.payload.health_score, 12);
    assert.strictEqual(res13.payload.health_category, "CRITICAL");
    console.log("PASS");

    // 14. High counts, low severity
    console.log("Test 14: High counts, low severity");
    const res14 = computeHealthScore(createEnvelope({
        incident_summary: {
            severity_score: 0.1,
            severity_level: "LOW",
            incident_tags: [],
            counts: { total_incidents: 1000, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 }
        }
    }));
    // Score depends on severity_score, not counts directly.
    // Stability = 100 - 10 = 90.
    // Weighted = 27 + 20 + 20 + 20 + 10 = 97.
    assert.strictEqual(res14.payload.health_score, 97);
    console.log("PASS");

    // 15. Tag overrides
    console.log("Test 15: Tag overrides");
    const res15 = computeHealthScore(createEnvelope({
        incident_summary: { severity_score: 0, severity_level: "NONE", incident_tags: ["CRITICAL_TAG"], counts: { total_incidents: 0, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 } },
        health_scoring_config: {
            version: "OVERRIDE_V1",
            dimension_weights: { stability: 1.0, policy: 0, budget: 0, connectors: 0, drift: 0 },
            category_thresholds: { good_min: 80, warn_min: 50, critical_min: 0 },
            penalties: { stability: { max_penalty: 100 }, policy: { max_penalty: 0 }, budget: { max_penalty: 0 }, connectors: { max_penalty: 0 }, drift: { max_penalty: 0 } },
            tag_dimension_overrides: {
                "CRITICAL_TAG": { dimension: "stability", severity: 1.0 }
            }
        }
    }));
    // Stability metric overridden to 1.0. Score = 0.
    assert.strictEqual(res15.payload.health_score, 0);
    console.log("PASS");

    // 16. Missing config (Default fallback)
    console.log("Test 16: Missing config");
    const res16 = computeHealthScore(createEnvelope({ health_scoring_config: null }));
    assert(res16.payload.health_tags.includes("HEALTH_CONFIG_MISSING"));
    assert.strictEqual(res16.payload.source.scoring_config_version, "DEFAULT_V1");
    console.log("PASS");

    // ========== GUARDS (2) ==========

    // 17. Regression Guard
    console.log("Test 17: Regression Guard");
    const fixture = createEnvelope({
        incident_summary: { severity_score: 0.5, severity_level: "MEDIUM", incident_tags: ["A"], counts: { total_incidents: 0, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 } }
    });
    const res17 = computeHealthScore(fixture);
    // Stability=50. Weighted=15 + 70 = 85.
    assert.strictEqual(res17.payload.health_score, 85);
    assert.strictEqual(res17.payload.health_category, "GOOD");
    console.log("PASS");

    // 18. Determinism Guard
    console.log("Test 18: Determinism Guard");
    const input18 = createEnvelope({ incident_summary: { severity_score: Math.random(), severity_level: "LOW", incident_tags: [], counts: { total_incidents: 0, validation_errors: 0, policy_blocks: 0, readiness_failures: 0, connector_failures: 0, drift_events: 0 } } });
    const run1 = computeHealthScore(input18);
    const run2 = computeHealthScore(input18);
    // Timestamps differ, compare payloads
    assert.deepStrictEqual(run1.payload, run2.payload);
    console.log("PASS");

    console.log("✅ All Phase 31 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
