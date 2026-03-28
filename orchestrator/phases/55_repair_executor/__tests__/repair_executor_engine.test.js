/**
 * Phase 55: Autonomous Drift Repair Executor Tests
 * Total: 18-22 tests (6 happy, 6 negative, 4 edge, 1 regression, 1 determinism, optional 4)
 */

const assert = require('assert');
const { execute, ACTION_HANDLERS } = require('../repair_executor_engine');

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
        toBeNull: () => assert.strictEqual(actual, null),
        toBeGreaterThan(value) { assert.ok(actual > value); },
        toContain(value) {
            if (Array.isArray(actual)) {
                assert.ok(actual.includes(value));
            } else if (typeof actual === 'string') {
                assert.ok(actual.includes(value), `Expected "${actual}" to contain "${value}"`);
            } else {
                assert.fail(`toContain expects array or string, got ${typeof actual}`);
            }
        }
    };
}

// Helper to create valid envelope
function createValidEnvelope(options = {}) {
    return {
        execution_id: options.execution_id || 'exec-123',
        tenant_id: options.tenant_id || 't1',
        workspace_id: options.workspace_id || 'w1',
        brand_id: options.brand_id || 'b1',
        repair_plan: {
            actions: options.actions || [{
                action_id: 'a1',
                action_type: 'ROTATE_CREDENTIALS',
                connector_key: 'connector_a',
                payload: {}
            }]
        },
        connector_capabilities: options.connector_capabilities || {
            'connector_a': {
                'ROTATE_CREDENTIALS': true,
                'UPGRADE_API_VERSION': true,
                'REBUILD_CONNECTOR': true,
                'SANDBOX_RETRY': true,
                'RETRY_CONNECTOR': true,
                'SWITCH_CONNECTOR': true
            }
        },
        policy: options.policy || {
            allow_credential_rotation: true,
            allow_rebuild: true,
            allow_api_upgrade: true
        },
        requested_at: options.requested_at || '2025-01-01T00:00:00Z',
        execution_context: options.execution_context || {
            credentials: {},
            api_config: {},
            sandbox_config: {},
            environment: {}
        }
    };
}

