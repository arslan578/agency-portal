/**
 * Phase 50: TikTok Ads Connector IO Engine - Test Suite
 * Exactly 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const assert = require('assert');
const { execute, _internal } = require('./tiktok_ads_connector_engine');

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
        toBeFalsy: () => assert.ok(!actual),
        toContain: (substring) => assert.ok(actual.includes(substring)),
        toBeGreaterThan: (value) => assert.ok(actual > value)
    };
}

// Helper to create valid envelope
function createValidEnvelope(operations = []) {
    return {
        execution_id: 'exec-123',
        connector_key: 'tiktok_ads',
        tenant: { workspace_id: 'ws-1', brand_id: 'br-1' },
        request: {
            contract_version: 'tiktok_ads_v1',
            account: {
                tiktok_advertiser_id: 'adv-123',
                credential_ref: 'valid-ref'
            },
            operations: operations
        }
    };
}

// Mock Dependencies
const mockCredentialService = {
    resolve: async (ref) => {
        if (ref === 'valid-ref') return 'valid-token';
        throw new Error('Invalid ref');
    }
};

describe('Phase 50: TikTok Ads Connector IO Engine', () => {
    // Enable feature flag by default for tests
    process.env.FF_TIKTOK_ADS_CONNECTOR_ENGINE = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Single campaign creation success', async () => {
        const ops = [{
            op_id: 'op-1',
            type: 'CREATE',
            entity: 'CAMPAIGN',
            endpoint: '/campaign/create/',
            method: 'POST',
            payload: { name: 'Test Campaign' }
        }];

        const mockHttpClient = {
            request: async (config) => {
                return { status: 200, data: { code: 0, message: 'OK', data: { campaign_id: '123' } } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('OK');
        expect(result.results.length).toBe(1);
        expect(result.results[0].status).toBe('SUCCESS');
    });

    test('Happy 2: Multiple operations, mixed entities all succeed', async () => {
        const ops = [
            { op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} },
            { op_id: 'op-2', type: 'CREATE', entity: 'AD_GROUP', endpoint: '/a', method: 'POST', payload: {} }
        ];

        const mockHttpClient = {
            request: async (config) => {
                return { status: 200, data: { code: 0, message: 'OK' } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('SUCCESS');
        expect(result.results.length).toBe(2);
        expect(result.meta.succeeded_operation_count).toBe(2);
    });

    test('Happy 3: Retry on transient network error then success', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        let attempts = 0;
        const mockHttpClient = {
            request: async (config) => {
                attempts++;
                if (attempts === 1) throw { code: 'ECONNABORTED', message: 'timeout' };
                return { status: 200, data: { code: 0, message: 'OK' } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('SUCCESS');
        expect(result.meta.retries_applied).toBe(1);
        expect(attempts).toBe(2);
    });

    test('Happy 4: Rate limit 429 with retry then success', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        let attempts = 0;
        const mockHttpClient = {
            request: async (config) => {
                attempts++;
                if (attempts === 1) throw { status: 429, message: 'Rate limit' };
                return { status: 200, data: { code: 0, message: 'OK' } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('SUCCESS');
        expect(result.meta.retries_applied).toBe(1);
    });

    test('Happy 5: Partial failure aggregation', async () => {
        const ops = [
            { op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} },
            { op_id: 'op-2', type: 'CREATE', entity: 'AD_GROUP', endpoint: '/a', method: 'POST', payload: {} }
        ];

        const mockHttpClient = {
            request: async (config) => {
                if (config.url.includes('/c')) return { status: 200, data: { code: 0 } };
                throw { status: 400, response: { status: 400, data: { code: 40001, message: 'Bad Request' } } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('PARTIAL_FAILURE');
        expect(result.status_code).toBe('UPSTREAM_ERROR');
        expect(result.meta.succeeded_operation_count).toBe(1);
        expect(result.meta.failed_operation_count).toBe(1);
    });

    test('Happy 6: Feature flag enabled path uses TikTok base URL from environment', async () => {
        process.env.TIKTOK_API_BASE_URL = 'https://custom-api.tiktok.com';
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        let capturedUrl;
        const mockHttpClient = {
            request: async (config) => {
                capturedUrl = config.url;
                return { status: 200, data: { code: 0 } };
            }
        };

        await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(capturedUrl).toContain('https://custom-api.tiktok.com');
        delete process.env.TIKTOK_API_BASE_URL;
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Invalid envelope, missing connector_key', async () => {
        const env = createValidEnvelope();
        delete env.connector_key;

        const result = await execute(env);

        expect(result.status).toBe('FAILED');
        expect(result.status_code).toBe('INVALID_REQUEST');
    });

    test('Negative 8: Wrong connector_key', async () => {
        const env = createValidEnvelope();
        env.connector_key = 'google_ads';

        const result = await execute(env);

        expect(result.status).toBe('FAILED');
        expect(result.status_code).toBe('INVALID_REQUEST');
    });

    test('Negative 9: Missing credential reference', async () => {
        const env = createValidEnvelope([{ op_id: '1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }]);
        env.request.account.credential_ref = 'invalid-ref';

        const result = await execute(env, {
            credentialService: mockCredentialService
        });

        expect(result.status).toBe('FAILED');
        expect(result.status_code).toBe('AUTH_ERROR');
        expect(result.errors[0].code).toBe('AUTH_TOKEN_INVALID');
    });

    test('Negative 10: TikTok returns 401 unauthorized', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        const mockHttpClient = {
            request: async (config) => {
                throw { status: 401, response: { status: 401, data: { code: 40100, message: 'Unauthorized' } } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('FAILED');
        expect(result.status_code).toBe('AUTH_ERROR');
        expect(result.meta.retries_applied).toBe(0); // No retry on 401
    });

    test('Negative 11: TikTok returns repeated 500 errors exceeding retries', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        const mockHttpClient = {
            request: async (config) => {
                throw { status: 500, response: { status: 500, data: { message: 'Internal Error' } } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('FAILED');
        expect(result.status_code).toBe('UPSTREAM_ERROR');
        expect(result.meta.retries_applied).toBe(2); // Default max retries
    });

    test('Negative 12: Malformed JSON response', async () => {
        // Simulating malformed response by throwing syntax error or similar during "parsing"
        // Since we mock the client, we can simulate an error that isn't a standard HTTP error
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        const mockHttpClient = {
            request: async (config) => {
                throw new Error('Unexpected token < in JSON at position 0');
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('FAILED');
        expect(result.errors[0].code).toBe('NETWORK_ERROR'); // Falls back to network error for unknown exceptions
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: Feature flag disabled returns DISABLED without IO', async () => {
        process.env.FF_TIKTOK_ADS_CONNECTOR_ENGINE = 'false';

        const mockHttpClient = {
            request: async () => { throw new Error('Should not be called'); }
        };

        const result = await execute(createValidEnvelope(), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('DISABLED');
        expect(result.status_code).toBe('DISABLED');

        process.env.FF_TIKTOK_ADS_CONNECTOR_ENGINE = 'true';
    });

    test('Edge 14: Zero operations yields NO_OP', async () => {
        const result = await execute(createValidEnvelope([]), {
            credentialService: mockCredentialService
        });

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('NO_OP');
        expect(result.meta.attempted_operation_count).toBe(0);
    });

    test('Edge 15: Custom timeout and retry settings applied', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];
        const env = createValidEnvelope(ops);
        env.request.settings = { max_retries: 1, timeout_ms: 1000 };

        let capturedConfig;
        let attempts = 0;
        const mockHttpClient = {
            request: async (config) => {
                capturedConfig = config;
                attempts++;
                throw { status: 500, response: { status: 500 } };
            }
        };

        const result = await execute(env, {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(capturedConfig.timeout).toBe(1000);
        expect(attempts).toBe(2); // 1 initial + 1 retry
    });

    test('Edge 16: Credential resolver returns token but HTTP client throws synchronously', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        const mockHttpClient = {
            request: async (config) => {
                throw new Error('Sync error');
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.status).toBe('FAILED');
        expect(result.errors[0].code).toBe('NETWORK_ERROR');
    });

    // --- Regression Test (1) ---

    test('Regression 17: Regression guard for double counting retries', async () => {
        const ops = [{ op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }];

        let attempts = 0;
        const mockHttpClient = {
            request: async (config) => {
                attempts++;
                if (attempts === 1) throw { status: 500, response: { status: 500 } };
                return { status: 200, data: { code: 0 } };
            }
        };

        const result = await execute(createValidEnvelope(ops), {
            credentialService: mockCredentialService,
            httpClient: mockHttpClient
        });

        expect(result.meta.retries_applied).toBe(1);
    });

    // --- Determinism Test (1) ---

    test('Determinism 18: Deterministic output for identical inputs with stubbed HTTP client', async () => {
        const ops = [
            { op_id: 'op-2', type: 'CREATE', entity: 'AD_GROUP', endpoint: '/a', method: 'POST', payload: {} },
            { op_id: 'op-1', type: 'CREATE', entity: 'CAMPAIGN', endpoint: '/c', method: 'POST', payload: {} }
        ];

        const mockHttpClient = {
            request: async (config) => {
                return { status: 200, data: { code: 0, message: 'OK' } };
            }
        };

        const env1 = createValidEnvelope(JSON.parse(JSON.stringify(ops)));
        const env2 = createValidEnvelope(JSON.parse(JSON.stringify(ops)));

        // Mock Date.now to ensure latency matches (or ignore latency in comparison)
        // For this test, we'll just compare the results array which should be sorted by op_id

        const result1 = await execute(env1, { credentialService: mockCredentialService, httpClient: mockHttpClient });
        const result2 = await execute(env2, { credentialService: mockCredentialService, httpClient: mockHttpClient });

        // Check sorting
        expect(result1.results[0].op_id).toBe('op-1');
        expect(result1.results[1].op_id).toBe('op-2');

        // Check identity excluding timestamps/latency
        const clean1 = JSON.parse(JSON.stringify(result1));
        const clean2 = JSON.parse(JSON.stringify(result2));
        delete clean1.latency_ms; delete clean1.meta.requested_at;
        delete clean2.latency_ms; delete clean2.meta.requested_at;

        expect(JSON.stringify(clean1)).toBe(JSON.stringify(clean2));
    });
});

// Run tests
(async () => {
    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
            passed++;
        } catch (e) {
            console.error(`  ✗ ${t.name}`);
            console.error(`    ${e.message}`);
            console.error(e.stack);
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
})();
