/**
 * Tests for Execution Snapshot Engine (Phase 28)
 */

const assert = require("assert");
const { buildExecutionSnapshot } = require("../modules/execution_snapshot_engine");

// Store original NODE_ENV
const originalEnv = process.env.NODE_ENV;

async function runTests() {
    // Suppress observability output during tests
    process.env.NODE_ENV = 'test';

    console.log("Running Execution Snapshot Engine Tests...");

    // Deterministic timestamp for testing
    const fixedTimestamp = "2025-11-29T10:00:00.000Z";
    const timestampProvider = () => fixedTimestamp;

    // ========== HAPPY PATH TESTS (6) ==========

    // Test 1: Minimal input - required fields only
    console.log("\nTest 1: Minimal input - required fields only");
    const input1 = {
        execution_id: "exec_1",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res1 = buildExecutionSnapshot(input1, { timestampProvider });
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.module, "execution_snapshot_engine");
    assert.strictEqual(res1.payload.execution_id, "exec_1");
    assert.strictEqual(res1.payload.loop.iteration_index, 0);
    assert.strictEqual(res1.payload.loop.is_terminal_iteration, false);
    assert.strictEqual(res1.payload.observability.metrics.artifacts_count, 0);
    assert.strictEqual(res1.payload.flags.has_redactions, false);
    assert.strictEqual(res1.payload.flags.schema_compatible, true);
    assert.strictEqual(res1.payload.replay.can_replay, true);
    assert.strictEqual(res1.payload.replay.incompatibility_reason, null);
    console.log("PASS");

    // Test 2: Full artifacts
    console.log("\nTest 2: Full artifacts - all artifact fields populated");
    const input2 = {
        execution_id: "exec_2",
        run_id: "run_2",
        campaign_id: "camp_2",
        brand_id: "brand_2",
        iteration_index: 1,
        max_iterations: 5,
        loop_status: {
            run_status: "PARTIAL",
            correction_action: "RETRY_CONNECTORS",
            has_drift: false
        },
        artifacts: {
            venue_execution_plan: { plan: "data" },
            execution_indexed_plan: { indexed: true },
            readiness_envelope: { ready: true },
            serialized_plan_envelope: { serialized: true },
            connector_contracts_envelope: { contracts: [] },
            connector_requests_envelope: { requests: [] },
            connector_io_envelope: { io: "data" }
        },
        observability: {
            trace_id: "trace_123",
            parent_span_id: "span_456"
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1",
            orchestrator_version: "2025.11.29",
            schema_version: "1.0"
        }
    };

    const res2 = buildExecutionSnapshot(input2, { timestampProvider });
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.observability.metrics.artifacts_count, 7);
    assert.strictEqual(res2.payload.contract.orchestrator_version, "2025.11.29");
    assert.strictEqual(res2.payload.observability.trace_id, "trace_123");
    assert.strictEqual(res2.payload.ids.campaign_id, "camp_2");
    assert.strictEqual(res2.payload.ids.brand_id, "brand_2");
    console.log("PASS");

    // Test 3: Terminal iteration
    console.log("\nTest 3: Terminal iteration");
    const input3 = {
        execution_id: "exec_3",
        iteration_index: 4,
        max_iterations: 5,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res3 = buildExecutionSnapshot(input3, { timestampProvider });
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.loop.is_terminal_iteration, true);
    console.log("PASS");

    // Test 4: With drift
    console.log("\nTest 4: With drift");
    const input4 = {
        execution_id: "exec_4",
        iteration_index: 2,
        max_iterations: 5,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "ADJUST_BUDGETS",
            has_drift: true
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res4 = buildExecutionSnapshot(input4, { timestampProvider });
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload.loop.has_drift, true);
    assert.strictEqual(res4.payload.loop.correction_action, "ADJUST_BUDGETS");
    assert.strictEqual(res4.payload.replay.can_replay, true);
    console.log("PASS");

    // Test 5: With termination reason
    console.log("\nTest 5: With termination reason");
    const input5 = {
        execution_id: "exec_5",
        iteration_index: 5,
        max_iterations: 5,
        loop_status: {
            run_status: "FAILED",
            correction_action: "ESCALATE",
            has_drift: false,
            termination_reason: "Max iterations reached with persistent failures"
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res5 = buildExecutionSnapshot(input5, { timestampProvider });
    assert.strictEqual(res5.ok, true);
    assert.strictEqual(res5.payload.loop.termination_reason, "Max iterations reached with persistent failures");
    assert.strictEqual(res5.payload.loop.is_terminal_iteration, true);
    console.log("PASS");

    // Test 6: Secret redactions
    console.log("\nTest 6: Secret redactions");
    const input6 = {
        execution_id: "exec_6",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        artifacts: {
            connector_io_envelope: {
                venue_1: {
                    auth: {
                        access_token: "secret_token_123",
                        refresh_token: "refresh_456"
                    },
                    config: {
                        api_key: "api_secret_789",
                        client_secret: "client_xyz"
                    }
                }
            }
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res6 = buildExecutionSnapshot(input6, { timestampProvider });
    assert.strictEqual(res6.ok, true);
    assert.strictEqual(res6.payload.flags.has_redactions, true);
    assert.strictEqual(res6.payload.artifacts.connector_io_envelope.venue_1.auth.access_token, "REDACTED");
    assert.strictEqual(res6.payload.artifacts.connector_io_envelope.venue_1.auth.refresh_token, "REDACTED");
    assert.strictEqual(res6.payload.artifacts.connector_io_envelope.venue_1.config.api_key, "REDACTED");
    assert.strictEqual(res6.payload.artifacts.connector_io_envelope.venue_1.config.client_secret, "REDACTED");
    console.log("PASS");

    // ========== NEGATIVE PATH TESTS (6) ==========

    // Test 7: Missing execution_id
    console.log("\nTest 7: Missing execution_id");
    const input7 = {
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res7 = buildExecutionSnapshot(input7, { timestampProvider });
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "INVALID_INPUT");
    assert.strictEqual(res7.payload, null);
    console.log("PASS");

    // Test 8: Negative iteration_index
    console.log("\nTest 8: Negative iteration_index");
    const input8 = {
        execution_id: "exec_8",
        iteration_index: -1,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res8 = buildExecutionSnapshot(input8, { timestampProvider });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 9: Zero max_iterations
    console.log("\nTest 9: Zero max_iterations");
    const input9 = {
        execution_id: "exec_9",
        iteration_index: 0,
        max_iterations: 0,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res9 = buildExecutionSnapshot(input9, { timestampProvider });
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 10: Invalid run_status
    console.log("\nTest 10: Invalid run_status");
    const input10 = {
        execution_id: "exec_10",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "BROKEN",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res10 = buildExecutionSnapshot(input10, { timestampProvider });
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 11: Forbidden top-level secret
    console.log("\nTest 11: Forbidden top-level secret");
    const input11 = {
        execution_id: "exec_11",
        iteration_index: 0,
        max_iterations: 3,
        access_token: "should_not_be_here",
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res11 = buildExecutionSnapshot(input11, { timestampProvider });
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.error.code, "INVALID_INPUT");
    assert(res11.error.message.includes("access_token"));
    console.log("PASS");

    // Test 12: Null loop_status
    console.log("\nTest 12: Null loop_status");
    const input12 = {
        execution_id: "exec_12",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: null,
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res12 = buildExecutionSnapshot(input12, { timestampProvider });
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.error.code, "INVALID_INPUT");
    console.log("PASS");

    // ========== EDGE CASE TESTS (4) ==========

    // Test 13: Huge artifacts immutability check
    console.log("\nTest 13: Complex artifacts immutability check");
    const complexArtifact = {
        nested: {
            deeply: {
                nested: {
                    access_token: "secret",
                    data: [1, 2, 3]
                }
            }
        }
    };
    const input13 = {
        execution_id: "exec_13",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        artifacts: {
            connector_io_envelope: complexArtifact
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const originalJson = JSON.stringify(input13);
    const res13 = buildExecutionSnapshot(input13, { timestampProvider });
    assert.strictEqual(res13.ok, true);
    assert.strictEqual(JSON.stringify(input13), originalJson); // Input unchanged
    assert.strictEqual(res13.payload.artifacts.connector_io_envelope.nested.deeply.nested.access_token, "REDACTED");
    assert.strictEqual(complexArtifact.nested.deeply.nested.access_token, "secret"); // Original unchanged
    console.log("PASS");

    // Test 14: Null observability
    console.log("\nTest 14: Null observability");
    const input14 = {
        execution_id: "exec_14",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        observability: null,
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res14 = buildExecutionSnapshot(input14, { timestampProvider });
    assert.strictEqual(res14.ok, true);
    assert.strictEqual(res14.payload.observability.trace_id, null);
    assert.strictEqual(res14.payload.observability.parent_span_id, null);
    assert.strictEqual(res14.payload.observability.span_name, "execution_snapshot_engine");
    console.log("PASS");

    // Test 15: Missing meta.extra
    console.log("\nTest 15: Missing meta.extra");
    const input15 = {
        execution_id: "exec_15",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
            // no extra field
        }
    };

    const res15 = buildExecutionSnapshot(input15, { timestampProvider });
    assert.strictEqual(res15.ok, true);
    console.log("PASS");

    // Test 16: Input contract version mismatch
    console.log("\nTest 16: Input contract version mismatch");
    const input16 = {
        execution_id: "exec_16",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v0"
        }
    };

    const res16 = buildExecutionSnapshot(input16, { timestampProvider });
    assert.strictEqual(res16.ok, true);
    assert.strictEqual(res16.payload.flags.schema_compatible, false);
    assert.strictEqual(res16.payload.replay.can_replay, false);
    assert(res16.payload.replay.incompatibility_reason.includes("mismatch"));
    console.log("PASS");

    // ========== REGRESSION GUARD (1) ==========

    // Test 17: Regression guard - fixture comparison
    console.log("\nTest 17: Regression guard - fixture comparison");
    const fixtureInput = {
        execution_id: "fixture_exec",
        run_id: "fixture_run",
        campaign_id: "fixture_camp",
        brand_id: "fixture_brand",
        iteration_index: 1,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false,
            termination_reason: null
        },
        artifacts: {
            venue_execution_plan: { test: "data" }
        },
        observability: {
            trace_id: "fixture_trace",
            parent_span_id: "fixture_span"
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1",
            orchestrator_version: "1.0.0"
        }
    };

    const expectedFixture = {
        snapshot_id: "20d6942c71184b810ef5aab175b19e9e",
        execution_id: "fixture_exec",
        run_id: "fixture_run",
        contract: {
            input_contract: "ExecutionSnapshotInput_v1",
            output_contract: "ExecutionSnapshot_v1",
            orchestrator_version: "1.0.0",
            schema_version: null
        },
        created_at: fixedTimestamp,
        loop: {
            iteration_index: 1,
            max_iterations: 3,
            is_terminal_iteration: false,
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false,
            termination_reason: null
        },
        ids: {
            campaign_id: "fixture_camp",
            brand_id: "fixture_brand"
        },
        artifacts: {
            venue_execution_plan: { test: "data" }
        },
        connector_responses: null,
        replay: {
            can_replay: true,
            replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
            replay_key: {
                execution_id: "fixture_exec",
                iteration_index: 1,
                snapshot_id: "20d6942c71184b810ef5aab175b19e9e"
            },
            incompatibility_reason: null
        },
        observability: {
            trace_id: "fixture_trace",
            parent_span_id: "fixture_span",
            span_name: "execution_snapshot_engine",
            metrics: {
                snapshot_bytes: undefined,
                artifacts_count: 1
            }
        },
        flags: {
            has_redactions: false,
            schema_compatible: true
        }
    };

    const res17 = buildExecutionSnapshot(fixtureInput, { timestampProvider });
    assert.strictEqual(res17.ok, true);
    assert.deepStrictEqual(res17.payload, expectedFixture);
    console.log("PASS");

    // Test 19: Connector Responses Handling (Phase 46 Integration)
    console.log("\nTest 19: Connector Responses Handling - Full V1 Object Preservation");
    const validConnectorResult = {
        connector_key: "meta_ads",
        ok: true,
        status: "SUCCESS",
        replay_source: "LIVE",
        connector: "meta_ads",
        request: { id: "req1" },
        response: { raw: {}, normalized: { id: "123" } },
        error: null,
        metrics: { duration_ms: 100 },
        logs: ["log1"],
        execution_id: "exec_conn",
        started_at: "2025-01-01T00:00:00Z",
        finished_at: "2025-01-01T00:00:01Z"
    };

    const connectorInput = {
        execution_id: "exec_conn",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: {
            run_status: "SUCCESS",
            correction_action: "NO_ACTION",
            has_drift: false
        },
        artifacts: {
            connector_responses_envelope: {
                connector_execution_router: {
                    summary: { total: 1 },
                    results: [validConnectorResult]
                }
            }
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const res19 = buildExecutionSnapshot(connectorInput, { timestampProvider });
    assert.strictEqual(res19.ok, true);
    assert.ok(res19.payload.connector_responses, "connector_responses field should exist");

    const metaResult = res19.payload.connector_responses.connector_responses["meta_ads"];
    assert.ok(metaResult, "meta_ads result should exist");
    assert.strictEqual(metaResult.status, "SUCCESS");
    assert.deepStrictEqual(metaResult.metrics, { duration_ms: 100 });
    assert.deepStrictEqual(metaResult.logs, ["log1"]);
    console.log("PASS");

    // Test 20: Reject malformed connector results
    console.log("\nTest 20: Reject malformed connector results");
    const malformedResult = {
        connector_key: "bad_connector",
        status: "SUCCESS"
        // Missing required fields: ok, replay_source, connector, request, response, etc.
    };

    const malformedInput = {
        execution_id: "exec_malformed",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: { run_status: "SUCCESS", correction_action: "NO_ACTION", has_drift: false },
        artifacts: {
            connector_responses_envelope: {
                connector_execution_router: {
                    results: [malformedResult]
                }
            }
        },
        meta: { input_contract_version: "ExecutionSnapshotInput_v1" }
    };

    const res20 = buildExecutionSnapshot(malformedInput, { timestampProvider });
    assert.strictEqual(res20.ok, true);
    assert.ok(res20.payload.connector_responses);
    assert.strictEqual(res20.payload.connector_responses.connector_responses["bad_connector"], undefined, "Malformed result should be rejected");
    console.log("PASS");

    // Test 21: Observability normalization
    console.log("\nTest 21: Observability normalization");
    const nullObsInput = {
        execution_id: "exec_obs",
        iteration_index: 0,
        max_iterations: 3,
        loop_status: { run_status: "SUCCESS", correction_action: "NO_ACTION", has_drift: false },
        observability: null,
        meta: { input_contract_version: "ExecutionSnapshotInput_v1" }
    };

    const res21 = buildExecutionSnapshot(nullObsInput, { timestampProvider });
    assert.strictEqual(res21.ok, true);
    assert.strictEqual(res21.payload.observability.trace_id, null);
    assert.strictEqual(res21.payload.observability.parent_span_id, null);
    // Ensure no undefined
    assert.ok("trace_id" in res21.payload.observability);
    assert.ok("parent_span_id" in res21.payload.observability);
    console.log("PASS");

    // ========== DETERMINISM GUARD (1) ==========

    // Test 22: Determinism guard
    console.log("\nTest 22: Determinism guard - identical inputs produce identical outputs");
    const deterministicInput = {
        execution_id: "deterministic_exec",
        iteration_index: 2,
        max_iterations: 5,
        loop_status: {
            run_status: "PARTIAL",
            correction_action: "RETRY_CONNECTORS",
            has_drift: true
        },
        artifacts: {
            connector_io_envelope: { data: "test" }
        },
        meta: {
            input_contract_version: "ExecutionSnapshotInput_v1"
        }
    };

    const run1 = buildExecutionSnapshot(deterministicInput, { timestampProvider });
    const run2 = buildExecutionSnapshot(deterministicInput, { timestampProvider });

    assert.strictEqual(run1.ok, true);
    assert.strictEqual(run2.ok, true);
    assert.strictEqual(JSON.stringify(run1), JSON.stringify(run2));
    console.log("PASS");

    console.log("\n✅ All 22 Phase 28 tests passed.");

    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.env.NODE_ENV = originalEnv;
    process.exit(1);
});
