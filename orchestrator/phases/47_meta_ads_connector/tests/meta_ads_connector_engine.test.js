/**
 * Phase 47: Meta Ads Connector Engine Tests (v3)
 *
 * 18 Tests: 6 Happy, 6 Negative, 4 Edge, 2 Guards
 */

const assert = require('assert');
const { executeMetaAdsConnector } = require('../meta_ads_connector_engine');

// Mock fetch
let mockFetchResponse = {};
let mockFetchError = null;
let fetchCalls = [];

global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (mockFetchError) {
        throw mockFetchError;
    }
    return {
        ok: mockFetchResponse.ok !== false,
        status: mockFetchResponse.status || 200,
        json: async () => mockFetchResponse.body || {}
    };
};

async function runTests() {
    console.log('Running Phase 47: Meta Ads Connector Engine Tests (v3)...\n');
    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            // Reset shared state
            mockFetchResponse = {};
            mockFetchError = null;
            fetchCalls = [];
            process.env.FF_META_ADS_CONNECTOR = 'true';
            process.env.META_ACCESS_TOKEN = 'env-token';
            process.env.META_ACCOUNT_ID = 'env-account';

            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${name}`);
            console.error(e);
            failed++;
        }
    };

    const createEnvelope = (overrides = {}) => {
        const base = {
            execution_id: 'exec-1',
            payload: {
                connector_key: 'meta_ads',
                connector_request: {
                    name: 'Test Campaign',
                    objective: 'OUTCOME_TRAFFIC',
                    status: 'PAUSED',
                    special_ad_categories: []
                },
                tenant: {
                    access_token: 'tenant-token',
                    account_id: 'tenant-account'
                }
            }
        };

        // apply overrides.payload (shallow except connector_request merged)
        if (overrides.payload) {
            const baseConnectorRequest = base.payload.connector_request;
            Object.assign(base.payload, overrides.payload);
            if (overrides.payload.connector_request) {
                base.payload.connector_request = {
                    ...baseConnectorRequest,
                    ...overrides.payload.connector_request
                };
            }
        }

        if (overrides.flags) {
            base.flags = overrides.flags;
        }

        if (overrides.execution_id) {
            base.execution_id = overrides.execution_id;
        }

        return base;
    };

    // ---------- Happy Path (6) ----------

    await test('1. Valid request (tenant creds) -> SUCCESS', async () => {
        mockFetchResponse = { body: { id: 'camp_123' } };
        const envelope = createEnvelope();

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.response.normalized.id, 'camp_123');
        assert.strictEqual(fetchCalls.length, 1);
        assert.ok(fetchCalls[0].url.includes('/act_tenant-account/campaigns'));

        const body = JSON.parse(fetchCalls[0].options.body);
        assert.strictEqual(body.name, 'Test Campaign');
        assert.strictEqual(body.access_token, 'tenant-token');
    });

    await test('2. Valid request -> FAILED due to API error', async () => {
        mockFetchResponse = {
            ok: false,
            status: 400,
            body: { error: { code: 100, message: 'Invalid parameter' } }
        };
        const envelope = createEnvelope();

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.error.code, '100');
        assert.strictEqual(result.error.message, 'Invalid parameter');
        assert.strictEqual(result.metrics.meta_ads.requests, 1);
    });

    await test('3. Valid request using env credentials', async () => {
        mockFetchResponse = { body: { id: 'camp_env' } };
        const envelope = createEnvelope();
        delete envelope.payload.tenant;

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(fetchCalls[0].url.includes('/act_env-account/campaigns'));
        const body = JSON.parse(fetchCalls[0].options.body);
        assert.strictEqual(body.access_token, 'env-token');
    });

    await test('4. Feature flag off via env -> SKIPPED with full V1 and no_op', async () => {
        process.env.FF_META_ADS_CONNECTOR = 'false';
        const envelope = createEnvelope();

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SKIPPED');
        assert.strictEqual(result.no_op, true);
        assert.strictEqual(result.ok, true);
        assert.strictEqual(fetchCalls.length, 0);
        assert.strictEqual(result.metrics.meta_ads.requests, 0);
        // Contract keys also enforced in test 18
    });

    await test('5. Replay mode with stored V1 result -> SUCCESS, REPLAY, full V1', async () => {
        const storedV1 = {
            ok: true,
            status: 'SUCCESS',
            replay_source: 'LIVE',
            connector: 'meta_ads',
            request: {
                name: 'Stored Campaign',
                objective: 'OUTCOME_TRAFFIC',
                status: 'PAUSED',
                special_ad_categories: []
            },
            response: {
                raw: { id: 'camp_replay' },
                normalized: { id: 'camp_replay', success: true, api_call: '/act_123/campaigns' }
            },
            error: null,
            metrics: {
                meta_ads: { requests: 1, latency_ms: 42 }
            },
            logs: [
                { event: 'meta_api_call', at: new Date().toISOString(), connector: 'meta_ads' }
            ],
            execution_id: 'exec-1',
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString()
        };

        const envelope = createEnvelope({
            payload: {
                snapshot: {
                    replay_mode: 'REPLAY',
                    connector_responses: { meta_ads: storedV1 }
                }
            }
        });

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.replay_source, 'REPLAY');
        assert.strictEqual(result.response.normalized.id, 'camp_replay');
        assert.strictEqual(fetchCalls.length, 0);

        // contract check: must still have V1 keys
        const keys = Object.keys(result).sort();
        const expectedKeys = [
            'ok', 'status', 'replay_source', 'connector', 'request',
            'response', 'error', 'metrics', 'logs',
            'execution_id', 'started_at', 'finished_at'
        ].sort();
        assert.deepStrictEqual(keys, expectedKeys);
    });

    await test('6. Valid request with empty special_ad_categories', async () => {
        mockFetchResponse = { body: { id: 'camp_empty_cat' } };
        const envelope = createEnvelope({
            payload: {
                connector_request: { special_ad_categories: [] }
            }
        });

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        const body = JSON.parse(fetchCalls[0].options.body);
        assert.deepStrictEqual(body.special_ad_categories, []);
    });

    // ---------- Negative Path (6) ----------

    await test('7. Malformed envelope (missing payload) -> MALFORMED_ENVELOPE', async () => {
        const envelope = { execution_id: 'exec-1' }; // no payload

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'MALFORMED_ENVELOPE');
        assert.strictEqual(result.ok, false);
    });

    await test('8. Wrong connector_key -> INVALID_CONNECTOR_KEY', async () => {
        const envelope = createEnvelope();
        envelope.payload.connector_key = 'google_ads';

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'INVALID_CONNECTOR_KEY');
    });

    await test('9. Missing connector_request -> MALFORMED_CONNECTOR_REQUEST', async () => {
        const envelope = createEnvelope();
        delete envelope.payload.connector_request;

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'MALFORMED_CONNECTOR_REQUEST');
    });

    await test('10. Missing required field (status) -> MALFORMED_CONNECTOR_REQUEST', async () => {
        const envelope = createEnvelope();
        delete envelope.payload.connector_request.status;

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'MALFORMED_CONNECTOR_REQUEST');
    });

    await test('11. Missing credentials -> MISSING_META_CREDENTIALS and no IO', async () => {
        process.env.META_ACCESS_TOKEN = '';
        process.env.META_ACCOUNT_ID = '';
        const envelope = createEnvelope();
        delete envelope.payload.tenant;

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'MISSING_META_CREDENTIALS');
        assert.strictEqual(fetchCalls.length, 0);
    });

    await test('12. Network error -> NETWORK_ERROR', async () => {
        mockFetchError = new Error('Network failure');
        const envelope = createEnvelope();

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'NETWORK_ERROR');
        assert.strictEqual(result.metrics.meta_ads.requests, 1);
    });

    // ---------- Edge Cases (4) ----------

    await test('13. Replay mode requested but missing data -> REPLAY_DATA_MISSING in REPLAY', async () => {
        const envelope = createEnvelope({
            payload: {
                snapshot: {
                    replay_mode: 'REPLAY',
                    connector_responses: {} // no meta_ads
                }
            }
        });

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'FAILED');
        assert.strictEqual(result.error.code, 'REPLAY_DATA_MISSING');
        assert.strictEqual(result.replay_source, 'REPLAY');
        assert.strictEqual(fetchCalls.length, 0);
    });

    await test('14. Very large name field', async () => {
        mockFetchResponse = { body: { id: 'camp_large' } };
        const largeName = 'A'.repeat(1000);
        const envelope = createEnvelope({
            payload: {
                connector_request: { name: largeName }
            }
        });

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        const body = JSON.parse(fetchCalls[0].options.body);
        assert.strictEqual(body.name.length, 1000);
    });

    await test('15. Unicode characters in name', async () => {
        mockFetchResponse = { body: { id: 'camp_emoji' } };
        const emojiName = 'Campaign 🚀';
        const envelope = createEnvelope({
            payload: {
                connector_request: { name: emojiName }
            }
        });

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        const body = JSON.parse(fetchCalls[0].options.body);
        assert.strictEqual(body.name, emojiName);
    });

    await test('16. Extra field in connector_request is ignored', async () => {
        mockFetchResponse = { body: { id: 'camp_extra' } };
        const envelope = createEnvelope({
            payload: {
                connector_request: { extra_field: 'should_be_ignored' }
            }
        });

        const result = await executeMetaAdsConnector(envelope);

        assert.strictEqual(result.status, 'SUCCESS');
        const body = JSON.parse(fetchCalls[0].options.body);
        assert.strictEqual(body.extra_field, undefined);
    });

    // ---------- Guards (2) ----------

    await test('17. Determinism guard (live)', async () => {
        mockFetchResponse = { body: { id: 'camp_det' } };
        const envelope = createEnvelope();

        const result1 = await executeMetaAdsConnector(JSON.parse(JSON.stringify(envelope)));
        const result2 = await executeMetaAdsConnector(JSON.parse(JSON.stringify(envelope)));

        const strip = (res) => {
            const { started_at, finished_at, logs, metrics, ...rest } = res;
            return rest;
        };

        assert.deepStrictEqual(strip(result1), strip(result2));
    });

    await test('18. Contract guard (LIVE)', async () => {
        mockFetchResponse = { body: { id: 'camp_contract' } };
        const envelope = createEnvelope();

        const result = await executeMetaAdsConnector(envelope);

        const expectedKeys = [
            'ok', 'status', 'replay_source', 'connector', 'request',
            'response', 'error', 'metrics', 'logs',
            'execution_id', 'started_at', 'finished_at'
        ];

        const actualKeys = Object.keys(result).sort();
        assert.deepStrictEqual(actualKeys, expectedKeys.sort());
    });

    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
