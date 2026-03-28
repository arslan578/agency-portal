/**
 * Tests for Execution Replay Engine (Phase 29)
 */

const assert = require("assert");
const { buildExecutionReplayPlan } = require("../modules/execution_replay_engine");

// Store original NODE_ENV
const originalEnv = process.env.NODE_ENV;

async function runTests() {
    // Suppress observability output during tests
    process.env.NODE_ENV = 'test';

    console.log("Running Execution Replay Engine Tests...");

    // Deterministic timestamp for testing
    const fixedTimestamp = "2025-12-01T10:00:00.000Z";
    const timestampProvider = () => fixedTimestamp;

    // Helper to create minimal compatible snapshot
    function createSnapshot(overrides = {}) {
        return {
            snapshot_id: "snap_123",
            execution_id: "exec_1",
            run_id: "run_1",
            contract: {
                input_contract: "ExecutionSnapshotInput_v1",
                output_contract: "ExecutionSnapshot_v1",
                orchestrator_version: "1.0",
                schema_version: "1.0"
            },
            created_at: "2025-12-01T09:00:00.000Z",
            loop: {
                iteration_index: 0,
                max_iterations: 3,
                is_terminal_iteration: false,
                run_status: "SUCCESS",
                correction_action: "NO_ACTION",
                has_drift: false,
                termination_reason: null
            },
            ids: {
                campaign_id: "camp_1",
                brand_id: "brand_1"
            },
            artifacts: {},
            connector_responses: null,
            replay: {
                can_replay: true,
                replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
                replay_key: {
                    execution_id: "exec_1",
                    iteration_index: 0,
                    snapshot_id: "snap_123"
                },
                incompatibility_reason: null
            },
            observability: {
                trace_id: null,
                parent_span_id: null,
                span_name: "execution_snapshot_engine",
                metrics: {
                    snapshot_bytes: undefined,
                    artifacts_count: 0
                }
            },
            flags: {
                has_redactions: false,
                schema_compatible: true
            },
            ...overrides
        };
    }

    // ========== HAPPY PATH TESTS (6) ==========

    // Test 1: Minimal compatible snapshot -> READY
    console.log("\nTest 1: Minimal compatible snapshot -> READY");
    const input1 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot()
    };

    const res1 = buildExecutionReplayPlan(input1, { timestampProvider });
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.ok, true);
    assert.strictEqual(res1.payload.replay_status, "READY");
    assert.strictEqual(res1.payload.connector_replay_snapshot, null);
    assert.strictEqual(res1.payload.connectors.available.length, 0);
    assert.strictEqual(res1.payload.connectors.selected.length, 0);
    console.log("PASS");

    // Test 2: Snapshot with single connector, no filter
    console.log("\nTest 2: Snapshot with single connector, no filter");
    const input2 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: {
                        connector_key: "meta_ads",
                        ok: true,
                        status: "SUCCESS",
                        replay_source: "LIVE",
                        connector: "meta_ads",
                        request: {},
                        response: { raw: {}, normalized: {} },
                        error: null,
                        metrics: {},
                        logs: [],
                        execution_id: "exec_1",
                        started_at: "2025-12-01T09:00:00Z",
                        finished_at: "2025-12-01T09:00:01Z"
                    }
                }
            }
        })
    };

    const res2 = buildExecutionReplayPlan(input2, { timestampProvider });
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.replay_status, "READY");
    assert.deepStrictEqual(res2.payload.connectors.available, ["meta_ads"]);
    assert.deepStrictEqual(res2.payload.connectors.selected, ["meta_ads"]);
    assert.strictEqual(res2.payload.connector_replay_snapshot.replay_mode, "REPLAY");
    assert.ok(res2.payload.connector_replay_snapshot.connector_responses.meta_ads);
    console.log("PASS");

    // Test 3: Multiple connectors, include filter
    console.log("\nTest 3: Multiple connectors, include filter");
    const input3 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    google_ads: { connector_key: "google_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "google_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    tiktok_ads: { connector_key: "tiktok_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "tiktok_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        }),
        connector_filter: {
            include: ["meta_ads", "tiktok_ads"]
        }
    };

    const res3 = buildExecutionReplayPlan(input3, { timestampProvider });
    assert.strictEqual(res3.payload.connectors.available.length, 3);
    assert.deepStrictEqual(res3.payload.connectors.selected.sort(), ["meta_ads", "tiktok_ads"].sort());
    assert.ok(res3.payload.connector_replay_snapshot.connector_responses.meta_ads);
    assert.ok(res3.payload.connector_replay_snapshot.connector_responses.tiktok_ads);
    assert.strictEqual(res3.payload.connector_replay_snapshot.connector_responses.google_ads, undefined);
    console.log("PASS");

    // Test 4: Multiple connectors, exclude filter
    console.log("\nTest 4: Multiple connectors, exclude filter");
    const input4 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    google_ads: { connector_key: "google_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "google_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    tiktok_ads: { connector_key: "tiktok_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "tiktok_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        }),
        connector_filter: {
            exclude: ["google_ads"]
        }
    };

    const res4 = buildExecutionReplayPlan(input4, { timestampProvider });
    assert.deepStrictEqual(res4.payload.connectors.selected.sort(), ["meta_ads", "tiktok_ads"].sort());
    console.log("PASS");

    // Test 5: Include and exclude combined
    console.log("\nTest 5: Include and exclude combined");
    const input5 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    google_ads: { connector_key: "google_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "google_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    tiktok_ads: { connector_key: "tiktok_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "tiktok_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        }),
        connector_filter: {
            include: ["meta_ads", "google_ads"],
            exclude: ["google_ads"]
        }
    };

    const res5 = buildExecutionReplayPlan(input5, { timestampProvider });
    assert.deepStrictEqual(res5.payload.connectors.selected, ["meta_ads"]);
    console.log("PASS");

    // Test 6: READY with connector data and schema_compatible true
    console.log("\nTest 6: READY with connector data and schema_compatible true");
    const input6 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        })
    };

    const res6 = buildExecutionReplayPlan(input6, { timestampProvider });
    assert.strictEqual(res6.payload.replay_status, "READY");
    assert.strictEqual(res6.payload.ok, true);
    assert.ok(res6.payload.connector_replay_snapshot);
    console.log("PASS");

    // ========== NEGATIVE PATH TESTS (6) ==========

    // Test 7: Null input -> INVALID_INPUT
    console.log("\nTest 7: Null input -> INVALID_INPUT");
    const res7 = buildExecutionReplayPlan(null, { timestampProvider });
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 8: Missing intent -> INVALID_INPUT
    console.log("\nTest 8: Missing intent -> INVALID_INPUT");
    const input8 = {
        snapshot: createSnapshot()
    };
    const res8 = buildExecutionReplayPlan(input8, { timestampProvider });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 9: Missing snapshot -> INVALID_INPUT
    console.log("\nTest 9: Missing snapshot -> INVALID_INPUT");
    const input9 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1"
    };
    const res9 = buildExecutionReplayPlan(input9, { timestampProvider });
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 10: Schema incompatible snapshot
    console.log("\nTest 10: Schema incompatible snapshot");
    const input10 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            flags: {
                has_redactions: false,
                schema_compatible: false
            },
            replay: {
                can_replay: false,
                replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
                replay_key: { execution_id: "exec_1", iteration_index: 0, snapshot_id: "snap_123" },
                incompatibility_reason: "Schema version mismatch"
            }
        })
    };
    const res10 = buildExecutionReplayPlan(input10, { timestampProvider });
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.payload.replay_status, "INCOMPATIBLE");
    assert.ok(res10.payload.incompatibility_reason);
    console.log("PASS");

    // Test 11: Snapshot can_replay false
    console.log("\nTest 11: Snapshot can_replay false");
    const input11 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            replay: {
                can_replay: false,
                replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
                replay_key: { execution_id: "exec_1", iteration_index: 0, snapshot_id: "snap_123" },
                incompatibility_reason: "Missing required artifacts"
            }
        })
    };
    const res11 = buildExecutionReplayPlan(input11, { timestampProvider });
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.payload.replay_status, "INCOMPATIBLE");
    console.log("PASS");

    // Test 12: Required connector data missing
    console.log("\nTest 12: Required connector data missing with require_connector_responses true");
    const input12 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot(),
        options: {
            require_connector_responses: true
        }
    };
    const res12 = buildExecutionReplayPlan(input12, { timestampProvider });
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.payload.replay_status, "NO_CONNECTOR_DATA");
    console.log("PASS");

    // ========== EDGE CASES (4) ==========

    // Test 13: Empty connector_responses map
    console.log("\nTest 13: Empty connector_responses map");
    const input13 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {}
            }
        })
    };
    const res13 = buildExecutionReplayPlan(input13, { timestampProvider });
    assert.strictEqual(res13.payload.replay_status, "READY");
    assert.deepStrictEqual(res13.payload.connectors.available, []);
    assert.deepStrictEqual(res13.payload.connectors.selected, []);
    console.log("PASS");

    // Test 14: Connector filter includes non-existing key
    console.log("\nTest 14: Connector filter includes non-existing key");
    const input14 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        }),
        connector_filter: {
            include: ["meta_ads", "missing_connector"]
        }
    };
    const res14 = buildExecutionReplayPlan(input14, { timestampProvider });
    assert.deepStrictEqual(res14.payload.connectors.selected, ["meta_ads"]);
    console.log("PASS");

    // Test 15: Snapshot with drift and termination_reason preserved
    console.log("\nTest 15: Snapshot with drift and termination_reason preserved");
    const input15 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            loop: {
                iteration_index: 2,
                max_iterations: 3,
                is_terminal_iteration: true,
                run_status: "FAILED",
                correction_action: "ESCALATE",
                has_drift: true,
                termination_reason: "Max retries exceeded"
            }
        })
    };
    const res15 = buildExecutionReplayPlan(input15, { timestampProvider });
    assert.strictEqual(res15.payload.snapshot_meta.has_drift, true);
    assert.strictEqual(res15.payload.snapshot_meta.termination_reason, "Max retries exceeded");
    console.log("PASS");

    // Test 16: Null connector_filter and null options
    console.log("\nTest 16: Null connector_filter and null options");
    const input16 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot(),
        connector_filter: null,
        options: null
    };
    const res16 = buildExecutionReplayPlan(input16, { timestampProvider });
    assert.strictEqual(res16.ok, true);
    assert.strictEqual(res16.payload.replay_status, "READY");
    console.log("PASS");

    // ========== REGRESSION AND SHAPE GUARDS (4) ==========

    // Test 17: Regression guard - stable replay_key shape
    console.log("\nTest 17: Regression guard - stable replay_key shape");
    const fixtureSnapshot = createSnapshot();
    const input17 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: fixtureSnapshot
    };
    const res17 = buildExecutionReplayPlan(input17, { timestampProvider });
    const expectedReplayKey = {
        execution_id: "exec_1",
        iteration_index: 0,
        snapshot_id: "snap_123"
    };
    assert.deepStrictEqual(res17.payload.replay_key, expectedReplayKey);
    console.log("PASS");

    // Test 18: Regression guard - connector_replay_snapshot shape
    console.log("\nTest 18: Regression guard - connector_replay_snapshot shape");
    const input18 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" },
                    google_ads: { connector_key: "google_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "google_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        })
    };
    const res18 = buildExecutionReplayPlan(input18, { timestampProvider });
    assert.strictEqual(res18.payload.connector_replay_snapshot.replay_mode, "REPLAY");
    assert.ok(res18.payload.connector_replay_snapshot.connector_responses);
    assert.strictEqual(Object.keys(res18.payload.connector_replay_snapshot.connector_responses).length, 2);
    console.log("PASS");

    // Test 19: Determinism guard
    console.log("\nTest 19: Determinism guard");
    const input19 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        })
    };
    const run1 = buildExecutionReplayPlan(input19, { timestampProvider });
    const run2 = buildExecutionReplayPlan(input19, { timestampProvider });
    assert.strictEqual(JSON.stringify(run1.payload), JSON.stringify(run2.payload));
    console.log("PASS");

    // Test 20: Input immutability guard
    console.log("\nTest 20: Input immutability guard");
    const input20 = {
        intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
        snapshot: createSnapshot({
            connector_responses: {
                replay_mode: "LIVE",
                connector_responses: {
                    meta_ads: { connector_key: "meta_ads", ok: true, status: "SUCCESS", replay_source: "LIVE", connector: "meta_ads", request: {}, response: { raw: {}, normalized: {} }, error: null, metrics: {}, logs: [], execution_id: "exec_1", started_at: "2025-12-01T09:00:00Z", finished_at: "2025-12-01T09:00:01Z" }
                }
            }
        })
    };
    const originalJson = JSON.stringify(input20);
    buildExecutionReplayPlan(input20, { timestampProvider });
    assert.strictEqual(JSON.stringify(input20), originalJson);
    console.log("PASS");

    console.log("\n✅ All 20 Phase 29 tests passed.");

    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.env.NODE_ENV = originalEnv;
    process.exit(1);
});
