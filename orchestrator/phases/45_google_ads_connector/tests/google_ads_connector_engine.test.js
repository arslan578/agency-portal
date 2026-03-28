/**
 * Phase 45: Google Ads and YouTube Connector IO Engine - Test Suite
 * 28 tests: 6 happy, 8 negative, 4 edge, 1 regression, 1 determinism, 8 connector specific
 */

const assert = require('assert');
const { executeGoogleAdsConnector } = require('../google_ads_connector_engine');
const GoogleAdsClient = require('../../../connectors/google_ads/client/google_ads_client');

const tests = [];

function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

function test(name, fn) {
    tests.push({ name, fn });
}

function expect(actual) {
    return {
        toBe: (expected) => assert.strictEqual(actual, expected),
        toEqual: (expected) => assert.deepStrictEqual(actual, expected),
        toBeTruthy: () => assert.ok(actual),
        toBeFalsy: () => assert.ok(!actual)
    };
}

// Helper to build a minimal valid envelope
function createEnvelope(overrides = {}) {
    return {
        execution_id: 'exec-123',
        trace_domain: { trace_domain_key: 'TENANT:tenant-A::WS:null::BRAND:null' },
        connector_request: {
            connector_key: 'GOOGLE_ADS',
            mode: 'DRY_RUN',
            account: { customer_id: '123-456-7890' },
            payloads: [
                {
                    entity_type: 'CAMPAIGN',
                    operation: 'CREATE',
                    data: { name: 'Test Campaign', status: 'PAUSED' }
                }
            ]
        },
        ...overrides
    };
}

// Mock clients

class MockClient {
    async send(req) {
        return {
            results: [{
                resource_name: `customers/${req.customer_id}/campaigns/999`,
                status: 'ENABLED'
            }]
        };
    }
}

class MockErrorClient {
    async send() {
        const err = new Error('Simulated API Error');
        err.code = 'INTERNAL_ERROR';
        throw err;
    }
}

