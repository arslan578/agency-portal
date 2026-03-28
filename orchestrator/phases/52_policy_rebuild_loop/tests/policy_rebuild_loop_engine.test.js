/**
 * Phase 52: Policy-Aware Rebuild Loop Engine Tests
 * Exactly 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const assert = require('assert');
const { execute, _internal } = require('../policy_rebuild_loop_engine');

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
        toBeGreaterThan(value) { assert.ok(actual > value); }
    };
}

// Helper to create valid envelope
function createValidEnvelope(phase51Status = 'SUCCESS', phase51StopReason = 'SUCCESS') {
    return {
        execution_id: 'exec-123',
        tenant: 'tenant-1',
        workspace_id: 'ws-1',
        brand_id: 'br-1',
        requested_at: '2023-01-01T00:00:00Z',
        phase_51: {
            status: phase51Status,
            status_code: 'OK',
            stop_reason: phase51StopReason,
            attempts: [],
            connector_request: { operation: 'test' },
            connector_output: { result: 'ok' }
        },
        policy_ruleset_id: 'ruleset-123',
        snapshot_id: 'snap-123'
    };
}

describe('Phase 52: Policy-Aware Rebuild Loop Engine', () => {
    // Enable feature flag by default
    process.env.FF_POLICY_AWARE_REBUILD_LOOP = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Feature flag disabled returns NO_REBUILD', async () => {
        process.env.FF_POLICY_AWARE_REBUILD_LOOP = 'false';

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('NO_REBUILD');
        expect(result.phase_52.reason).toBe('FEATURE_DISABLED');
        expect(result.phase_52.meta.feature_flag_enabled).toBe(false);
        expect(result.phase_52.actions.length).toBe(0);

        process.env.FF_POLICY_AWARE_REBUILD_LOOP = 'true';
    });

    test('Happy 2: Phase 51 SUCCESS returns NO_REBUILD', async () => {
        const envelope = createValidEnvelope('SUCCESS', 'SUCCESS');
        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('NO_REBUILD');
        expect(result.phase_52.reason).toBe('NO_REBUILD_REQUIRED');
        expect(result.phase_52.actions.length).toBe(0);
    });

    test('Happy 3: PARTIAL_SUCCESS returns PARTIAL_REBUILD via policy', async () => {
        const envelope = createValidEnvelope('SUCCESS', 'PARTIAL_SUCCESS');
        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('PARTIAL_REBUILD');
        expect(result.phase_52.reason).toBe('PARTIAL_SUCCESS_RECOVERABLE');
        expect(result.phase_52.actions.length).toBeGreaterThan(0);
        expect(result.phase_52.actions[0].action_type).toBe('REBUILD_FIELDS');
    });

    test('Happy 4: HARD_FAIL (non-auth) returns FULL_REBUILD', async () => {
        const envelope = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');
        envelope.phase_51.status_code = 'NETWORK_ERROR';

        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('FULL_REBUILD');
        expect(result.phase_52.reason).toBe('HARD_FAILURE_RECOVERABLE');
        expect(result.phase_52.actions.length).toBeGreaterThan(0);
        expect(result.phase_52.actions[0].action_type).toBe('REBUILD_REQUEST');
    });

    test('Happy 5: RETRY_EXHAUSTED returns FULL_REBUILD', async () => {
        const envelope = createValidEnvelope('RETRY_EXHAUSTED', 'LIMIT_REACHED');
        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('FULL_REBUILD');
        expect(result.phase_52.reason).toBe('TRANSIENT_FAILURE');
        expect(result.phase_52.actions[0].action_type).toBe('REBUILD_REQUEST');
    });

    test('Happy 6: AUTH_ERROR returns NO_REBUILD (policy forbids)', async () => {
        const envelope = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');
        envelope.phase_51.status_code = 'AUTH_ERROR';

        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('NO_REBUILD');
        expect(result.phase_52.reason).toBe('POLICY_FORBIDS_REBUILD');
        expect(result.phase_52.actions.length).toBe(0);
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Missing phase_51 block returns error', async () => {
        const envelope = {
            execution_id: 'exec-123',
            tenant: 'tenant-1',
            workspace_id: 'ws-1',
            brand_id: 'br-1',
            policy_ruleset_id: 'ruleset-123',
            snapshot_id: 'snap-123'
        };

        const result = await execute(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
        expect(result.phase_52.reason).toBe('VALIDATION_ERROR');
    });

    test('Negative 8: Missing policy_ruleset_id returns error', async () => {
        const envelope = createValidEnvelope();
        delete envelope.policy_ruleset_id;

        const result = await execute(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
    });

    test('Negative 9: Missing phase_51.status returns error', async () => {
        const envelope = createValidEnvelope();
        delete envelope.phase_51.status;

        const result = await execute(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
    });

    test('Negative 10: Malformed attempts array returns error', async () => {
        const envelope = createValidEnvelope();
        envelope.phase_51.attempts = 'not-an-array';

        const result = await execute(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
    });

    test('Negative 11: Policy resolver throws error', async () => {
        _internal.setPolicyResolver({
            resolve() {
                throw new Error('Policy resolver error');
            }
        });

        const envelope = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');
        const result = await execute(envelope);

        expect(result.ok).toBe(false);
        expect(result.phase_52.reason).toBe('VALIDATION_ERROR');
    });

    test('Negative 12: Invalid envelope (null) returns error', async () => {
        const result = await execute(null);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: Empty actions for NO_REBUILD', async () => {
        const envelope = createValidEnvelope('SUCCESS', 'SUCCESS');
        const result = await execute(envelope);

        expect(result.phase_52.actions).toEqual([]);
        expect(result.phase_52.snapshot.final_status).toBe('NO_REBUILD');
    });

    test('Edge 14: Single attempt in Phase 51', async () => {
        const envelope = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');
        envelope.phase_51.status_code = 'NETWORK_ERROR';  // Use non-auth error
        envelope.phase_51.attempts = [
            { attempt_number: 1, status: 'FAILED', retryable: false }
        ];

        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('FULL_REBUILD');
    });

    test('Edge 15: Large connector response object', async () => {
        const envelope = createValidEnvelope('SUCCESS', 'PARTIAL_SUCCESS');
        envelope.phase_51.connector_output = {
            results: Array(100).fill({ id: 'item', status: 'ok' })
        };

        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.snapshot).toBeTruthy();
    });

    test('Edge 16: Custom policy decision via mock', async () => {
        _internal.setPolicyResolver({
            resolve() {
                return {
                    decision: 'PARTIAL_REBUILD',
                    reason: 'CUSTOM_POLICY',
                    details: { fields: ['custom_field'] },
                    policy_version: 'custom_v1'
                };
            }
        });

        const envelope = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');
        const result = await execute(envelope);

        expect(result.ok).toBe(true);
        expect(result.phase_52.status).toBe('PARTIAL_REBUILD');
        expect(result.phase_52.reason).toBe('CUSTOM_POLICY');
        expect(result.phase_52.meta.rebuild_policy_version).toBe('custom_v1');
    });

    // --- Regression Test (1) ---

    test('Regression 17: Snapshot for known PARTIAL_SUCCESS scenario', async () => {
        const envelope = createValidEnvelope('SUCCESS', 'PARTIAL_SUCCESS');
        envelope.execution_id = 'regression-test-exec';
        envelope.snapshot_id = 'regression-snap';

        const result = await execute(envelope);

        // Lock in specific behavior
        expect(result.phase_52.status).toBe('PARTIAL_REBUILD');
        expect(result.phase_52.snapshot.decision_inputs.execution_id).toBe('regression-test-exec');
        expect(result.phase_52.snapshot.decision_inputs.snapshot_id).toBe('regression-snap');
        expect(result.phase_52.snapshot.final_status).toBe('PARTIAL_REBUILD');
        expect(result.phase_52.snapshot.policy_rule_id).toBe('default_v1');
    });

    // --- Determinism Test (1) ---

    test('Determinism 18: Identical inputs produce identical outputs', async () => {
        const envelope1 = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');
        const envelope2 = createValidEnvelope('HARD_FAIL', 'HARD_ERROR');

        const result1 = await execute(envelope1);
        const result2 = await execute(envelope2);

        // Deep equality check (excluding timestamps if added)
        expect(result1.phase_52.status).toBe(result2.phase_52.status);
        expect(result1.phase_52.reason).toBe(result2.phase_52.reason);
        expect(JSON.stringify(result1.phase_52.actions)).toBe(JSON.stringify(result2.phase_52.actions));
        expect(JSON.stringify(result1.phase_52.snapshot)).toBe(JSON.stringify(result2.phase_52.snapshot));
    });
});

// Run tests
(async () => {
    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        try {
            // Reset policy resolver before each test
            _internal.resetPolicyResolver();

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

    // Reset environment
    _internal.resetPolicyResolver();
})();
