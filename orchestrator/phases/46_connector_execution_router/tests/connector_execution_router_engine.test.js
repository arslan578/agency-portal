const assert = require('assert');
const { executeConnectorRouter, ERROR_CODES, _internal } = require('../connector_execution_router_engine');

// Mock connector engine
const createMockEngine = (name, shouldFail = false) => ({
    execute: async (req, context) => {
        if (shouldFail) throw new Error(`${name} failed`);
        return {
            status: 'SUCCESS',
            status_code: 'OK',
            response_body: { id: `${name}_${req.request_id}` },
            latency_ms: 10
        };
    }
});

// Test Harness
async function runTests() {
    console.log('Running Phase 46: Connector Execution Router Tests...\n');
    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            // Reset registry and env before each test
            process.env.FF_CONNECTOR_EXECUTION_ROUTER = 'true';
            _internal.setConnectorRegistry({
                google_ads: createMockEngine('google'),
                meta_ads: createMockEngine('meta'),
                tiktok_ads: createMockEngine('tiktok')
            });

            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${name}`);
            console.error(e);
            failed++;
        }
    };

    // Helper to create base envelope
    const createEnvelope = (requests = [], meta = {}) => ({
        meta: {
            execution_id: 'exec-1',
            workspace_id: 'ws-1',
            brand_id: 'br-1',
            trace_domain: 'td-1',
            ...meta
        },
        payload: {
            connector_execution_requests: requests
        }
    });

    // --- Happy Path (6) ---

    await test('1. Single Google request, flag on', async () => {
        const req = { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req]);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.summary.total_requests, 1);
        assert.strictEqual(routerRes.summary.total_success, 1);
        assert.strictEqual(routerRes.results[0].connector_key, 'google_ads');
        assert.strictEqual(routerRes.results[0].status, 'SUCCESS');
    });

    await test('2. Multiple Google requests, flag on', async () => {
        const reqs = [
            { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} },
            { connector_key: 'google_ads', connector_intent: 'UPDATE', request_id: 'req-2', request_body: {} },
            { connector_key: 'google_ads', connector_intent: 'DELETE', request_id: 'req-3', request_body: {} }
        ];
        const envelope = createEnvelope(reqs);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.summary.total_requests, 3);
        assert.strictEqual(routerRes.summary.total_success, 3);
        assert.strictEqual(routerRes.results.length, 3);
    });

    await test('3. Mixed connectors, all known', async () => {
        const reqs = [
            { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-g', request_body: {} },
            { connector_key: 'meta_ads', connector_intent: 'CREATE', request_id: 'req-m', request_body: {} },
            { connector_key: 'tiktok_ads', connector_intent: 'CREATE', request_id: 'req-t', request_body: {} }
        ];
        const envelope = createEnvelope(reqs);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.summary.total_requests, 3);
        assert.strictEqual(routerRes.summary.per_connector.google_ads.requests, 1);
        assert.strictEqual(routerRes.summary.per_connector.meta_ads.requests, 1);
        assert.strictEqual(routerRes.summary.per_connector.tiktok_ads.requests, 1);
    });

    await test('4. Replay dry run, no IO', async () => {
        const req = { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req], { replay_mode: 'DRY_RUN' });

        // Mock engine that throws if called
        _internal.setConnectorRegistry({
            google_ads: { execute: () => { throw new Error('Should not be called'); } }
        });

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.no_op, true);
        assert.strictEqual(routerRes.results.length, 0);
    });

    await test('5. Replay rehydrate with snapshot', async () => {
        const req = { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req], { replay_mode: 'REHYDRATE' });
        envelope.snapshot = {
            connectors: {
                'req-1': { status: 'SUCCESS', response_body: { rehydrated: true } }
            }
        };

        // Mock engine that throws if called
        _internal.setConnectorRegistry({
            google_ads: { execute: () => { throw new Error('Should not be called'); } }
        });

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.results[0].replay_source, 'SNAPSHOT');
        assert.strictEqual(routerRes.results[0].response_body.rehydrated, true);
    });

    await test('6. Passthrough behavior when flag is off', async () => {
        process.env.FF_CONNECTOR_EXECUTION_ROUTER = 'false';
        const req = { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req]);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        // Passthrough returns        // Rev1 Requirement 5A: Assert no no_op property
        assert.strictEqual(routerRes.no_op, undefined);
        assert.strictEqual(routerRes.summary.per_connector.google_ads.requests, 1);

        // Rev1.1 Requirement 3: Tighten Test 6
        assert.strictEqual(routerRes.results.length, 1);
        assert.strictEqual(routerRes.results[0].status, 'FAILED');
    });

    // --- Negative Path (6) ---

    await test('7. Missing payload', async () => {
        const envelope = { meta: {} };
        const result = await executeConnectorRouter(envelope);
        assert.strictEqual(result.payload.connector_execution_router_error.error_code, ERROR_CODES.MALFORMED_INPUT);
    });

    await test('8. connector_execution_requests is not an array', async () => {
        const envelope = createEnvelope();
        envelope.payload.connector_execution_requests = 'not-array';
        const result = await executeConnectorRouter(envelope);
        assert.strictEqual(result.payload.connector_execution_router_error.error_code, ERROR_CODES.MALFORMED_INPUT);
    });

    await test('9. Request missing connector_key', async () => {
        const req = { connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req]);
        const result = await executeConnectorRouter(envelope);
        assert.strictEqual(result.payload.connector_execution_router_error.error_code, ERROR_CODES.MALFORMED_INPUT);
    });

    await test('10. Unknown connector_key', async () => {
        const req = { connector_key: 'unknown_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req]);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.summary.total_failed, 1);
        assert.strictEqual(routerRes.unknown_connectors[0].connector_key, 'unknown_ads');
        assert.strictEqual(routerRes.unknown_connectors[0].error_code, ERROR_CODES.UNKNOWN_CONNECTOR);
    });

    await test('11. Registry misconfigured (now handled by Phase 47)', async () => {
        const req = { connector_key: 'bad_connector', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req]);

        _internal.setConnectorRegistry({
            bad_connector: {} // Missing execute - Phase 47 adapter uses default stub
        });

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        // With Phase 47 adapter, this succeeds with default stub executor
        assert.strictEqual(routerRes.summary.total_requests, 1);
        assert.strictEqual(routerRes.results[0].status, 'SUCCESS');
    });

    await test('12. Replay requested but snapshot missing', async () => {
        const req = { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: {} };
        const envelope = createEnvelope([req], { replay_mode: 'REHYDRATE' });
        // No snapshot

        const result = await executeConnectorRouter(envelope);
        assert.strictEqual(result.payload.connector_execution_router_error.error_code, ERROR_CODES.REPLAY_SNAPSHOT_MISSING);
    });

    // Rev1.1 Requirement 1: Add explicit meta-negative tests
    await test('12a. Missing meta object', async () => {
        const envelope = { payload: { connector_execution_requests: [] } };
        const result = await executeConnectorRouter(envelope);
        assert.strictEqual(result.payload.connector_execution_router_error.error_code, ERROR_CODES.MALFORMED_INPUT);
    });

    await test('12b. Missing meta.execution_id', async () => {
        const envelope = {
            meta: { execution_id: '', workspace_id: 'ws', brand_id: 'br', trace_domain: 'td' },
            payload: { connector_execution_requests: [] }
        };
        const result = await executeConnectorRouter(envelope);
        assert.strictEqual(result.payload.connector_execution_router_error.error_code, ERROR_CODES.MALFORMED_INPUT);
    });

    // --- Edge Cases (4) ---

    await test('13. Zero length connector_execution_requests', async () => {
        const envelope = createEnvelope([]);
        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        // Rev1.1 Requirement 2: Tighten Test 13
        assert.strictEqual(routerRes.no_op, true);
        assert.strictEqual(routerRes.results.length, 0);
        assert.strictEqual(routerRes.summary.total_requests, 0);
    });

    await test('14. High cardinality but small registry', async () => {
        const reqs = Array(100).fill(null).map((_, i) => ({
            connector_key: 'google_ads',
            connector_intent: 'CREATE',
            request_id: `req-${i}`,
            request_body: {}
        }));
        const envelope = createEnvelope(reqs);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.summary.total_requests, 100);
        assert.strictEqual(routerRes.summary.total_success, 100);
    });

    // 15. Edge case: duplicate request_id handling
    await test('15. Duplicate request_id handling', async () => {
        const reqs = [
            { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: { a: 1 } },
            { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: { a: 2 } }
        ];
        const envelope = createEnvelope(reqs);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        assert.strictEqual(routerRes.results.length, 2);
        assert.strictEqual(routerRes.results[0].request_id, 'req-1');
        assert.strictEqual(routerRes.results[1].request_id, 'req-1');
    });

    // 16. Edge case: large request_body with nested objects
    await test('16. Large nested request_body', async () => {
        const largeBody = { nested: { deep: { array: Array(1000).fill('data') } } };
        const req = { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-1', request_body: largeBody };
        const envelope = createEnvelope([req]);

        const result = await executeConnectorRouter(envelope);
        const routerRes = result.payload.connector_execution_router;

        // Ensure body was passed through without error and result contains it (mock returns stub, but we check execution)
        assert.strictEqual(routerRes.results[0].status, 'SUCCESS');
        // Check immutability of input
        assert.strictEqual(req.request_body.nested.deep.array.length, 1000);
    });

    // --- Guards (2) ---

    await test('17. Determinism guard', async () => {
        const reqs = [
            { connector_key: 'tiktok_ads', connector_intent: 'CREATE', request_id: 'req-t', request_body: {} },
            { connector_key: 'google_ads', connector_intent: 'CREATE', request_id: 'req-g', request_body: {} },
            { connector_key: 'meta_ads', connector_intent: 'CREATE', request_id: 'req-m', request_body: {} }
        ];
        const envelope = createEnvelope(reqs);

        const result1 = await executeConnectorRouter(JSON.parse(JSON.stringify(envelope)));
        const result2 = await executeConnectorRouter(JSON.parse(JSON.stringify(envelope)));

        assert.strictEqual(JSON.stringify(result1), JSON.stringify(result2));

        // Check sorting: Google, Meta, TikTok
        const keys = result1.payload.connector_execution_router.results.map(r => r.connector_key);
        assert.deepStrictEqual(keys, ['google_ads', 'meta_ads', 'tiktok_ads']);
    });

    await test('18. Regression guard', async () => {
        // Known scenario: Mixed keys, mixed IDs
        const reqs = [
            { connector_key: 'meta_ads', connector_intent: 'C', request_id: 'r2', request_body: {} },
            { connector_key: 'google_ads', connector_intent: 'A', request_id: 'r1', request_body: {} },
            { connector_key: 'meta_ads', connector_intent: 'B', request_id: 'r1', request_body: {} }
        ];
        const envelope = createEnvelope(reqs);

        const result = await executeConnectorRouter(envelope);
        const results = result.payload.connector_execution_router.results;

        // Expected order: 
        // 1. google_ads, r1
        // 2. meta_ads, r1
        // 3. meta_ads, r2

        assert.strictEqual(results[0].connector_key, 'google_ads');
        assert.strictEqual(results[0].request_id, 'r1');

        assert.strictEqual(results[1].connector_key, 'meta_ads');
        assert.strictEqual(results[1].request_id, 'r1');

        assert.strictEqual(results[2].connector_key, 'meta_ads');
        assert.strictEqual(results[2].request_id, 'r2');
    });

    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
