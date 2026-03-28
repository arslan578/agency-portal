/**
 * Phase 54: Autonomous Drift Repair Engine Tests (CORRECTED)
 * Total: 22 tests (19 original + 3 new)
 */

const assert = require('assert');
const { execute } = require('../connector_drift_repair_engine');

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
        workspace_id: options.workspace_id || 'ws-1',
        brand_id: options.brand_id || 'brand-1',
        tenant_id: options.tenant_id || 'tenant-1',
        drift_report: {
            has_drift: options.has_drift !== undefined ? options.has_drift : true,
            drift_types: options.drift_types || ['STATE_MISMATCH'],
            connector_states: options.connector_states || [{
                connector_key: options.connector_key || 'connector_a',
                expected_state: { status: 'active' },
                observed_state: { status: 'paused' },
                severity: options.severity || 'HIGH'
            }]
        },
        rebuild_plan: {
            rebuild_type: options.rebuild_type || 'NO_REBUILD',
            targets: options.rebuild_targets || null
        },
        escalation_plan: {
            strategy: options.strategy || 'CREDENTIAL_ROTATION',
            details: options.escalation_details || null,
            snapshot: options.escalation_snapshot || {}
        },
        connector_capabilities: options.connector_capabilities || {
            'connector_a': {
                can_retry: true,
                can_rebuild: true,
                can_upgrade_version: true,
                can_rotate_credentials: true,
                can_retry_sandbox: true
            }
        },
        policy: {
            forbid_repair: options.forbid_repair || false,
            allow_full_rebuild: options.allow_full_rebuild !== undefined ? options.allow_full_rebuild : true,
            allow_partial_rebuild: options.allow_partial_rebuild !== undefined ? options.allow_partial_rebuild : true,
            forbid_credential_rotation: options.forbid_credential_rotation || false
        },
        requested_at: options.requested_at || null,
        snapshot: options.snapshot || null
    };
}

