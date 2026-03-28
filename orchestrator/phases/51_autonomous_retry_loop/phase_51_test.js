/**
 * Phase 51: Autonomous Retry Loop Engine Tests
 * Exactly 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const assert = require('assert');
const autonomousRetryLoop = require('./autonomous_retry_loop_engine');
const tiktokAdsConnectorEngine = require('../50_tiktok_ads_connector/tiktok_ads_connector_engine');

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
        toBeGreaterThanOrEqual: (value) => assert.ok(actual >= value)
    };
}

// Mock dependencies
const originalExecute = tiktokAdsConnectorEngine.execute;

// Test Data
const validEnvelope = {
    execution_id: 'exec-123',
    connector_key: 'tiktok_ads',
    attempt_limit: 3,
    requested_at: '2023-01-01T00:00:00Z',
    tenant: { workspace_id: 'ws-1', brand_id: 'br-1' },
    connector_request: {
        contract_version: 'tiktok_ads_v1',
        account: { tiktok_advertiser_id: '123', credential_ref: 'ref' },
        operations: []
    }
};

// Helper to mock connector response
function mockConnectorResponse(status, statusCode, errors = []) {
    return {
        execution_id: 'exec-123',
        connector_key: 'tiktok_ads',
        status,
        status_code: statusCode,
        results: [],
        latency_ms: 10,
        meta: {
            contract_version: 'tiktok_ads_v1',
            attempted_operation_count: 1,
            succeeded_operation_count: status === 'SUCCESS' ? 1 : 0,
            failed_operation_count: status === 'FAILED' ? 1 : 0,
            retries_applied: 0,
            feature_flag_enabled: true,
            requested_at: '2023-01-01T00:00:00Z'
        },
        errors
    };
}

describe('Phase 51: Autonomous Retry Loop Engine', () => {
    // Enable feature flag by default for tests
    process.env.FF_AUTONOMOUS_RETRY_LOOP = 'true';

    // --- Happy Path (6 Tests) ---

    test('Happy 1: Success on first attempt', async () => {
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('SUCCESS', 'OK');

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('SUCCESS');
        expect(response.meta.total_attempts).toBe(1);
        expect(response.meta.stop_reason).toBe('SUCCESS');
        expect(response.attempts.length).toBe(1);
        expect(response.attempts[0].status).toBe('SUCCESS');
    });

    test('Happy 2: Retry on RATE_LIMITED then Success', async () => {
        let attempts = 0;
        tiktokAdsConnectorEngine.execute = async () => {
            attempts++;
            if (attempts === 1) return mockConnectorResponse('FAILED', 'RATE_LIMITED', [{ code: 'RATE_LIMIT' }]);
            return mockConnectorResponse('SUCCESS', 'OK');
        };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('SUCCESS');
        expect(response.meta.total_attempts).toBe(2);
        expect(response.attempts[0].status).toBe('FAILED');
        expect(response.attempts[0].retryable).toBe(true);
        expect(response.attempts[1].status).toBe('SUCCESS');
    });

    test('Happy 3: Retry on UPSTREAM_SERVICE_FAILURE then Success', async () => {
        let attempts = 0;
        tiktokAdsConnectorEngine.execute = async () => {
            attempts++;
            if (attempts === 1) return mockConnectorResponse('FAILED', 'UPSTREAM_SERVICE_FAILURE', [{ code: 'UPSTREAM_SERVICE_FAILURE' }]);
            return mockConnectorResponse('SUCCESS', 'OK');
        };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('SUCCESS');
        expect(response.meta.total_attempts).toBe(2);
    });

    test('Happy 4: Retry on NETWORK_TIMEOUT then Success', async () => {
        let attempts = 0;
        tiktokAdsConnectorEngine.execute = async () => {
            attempts++;
            if (attempts === 1) return mockConnectorResponse('FAILED', 'NETWORK_TIMEOUT', [{ code: 'NETWORK_TIMEOUT' }]);
            return mockConnectorResponse('SUCCESS', 'OK');
        };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('SUCCESS');
        expect(response.meta.total_attempts).toBe(2);
    });

    test('Happy 5: Success on last allowed attempt', async () => {
        let attempts = 0;
        tiktokAdsConnectorEngine.execute = async () => {
            attempts++;
            if (attempts < 3) return mockConnectorResponse('FAILED', 'RATE_LIMITED', [{ code: 'RATE_LIMIT' }]);
            return mockConnectorResponse('SUCCESS', 'OK');
        };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('SUCCESS');
        expect(response.meta.total_attempts).toBe(3);
    });

    test('Happy 6: Pass-through mode (Feature Flag Disabled)', async () => {
        process.env.FF_AUTONOMOUS_RETRY_LOOP = 'false';
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('SUCCESS', 'OK');

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('SUCCESS');
        expect(response.meta.feature_flag_enabled).toBe(false);
        expect(response.meta.total_attempts).toBe(1);
        expect(response.meta.stop_reason).toBe('FEATURE_DISABLED');
        expect(response.final_response.status).toBe('SUCCESS');
        expect(response.attempts.length).toBe(1);

        process.env.FF_AUTONOMOUS_RETRY_LOOP = 'true';
    });

    // --- Negative Path (6 Tests) ---

    test('Negative 7: Hard Failure (AUTH_ERROR) stops immediately', async () => {
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('FAILED', 'AUTH_ERROR', [{ code: 'AUTH_TOKEN_INVALID' }]);

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('HARD_FAIL');
        expect(response.meta.total_attempts).toBe(1);
        expect(response.meta.stop_reason).toBe('HARD_ERROR');
        expect(response.attempts[0].retryable).toBe(false);
    });

    test('Negative 8: Hard Failure (INVALID_REQUEST) stops immediately', async () => {
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('FAILED', 'INVALID_REQUEST', [{ code: 'INVALID_REQUEST' }]);

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('HARD_FAIL');
        expect(response.meta.total_attempts).toBe(1);
    });

    test('Negative 9: Retry Exhaustion (Repeated RATE_LIMITED)', async () => {
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('FAILED', 'RATE_LIMITED', [{ code: 'RATE_LIMIT' }]);

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('RETRY_EXHAUSTED');
        expect(response.meta.total_attempts).toBe(3);
        expect(response.meta.stop_reason).toBe('LIMIT_REACHED');
    });

    test('Negative 10: Retry Exhaustion (Repeated NETWORK_ERROR)', async () => {
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('FAILED', 'NETWORK_ERROR', [{ code: 'NETWORK_ERROR' }]);

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('RETRY_EXHAUSTED');
        expect(response.meta.total_attempts).toBe(3);
    });

    test('Negative 11: Engine Crash handled as Hard Fail', async () => {
        tiktokAdsConnectorEngine.execute = async () => { throw new Error('Crash'); };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('HARD_FAIL');
        expect(response.meta.stop_reason).toBe('ENGINE_CRASH');
        expect(response.attempts[0].error_code).toBe('Crash');
    });

    test('Negative 12: Unsupported Connector Key', async () => {
        const invalidEnvelope = { ...validEnvelope, connector_key: 'unknown' };
        const response = await autonomousRetryLoop.execute(invalidEnvelope);

        expect(response.status).toBe('HARD_FAIL');
        expect(response.meta.stop_reason).toBe('VALIDATION_ERROR');
    });

    // --- Edge Cases (4 Tests) ---

    test('Edge 13: Custom Attempt Limit', async () => {
        const customEnvelope = { ...validEnvelope, attempt_limit: 5 };
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('FAILED', 'RATE_LIMITED', [{ code: 'RATE_LIMIT' }]);

        const response = await autonomousRetryLoop.execute(customEnvelope);

        expect(response.status).toBe('RETRY_EXHAUSTED');
        expect(response.meta.total_attempts).toBe(5);
    });

    test('Edge 14: Invalid Envelope (Missing Request)', async () => {
        const invalidEnvelope = { ...validEnvelope, connector_request: null };
        const response = await autonomousRetryLoop.execute(invalidEnvelope);

        expect(response.status).toBe('INVALID_REQUEST');
        expect(response.meta.stop_reason).toBe('VALIDATION_ERROR');
    });

    test('Edge 15: Pass-through mode with Connector Failure', async () => {
        process.env.FF_AUTONOMOUS_RETRY_LOOP = 'false';
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('FAILED', 'AUTH_ERROR');

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('HARD_FAIL');
        expect(response.final_response.status).toBe('FAILED');
        expect(response.meta.feature_flag_enabled).toBe(false);
        expect(response.meta.stop_reason).toBe('FEATURE_DISABLED');

        process.env.FF_AUTONOMOUS_RETRY_LOOP = 'true';
    });

    test('Edge 16: Pass-through mode with Engine Crash', async () => {
        process.env.FF_AUTONOMOUS_RETRY_LOOP = 'false';
        tiktokAdsConnectorEngine.execute = async () => { throw new Error('Crash'); };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.status).toBe('HARD_FAIL');
        expect(response.meta.feature_flag_enabled).toBe(false);
        expect(response.meta.stop_reason).toBe('FEATURE_DISABLED');

        process.env.FF_AUTONOMOUS_RETRY_LOOP = 'true';
    });

    // --- Regression (1 Test) ---

    test('Regression 17: Latency is positive', async () => {
        tiktokAdsConnectorEngine.execute = async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return mockConnectorResponse('SUCCESS', 'OK');
        };

        const response = await autonomousRetryLoop.execute(validEnvelope);

        expect(response.attempts[0].latency_ms).toBeGreaterThanOrEqual(1);
    });

    // --- Determinism (1 Test) ---

    test('Determinism 18: Identical inputs produce identical structure', async () => {
        tiktokAdsConnectorEngine.execute = async () => mockConnectorResponse('SUCCESS', 'OK');

        const response1 = await autonomousRetryLoop.execute(validEnvelope);
        const response2 = await autonomousRetryLoop.execute(validEnvelope);

        // Scrub timestamps and latencies
        const scrub = (r) => {
            r.attempts.forEach(a => { delete a.timestamp; delete a.latency_ms; });
            delete r.meta.requested_at;
        };
        scrub(response1);
        scrub(response2);

        expect(JSON.stringify(response1.attempts)).toBe(JSON.stringify(response2.attempts));
        expect(response1.status).toBe(response2.status);
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

    // Restore
    tiktokAdsConnectorEngine.execute = originalExecute;
})();
