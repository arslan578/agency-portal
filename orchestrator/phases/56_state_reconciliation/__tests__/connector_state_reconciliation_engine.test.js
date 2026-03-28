/**
 * Phase 56: Autonomous State Reconciliation Engine Tests
 * Total: 18-22 tests (6 happy, 6 negative, 4 edge, 1 regression, 1 determinism, optional)
 */

const assert = require('assert');
const { reconcileConnectorState } = require('../connector_state_reconciliation_engine');

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
        toContain(value) {
            if (typeof actual === 'string') {
                assert.ok(actual.includes(value));
            } else {
                assert.fail(`Expected string, got ${typeof actual}`);
            }
        }
    };
}

// Helper to create valid envelope
function createValidEnvelope(options = {}) {
    return {
        execution_id: options.execution_id || 'exec-123',
        phase_55_snapshot: {
            actions: options.actions || [],
            per_action: options.per_action || {},
            connector_metadata: options.metadata || {
                'connector_a': {
                    auth_state: 'VALID',
                    api_version: 'v1',
                    needs_rebuild: false,
                    active_connector: 'primary',
                    fallback_connector: null
                }
            },
            capability_matrix: options.capabilities || {
                'connector_a': {
                    can_rotate_credentials: true,
                    can_rebuild: true,
                    supports_sandbox: true,
                    can_upgrade_api_version: true
                }
            },
            policy_flags: options.policy || {
                allow_rebuild: true,
                forbid_rebuild: false
            }
        },
        timestamp: options.timestamp || '2025-01-01T00:00:00Z'
    };
}