describe('Phase 54: Autonomous Drift Repair Engine (CORRECTED)', () => {
    // Enable feature flag by default
    process.env.FF_AUTONOMOUS_DRIFT_REPAIR = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Full rebuild + composite', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            strategy: 'COMPOSITE',
            escalation_details: { strategies: ['SANDBOX_RETRY'] }
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('OK');
        expect(result.repair_plan.actions.length).toBeGreaterThan(0);
        expect(result.repair_plan.snapshot.feature_enabled).toBe(true);
    });

    test('Happy 2: No drift + no rebuild + no escalation', async () => {
        const envelope = createValidEnvelope({
            has_drift: false,
            drift_types: [],
            connector_states: [],
            rebuild_type: 'NO_REBUILD',
            strategy: 'NO_ESCALATION'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.repair_plan.actions.length).toBe(0);
    });

    test('Happy 3: Credential rotation allowed', async () => {
        const envelope = createValidEnvelope({
            strategy: 'CREDENTIAL_ROTATION',
            forbid_credential_rotation: false,
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        const credActions = result.repair_plan.actions.filter(a => a.action_type === 'ROTATE_CREDENTIALS');
        expect(credActions.length).toBeGreaterThan(0);
    });

    test('Happy 4: Sandbox retry allowed', async () => {
        const envelope = createValidEnvelope({
            strategy: 'SANDBOX_RETRY',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        const sandboxActions = result.repair_plan.actions.filter(a => a.action_type === 'SANDBOX_RETRY');
        expect(sandboxActions.length).toBeGreaterThan(0);
    });

    test('Happy 5: API version upgrade allowed', async () => {
        const envelope = createValidEnvelope({
            strategy: 'API_VERSION_UPGRADE',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        const upgradeActions = result.repair_plan.actions.filter(a => a.action_type === 'UPGRADE_API_VERSION');
        expect(upgradeActions.length).toBeGreaterThan(0);
    });

    test('Happy 6: Mixed drift severities → deterministic sort (type→severity→alphabetical)', async () => {
        const envelope = createValidEnvelope({
            connector_states: [
                { connector_key: 'connector_c', expected_state: {}, observed_state: {}, severity: 'LOW' },
                { connector_key: 'connector_b', expected_state: {}, observed_state: {}, severity: 'HIGH' },
                { connector_key: 'connector_a', expected_state: {}, observed_state: {}, severity: 'HIGH' }
            ],
            connector_capabilities: {
                'connector_a': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_b': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_c': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true }
            },
            strategy: 'CREDENTIAL_ROTATION',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        // Within ROTATE_CREDENTIALS type: HIGH severity connectors first (a before b alphabetically), then LOW (c)
        const connectorKeys = result.repair_plan.actions.map(a => a.connector_key);
        expect(connectorKeys[0]).toBe('connector_a'); // HIGH, alphabetically first
        expect(connectorKeys[1]).toBe('connector_b'); // HIGH, alphabetically second
        expect(connectorKeys[2]).toBe('connector_c'); // LOW
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Invalid contract shape', async () => {
        const envelope = { invalid: 'shape' };

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('INVALID_INPUT');
        expect(result.repair_plan).toBeNull();
    });

    test('Negative 8: Missing required fields', async () => {
        const envelope = createValidEnvelope();
        delete envelope.execution_id;

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('INVALID_INPUT');
    });

    test('Negative 9: Policy forbids repair', async () => {
        const envelope = createValidEnvelope({
            forbid_repair: true,
            strategy: 'CREDENTIAL_ROTATION'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('POLICY_FORBID_REPAIR');
        expect(result.repair_plan.actions.length).toBe(0);
        expect(result.repair_plan.snapshot.reason).toBe('POLICY_SUPREMACY');
    });

    test('Negative 10: Capabilities block escalation (returns conflict)', async () => {
        const envelope = createValidEnvelope({
            strategy: 'CREDENTIAL_ROTATION',
            connector_capabilities: {
                'connector_a': {
                    can_retry: false,
                    can_rebuild: false,
                    can_upgrade_version: false,
                    can_rotate_credentials: false,  // Blocked
                    can_retry_sandbox: false
                }
            },
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        // Should return CAPABILITY_CONFLICT
        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('CAPABILITY_CONFLICT');
    });

    test('Negative 11: Hard stop propagation', async () => {
        const envelope = createValidEnvelope({
            strategy: 'HARD_STOP',
            rebuild_type: 'FULL_REBUILD',  // even with full rebuild, HARD_STOP must override
            allow_full_rebuild: true
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('HARD_STOP');
        expect(result.repair_plan.actions.length).toBe(0);
        expect(result.repair_plan.snapshot.ordered_actions.length).toBe(0);
    });

    test('Negative 12: Rebuild+escalation conflict (policy blocks rebuild)', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            allow_full_rebuild: false,  // Policy blocks
            strategy: 'NO_ESCALATION'
        });

        const result = await execute(envelope);

        // Should return POLICY_CONFLICT
        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('POLICY_CONFLICT');
    });

    test('Negative 13: Unknown top-level fields cause INVALID_INPUT', async () => {
        const envelope = createValidEnvelope();
        envelope.extra_field = 'not_allowed';

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('INVALID_INPUT');
        expect(result.error_message).toContain('Unknown fields in envelope');
    });

    test('Negative 14: Connector has drift but no capabilities entry → CAPABILITY_CONFLICT', async () => {
        const envelope = createValidEnvelope({
            connector_states: [
                { connector_key: 'connector_x', expected_state: {}, observed_state: {}, severity: 'HIGH' }
            ],
            connector_capabilities: {
                // Note: connector_x missing here
            },
            strategy: 'NO_ESCALATION',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('CAPABILITY_CONFLICT');
        expect(result.error_message).toContain('has drift but no capabilities entry');
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: Empty drift array', async () => {
        const envelope = createValidEnvelope({
            connector_states: [],
            rebuild_type: 'NO_REBUILD',
            strategy: 'NO_ESCALATION'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.repair_plan.snapshot.drift_severities).toEqual([]);
    });

    test('Edge 14: All capabilities disabled (returns conflict)', async () => {
        const envelope = createValidEnvelope({
            connector_capabilities: {
                'connector_a': {
                    can_retry: false,
                    can_rebuild: false,
                    can_upgrade_version: false,
                    can_rotate_credentials: false,
                    can_retry_sandbox: false
                }
            },
            strategy: 'SANDBOX_RETRY',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        // Should return CAPABILITY_CONFLICT
        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('CAPABILITY_CONFLICT');
    });

    test('Edge 15: Only LOW drift', async () => {
        const envelope = createValidEnvelope({
            severity: 'LOW',
            strategy: 'CREDENTIAL_ROTATION',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.repair_plan.snapshot.drift_severities[0].severity).toBe('LOW');
    });

    test('Edge 16: Composite with partial capability conflicts (rejected)', async () => {
        const envelope = createValidEnvelope({
            strategy: 'COMPOSITE',
            escalation_details: { strategies: ['CREDENTIAL_ROTATION', 'API_VERSION_UPGRADE'] },
            connector_capabilities: {
                'connector_a': {
                    can_retry: true,
                    can_rebuild: true,
                    can_upgrade_version: false,  // Blocked - should cause composite to fail
                    can_rotate_credentials: true,
                    can_retry_sandbox: true
                }
            },
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        // Composite should fail if ANY sub-strategy fails
        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('CAPABILITY_CONFLICT');
    });

    // --- Regression Test (1) ---

    test('Regression 17: No upstream envelope mutation', async () => {
        const envelope = createValidEnvelope({
            execution_id: 'regression-test',
            rebuild_type: 'NO_REBUILD'
        });

        // Deep clone to compare
        const originalPolicyKeys = Object.keys(envelope.policy);
        const originalDriftTypesLength = envelope.drift_report.drift_types.length;

        await execute(envelope);

        // Verify no mutation
        expect(Object.keys(envelope.policy).length).toBe(originalPolicyKeys.length);
        expect(envelope.drift_report.drift_types.length).toBe(originalDriftTypesLength);
    });

    // --- Determinism Test (1) ---

    test('Determinism 18: Identical inputs → identical ordered actions', async () => {
        const envelope1 = createValidEnvelope({
            execution_id: 'determinism-1',
            connector_states: [
                { connector_key: 'connector_c', expected_state: {}, observed_state: {}, severity: 'HIGH' },
                { connector_key: 'connector_a', expected_state: {}, observed_state: {}, severity: 'HIGH' },
                { connector_key: 'connector_b', expected_state: {}, observed_state: {}, severity: 'MEDIUM' }
            ],
            connector_capabilities: {
                'connector_a': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_b': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_c': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true }
            },
            strategy: 'CREDENTIAL_ROTATION',
            rebuild_type: 'NO_REBUILD'
        });

        const envelope2 = createValidEnvelope({
            execution_id: 'determinism-2',
            connector_states: [
                { connector_key: 'connector_c', expected_state: {}, observed_state: {}, severity: 'HIGH' },
                { connector_key: 'connector_a', expected_state: {}, observed_state: {}, severity: 'HIGH' },
                { connector_key: 'connector_b', expected_state: {}, observed_state: {}, severity: 'MEDIUM' }
            ],
            connector_capabilities: {
                'connector_a': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_b': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_c': { can_rebuild: true, can_retry: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true }
            },
            strategy: 'CREDENTIAL_ROTATION',
            rebuild_type: 'NO_REBUILD'
        });

        const result1 = await execute(envelope1);
        const result2 = await execute(envelope2);

        // Verify identical ordering
        expect(JSON.stringify(result1.repair_plan.snapshot.ordered_actions)).toBe(JSON.stringify(result2.repair_plan.snapshot.ordered_actions));
        expect(result1.repair_plan.actions.length).toBe(result2.repair_plan.actions.length);
    });

    // --- NEW TEST 1: Composite denied because policy forbids credential rotation ---

    test('NEW 19: Composite denied due to policy forbidding credential rotation', async () => {
        const envelope = createValidEnvelope({
            strategy: 'COMPOSITE',
            escalation_details: { strategies: ['CREDENTIAL_ROTATION', 'SANDBOX_RETRY'] },
            forbid_credential_rotation: true,  // Policy forbids credential rotation
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        // COMPOSITE should fail because one of its sub-strategies (CREDENTIAL_ROTATION) is forbidden
        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('POLICY_CONFLICT');
        expect(result.error_message).toContain('Composite rejected');
    });

    // --- NEW TEST 2: Fallback connector uses details.from and details.to ---

    test('NEW 20: Fallback connector correctly uses details.from and details.to', async () => {
        const envelope = createValidEnvelope({
            strategy: 'FALLBACK_CONNECTOR',
            escalation_details: {
                from: 'connector_a',
                to: 'connector_b'
            },
            connector_capabilities: {
                'connector_a': { can_retry: true, can_rebuild: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true },
                'connector_b': { can_retry: true, can_rebuild: true, can_upgrade_version: true, can_rotate_credentials: true, can_retry_sandbox: true }
            },
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.repair_plan.actions.length).toBe(1);
        expect(result.repair_plan.actions[0].action_type).toBe('SWITCH_CONNECTOR');
        expect(result.repair_plan.actions[0].connector_key).toBe('connector_a');  // from
        expect(result.repair_plan.actions[0].params.to).toBe('connector_b');       // to
    });

    // --- NEW TEST 3: Rebuild plan and strategy conflict returns error ---

    test('NEW 21: Rebuild capability conflict returns CAPABILITY_CONFLICT', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            allow_full_rebuild: true,  // Policy allows
            connector_capabilities: {
                'connector_a': {
                    can_retry: true,
                    can_rebuild: false,  // Cannot rebuild - should cause conflict
                    can_upgrade_version: true,
                    can_rotate_credentials: true,
                    can_retry_sandbox: true
                }
            },
            strategy: 'NO_ESCALATION'
        });

        const result = await execute(envelope);

        // Should return CAPABILITY_CONFLICT
        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('CAPABILITY_CONFLICT');
        expect(result.error_message).toContain('cannot rebuild');
    });

    // Feature flag OFF test
    test('Feature Flag: Disabled returns FEATURE_DISABLED', async () => {
        process.env.FF_AUTONOMOUS_DRIFT_REPAIR = 'false';

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('FEATURE_DISABLED');
        expect(result.repair_plan.actions).toBeNull();
        expect(result.repair_plan.snapshot.feature_enabled).toBe(false);

        process.env.FF_AUTONOMOUS_DRIFT_REPAIR = 'true';
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
