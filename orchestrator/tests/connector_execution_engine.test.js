/**
 * Tests for Connector Execution Engine (Phase 47 v3)
 */

const assert = require("assert");
const { executeConnector } = require("../modules/connector_execution_engine");

// Store original NODE_ENV
const originalEnv = process.env.NODE_ENV;

async function runTests() {
    // Suppress observability output during tests
    process.env.NODE_ENV = 'test';

    console.log("Running Connector Execution Engine Tests...");

    // Deterministic timestamp for testing
    const fixedTimestamp = "2025-12-01T22:00:00.000Z";
    const timestampProvider = () => fixedTimestamp;
    const now = () => "2025-12-01T22:00:00.000Z";
    const hrtimeStart = 1000;
    let hrtimeCalls = 0;
    const hrtime = () => { hrtimeCalls++; return hrtimeStart + (hrtimeCalls * 100); };

    // Helper to create minimal LIVE input
    function createLiveInput(overrides = {}) {
        return {
            mode: "LIVE",
            connector_key: "meta_ads",
            execution_id: "exec_1",
            iteration_index: 0,
            request: {
                raw_request: { action: "create_campaign" },
                normalized_request: { name: "Test Campaign" }
            },
            meta: {
                input_contract_version: "Phase47ConnectorInputV1",
                schema_version: "1.0",
                orchestrator_version: "2025.12.01"
            },
            ...overrides
        };
    }

    // Helper to create minimal REPLAY input
    function createReplayInput(overrides = {}) {
        return {
            mode: "REPLAY",
            connector_key: "meta_ads",
            execution_id: "exec_1",
            iteration_index: 0,
            replay_snapshot: {
                replay_mode: "REPLAY",
                connector_responses: {
                    meta_ads: {
                        ok: true,
                        connector_key: "meta_ads",
                        execution_id: "exec_1",
                        mode: "LIVE",
                        replay_source: "LIVE_EXECUTION",
                        status: "SUCCESS",
                        connector: "meta_ads",
                        request: { raw: { action: "create" }, normalized: { name: "Test" } },
                        response: { raw: { id: "123" }, normalized: { campaign_id: "123" } },
                        error: { code: null, message: null },
                        metrics: { duration_ms: 100, started_at: "2025-12-01T21:00:00Z", finished_at: "2025-12-01T21:00:01Z" },
                        logs: ["log1", "log2"],
                        started_at: "2025-12-01T21:00:00Z",
                        finished_at: "2025-12-01T21:00:01Z"
                    }
                }
            },
            meta: {
                input_contract_version: "Phase47ConnectorInputV1"
            },
            ...overrides
        };
    }

    // ========== HAPPY PATH TESTS (6) ==========

    // Test 1: Minimal LIVE input executes stub
    console.log("\nTest 1: Minimal LIVE input executes stub");
    hrtimeCalls = 0;
    const input1 = createLiveInput();
    const res1 = executeConnector(input1, { timestampProvider, now, hrtime });
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.mode, "LIVE");
    assert.strictEqual(res1.payload.replay_source, "LIVE_EXECUTION");
    assert.strictEqual(res1.payload.ok, true);
    assert.strictEqual(res1.payload.status, "SUCCESS");
    assert.strictEqual(res1.payload.connector, "meta_ads");
    assert.strictEqual(res1.payload.connector_key, "meta_ads");
    assert.strictEqual(res1.payload.response.raw, null); // Default stub
    assert.strictEqual(res1.payload.response.normalized, null);
    console.log("PASS");

    // Test 2: LIVE input with provided executor returns deterministic output
    console.log("\nTest 2: LIVE input with provided executor returns deterministic output");
    hrtimeCalls = 0;
    const customExecutor = (req) => ({ raw: { status: "created" }, normalized: { id: "campaign_123" } });
    const input2 = createLiveInput();
    const res2 = executeConnector(input2, { timestampProvider, now, hrtime, executor: customExecutor });
    assert.strictEqual(res2.payload.ok, true);
    assert.strictEqual(res2.payload.status, "SUCCESS");
    assert.strictEqual(res2.payload.connector, "meta_ads");
    assert.strictEqual(res2.payload.response.raw.status, "created");
    assert.strictEqual(res2.payload.response.normalized.id, "campaign_123");
    assert.strictEqual(res2.payload.metrics.duration_ms, 100);
    console.log("PASS");

    // Test 3: REPLAY: exact passthrough of snapshot
    console.log("\nTest 3: REPLAY: exact passthrough of snapshot");
    const input3 = createReplayInput();
    const res3 = executeConnector(input3, { timestampProvider, now, hrtime });
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.mode, "REPLAY");
    assert.strictEqual(res3.payload.replay_source, "REPLAY_SNAPSHOT");
    assert.strictEqual(res3.payload.status, "SUCCESS");
    assert.strictEqual(res3.payload.connector, "meta_ads");
    assert.strictEqual(res3.payload.response.raw.id, "123");
    assert.strictEqual(res3.payload.response.normalized.campaign_id, "123");
    assert.deepStrictEqual(res3.payload.logs, ["log1", "log2"]);
    assert.strictEqual(res3.payload.started_at, "2025-12-01T21:00:00Z"); // Preserved
    console.log("PASS");

    // Test 4: REPLAY: connector not found → error
    console.log("\nTest 4: REPLAY: connector not found → error");
    const input4 = createReplayInput();
    input4.connector_key = "missing_connector";
    const res4 = executeConnector(input4, { timestampProvider, now, hrtime });
    assert.strictEqual(res4.ok, false);
    assert.strictEqual(res4.payload.ok, false);
    assert.strictEqual(res4.payload.status, "FAILED");
    assert.strictEqual(res4.payload.connector, "missing_connector");
    assert.strictEqual(res4.payload.error.code, "INVALID_INPUT");
    assert.ok(res4.payload.error.message.includes("not found"));
    console.log("PASS");

    // Test 5: LIVE: duration computed deterministically
    console.log("\nTest 5: LIVE: duration computed deterministically");
    hrtimeCalls = 0;
    const input5 = createLiveInput();
    const res5 = executeConnector(input5, { timestampProvider, now, hrtime });
    assert.strictEqual(res5.payload.metrics.duration_ms, 100);
    assert.strictEqual(res5.payload.metrics.started_at, "2025-12-01T22:00:00.000Z");
    assert.strictEqual(res5.payload.metrics.finished_at, "2025-12-01T22:00:00.000Z");
    console.log("PASS");

    // Test 6: REPLAY: complex nested normalized payload preserved
    console.log("\nTest 6: REPLAY: complex nested normalized payload preserved");
    const complexPayload = {
        campaign: {
            id: "123",
            name: "Test Campaign",
            settings: {
                budget: { daily: 100, total: 1000 },
                targeting: { age: [18, 65], gender: ["ALL"] }
            }
        }
    };
    const input6 = createReplayInput();
    input6.replay_snapshot.connector_responses.meta_ads.response.normalized = complexPayload;
    const res6 = executeConnector(input6, { timestampProvider, now, hrtime });
    assert.deepStrictEqual(res6.payload.response.normalized, complexPayload);
    console.log("PASS");

    // ========== NEGATIVE PATH TESTS (6) ==========

    // Test 7: Missing mode
    console.log("\nTest 7: Missing mode");
    const input7 = createLiveInput();
    delete input7.mode;
    const res7 = executeConnector(input7, { timestampProvider, now, hrtime });
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "INVALID_INPUT");
    assert.ok(res7.error.message.includes("mode"));
    console.log("PASS");

    // Test 8: Invalid mode
    console.log("\nTest 8: Invalid mode");
    const input8 = createLiveInput();
    input8.mode = "INVALID";
    const res8 = executeConnector(input8, { timestampProvider, now, hrtime });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 9: Providing both request + replay_snapshot
    console.log("\nTest 9: Providing both request + replay_snapshot");
    const input9 = createLiveInput();
    input9.replay_snapshot = { connector_responses: {} };
    const res9 = executeConnector(input9, { timestampProvider, now, hrtime });
    assert.strictEqual(res9.ok, false);
    assert.strictEqual(res9.error.code, "INVALID_INPUT");
    assert.ok(res9.error.message.includes("cannot have"));
    console.log("PASS");

    // Test 10: Missing meta.input_contract_version
    console.log("\nTest 10: Missing meta.input_contract_version");
    const input10 = createLiveInput();
    input10.meta.input_contract_version = "WrongVersion";
    const res10 = executeConnector(input10, { timestampProvider, now, hrtime });
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 11: Missing connector_key
    console.log("\nTest 11: Missing connector_key");
    const input11 = createLiveInput();
    delete input11.connector_key;
    const res11 = executeConnector(input11, { timestampProvider, now, hrtime });
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 12: Malformed replay_snapshot (missing fields)
    console.log("\nTest 12: Malformed replay_snapshot (missing fields)");
    const input12 = createReplayInput();
    delete input12.replay_snapshot.connector_responses.meta_ads.request;
    const res12 = executeConnector(input12, { timestampProvider, now, hrtime });
    assert.strictEqual(res12.payload.ok, false);
    assert.strictEqual(res12.payload.error.code, "INVALID_INPUT");
    assert.ok(res12.payload.error.message.includes("Invalid connector result"));
    console.log("PASS");

    // ========== EDGE CASES (4) ==========

    // Test 13: Empty logs array
    console.log("\nTest 13: Empty logs array");
    const input13 = createReplayInput();
    input13.replay_snapshot.connector_responses.meta_ads.logs = [];
    const res13 = executeConnector(input13, { timestampProvider, now, hrtime });
    assert.strictEqual(res13.ok, true);
    assert.deepStrictEqual(res13.payload.logs, []);
    console.log("PASS");

    // Test 14: executor throws → ok=false with error.code="EXECUTION_ERROR"
    console.log("\nTest 14: executor throws → ok=false with error.code='EXECUTION_ERROR'");
    hrtimeCalls = 0;
    const throwingExecutor = () => { throw new Error("Simulated execution failure"); };
    const input14 = createLiveInput();
    const res14 = executeConnector(input14, { timestampProvider, now, hrtime, executor: throwingExecutor });
    assert.strictEqual(res14.payload.ok, false);
    assert.strictEqual(res14.payload.status, "FAILED");
    assert.strictEqual(res14.payload.connector, "meta_ads");
    assert.strictEqual(res14.payload.error.code, "EXECUTION_ERROR");
    assert.ok(res14.payload.error.message.includes("Simulated"));
    console.log("PASS");

    // Test 15: Determinism: identical inputs produce identical output
    console.log("\nTest 15: Determinism: identical inputs produce identical output");
    hrtimeCalls = 0;
    const input15 = createLiveInput();
    const run1 = executeConnector(input15, { timestampProvider, now, hrtime: () => 1000 });
    hrtimeCalls = 0;
    const run2 = executeConnector(input15, { timestampProvider, now, hrtime: () => 1000 });
    assert.strictEqual(JSON.stringify(run1.payload), JSON.stringify(run2.payload));
    console.log("PASS");

    // Test 16: Immutability: input not mutated
    console.log("\nTest 16: Immutability: input not mutated");
    const input16 = createLiveInput();
    const originalJson = JSON.stringify(input16);
    executeConnector(input16, { timestampProvider, now, hrtime });
    assert.strictEqual(JSON.stringify(input16), originalJson);
    console.log("PASS");

    // ========== REGRESSION GUARDS (4) ==========

    // Test 17: V1 contract field list guard
    console.log("\nTest 17: V1 contract field list guard");
    hrtimeCalls = 0;
    const input17 = createLiveInput();
    const res17 = executeConnector(input17, { timestampProvider, now, hrtime });
    const requiredFields = [
        "ok", "connector_key", "execution_id", "mode", "replay_source",
        "status", "connector",
        "request", "response", "error", "metrics", "logs", "started_at", "finished_at"
    ];
    for (const field of requiredFields) {
        assert.ok(field in res17.payload, `Missing field: ${field}`);
    }
    console.log("PASS");

    // Test 18: Nested structure guard for response.normalized
    console.log("\nTest 18: Nested structure guard for response.normalized");
    const input18 = createReplayInput();
    const res18 = executeConnector(input18, { timestampProvider, now, hrtime });
    assert.ok("raw" in res18.payload.response);
    assert.ok("normalized" in res18.payload.response);
    assert.ok("raw" in res18.payload.request);
    assert.ok("normalized" in res18.payload.request);
    console.log("PASS");

    // Test 19: metrics structure guard
    console.log("\nTest 19: metrics structure guard");
    hrtimeCalls = 0;
    const input19 = createLiveInput();
    const res19 = executeConnector(input19, { timestampProvider, now, hrtime });
    assert.ok("duration_ms" in res19.payload.metrics);
    assert.ok("started_at" in res19.payload.metrics);
    assert.ok("finished_at" in res19.payload.metrics);
    assert.strictEqual(typeof res19.payload.metrics.duration_ms, "number");
    console.log("PASS");

    // Test 20: replay passthrough timestamp guard (no timestamp changes)
    console.log("\nTest 20: replay passthrough timestamp guard (no timestamp changes)");
    const input20 = createReplayInput();
    const originalStarted = input20.replay_snapshot.connector_responses.meta_ads.started_at;
    const originalFinished = input20.replay_snapshot.connector_responses.meta_ads.finished_at;
    const res20 = executeConnector(input20, { timestampProvider, now, hrtime });
    assert.strictEqual(res20.payload.started_at, originalStarted);
    assert.strictEqual(res20.payload.finished_at, originalFinished);
    assert.strictEqual(res20.payload.status, "SUCCESS"); // Preserved from snapshot
    assert.strictEqual(res20.payload.connector, "meta_ads"); // Preserved from snapshot
    assert.strictEqual(res20.payload.metrics.started_at, "2025-12-01T21:00:00Z");
    assert.strictEqual(res20.payload.metrics.finished_at, "2025-12-01T21:00:01Z");
    console.log("PASS");

    console.log("\n✅ All 20 Phase 47 v3 tests passed.");

    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.env.NODE_ENV = originalEnv;
    process.exit(1);
});
