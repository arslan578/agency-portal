/**
 * Tests for Execution Incident & Drift Engine (Phase 30 - Hardened)
 */

const assert = require("assert");
const { analyzeIncident } = require("../modules/execution_incident_engine");

// Store original NODE_ENV
const originalEnv = process.env.NODE_ENV;

async function runTests() {
    // Suppress observability output during tests
    process.env.NODE_ENV = 'test';

    console.log("Running Execution Incident & Drift Engine Tests (Hardened)...");

    // Deterministic timestamp for testing
    const fixedTimestamp = "2025-11-29T12:30:00.000Z";
    const timestampProvider = () => fixedTimestamp;

    // Helper: Create a snapshot for testing
    function createTestSnapshot(execution_id, iteration_index, overrides = {}) {
        return {
            meta: {
                execution_id,
                iteration_index,
                created_at: new Date(Date.now() + iteration_index * 1000).toISOString(),
                run_status: overrides.run_status || "SUCCESS"
            },
            loop_state: {
                stats: {
                    total_budget: overrides.total_budget !== undefined ? overrides.total_budget : 1000,
                    venues: overrides.venues || [
                        { venue_key: "google", budget: 600, unit_count: 3 },
                        { venue_key: "meta", budget: 400, unit_count: 2 }
                    ]
                },
                readiness: {
                    summary: {
                        can_launch: overrides.can_launch ?? true,
                        global_status: overrides.readiness_status || "READY"
                    }
                },
                validation: {
                    is_valid: overrides.is_valid ?? true,
                    errors: overrides.validation_errors || []
                },
                policy: {
                    summary: {
                        is_policy_clean: overrides.is_policy_clean ?? true
                    },
                    issues: overrides.policy_issues || []
                },
                connector: {
                    responses: overrides.connector_responses
                },
                corrective_actions: {
                    applied: overrides.corrective_actions || []
                }
            }
        };
    }

    // ========== HAPPY PATH TESTS (6) ==========

    // Test 1: Single incident-free execution, clean success summary
    console.log("\nTest 1: Single incident-free execution, clean success summary");
    const input1 = {
        execution_id: "exec_1",
        snapshots: [
            createTestSnapshot("exec_1", 0),
            createTestSnapshot("exec_1", 1),
            createTestSnapshot("exec_1", 2)
        ]
    };

    const res1 = analyzeIncident(input1, { timestampProvider });
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.execution_id, "exec_1");
    assert.strictEqual(res1.payload.incident_summary.has_incident, false);
    assert.strictEqual(res1.payload.incident_summary.severity, "NONE");
    assert.strictEqual(res1.payload.incident_summary.iteration_count, 3);
    assert.strictEqual(res1.payload.training_view.label.outcome, "SUCCESS");
    console.log("PASS");

    // Test 2: Validation failure that recovers
    console.log("\nTest 2: Validation failure that recovers");
    const input2 = {
        execution_id: "exec_2",
        snapshots: [
            createTestSnapshot("exec_2", 0),
            createTestSnapshot("exec_2", 1, {
                validation_errors: [{ code: "BUDGET_MISSING" }],
                is_valid: false
            }),
            createTestSnapshot("exec_2", 2)  // Recovered
        ]
    };

    const res2 = analyzeIncident(input2, { timestampProvider });
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.incident_summary.has_incident, true);
    assert.strictEqual(res2.payload.incident_summary.first_failure_iteration, 1);
    assert.strictEqual(res2.payload.incident_summary.last_recovery_iteration, 2);
    assert(res2.payload.incident_summary.primary_cause_codes.includes("VALIDATION_ERROR"));
    assert.strictEqual(res2.payload.training_view.label.outcome, "RECOVERED");
    console.log("PASS");

    // Test 3: Policy failure that does not recover
    console.log("\nTest 3: Policy failure that does not recover");
    const input3 = {
        execution_id: "exec_3",
        snapshots: [
            createTestSnapshot("exec_3", 0),
            createTestSnapshot("exec_3", 1, {
                policy_issues: [{ code: "BUDGET_EXCEEDED", level: "ERROR" }],
                is_policy_clean: false,
                run_status: "FAILED"
            }),
            createTestSnapshot("exec_3", 2, {
                policy_issues: [{ code: "BUDGET_EXCEEDED", level: "ERROR" }],
                is_policy_clean: false,
                run_status: "FAILED"
            })
        ]
    };

    const res3 = analyzeIncident(input3, { timestampProvider });
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.incident_summary.has_incident, true);
    assert.strictEqual(res3.payload.incident_summary.severity, "HIGH");  // Failed at end
    assert(res3.payload.incident_summary.primary_cause_codes.includes("POLICY_ERROR"));
    assert.strictEqual(res3.payload.training_view.label.outcome, "FAILED");
    console.log("PASS");

    // Test 4: Connector responses missing mid-run
    console.log("\nTest 4: Connector responses missing mid-run");
    const input4 = {
        execution_id: "exec_4",
        snapshots: [
            createTestSnapshot("exec_4", 0, { connector_responses: { data: "present" } }),
            createTestSnapshot("exec_4", 1, { connector_responses: null }),  // Missing
            createTestSnapshot("exec_4", 2, { connector_responses: { data: "present" } })  // Returns
        ]
    };

    const res4 = analyzeIncident(input4, { timestampProvider });
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload.incident_summary.has_incident, true);
    assert(res4.payload.incident_summary.primary_cause_codes.includes("CONNECTOR_FAILURE"));
    const connector_event = res4.payload.timeline.find(e => e.event_code === "CONNECTOR_RESPONSE_MISSING");
    assert(connector_event);
    assert.strictEqual(connector_event.iteration_index, 1);
    console.log("PASS");

    // Test 5: Corrective actions resolving issue
    console.log("\nTest 5: Corrective actions resolving issue");
    const input5 = {
        execution_id: "exec_5",
        snapshots: [
            createTestSnapshot("exec_5", 0, { run_status: "FAILED" }),
            createTestSnapshot("exec_5", 1, {
                corrective_actions: [{ code: "RETRY_CONNECTOR" }]
            }),
            createTestSnapshot("exec_5", 2, { run_status: "SUCCESS" })
        ]
    };

    const res5 = analyzeIncident(input5, { timestampProvider });
    assert.strictEqual(res5.ok, true);
    const corrective_event = res5.payload.timeline.find(e => e.event_code === "CORRECTIVE_ACTION_APPLIED");
    assert(corrective_event);
    assert.strictEqual(corrective_event.iteration_index, 1);
    assert.strictEqual(res5.payload.training_view.features.had_corrective_actions, true);
    console.log("PASS");

    // Test 6: Drift detection with thresholds
    console.log("\nTest 6: Drift detection with thresholds");
    const input6 = {
        execution_id: "exec_6",
        snapshots: [
            createTestSnapshot("exec_6", 0, { total_budget: 1000 }),
            createTestSnapshot("exec_6", 1, { total_budget: 1100 }),  // 10% increase
            createTestSnapshot("exec_6", 2, { total_budget: 1300 })   // 30% increase from baseline
        ],
        config: {
            drift_thresholds: {
                max_budget_rel_delta: 0.15  // 15%
            }
        }
    };

    const res6 = analyzeIncident(input6, { timestampProvider });
    assert.strictEqual(res6.ok, true);
    assert(res6.payload.drift_report.drift_vectors.length > 0);
    const high_drift = res6.payload.drift_report.drift_vectors.find(v => v.drift_severity === "HIGH");
    assert(high_drift, "Should detect HIGH drift for 30% budget increase");
    console.log("PASS");

    // ========== NEGATIVE PATH TESTS (6) ==========

    // Test 7: Missing execution_id
    console.log("\nTest 7: Missing execution_id");
    const input7 = {
        snapshots: [createTestSnapshot("exec_7", 0)]
    };

    const res7 = analyzeIncident(input7, { timestampProvider });
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "INVALID_INPUT");
    assert(res7.error.message.includes("execution_id"));
    console.log("PASS");

    // Test 8: Empty snapshots array
    console.log("\nTest 8: Empty snapshots array");
    const input8 = {
        execution_id: "exec_8",
        snapshots: []
    };

    const res8 = analyzeIncident(input8, { timestampProvider });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INSUFFICIENT_SNAPSHOTS");
    console.log("PASS");

    // Test 9: Mixed execution_ids
    console.log("\nTest 9: Mixed execution_ids");
    const input9 = {
        execution_id: "exec_9",
        snapshots: [
            createTestSnapshot("exec_9", 0),
            createTestSnapshot("exec_different", 1),  // Mismatched
            createTestSnapshot("exec_9", 2)
        ]
    };

    const res9 = analyzeIncident(input9, { timestampProvider });
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "EXECUTION_ID_MISMATCH");
    console.log("PASS");

    // Test 10: Duplicate iteration indices (can't be fixed by sorting)
    console.log("\nTest 10: Duplicate iteration indices");
    const input10 = {
        execution_id: "exec_10",
        snapshots: [
            createTestSnapshot("exec_10", 0),
            createTestSnapshot("exec_10", 1),
            createTestSnapshot("exec_10", 1)  // Duplicate - 2nd one will be dropped by dedupe
        ]
    };

    const res10 = analyzeIncident(input10, { timestampProvider });
    // Should succeed but only have 2 iterations after deduplication
    assert.strictEqual(res10.ok, true);
    assert.strictEqual(res10.payload.incident_summary.iteration_count, 2);
    console.log("PASS");

    // Test 11: Invalid snapshot shapes (graceful skip)
    console.log("\nTest 11: Invalid snapshot shapes (graceful skip)");
    const input11 = {
        execution_id: "exec_11",
        snapshots: [
            null,  // Invalid
            createTestSnapshot("exec_11", 0),
            { bad: "snapshot" },  // Missing meta
            createTestSnapshot("exec_11", 1),
            undefined  // Invalid
        ]
    };

    const res11 = analyzeIncident(input11, { timestampProvider });
    assert.strictEqual(res11.ok, true);  // Should process valid ones
    assert.strictEqual(res11.payload.incident_summary.iteration_count, 2);
    console.log("PASS");

    // Test 12: Feature flag disabled
    console.log("\nTest 12: Feature flag disabled");
    const originalFlag = process.env.FF_EXECUTION_INCIDENT_V1;
    process.env.FF_EXECUTION_INCIDENT_V1 = "false";

    const dispatcher = require("../dispatcher");
    const res12 = await dispatcher({
        type: "EXECUTION_INCIDENT_V1",
        payload: {}
    });

    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.error.code, "FEATURE_DISABLED");

    process.env.FF_EXECUTION_INCIDENT_V1 = originalFlag;
    console.log("PASS");

    // ========== EDGE CASE TESTS (4) ==========

    // Test 13: Single snapshot (no drift)
    console.log("\nTest 13: Single snapshot (no drift)");
    const input13 = {
        execution_id: "exec_13",
        snapshots: [createTestSnapshot("exec_13", 0)]
    };

    const res13 = analyzeIncident(input13, { timestampProvider });
    assert.strictEqual(res13.ok, true);
    assert.strictEqual(res13.payload.drift_report.drift_vectors.length, 0);  // No drift with single snapshot
    assert.strictEqual(res13.payload.incident_summary.iteration_count, 1);
    console.log("PASS");

    // Test 14: Many events (timeline truncation)
    console.log("\nTest 14: Many events (timeline truncation)");
    const many_snapshots = [];
    for (let i = 0; i < 50; i++) {
        many_snapshots.push(createTestSnapshot("exec_14", i, {
            run_status: i % 3 === 0 ? "FAILED" : "SUCCESS"  // Status changes create events
        }));
    }

    const input14 = {
        execution_id: "exec_14",
        snapshots: many_snapshots,
        config: {
            max_timeline_events: 20
        }
    };

    const res14 = analyzeIncident(input14, { timestampProvider });
    assert.strictEqual(res14.ok, true);
    assert(res14.payload.timeline.length <= 21);  // 20 + 1 truncation event
    const truncation_event = res14.payload.timeline.find(e => e.event_code === "TIMELINE_TRUNCATED");
    assert(truncation_event, "Should have truncation event");
    console.log("PASS");

    // Test 15: No stats (incident detection still works)
    console.log("\nTest 15: No stats (incident detection still works)");
    const input15 = {
        execution_id: "exec_15",
        snapshots: [
            {
                meta: { execution_id: "exec_15", iteration_index: 0, created_at: "2025-11-29T12:00:00Z" },
                loop_state: {
                    // No stats
                    validation: {
                        is_valid: false,
                        errors: [{ code: "MISSING_DATA" }]
                    }
                }
            },
            {
                meta: { execution_id: "exec_15", iteration_index: 1, created_at: "2025-11-29T12:01:00Z" },
                loop_state: {
                    validation: {
                        is_valid: true,
                        errors: []
                    }
                }
            }
        ]
    };

    const res15 = analyzeIncident(input15, { timestampProvider });
    assert.strictEqual(res15.ok, true);
    assert.strictEqual(res15.payload.incident_summary.has_incident, true);
    assert(res15.payload.incident_summary.primary_cause_codes.includes("VALIDATION_ERROR"));
    console.log("PASS");

    // Test 16: Empty replay results (ignored gracefully)
    console.log("\nTest 16: Empty replay results (ignored gracefully)");
    const input16 = {
        execution_id: "exec_16",
        snapshots: [
            createTestSnapshot("exec_16", 0),
            createTestSnapshot("exec_16", 1)
        ],
        replay_results: []  // Empty array, should be ignored
    };

    const res16 = analyzeIncident(input16, { timestampProvider });
    assert.strictEqual(res16.ok, true);
    assert.strictEqual(res16.payload.incident_summary.iteration_count, 2);
    console.log("PASS");

    // ========== REGRESSION GUARD (1) ==========

    // Test 17: Regression guard - canonical fixture comparison
    console.log("\nTest 17: Regression guard - canonical fixture comparison");
    const fixture_input = {
        execution_id: "fixture_exec",
        snapshots: [
            createTestSnapshot("fixture_exec", 0, { total_budget: 1000 }),
            createTestSnapshot("fixture_exec", 1, {
                total_budget: 1200,
                validation_errors: [{ code: "MISSING_FIELD" }],
                is_valid: false
            }),
            createTestSnapshot("fixture_exec", 2, { total_budget: 1200 })
        ]
    };

    const fixture_result = analyzeIncident(fixture_input, { timestampProvider });

    // Lock in key structure
    assert.strictEqual(fixture_result.ok, true);
    assert.strictEqual(fixture_result.payload.execution_id, "fixture_exec");
    assert.strictEqual(fixture_result.payload.incident_summary.iteration_count, 3);
    assert.strictEqual(fixture_result.payload.incident_summary.has_incident, true);
    assert.strictEqual(fixture_result.payload.incident_summary.first_failure_iteration, 1);
    assert.strictEqual(fixture_result.payload.incident_summary.last_recovery_iteration, 2);
    assert(fixture_result.payload.drift_report.drift_vectors.length > 0);
    assert.strictEqual(fixture_result.payload.training_view.features.iteration_count, 3);
    assert.strictEqual(fixture_result.payload.training_view.label.outcome, "RECOVERED");
    console.log("PASS");

    // ========== DETERMINISM GUARD (1) ==========

    // Test 18: Determinism guard - unsorted input produces identical output
    console.log("\nTest 18: Determinism guard - unsorted input produces identical output");
    const unsorted_snapshots = [
        createTestSnapshot("deterministic_exec", 2, { total_budget: 1500 }),
        createTestSnapshot("deterministic_exec", 0, { total_budget: 1000 }),
        createTestSnapshot("deterministic_exec", 1, { total_budget: 1200 })
    ];

    const deterministic_input = {
        execution_id: "deterministic_exec",
        snapshots: [...unsorted_snapshots]  // Copy array
    };

    const run1 = analyzeIncident(deterministic_input, { timestampProvider });

    // Run again with same unsorted input
    const run2 = analyzeIncident({
        execution_id: "deterministic_exec",
        snapshots: [...unsorted_snapshots]
    }, { timestampProvider });

    assert.strictEqual(run1.ok, true);
    assert.strictEqual(run2.ok, true);
    assert.strictEqual(JSON.stringify(run1.payload), JSON.stringify(run2.payload));
    console.log("PASS");

    // ========== HARDENING TESTS (2) ==========

    // Test 19: Missing stats + drift thresholds → stable UNKNOWN severity
    console.log("\nTest 19: Missing stats + drift thresholds → stable UNKNOWN severity");
    const input19 = {
        execution_id: "exec_19",
        snapshots: [
            createTestSnapshot("exec_19", 0, { total_budget: null }), // Missing budget
            createTestSnapshot("exec_19", 1, { total_budget: null })
        ],
        config: {
            drift_thresholds: { max_budget_rel_delta: 0.15 }
        }
    };

    const res19 = analyzeIncident(input19, { timestampProvider });
    assert.strictEqual(res19.ok, true);
    const drift_vector = res19.payload.drift_report.drift_vectors[0];
    assert.strictEqual(drift_vector.drift_severity, "UNKNOWN"); // Should be UNKNOWN, not error
    console.log("PASS");

    // Test 20: Mixed severity incidents → correct highest-severity resolution
    console.log("\nTest 20: Mixed severity incidents → correct highest-severity resolution");
    const input20 = {
        execution_id: "exec_20",
        snapshots: [
            createTestSnapshot("exec_20", 0),
            createTestSnapshot("exec_20", 1, {
                // Warning level issue
                readiness_status: "BLOCKED",
                can_launch: false
            }),
            createTestSnapshot("exec_20", 2, {
                // Error level issue
                validation_errors: [{ code: "CRITICAL_ERROR" }],
                is_valid: false,
                run_status: "FAILED"
            })
        ]
    };

    const res20 = analyzeIncident(input20, { timestampProvider });
    assert.strictEqual(res20.ok, true);
    assert.strictEqual(res20.payload.incident_summary.has_incident, true);
    assert.strictEqual(res20.payload.incident_summary.severity, "HIGH"); // Should escalate to HIGH

    // Verify timeline has both WARNING and ERROR events
    const has_warning = res20.payload.timeline.some(e => e.severity === "WARNING");
    const has_error = res20.payload.timeline.some(e => e.severity === "ERROR");
    assert.strictEqual(has_warning, true);
    assert.strictEqual(has_error, true);
    console.log("PASS");

    console.log("\n✅ All 20 Phase 30 tests passed.");

    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.env.NODE_ENV = originalEnv;
    process.exit(1);
});