describe('Phase 45: Google Ads Connector', () => {
    process.env.FF_GOOGLE_ADS_CONNECTOR_IO = 'true';

    // --- Happy Paths (6) ---

    test('Happy 1: DRY_RUN with single search campaign', async () => {
        const envelope = createEnvelope();
        const result = await executeGoogleAdsConnector(envelope);

        expect(result.connector_result.status).toBe('DRY_RUN_OK');
        expect(result.connector_result.requests.length).toBe(1);
        expect(result.connector_result.requests[0].raw_request.customer_id).toBe('123-456-7890');
        expect(result.connector_result.requests[0].raw_request.campaign.name).toBe('Test Campaign');
        expect(result.connector_result.requests[0].raw_response).toBe(null);
        expect(result.connector_result.requests[0].normalized_response.status).toBe('NOT_SENT');
    });

    test('Happy 2: DRY_RUN with mixed payloads', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.payloads.push({
            entity_type: 'AD_GROUP',
            operation: 'CREATE',
            data: { name: 'Test AdGroup', campaign_id: '999' }
        });

        const result = await executeGoogleAdsConnector(envelope);

        expect(result.connector_result.requests.length).toBe(2);
        expect(result.connector_result.requests[1].raw_request.ad_group.campaign).toBe('999');
        expect(result.connector_result.requests[1].normalized_response.status).toBe('NOT_SENT');
    });

    test('Happy 3: LIVE_SEND success', async () => {
        const envelope = createEnvelope({
            connector_request: {
                connector_key: 'GOOGLE_ADS',
                mode: 'LIVE_SEND',
                account: { customer_id: '123' },
                payloads: [{ entity_type: 'CAMPAIGN', operation: 'CREATE', data: {} }]
            }
        });

        const result = await executeGoogleAdsConnector(envelope, new MockClient());

        expect(result.connector_result.status).toBe('SUCCESS');
        const nr = result.connector_result.requests[0].normalized_response;
        expect(nr.entity_type).toBe('CAMPAIGN');
        expect(nr.resource_name).toBe('customers/123/campaigns/999');
        expect(nr.entity_id).toBe('999');
        expect(nr.status).toBe('ENABLED');
    });

    test('Happy 4: RECORD_ONLY mode', async () => {
        const envelope = createEnvelope({
            connector_request: {
                connector_key: 'GOOGLE_ADS',
                mode: 'RECORD_ONLY',
                account: { customer_id: '123' },
                payloads: [{ entity_type: 'CAMPAIGN', operation: 'CREATE', data: {} }]
            }
        });

        const result = await executeGoogleAdsConnector(envelope);

        expect(result.connector_result.status).toBe('RECORDED_NO_IO');
        expect(result.connector_result.requests[0].raw_request.customer_id).toBe('123');
        expect(result.connector_result.requests[0].normalized_response.status).toBe('NOT_SENT');
    });

    test('Happy 5: Replay alignment (no snapshot, simple DRY_RUN)', async () => {
        const envelope = createEnvelope();
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.connector_result.status).toBe('DRY_RUN_OK');
    });

    test('Happy 6: Basic metrics extraction from LIVE_SEND', async () => {
        class MetricsClient {
            async send(req) {
                return {
                    results: [{
                        resource_name: `customers/${req.customer_id}/campaigns/777`,
                        status: 'ENABLED',
                        metrics: { clicks: 10, impressions: 100 }
                    }]
                };
            }
        }

        const envelope = createEnvelope({
            connector_request: {
                ...createEnvelope().connector_request,
                mode: 'LIVE_SEND',
                account: { customer_id: '555-000-0000' }
            }
        });

        const result = await executeGoogleAdsConnector(envelope, new MetricsClient());
        expect(result.connector_result.status).toBe('SUCCESS');
        const nr = result.connector_result.requests[0].normalized_response;
        expect(nr.status).toBe('ENABLED');
        expect(nr.metrics.clicks).toBe(10);
        expect(nr.metrics.impressions).toBe(100);
    });

    // --- Negative Paths (6) ---

    test('Negative 1: Null envelope', async () => {
        const result = await executeGoogleAdsConnector(null);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Negative 2: Missing execution_id', async () => {
        const envelope = createEnvelope();
        delete envelope.execution_id;
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Negative 3: Missing connector_request', async () => {
        const envelope = createEnvelope();
        delete envelope.connector_request;
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Negative 4: Unsupported connector_key', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.connector_key = 'FACEBOOK';
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Negative 5: Invalid mode', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.mode = 'INVALID';
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Negative 6: Invalid customer_id', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.account.customer_id = '';
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    // --- Edge Cases (4) ---

    test('Edge 1: Empty payloads array', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.payloads = [];
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.connector_result.status).toBe('DRY_RUN_OK');
        expect(result.connector_result.requests.length).toBe(0);
    });

    test('Edge 2: Unmapped fields are ignored', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.payloads[0].data = { unknown_field: 'value' };
        const result = await executeGoogleAdsConnector(envelope);

        // No known mapped fields, so campaign body is empty object
        expect(result.connector_result.requests[0].raw_request.campaign).toEqual({});
    });

    test('Edge 3: Large payload batch', async () => {
        const envelope = createEnvelope();
        for (let i = 0; i < 100; i++) {
            envelope.connector_request.payloads.push({
                entity_type: 'CAMPAIGN',
                operation: 'CREATE',
                data: { name: `C${i}` }
            });
        }

        const result = await executeGoogleAdsConnector(envelope);
        expect(result.connector_result.requests.length).toBe(101);
        expect(result.connector_result.summary_metrics.success_count).toBe(101);
    });

    test('Edge 4: Mixed success and failure', async () => {
        class MixedClient {
            async send(req) {
                if (req.payloads[0].data.name === 'Fail') {
                    const e = new Error('Fail');
                    e.code = 'INTERNAL_ERROR';
                    throw e;
                }
                return { results: [{ status: 'OK' }] };
            }
        }

        const envelope = createEnvelope({
            connector_request: {
                ...createEnvelope().connector_request,
                mode: 'LIVE_SEND'
            }
        });

        envelope.connector_request.payloads = [
            { entity_type: 'CAMPAIGN', operation: 'CREATE', data: { name: 'Success' } },
            { entity_type: 'CAMPAIGN', operation: 'CREATE', data: { name: 'Fail' } }
        ];

        const result = await executeGoogleAdsConnector(envelope, new MixedClient());
        expect(result.connector_result.status).toBe('PARTIAL_SUCCESS');
        expect(result.connector_result.summary_metrics.success_count).toBe(1);
        expect(result.connector_result.summary_metrics.failure_count).toBe(1);
    });

    // --- Regression & Determinism (2) ---

    test('Regression: Golden raw_request snapshot for DRY_RUN', async () => {
        const envelope = createEnvelope();
        const result = await executeGoogleAdsConnector(envelope);
        const json = JSON.stringify(result.connector_result.requests[0].raw_request);
        expect(json).toBe('{"customer_id":"123-456-7890","operation":"CREATE","campaign":{"name":"Test Campaign","status":"PAUSED"}}');
    });

    test('Determinism: Identical DRY_RUN input yields identical output', async () => {
        const envelope = createEnvelope();
        const r1 = await executeGoogleAdsConnector(envelope);
        const r2 = await executeGoogleAdsConnector(envelope);

        assert.deepStrictEqual(r1, r2);
    });

    // --- Connector Specific (8) ---

    test('Connector 1: Error Mapping for INTERNAL_ERROR', async () => {
        const envelope = createEnvelope({
            connector_request: {
                ...createEnvelope().connector_request,
                mode: 'LIVE_SEND'
            }
        });
        const result = await executeGoogleAdsConnector(envelope, new MockErrorClient());
        expect(result.connector_result.status).toBe('FAILED');
        const err = result.connector_result.requests[0].error;
        expect(err.code).toBe('TRANSIENT_ERROR');
        expect(err.retryable).toBe(true);
    });

    test('Connector 2: Retry Behavior signal (retryable flag)', async () => {
        const envelope = createEnvelope({
            connector_request: {
                ...createEnvelope().connector_request,
                mode: 'LIVE_SEND'
            }
        });
        const result = await executeGoogleAdsConnector(envelope, new MockErrorClient());
        expect(result.connector_result.requests[0].error.retryable).toBe(true);
    });

    test('Connector 3: No retry for policy error mapping', async () => {
        class PolicyErrorClient {
            async send() {
                const e = new Error('Policy error');
                e.code = 'POLICY_FINDING_ERROR';
                throw e;
            }
        }

        const envelope = createEnvelope({
            connector_request: {
                ...createEnvelope().connector_request,
                mode: 'LIVE_SEND'
            }
        });

        const result = await executeGoogleAdsConnector(envelope, new PolicyErrorClient());
        const err = result.connector_result.requests[0].error;
        expect(err.code).toBe('POLICY_VIOLATION');
        expect(err.retryable).toBe(false);
    });

    test('Connector 4: Status separation for FAILED', async () => {
        const envelope = createEnvelope({
            connector_request: {
                ...createEnvelope().connector_request,
                mode: 'LIVE_SEND'
            }
        });
        const result = await executeGoogleAdsConnector(envelope, new MockErrorClient());
        expect(result.connector_result.status).toBe('FAILED');
    });

    test('Connector 5: Trace domain required and validated', async () => {
        const envelope = createEnvelope();
        delete envelope.trace_domain;
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Connector 6: Feature Flag short circuit', async () => {
        process.env.FF_GOOGLE_ADS_CONNECTOR_IO = 'false';
        const envelope = createEnvelope();
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.connector_result.status).toBe('NOOP_FEATURE_FLAG_OFF');
        process.env.FF_GOOGLE_ADS_CONNECTOR_IO = 'true';
    });

    test('Connector 7: Non mutation of input envelope', async () => {
        const envelope = createEnvelope();
        const originalJson = JSON.stringify(envelope);
        await executeGoogleAdsConnector(envelope);
        expect(JSON.stringify(envelope)).toBe(originalJson);
    });

    test('Connector 8: Replay snapshot mismatch returns error', async () => {
        const envelope = createEnvelope({
            replay_snapshot: {
                raw_requests: [{
                    customer_id: 'DIFFERENT',
                    operation: 'CREATE',
                    campaign: { name: 'Wrong Name' }
                }]
            }
        });

        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
    });

    test('Negative 7: Invalid entity_type', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.payloads[0].entity_type = 'INVALID_TYPE';
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
        expect(result.message).toBe('Unsupported entity_type: INVALID_TYPE');
    });

    test('Negative 8: Invalid operation', async () => {
        const envelope = createEnvelope();
        envelope.connector_request.payloads[0].operation = 'DESTROY';
        const result = await executeGoogleAdsConnector(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_CONNECTOR_INPUT');
        expect(result.message).toBe('Unsupported operation: DESTROY');
    });

});

// Run all tests
(async () => {
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
        } catch (e) {
            console.error(`  ✗ ${t.name}`);
            console.error(`    ${e.message}`);
            process.exit(1);
        }
    }
})();