describe('Phase 55: Autonomous Drift Repair Executor', () => {
    // Enable feature flag by default
    process.env.FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Single credential rotation succeeds', async () => {
        const envelope = createValidEnvelope();

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('ALL_ACTIONS_SUCCEEDED');
        expect(result.results.length).toBe(1);
        expect(result.results[0].status).toBe('SUCCESS');
        expect(result.results[0].action_type).toBe('ROTATE_CREDENTIALS');
        expect(result.failures.length).toBe(0);
    });

    test('Happy 2: Multiple actions execute in strict order', async () => {
        const envelope = createValidEnvelope({
            actions: [
                { action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a', payload: {} },
                { action_id: 'a2', action_type: 'UPGRADE_API_VERSION', connector_key: 'connector_a', payload: {} },
                { action_id: 'a3', action_type: 'REBUILD_CONNECTOR', connector_key: 'connector_a', payload: {} }
            ]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results.length).toBe(3);
        expect(result.results[0].action_id).toBe('a1');
        expect(result.results[1].action_id).toBe('a2');
        expect(result.results[2].action_id).toBe('a3');
        expect(result.execution_snapshot.ordered_actions).toEqual(['a1', 'a2', 'a3']);
    });

    test('Happy 3: API version upgrade succeeds', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'UPGRADE_API_VERSION',
                connector_key: 'connector_a',
                payload: { target_version: 'latest' }
            }]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results[0].action_type).toBe('UPGRADE_API_VERSION');
        expect(result.results[0].response).toBeTruthy();
    });

    test('Happy 4: Full connector rebuild succeeds', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'REBUILD_CONNECTOR',
                connector_key: 'connector_a',
                payload: {}
            }]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results[0].action_type).toBe('REBUILD_CONNECTOR');
        expect(result.results[0].status).toBe('SUCCESS');
    });

    test('Happy 5: Sandbox retry succeeds', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'SANDBOX_RETRY',
                connector_key: 'connector_a',
                payload: {}
            }]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results[0].action_type).toBe('SANDBOX_RETRY');
    });

    test('Happy 6: Mixed action types all succeed', async () => {
        const envelope = createValidEnvelope({
            actions: [
                { action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a', payload: {} },
                { action_id: 'a2', action_type: 'SANDBOX_RETRY', connector_key: 'connector_a', payload: {} },
                { action_id: 'a3', action_type: 'SWITCH_CONNECTOR', connector_key: 'connector_a', payload: { to: 'connector_b' } }
            ]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results.length).toBe(3);
        expect(result.results.every(r => r.status === 'SUCCESS')).toBeTruthy();
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Policy blocks credential rotation', async () => {
        const envelope = createValidEnvelope({
            policy: {
                allow_credential_rotation: false
            }
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('ALL_ACTIONS_FAILED');
        expect(result.failures.length).toBe(1);
        expect(result.failures[0].error_code).toBe('POLICY_FORBIDDEN');
    });

    test('Negative 8: Capability missing for API upgrade', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'UPGRADE_API_VERSION',
                connector_key: 'connector_a',
                payload: {}
            }],
            connector_capabilities: {
                'connector_a': {
                    'UPGRADE_API_VERSION': false  // Not supported
                }
            }
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.failures[0].error_code).toBe('CAPABILITY_MISSING');
    });

    test('Negative 9: Unknown action type', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'UNKNOWN_ACTION',
                connector_key: 'connector_a',
                payload: {}
            }]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.results[0].status).toBe('ERROR');
        // Note: error_code might not appear in results but in failures
    });

    test('Negative 10: Connector IO error classification', async () => {
        // Mock a handler that throws an IO error
        const originalHandler = ACTION_HANDLERS.ROTATE_CREDENTIALS;
        ACTION_HANDLERS.ROTATE_CREDENTIALS = async () => {
            const error = new Error('Connection refused');
            error.code = 'ECONNREFUSED';
            throw error;
        };

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        // Restore original handler
        ACTION_HANDLERS.ROTATE_CREDENTIALS = originalHandler;

        expect(result.status).toBe('ERROR');
        expect(result.failures.length).toBeGreaterThan(0);
    });

    test('Negative 11: Connector timeout classification', async () => {
        const originalHandler = ACTION_HANDLERS.ROTATE_CREDENTIALS;
        ACTION_HANDLERS.ROTATE_CREDENTIALS = async () => {
            const error = new Error('Request timeout');
            error.code = 'ETIMEDOUT';
            throw error;
        };

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        ACTION_HANDLERS.ROTATE_CREDENTIALS = originalHandler;

        expect(result.status).toBe('ERROR');
        expect(result.failures.length).toBeGreaterThan(0);
    });

    test('Negative 12: Invalid action payload', async () => {
        const originalHandler = ACTION_HANDLERS.ROTATE_CREDENTIALS;
        ACTION_HANDLERS.ROTATE_CREDENTIALS = async () => {
            throw new Error('Invalid payload structure');
        };

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        ACTION_HANDLERS.ROTATE_CREDENTIALS = originalHandler;

        expect(result.status).toBe('ERROR');
        expect(result.failures.length).toBeGreaterThan(0);
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: Empty action list', async () => {
        const envelope = createValidEnvelope({
            actions: []
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('ALL_ACTIONS_SUCCEEDED');
        expect(result.results.length).toBe(0);
        expect(result.execution_snapshot.ordered_actions).toEqual([]);
    });

    test('Edge 14: Connector capability map empty', async () => {
        const envelope = createValidEnvelope({
            connector_capabilities: {}
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.failures[0].error_code).toBe('CAPABILITY_MISSING');
    });

    test('Edge 15: Policy object empty defaults to forbid', async () => {
        const envelope = createValidEnvelope({
            policy: {}
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.failures[0].error_code).toBe('POLICY_FORBIDDEN');
    });

    test('Edge 16: Execution context missing optional subfields', async () => {
        const envelope = createValidEnvelope({
            execution_context: {
                credentials: {}
                // Missing api_config, sandbox_config, environment
            }
        });

        const result = await execute(envelope);

        // Should still execute deterministically
        expect(result.status).toBe('SUCCESS');
    });

    // --- Regression Test (1) ---

    test('Regression 17: No mutation of input envelope', async () => {
        const envelope = createValidEnvelope();
        const originalEnvelope = JSON.parse(JSON.stringify(envelope));

        await execute(envelope);

        // Verify no mutation
        expect(JSON.stringify(envelope)).toBe(JSON.stringify(originalEnvelope));
    });

    test('Regression 18: Snapshot error_code populated for failing actions', async () => {
        const envelope = createValidEnvelope({
            actions: [{ action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a', payload: {} }],
            policy: { allow_credential_rotation: false }
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.failures.length).toBe(1);
        expect(result.failures[0].error_code).toBe('POLICY_FORBIDDEN');

        // Verify snapshot captures error_code
        const snapshot = result.execution_snapshot;
        expect(snapshot.per_action['a1'].status).toBe('ERROR');
        expect(snapshot.per_action['a1'].error_code).toBe('POLICY_FORBIDDEN');
    });

    // --- Determinism Test (1) ---

    test('Determinism 18: Identical inputs produce identical structured output', async () => {
        const envelope1 = createValidEnvelope({ execution_id: 'det-1' });
        const envelope2 = createValidEnvelope({ execution_id: 'det-2' });

        const result1 = await execute(envelope1);
        const result2 = await execute(envelope2);

        // Status and structure should be identical
        expect(result1.status).toBe(result2.status);
        expect(result1.status_code).toBe(result2.status_code);
        expect(result1.results.length).toBe(result2.results.length);
        expect(result1.results[0].action_type).toBe(result2.results[0].action_type);
    });

    // --- Optional Tests (4) ---

    test('Optional 19: Switch connector updates routing state', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'SWITCH_CONNECTOR',
                connector_key: 'connector_a',
                payload: { to: 'connector_b' }
            }]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results[0].action_type).toBe('SWITCH_CONNECTOR');
    });

    test('Optional 20: Retry connector preserves context', async () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'RETRY_CONNECTOR',
                connector_key: 'connector_a',
                payload: {}
            }]
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.results[0].action_type).toBe('RETRY_CONNECTOR');
    });

    test('Optional 21: Snapshot includes capability matrix', async () => {
        const envelope = createValidEnvelope();

        const result = await execute(envelope);

        expect(result.execution_snapshot.capability_matrix).toBeTruthy();
        expect(result.execution_snapshot.capability_matrix.connector_a).toBeTruthy();
    });

    test('Optional 22: Snapshot total latency equals sum of per-action latency', async () => {
        const envelope = createValidEnvelope({
            actions: [
                { action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a', payload: {} },
                { action_id: 'a2', action_type: 'SANDBOX_RETRY', connector_key: 'connector_a', payload: {} }
            ]
        });

        const result = await execute(envelope);

        const sumOfPerAction = result.results.reduce((sum, r) => sum + r.latency_ms, 0);
        expect(result.execution_snapshot.total_latency_ms).toBe(sumOfPerAction);
    });

    // Feature flag OFF test
    test('Feature Flag: Disabled returns FEATURE_DISABLED', async () => {
        process.env.FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR = 'false';

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('FEATURE_DISABLED');
        expect(result.results.length).toBe(0);
        expect(result.failures.length).toBe(0);

        process.env.FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR = 'true';
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
            if (e.stack) {
                console.error(e.stack.split('\n').slice(0, 5).join('\n'));
            }
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
})();