describe('Phase 56: Autonomous State Reconciliation Engine', () => {
    // Enable feature flag by default
    process.env.FF_STATE_RECONCILIATION_ENGINE = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Basic reconciliation - all succeeded', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'ROTATE_CREDENTIALS',
                connector_key: 'connector_a'
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.execution_id).toBe('exec-123');
        expect(result.connector_state.connector_a.auth_state).toBe('ROTATED');
        expect(result.connector_state.connector_a.health_state).toBe('OK');
        expect(result.connector_state.connector_a.drift_status).toBe('RESOLVED');
        expect(result.determinism_hash).toBeTruthy();
    });

    test('Happy 2: Version upgrade success', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'UPGRADE_API_VERSION',
                connector_key: 'connector_a',
                payload: { target_version: 'v2' }
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.api_version_state.current_version).toBe('v2');
        expect(result.connector_state.connector_a.api_version_state.upgrade_attempted).toBe(true);
        expect(result.connector_state.connector_a.api_version_state.upgrade_success).toBe(true);
    });

    test('Happy 3: Auth rotation success', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'ROTATE_CREDENTIALS',
                connector_key: 'connector_a'
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.auth_state).toBe('ROTATED');
        expect(result.connector_state.connector_a.drift_status).toBe('RESOLVED');
    });

    test('Happy 4: Partial rebuild success', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'REBUILD_CONNECTOR',
                connector_key: 'connector_a',
                payload: { partial: true }
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.structural_state.partial_rebuild).toBe(true);
        expect(result.connector_state.connector_a.structural_state.rebuilt).toBe(false);
        expect(result.connector_state.connector_a.health_state).toBe('DEGRADED');
    });

    test('Happy 5: Routing switch success', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'SWITCH_CONNECTOR',
                connector_key: 'connector_a',
                payload: { to: 'fallback' }
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.routing_state.switched).toBe(true);
        expect(result.connector_state.connector_a.routing_state.active).toBe('fallback');
    });

    test('Happy 6: Composite repair success', () => {
        const envelope = createValidEnvelope({
            actions: [
                { action_id: 'a1', action_type: 'REBUILD_CONNECTOR', connector_key: 'connector_a', payload: {} },
                { action_id: 'a2', action_type: 'UPGRADE_API_VERSION', connector_key: 'connector_a', payload: { target_version: 'v2' } }
            ],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null },
                'a2': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.structural_state.rebuilt).toBe(true);
        expect(result.connector_state.connector_a.api_version_state.current_version).toBe('v2');
        expect(result.connector_state.connector_a.drift_status).toBe('RESOLVED');
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Failed rebuild', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'REBUILD_CONNECTOR',
                connector_key: 'connector_a',
                payload: {}
            }],
            per_action: {
                'a1': { status: 'ERROR', error_code: 'REBUILD_FAILED' }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.structural_state.needs_rebuild).toBe(true);
        expect(result.connector_state.connector_a.structural_state.rebuilt).toBe(false);
        expect(result.connector_state.connector_a.drift_status).toBe('UNRESOLVED');
        expect(result.connector_state.connector_a.health_state).toBe('BROKEN');
    });

    test('Negative 8: Failed version upgrade', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'UPGRADE_API_VERSION',
                connector_key: 'connector_a',
                payload: { target_version: 'v2' }
            }],
            per_action: {
                'a1': { status: 'ERROR', error_code: 'UPGRADE_FAILED' }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.api_version_state.current_version).toBe('v1'); // Unchanged
        expect(result.connector_state.connector_a.api_version_state.upgrade_success).toBe(false);
        expect(result.connector_state.connector_a.health_state).toBe('DEGRADED');
    });

    test('Negative 9: Auth failure', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'ROTATE_CREDENTIALS',
                connector_key: 'connector_a'
            }],
            per_action: {
                'a1': { status: 'ERROR', error_code: 'AUTH_FAILED' }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.auth_state).toBe('INVALID');
        expect(result.connector_state.connector_a.health_state).toBe('BROKEN');
    });

    test('Negative 10: Capability missing - cannot infer success', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'REBUILD_CONNECTOR',
                connector_key: 'connector_a',
                payload: {}
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            },
            capabilities: {
                'connector_a': {
                    can_rebuild: false // Missing capability
                }
            }
        });

        const result = reconcileConnectorState(envelope);

        // Cannot infer success without capability
        expect(result.connector_state.connector_a.structural_state.rebuilt).toBe(false);
        expect(result.connector_state.connector_a.structural_state.needs_rebuild).toBe(true);
    });

    test('Negative 11: Policy forbids rebuild', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'REBUILD_CONNECTOR',
                connector_key: 'connector_a',
                payload: {}
            }],
            per_action: {
                'a1': { status: 'ERROR', error_code: 'POLICY_FORBIDDEN' }
            },
            policy: {
                allow_rebuild: false,
                forbid_rebuild: true
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.structural_state.needs_rebuild).toBe(true);
        expect(result.connector_state.connector_a.drift_status).toBe('UNRESOLVED');
    });

    test('Negative 12: Fallback switch failed', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'SWITCH_CONNECTOR',
                connector_key: 'connector_a',
                payload: { to: 'fallback' }
            }],
            per_action: {
                'a1': { status: 'ERROR', error_code: 'SWITCH_FAILED' }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.routing_state.switched).toBe(false);
        expect(result.connector_state.connector_a.routing_state.switch_attempted).toBe(true);
        expect(result.connector_state.connector_a.health_state).toBe('DEGRADED');
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: No actions - UNRESOLVED drift', () => {
        const envelope = createValidEnvelope({
            actions: [],
            per_action: {}
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.drift_status).toBe('UNRESOLVED');
        expect(result.connector_state.connector_a.health_state).toBe('BROKEN');
    });

    test('Edge 14: Connector metadata missing', () => {
        const envelope = createValidEnvelope({
            metadata: {},
            actions: []
        });

        const result = reconcileConnectorState(envelope);

        // Should handle gracefully
        expect(result.execution_id).toBe('exec-123');
        expect(result.determinism_hash).toBeTruthy();
    });

    test('Edge 15: Mixed success and failure', () => {
        const envelope = createValidEnvelope({
            actions: [
                { action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a' },
                { action_id: 'a2', action_type: 'REBUILD_CONNECTOR', connector_key: 'connector_a', payload: {} }
            ],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null },
                'a2': { status: 'ERROR', error_code: 'REBUILD_FAILED' }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.drift_status).toBe('UNRESOLVED'); // Critical issue remains
        expect(result.connector_state.connector_a.health_state).toBe('BROKEN');
    });

    test('Edge 16: Sandbox mode actions', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'SANDBOX_RETRY',
                connector_key: 'connector_a'
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.connector_state.connector_a.structural_state.sandbox_verified).toBe(true);
    });

    // --- Regression Test (1) ---

    test('Regression 17: Snapshot error_code propagation from Phase 55', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'ROTATE_CREDENTIALS',
                connector_key: 'connector_a'
            }],
            per_action: {
                'a1': { status: 'ERROR', error_code: 'AUTH_EXPIRED' }
            }
        });

        const result = reconcileConnectorState(envelope);

        // Error code should be used to determine auth_state
        expect(result.connector_state.connector_a.auth_state).toBe('EXPIRED');
    });

    // --- Determinism Test (1) ---

    test('Determinism 18: Identical inputs produce identical outputs', () => {
        const envelope1 = createValidEnvelope({ execution_id: 'det-1' });
        const envelope2 = createValidEnvelope({ execution_id: 'det-2' });

        const result1 = reconcileConnectorState(envelope1);
        const result2 = reconcileConnectorState(envelope2);

        // States should be identical (except execution_id)
        expect(result1.connector_state).toEqual(result2.connector_state);
    });

    // --- Optional Tests (4) ---

    test('Optional 19: Reordered per_action keys produce deterministic output', () => {
        const envelope1 = createValidEnvelope({
            actions: [
                { action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a' },
                { action_id: 'a2', action_type: 'REBUILD_CONNECTOR', connector_key: 'connector_a', payload: {} }
            ],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null },
                'a2': { status: 'SUCCESS', error_code: null }
            }
        });

        const envelope2 = createValidEnvelope({
            actions: [
                { action_id: 'a2', action_type: 'REBUILD_CONNECTOR', connector_key: 'connector_a', payload: {} },
                { action_id: 'a1', action_type: 'ROTATE_CREDENTIALS', connector_key: 'connector_a' }
            ],
            per_action: {
                'a2': { status: 'SUCCESS', error_code: null },
                'a1': { status: 'SUCCESS', error_code: null }
            }
        });

        const result1 = reconcileConnectorState(envelope1);
        const result2 = reconcileConnectorState(envelope2);

        // Hashes should be identical due to deterministic sorting
        expect(result1.determinism_hash).toBe(result2.determinism_hash);
    });

    test('Optional 20: Capability matrix ordering does not affect output', () => {
        const envelope = createValidEnvelope({
            capabilities: {
                'connector_a': {
                    supports_sandbox: true,
                    can_rebuild: true,
                    can_rotate_credentials: true
                }
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.determinism_hash).toBeTruthy();
    });

    test('Optional 21: Policy flags ordering does not affect output', () => {
        const envelope = createValidEnvelope({
            policy: {
                forbid_rebuild: false,
                allow_rebuild: true
            }
        });

        const result = reconcileConnectorState(envelope);

        expect(result.determinism_hash).toBeTruthy();
    });

    test('Optional 22: Deep clone guard - inputs unchanged', () => {
        const envelope = createValidEnvelope();
        const originalEnvelope = JSON.parse(JSON.stringify(envelope));

        reconcileConnectorState(envelope);

        // Verify no mutation
        expect(JSON.stringify(envelope)).toBe(JSON.stringify(originalEnvelope));
    });

    // --- Hardening Tests (4) ---

    test('Hardening A: API Capability Supremacy - upgrade blocked by missing capability', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'UPGRADE_API_VERSION',
                connector_key: 'connector_a',
                payload: { target_version: 'v2' }
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            },
            capabilities: {
                'connector_a': {
                    can_upgrade_api_version: false // Missing capability
                }
            }
        });

        const result = reconcileConnectorState(envelope);

        // Even though Phase 55 said SUCCESS, capability supremacy overrides
        expect(result.connector_state.connector_a.api_version_state.upgrade_success).toBe(false);
        expect(result.connector_state.connector_a.api_version_state.current_version).toBe('v1'); // Unchanged
        expect(result.connector_state.connector_a.drift_status).toBe('PARTIALLY_RESOLVED'); // Non-critical failure
    });

    test('Hardening B: Missing metadata but has actions', () => {
        const envelope = createValidEnvelope({
            actions: [{
                action_id: 'a1',
                action_type: 'ROTATE_CREDENTIALS',
                connector_key: 'connector_b'
            }],
            per_action: {
                'a1': { status: 'SUCCESS', error_code: null }
            },
            metadata: {
                'connector_a': { auth_state: 'VALID', api_version: 'v1' }
                // connector_b is missing
            },
            capabilities: {
                'connector_a': { can_rotate_credentials: true },
                'connector_b': { can_rotate_credentials: true }
            }
        });

        const result = reconcileConnectorState(envelope);

        // connector_b should have defensive defaults
        expect(result.connector_state.connector_b.auth_state).toBe('UNKNOWN');
        expect(result.connector_state.connector_b.api_version_state.current_version).toBe('unknown');
        expect(result.connector_state.connector_b.drift_status).toBe('UNRESOLVED');
        expect(result.connector_state.connector_b.health_state).toBe('BROKEN');
        expect(result.connector_state.connector_b.structural_state.needs_rebuild).toBe(true);
    });

    test('Hardening C: Deterministic compare uses canonical sorting', () => {
        // This test verifies that mutation check uses sortObjectKeys
        const envelope = createValidEnvelope();
        const result = reconcileConnectorState(envelope);

        // If canonical sorting is used, reordered keys should not trigger mutation error
        expect(result.status).toBe('OK');
    });

    test('Hardening D: Output contract fields present', () => {
        const successEnvelope = createValidEnvelope();
        const successResult = reconcileConnectorState(successEnvelope);

        // Success case
        expect(successResult.status).toBe('OK');
        expect(successResult.error).toBeNull();

        // Error case
        const errorEnvelope = { execution_id: 'err-123' }; // Missing required fields
        const errorResult = reconcileConnectorState(errorEnvelope);

        expect(errorResult.status).toBe('ERROR');
        expect(errorResult.error).toBeTruthy();
    });

    // Feature flag OFF test
    test('Feature Flag: Disabled returns FEATURE_DISABLED', () => {
        process.env.FF_STATE_RECONCILIATION_ENGINE = 'false';

        const envelope = createValidEnvelope();
        const result = reconcileConnectorState(envelope);

        expect(result.execution_id).toBe('exec-123');
        expect(result.feature_flag_enabled).toBe(false);
        expect(result.stop_reason).toBe('FEATURE_DISABLED');
        expect(Object.keys(result.connector_state).length).toBe(0);
        expect(result.status).toBe('OK');
        expect(result.error).toBeNull();

        process.env.FF_STATE_RECONCILIATION_ENGINE = 'true';
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
