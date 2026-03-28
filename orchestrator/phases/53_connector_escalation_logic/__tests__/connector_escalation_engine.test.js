/**
 * Phase 53: Connector Escalation Logic Engine Tests
 * Exactly 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const assert = require('assert');
const { execute } = require('../connector_escalation_engine');

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
        toBeNull: () => assert.strictEqual(actual, null)
    };
}

// Helper to create valid envelope
function createValidEnvelope(options = {}) {
    return {
        execution_id: options.execution_id || 'exec-123',
        trace_domain: options.trace_domain || 'test-domain',
        connector_key: options.connector_key || 'tiktok_ads',
        tenant_id: options.tenant_id || 'tenant-1',
        workspace_id: options.workspace_id || 'ws-1',
        phase_51: {
            status: options.phase_51_status || 'HARD_FAIL',
            stop_reason: options.phase_51_stop_reason || 'NETWORK_ERROR',
            retries_attempted: options.retries_attempted || 3
        },
        phase_52: {
            rebuild_type: options.rebuild_type || 'FULL_REBUILD',
            rebuild_targets: options.rebuild_targets || null,
            policy_notes: options.policy_notes || null
        },
        connector_capabilities: {
            fallback_connectors: options.fallback_connectors || ['backup_connector'],
            credential_modes: options.credential_modes || ['primary', 'secondary'],
            api_versions: options.api_versions || ['v12', 'v13'],
            sandbox_supported: options.sandbox_supported !== undefined ? options.sandbox_supported : true
        },
        policy_constraints: {
            allow_fallback: options.allow_fallback !== undefined ? options.allow_fallback : true,
            allow_credential_rotation: options.allow_credential_rotation !== undefined ? options.allow_credential_rotation : true,
            allow_api_upgrade: options.allow_api_upgrade !== undefined ? options.allow_api_upgrade : true,
            allow_sandbox_retry: options.allow_sandbox_retry !== undefined ? options.allow_sandbox_retry : true,
            allow_composite_strategies: options.allow_composite_strategies !== undefined ? options.allow_composite_strategies : true,
            escalation_hard_stops: options.escalation_hard_stops || []
        }
    };
}

describe('Phase 53: Connector Escalation Logic Engine', () => {
    // Enable feature flag by default
    process.env.FF_CONNECTOR_ESCALATION_ENGINE = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Credential rotation success', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'NO_REBUILD',
            credential_modes: ['primary', 'secondary']
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('OK');
        expect(result.escalation_plan.strategy).toBe('CREDENTIAL_ROTATION');
        expect(result.escalation_plan.details.credential_mode).toBe('secondary');
        expect(result.escalation_plan.snapshot.chosen_strategy).toBe('CREDENTIAL_ROTATION');
    });

    test('Happy 2: Fallback connector selection', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            fallback_connectors: ['backup_1', 'backup_2']
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.escalation_plan.strategy).toBe('FALLBACK_CONNECTOR');
        expect(result.escalation_plan.details.target_connector).toBe('backup_1');
    });

    test('Happy 3: API version upgrade chosen', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            fallback_connectors: [],
            credential_modes: [],
            api_versions: ['v11', 'v12', 'v13']
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.escalation_plan.strategy).toBe('API_VERSION_UPGRADE');
        expect(result.escalation_plan.details.target_version).toBe('v13');
    });

    test('Happy 4: Sandbox retry allowed', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            fallback_connectors: [],
            credential_modes: [],
            api_versions: ['v12'],
            sandbox_supported: true
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.escalation_plan.strategy).toBe('SANDBOX_RETRY');
        expect(result.escalation_plan.details.sandbox_mode).toBe(true);
    });

    test('Happy 5: Composite strategy (fallback + rotation)', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            fallback_connectors: ['backup'],
            credential_modes: ['primary', 'secondary'],
            allow_composite_strategies: true
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        // Fallback has priority in FULL_REBUILD, but composite is also available
        expect(['FALLBACK_CONNECTOR', 'COMPOSITE'].includes(result.escalation_plan.strategy)).toBeTruthy();
    });

    test('Happy 6: Clean success → NO_ESCALATION', async () => {
        const envelope = createValidEnvelope({
            phase_51_status: 'SUCCESS',
            phase_51_stop_reason: 'SUCCESS',
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('OK');
        expect(result.escalation_plan.strategy).toBe('NO_ESCALATION');
        expect(result.escalation_plan.details).toBeNull();
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Policy blocks credential rotation', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'NO_REBUILD',
            allow_credential_rotation: false,
            credential_modes: ['primary', 'secondary']
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        // Should choose fallback since credential rotation is blocked
        expect(result.escalation_plan.strategy).toBe('FALLBACK_CONNECTOR');
    });

    test('Negative 8: Policy disallows fallback', async () => {
        const envelope = createValidEnvelope({
            rebuild_type: 'FULL_REBUILD',
            allow_fallback: false,
            fallback_connectors: ['backup']
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        // Should choose CREDENTIAL_ROTATION instead since fallback is blocked
        expect(result.escalation_plan.strategy).toBe('CREDENTIAL_ROTATION');
    });

    test('Negative 9: Missing required field', async () => {
        const envelope = createValidEnvelope();
        delete envelope.execution_id;

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('INVALID_INPUT');
        expect(result.escalation_plan).toBeNull();
    });

    test('Negative 10: Unknown connector capability (malformed array)', async () => {
        const envelope = createValidEnvelope();
        envelope.connector_capabilities.fallback_connectors = 'not-an-array';

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('INVALID_INPUT');
    });

    test('Negative 11: Hard stop reason → HARD_STOP', async () => {
        const envelope = createValidEnvelope({
            phase_51_stop_reason: 'AUTH_HARD_FAIL',
            escalation_hard_stops: ['AUTH_HARD_FAIL']
        });

        const result = await execute(envelope);

        expect(result.status).toBe('HARD_STOP');
        expect(result.status_code).toBe('POLICY_BLOCKED');
        expect(result.escalation_plan.strategy).toBe('HARD_STOP');
        expect(result.escalation_plan.details.blocked_reason).toBe('AUTH_HARD_FAIL');
    });

    test('Negative 12: Malformed capability list', async () => {
        const envelope = createValidEnvelope();
        envelope.connector_capabilities.api_versions = null;

        const result = await execute(envelope);

        expect(result.status).toBe('ERROR');
        expect(result.status_code).toBe('INVALID_INPUT');
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: All options forbidden by policy', async () => {
        const envelope = createValidEnvelope({
            allow_fallback: false,
            allow_credential_rotation: false,
            allow_api_upgrade: false,
            allow_sandbox_retry: false
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.escalation_plan.strategy).toBe('NO_ESCALATION');
    });

    test('Edge 14: Single capability option', async () => {
        const envelope = createValidEnvelope({
            fallback_connectors: [],
            credential_modes: ['primary', 'secondary'],  // Need at least 2 for rotation
            api_versions: ['v12'],
            sandbox_supported: false,
            rebuild_type: 'NO_REBUILD'
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        // Should choose credential rotation as the only viable option
        expect(result.escalation_plan.strategy).toBe('CREDENTIAL_ROTATION');
    });

    test('Edge 15: Empty fallback list', async () => {
        const envelope = createValidEnvelope({
            fallback_connectors: [],
            allow_fallback: true
        });

        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        // Should choose CREDENTIAL_ROTATION as next priority
        expect(result.escalation_plan.strategy).toBe('CREDENTIAL_ROTATION');
    });

    test('Edge 16: Snapshot replay determinism', async () => {
        const envelope1 = createValidEnvelope({
            execution_id: 'determinism-test'
        });
        const envelope2 = createValidEnvelope({
            execution_id: 'determinism-test'
        });

        const result1 = await execute(envelope1);
        const result2 = await execute(envelope2);

        expect(result1.escalation_plan.strategy).toBe(result2.escalation_plan.strategy);
        expect(JSON.stringify(result1.escalation_plan.snapshot)).toBe(JSON.stringify(result2.escalation_plan.snapshot));
    });

    // --- Regression Test (1) ---

    test('Regression 17: Phase 52 → 53 handoff stability', async () => {
        const envelope = createValidEnvelope({
            execution_id: 'regression-exec',
            rebuild_type: 'PARTIAL_REBUILD',
            phase_51_stop_reason: 'TRANSIENT_FAILURE'
        });

        const result = await execute(envelope);

        // Lock in behavior: PARTIAL_REBUILD should still allow credential rotation
        expect(result.status).toBe('SUCCESS');
        expect(result.escalation_plan.strategy).toBe('CREDENTIAL_ROTATION');
        expect(result.escalation_plan.snapshot.rebuild_type).toBe('PARTIAL_REBUILD');
        expect(result.escalation_plan.snapshot.phase_51_stop_reason).toBe('TRANSIENT_FAILURE');
    });

    // --- Determinism Test (1) ---

    test('Determinism 18: 24-hour seed replay', async () => {
        const seed = Date.now();
        const envelope1 = createValidEnvelope({
            execution_id: `seed-${seed}`,
            phase_51_stop_reason: 'NETWORK_TIMEOUT'
        });
        const envelope2 = createValidEnvelope({
            execution_id: `seed-${seed}`,
            phase_51_stop_reason: 'NETWORK_TIMEOUT'
        });

        const result1 = await execute(envelope1);
        const result2 = await execute(envelope2);

        // Deep equality check
        expect(result1.escalation_plan.strategy).toBe(result2.escalation_plan.strategy);
        expect(result1.status).toBe(result2.status);
        expect(result1.status_code).toBe(result2.status_code);
        expect(JSON.stringify(result1.escalation_plan)).toBe(JSON.stringify(result2.escalation_plan));
    });

    // Feature flag OFF test
    test('Feature Flag: Disabled returns NO_ESCALATION', async () => {
        process.env.FF_CONNECTOR_ESCALATION_ENGINE = 'false';

        const envelope = createValidEnvelope();
        const result = await execute(envelope);

        expect(result.status).toBe('SUCCESS');
        expect(result.status_code).toBe('FEATURE_DISABLED');
        expect(result.escalation_plan.strategy).toBe('NO_ESCALATION');
        expect(result.escalation_plan.snapshot.feature_enabled).toBe(false);

        process.env.FF_CONNECTOR_ESCALATION_ENGINE = 'true';
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
