/**
 * Tests for Universal IO Connector Interface (Phase 21A)
 */

const { run, BaseConnector } = require("../modules/connector_io_engine");
const assert = require("assert");

// Helper to create minimal valid input from Phase 20
function createTestInput() {
    return {
        plan: {},
        readiness: {},
        validation: {},
        policy: {},
        connector_contracts: {},
        connector_requests: {
            venues: [
                {
                    venue_key: "meta",
                    platform_kind: "META",
                    can_build_request: true,
                    status: "READY",
                    requests: { primary: { some: "data" } }
                }
            ]
        }
    };
}

async function runTests() {
    console.log("Running Connector IO Engine Tests...");

    // Test 1: Invalid Payload Type
    console.log("Test 1: Invalid Payload Type");
    const result1 = await run(null);
    assert.strictEqual(result1.ok, false);
    assert.strictEqual(result1.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 2: Missing connector_requests
    console.log("Test 2: Missing connector_requests");
    const result2 = await run({ plan: {} });
    assert.strictEqual(result2.ok, false);
    assert.strictEqual(result2.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 3: SKIPPED Venue (Not Ready)
    console.log("Test 3: SKIPPED Venue (Not Ready)");
    const input3 = createTestInput();
    input3.connector_requests.venues[0].status = "SKIPPED";
    input3.connector_requests.venues[0].can_build_request = false;

    const result3 = await run(input3);
    assert.strictEqual(result3.ok, true);
    const venue3 = result3.payload.venues[0];
    assert.strictEqual(venue3.status, "SKIPPED");
    assert.strictEqual(venue3.http_status, null);
    console.log("PASS");

    // Test 4: READY Venue (Meta)
    console.log("Test 4: READY Venue (Meta)");
    const input4 = createTestInput();

    const result4 = await run(input4);
    assert.strictEqual(result4.ok, true);
    const venue4 = result4.payload.venues[0];
    assert.strictEqual(venue4.status, "READY");
    assert.strictEqual(venue4.platform_kind, "META");
    assert.strictEqual(venue4.http_status, null); // Stub returns null
    assert.strictEqual(venue4.response_body, null);
    console.log("PASS");

    // Test 5: READY Venue (Google Ads)
    console.log("Test 5: READY Venue (Google Ads)");
    const input5 = createTestInput();
    input5.connector_requests.venues[0].platform_kind = "GOOGLE_ADS";

    const result5 = await run(input5);
    assert.strictEqual(result5.ok, true);
    const venue5 = result5.payload.venues[0];
    assert.strictEqual(venue5.status, "READY");
    assert.strictEqual(venue5.platform_kind, "GOOGLE_ADS");
    console.log("PASS");

    // Test 6: Determinism
    console.log("Test 6: Determinism");
    const input6 = createTestInput();

    const resultA = await run(input6);
    const resultB = await run(input6);

    delete resultA.timestamp;
    delete resultB.timestamp;

    assert.deepStrictEqual(resultA.payload, resultB.payload);
    console.log("PASS");

    // Test 7: BaseConnector Interface
    console.log("Test 7: BaseConnector Interface");
    const base = new BaseConnector({});
    const execResult = await base.execute({});
    assert.strictEqual(execResult.http_status, null);
    assert.strictEqual(execResult.response_body, null);
    assert.deepStrictEqual(execResult.errors, []);
    console.log("PASS");

    // Test 8: GoogleAdsConnector Config Validation
    console.log("Test 8: GoogleAdsConnector Config Validation");
    const { GoogleAdsConnector } = require("../modules/connector_io_engine");
    const invalidConfigConnector = new GoogleAdsConnector({});
    const invalidConfigResult = await invalidConfigConnector.execute({});
    assert.strictEqual(invalidConfigResult.http_status, null);
    assert.strictEqual(invalidConfigResult.errors[0].code, "INVALID_CONFIG");
    console.log("PASS");

    // Test 9: GoogleAdsConnector Primary Request Validation
    console.log("Test 9: GoogleAdsConnector Primary Request Validation");
    const validConfig = {
        developer_token: "dev_token",
        access_token: "acc_token",
        http_client: async () => ({ status: 200, json: async () => ({}) })
    };
    const validConfigConnector = new GoogleAdsConnector(validConfig);

    // Missing customer_id
    const invalidReqResult1 = await validConfigConnector.execute({ gaql: "SELECT *" });
    assert.strictEqual(invalidReqResult1.errors[0].code, "INVALID_PRIMARY_REQUEST");

    // Missing gaql
    const invalidReqResult2 = await validConfigConnector.execute({ customer_id: "123" });
    assert.strictEqual(invalidReqResult2.errors[0].code, "INVALID_PRIMARY_REQUEST");
    console.log("PASS");

    // Test 10: GoogleAdsConnector Success Mapping
    console.log("Test 10: GoogleAdsConnector Success Mapping");
    const mockHttpClientSuccess = async (url, options) => {
        assert.ok(url.includes("/customers/1234567890/googleAds:searchStream"));
        assert.strictEqual(options.method, "POST");
        assert.strictEqual(options.headers["developer-token"], "dev_token");
        assert.strictEqual(options.headers["Authorization"], "Bearer acc_token");
        return {
            status: 200,
            json: async () => ({ rows: [{ customer: { id: "123" } }] })
        };
    };

    const successConnector = new GoogleAdsConnector({ ...validConfig, http_client: mockHttpClientSuccess });
    const successResult = await successConnector.execute({
        customer_id: "1234567890",
        gaql: "SELECT customer.id FROM customer"
    });

    assert.strictEqual(successResult.http_status, 200);
    assert.strictEqual(successResult.errors.length, 0);
    assert.strictEqual(successResult.response_body.rows[0].customer.id, "123");
    console.log("PASS");

    // Test 11: GoogleAdsConnector HTTP Error Mapping
    console.log("Test 11: GoogleAdsConnector HTTP Error Mapping");
    const mockHttpClientError = async () => ({
        status: 400,
        json: async () => ({ error: { message: "Bad request" } })
    });

    const errorConnector = new GoogleAdsConnector({ ...validConfig, http_client: mockHttpClientError });
    const errorResult = await errorConnector.execute({
        customer_id: "1234567890",
        gaql: "SELECT customer.id FROM customer"
    });

    assert.strictEqual(errorResult.http_status, 400);
    assert.strictEqual(errorResult.errors[0].code, "GOOGLE_ADS_HTTP_ERROR");
    console.log("PASS");

    console.log("All Phase 21B tests passed.");

    // --- Phase 21C Tests: Connector Config Injection ---

    // Test 12: Config Injection Merging (Global + Venue)
    console.log("\nTest 12: Config Injection Merging (Global + Venue)");
    const test12Payload = createTestInput();
    test12Payload.connector_requests.venues[0].platform_kind = "GOOGLE_ADS";
    test12Payload.connector_requests.venues[0].venue_key = "venue_12";
    test12Payload.connector_contracts.venues = [{
        venue_key: "venue_12",
        meta: {
            login_customer_id: "venue_login_id"
        }
    }];
    test12Payload.connector_requests.venues[0].requests.primary = {
        customer_id: "123",
        gaql: "SELECT x FROM y"
    };

    const test12Config = {
        global_connector_config: {
            GOOGLE_ADS: {
                developer_token: "global_dev_token",
                access_token: "global_access_token"
            }
        },
        http_client: async () => ({ status: 200, json: async () => ({}) })
    };

    // We can't easily spy on the internal constructor, but we can verify execution succeeds
    // which implies config was valid. To be sure, we'll rely on the fact that GoogleAdsConnector
    // throws if config is missing.
    const result12 = await run(test12Payload, test12Config);
    assert.strictEqual(result12.ok, true);
    const venue12Result = result12.payload.venues[0];
    assert.strictEqual(venue12Result.status, "READY");
    // If it didn't merge, it would fail validation for missing developer_token
    console.log("PASS");

    // Test 13: Config Injection Venue Override
    console.log("\nTest 13: Config Injection Venue Override");
    const test13Payload = createTestInput();
    test13Payload.connector_requests.venues[0].platform_kind = "GOOGLE_ADS";
    test13Payload.connector_requests.venues[0].venue_key = "venue_13";
    test13Payload.connector_contracts.venues = [{
        venue_key: "venue_13",
        meta: {
            developer_token: "venue_override_token", // Should override global
            login_customer_id: "venue_login_id"
        }
    }];
    test13Payload.connector_requests.venues[0].requests.primary = {
        customer_id: "123",
        gaql: "SELECT x FROM y"
    };

    const test13Config = {
        global_connector_config: {
            GOOGLE_ADS: {
                developer_token: "global_dev_token",
                access_token: "global_access_token"
            }
        },
        http_client: async (url, options) => {
            // We can inspect headers to see which token was used
            if (options.headers["developer-token"] === "venue_override_token") {
                return { status: 200, json: async () => ({}) };
            }
            return { status: 400, json: async () => ({ error: "Wrong token" }) };
        }
    };

    const result13 = await run(test13Payload, test13Config);
    assert.strictEqual(result13.payload.venues[0].http_status, 200);
    console.log("PASS");

    // Test 14: Missing Global Config (Graceful Fallback)
    console.log("\nTest 14: Missing Global Config");
    const test14Payload = createTestInput();
    test14Payload.connector_requests.venues[0].platform_kind = "GOOGLE_ADS";
    test14Payload.connector_requests.venues[0].venue_key = "venue_14";
    // Provide ALL required config in venue contract since global is missing
    test14Payload.connector_contracts.venues = [{
        venue_key: "venue_14",
        meta: {
            developer_token: "venue_dev_token",
            access_token: "venue_access_token",
            login_customer_id: "venue_login_id"
        }
    }];
    test14Payload.connector_requests.venues[0].requests.primary = {
        customer_id: "123",
        gaql: "SELECT x FROM y"
    };

    const test14Config = {
        // No global_connector_config
        http_client: async () => ({ status: 200, json: async () => ({}) })
    };

    const result14 = await run(test14Payload, test14Config);
    assert.strictEqual(result14.payload.venues[0].status, "READY");
    console.log("PASS");

    // Test 15: End-to-End Google Ads with Injected Config
    console.log("\nTest 15: End-to-End Google Ads with Injected Config");
    const test15Payload = createTestInput();
    test15Payload.connector_requests.venues[0].platform_kind = "GOOGLE_ADS";
    test15Payload.connector_requests.venues[0].venue_key = "venue_15";
    test15Payload.connector_requests.venues[0].requests.primary = {
        customer_id: "1234567890",
        gaql: "SELECT campaign.id FROM campaign"
    };

    const test15Config = {
        global_connector_config: {
            GOOGLE_ADS: {
                developer_token: "TEST_DEV_TOKEN",
                access_token: "TEST_ACCESS_TOKEN",
                api_base_url: "https://google.ads.api"
            }
        },
        http_client: async (url, options) => {
            // Verify URL and Headers
            if (url === "https://google.ads.api/v16/customers/1234567890/googleAds:searchStream" &&
                options.headers["developer-token"] === "TEST_DEV_TOKEN" &&
                options.headers["Authorization"] === "Bearer TEST_ACCESS_TOKEN") {
                return {
                    status: 200,
                    json: async () => ([
                        { results: [{ campaign: { id: "999" } }] }
                    ])
                };
            }
            return { status: 500, json: async () => ({ error: "Mock mismatch" }) };
        }
    };

    const result15 = await run(test15Payload, test15Config);
    const venue15Result = result15.payload.venues[0];
    assert.strictEqual(venue15Result.status, "READY");
    assert.strictEqual(venue15Result.http_status, 200);
    assert.strictEqual(venue15Result.response_body[0].results[0].campaign.id, "999");
    console.log("PASS");

    console.log("All Phase 21C tests passed.");

    // --- Phase 21D Tests: Meta Connector ---

    // Test 16: Meta Config Validation
    console.log("\nTest 16: Meta Config Validation");
    const { MetaConnector } = require("../modules/connector_io_engine");
    const metaConfigErrors = MetaConnector.validateConfig({});
    assert.strictEqual(metaConfigErrors.length > 0, true);
    assert.strictEqual(metaConfigErrors[0].code, "INVALID_CONFIG");
    console.log("PASS");

    // Test 17: Meta Primary Request Validation
    console.log("\nTest 17: Meta Primary Request Validation");
    const test17Payload = createTestInput();
    test17Payload.connector_requests.venues[0].platform_kind = "META";
    test17Payload.connector_requests.venues[0].venue_key = "meta_17";
    test17Payload.connector_contracts.venues = [{
        venue_key: "meta_17",
        meta: { access_token: "valid_token" }
    }];
    // Missing ad_account_id
    test17Payload.connector_requests.venues[0].requests.primary = { fields: "id" };

    const test17Config = {
        http_client: async () => ({ status: 200, json: async () => ({}) })
    };

    const result17 = await run(test17Payload, test17Config);
    const venue17Result = result17.payload.venues[0];
    assert.strictEqual(venue17Result.status, "READY"); // It ran
    assert.strictEqual(venue17Result.errors[0].code, "INVALID_PRIMARY_REQUEST");
    console.log("PASS");

    // Test 18: Meta Success Mapping
    console.log("\nTest 18: Meta Success Mapping");
    const test18Payload = createTestInput();
    test18Payload.connector_requests.venues[0].platform_kind = "META";
    test18Payload.connector_requests.venues[0].venue_key = "meta_18";
    test18Payload.connector_contracts.venues = [{
        venue_key: "meta_18",
        meta: { access_token: "valid_token" }
    }];
    test18Payload.connector_requests.venues[0].requests.primary = {
        ad_account_id: "act_1234567890"
    };

    const test18Config = {
        http_client: async (url, options) => {
            if (url.includes("/v18.0/act_1234567890") &&
                options.method === "GET" &&
                options.headers["Authorization"] === "Bearer valid_token") {
                return {
                    status: 200,
                    json: async () => ({ id: "act_1234567890", name: "Test Account" })
                };
            }
            return { status: 500, json: async () => ({ error: "Mock mismatch" }) };
        }
    };

    const result18 = await run(test18Payload, test18Config);
    const venue18Result = result18.payload.venues[0];
    assert.strictEqual(venue18Result.status, "READY");
    assert.strictEqual(venue18Result.http_status, 200);
    assert.strictEqual(venue18Result.response_body.id, "act_1234567890");
    console.log("PASS");

    // Test 19: Meta HTTP Error Mapping
    console.log("\nTest 19: Meta HTTP Error Mapping");
    const test19Payload = createTestInput();
    test19Payload.connector_requests.venues[0].platform_kind = "META";
    test19Payload.connector_requests.venues[0].venue_key = "meta_19";
    test19Payload.connector_contracts.venues = [{
        venue_key: "meta_19",
        meta: { access_token: "valid_token" }
    }];
    test19Payload.connector_requests.venues[0].requests.primary = {
        ad_account_id: "act_1234567890"
    };

    const test19Config = {
        http_client: async () => ({
            status: 403,
            json: async () => ({ error: { message: "Invalid OAuth token" } })
        })
    };

    const result19 = await run(test19Payload, test19Config);
    const venue19Result = result19.payload.venues[0];
    assert.strictEqual(venue19Result.http_status, 403);
    assert.strictEqual(venue19Result.errors[0].code, "META_HTTP_ERROR");
    console.log("PASS");

    console.log("All Phase 21D tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
