/**
 * Tests for Execution Run Engine (Phase 22)
 */

const { run } = require("../modules/execution_run_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Execution Run Engine Tests...");

    // Test 1: Invalid Input
    console.log("Test 1: Invalid Input");
    const result1 = await run(null);
    assert.strictEqual(result1.ok, false);
    assert.strictEqual(result1.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 2: Missing connector_payload
    console.log("\nTest 2: Missing connector_payload");
    const result2 = await run({});
    assert.strictEqual(result2.ok, false);
    assert.strictEqual(result2.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 3: Happy Path with Mocked connector_io_engine
    console.log("\nTest 3: Happy Path with Mocked connector_io_engine");
    const connectorIO = require("../modules/connector_io_engine");
    const originalRun = connectorIO.run;

    // Mock connector_io_engine.run
    connectorIO.run = async () => ({
        ok: true,
        module: "connector_io_engine",
        timestamp: "2024-01-01T00:00:00.000Z",
        payload: {
            venues: [
                { venue_key: "v1", status: "SKIPPED", errors: [], http_status: null },
                { venue_key: "v2", status: "READY", errors: [], http_status: 200 },
                { venue_key: "v3", status: "READY", errors: [{ code: "X", message: "Y" }], http_status: 400 }
            ]
        }
    });

    const input3 = {
        run_id: "test_run_123",
        connector_payload: {
            connector_requests: {
                venues: [
                    { venue_key: "v1" },
                    { venue_key: "v2" },
                    { venue_key: "v3" }
                ]
            }
        }
    };

    const result3 = await run(input3, {});
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.run_id, "test_run_123");
    assert.strictEqual(result3.payload.summary.total_venues, 3);
    assert.strictEqual(result3.payload.summary.skipped, 1);
    assert.strictEqual(result3.payload.summary.success, 1);
    assert.strictEqual(result3.payload.summary.failed, 1);
    assert.strictEqual(result3.payload.connector_io.venues.length, 3);

    // Restore
    connectorIO.run = originalRun;
    console.log("PASS");

    // Test 4: Propagate Connector IO Error
    console.log("\nTest 4: Propagate Connector IO Error");
    connectorIO.run = async () => ({
        ok: false,
        module: "connector_io_engine",
        timestamp: "2024-01-01T00:00:00.000Z",
        payload: null,
        error: {
            code: "SOME_ERROR",
            message: "Something went wrong"
        }
    });

    const input4 = {
        connector_payload: {
            connector_requests: {
                venues: []
            }
        }
    };

    const result4 = await run(input4, {});
    assert.strictEqual(result4.ok, false);
    assert.strictEqual(result4.error.code, "CONNECTOR_IO_ERROR");
    assert.strictEqual(result4.error.message, "Something went wrong");

    // Restore
    connectorIO.run = originalRun;
    console.log("PASS");

    // Test 5: Auto-generated run_id
    console.log("\nTest 5: Auto-generated run_id");
    connectorIO.run = async () => ({
        ok: true,
        module: "connector_io_engine",
        timestamp: "2024-01-01T00:00:00.000Z",
        payload: {
            venues: []
        }
    });

    const input5 = {
        // No run_id provided
        connector_payload: {
            connector_requests: {
                venues: []
            }
        }
    };

    const result5 = await run(input5, {});
    assert.strictEqual(result5.ok, true);
    assert.strictEqual(result5.payload.run_id.startsWith("run_"), true);

    // Restore
    connectorIO.run = originalRun;
    console.log("PASS");

    console.log("\nAll Phase 22 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
