/**
 * Phase 57: Cross-Connector State Merger Engine Tests
 */

const assert = require('assert');
const { mergeGlobalConnectorState } = require('../global_connector_state_merger_engine');

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
        toBeNull: () => assert.strictEqual(actual, null),
        toContain: (item) => assert.ok(actual.includes(item))
    };
}

// Helper to create valid input
function createValidInput(overrides = {}) {
    return {
        execution_id: 'exec-1',
        connector_states_by_key: {},
        ...overrides
    };
}

describe('Phase 57: Cross-Connector State Merger Engine', () => {
    // Enable feature flag by default
    process.env.FF_GLOBAL_CONNECTOR_STATE_MERGER = 'true';

    // --- Happy Path (6) ---

    test('Happy 1: All OK -> Global OK, RESOLVED', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': {
                    auth_state: 'VALID',
                    api_version_state: { current_version: 'v1', target_version: null },
                    structural_state: { needs_rebuild: false },
                    health_state: 'OK',
                    drift_status: 'RESOLVED'
                }
            }
        });

        const result = mergeGlobalConnectorState(input);

        expect(result.status).toBe('OK');
        expect(result.global_health).toBe('OK');
        expect(result.global_drift).toBe('RESOLVED');
        expect(result.merged_state['conn-a']).toEqual(input.connector_states_by_key['conn-a']);
    });

    test('Happy 2: Mixed OK/DEGRADED -> Global DEGRADED', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': {
                    auth_state: 'VALID',
                    api_version_state: { current_version: 'v1', target_version: null },
                    structural_state: { needs_rebuild: false },
                    health_state: 'OK',
                    drift_status: 'RESOLVED'
                },
                'conn-b': {
                    auth_state: 'VALID',
                    api_version_state: { current_version: 'v1', target_version: null },
                    structural_state: { needs_rebuild: false },
                    health_state: 'DEGRADED',
                    drift_status: 'RESOLVED'
                }
            }
        });

        const result = mergeGlobalConnectorState(input);

        expect(result.global_health).toBe('DEGRADED');
    });

    test('Happy 3: Mixed Drift RESOLVED/PARTIALLY_RESOLVED -> Global PARTIALLY_RESOLVED', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': {
                    auth_state: 'VALID',
                    api_version_state: { current_version: 'v1', target_version: null },
                    structural_state: { needs_rebuild: false },
                    health_state: 'OK',
                    drift_status: 'RESOLVED'
                },
                'conn-b': {
                    auth_state: 'VALID',
                    api_version_state: { current_version: 'v1', target_version: null },
                    structural_state: { needs_rebuild: false },
                    health_state: 'OK',
                    drift_status: 'PARTIALLY_RESOLVED'
                }
            }
        });

        const result = mergeGlobalConnectorState(input);

        expect(result.global_drift).toBe('PARTIALLY_RESOLVED');
    });

    test('Happy 4: Capabilities merged and sorted', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} },
                'conn-b': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            },
            capabilities_by_connector_key: {
                'conn-b': { 'cap-x': true, 'cap-y': true },
                'conn-a': { 'cap-x': true }
            }
        });

        const result = mergeGlobalConnectorState(input);

        expect(result.capability_matrix['cap-x']).toEqual(['conn-a', 'conn-b']);
        expect(result.capability_matrix['cap-y']).toEqual(['conn-b']);
    });

    test('Happy 5: Routing profile counts', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': {
                    health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {},
                    routing_state: { active_role: 'PRIMARY', routing_status: 'STABLE' }
                },
                'conn-b': {
                    health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {},
                    routing_state: { active_role: 'FALLBACK', routing_status: 'FAILED' }
                }
            }
        });

        const result = mergeGlobalConnectorState(input);

        expect(result.routing_profile.active_primary_paths).toBe(1);
        expect(result.routing_profile.fallback_dependencies).toBe(1);
        expect(result.routing_profile.routing_failures).toBe(1);
    });

    test('Happy 6: Determinism hash is valid hex', () => {
        const input = createValidInput();
        const result = mergeGlobalConnectorState(input);

        expect(result.determinism_hash).toBeTruthy();
        assert.match(result.determinism_hash, /^[a-f0-9]{64}$/);
    });

    // --- Negative Path (6) ---

    test('Negative 1: Unknown top-level field', () => {
        const input = createValidInput({ unknown_field: 123 });
        const result = mergeGlobalConnectorState(input);

        expect(result.status).toBe('ERROR');
        expect(result.stop_reason).toBe('INVALID_INPUT');
    });

    test('Negative 2: Invalid health_state enum', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': { health_state: 'BAD_VALUE', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(result.status).toBe('ERROR');
        expect(result.stop_reason).toBe('INVALID_INPUT');
    });

    test('Negative 3: Invalid drift_status enum', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': { health_state: 'OK', drift_status: 'BAD_VALUE', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(result.status).toBe('ERROR');
        expect(result.stop_reason).toBe('INVALID_INPUT');
    });

    test('Negative 4: Invalid active_role enum', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': {
                    health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {},
                    routing_state: { active_role: 'BAD_ROLE' }
                }
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(result.status).toBe('ERROR');
        expect(result.stop_reason).toBe('INVALID_INPUT');
    });

    test('Negative 5: Capabilities not an object', () => {
        const input = createValidInput({ capabilities_by_connector_key: 'not-an-object' });
        const result = mergeGlobalConnectorState(input);
        expect(result.status).toBe('ERROR');
        expect(result.stop_reason).toBe('INVALID_INPUT');
    });

    test('Negative 6: Missing required health_state', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': { drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(result.status).toBe('ERROR');
        expect(result.stop_reason).toBe('INVALID_INPUT');
    });

    // --- Edge Cases (4) ---

    test('Edge 1: Zero connectors', () => {
        const input = createValidInput({ connector_states_by_key: {} });
        const result = mergeGlobalConnectorState(input);

        expect(result.global_health).toBe('OK');
        expect(result.global_drift).toBe('RESOLVED');
        expect(Object.keys(result.merged_state).length).toBe(0);
    });

    test('Edge 2: Single connector full state', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': {
                    auth_state: 'VALID',
                    api_version_state: { current_version: 'v1', target_version: null },
                    structural_state: { needs_rebuild: false },
                    routing_state: { active_role: 'PRIMARY', switch_attempted: false, switched: false, routing_status: 'STABLE' },
                    health_state: 'OK',
                    drift_status: 'RESOLVED'
                }
            },
            capabilities_by_connector_key: {
                'conn-a': { 'cap-1': true }
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(result.status).toBe('OK');
        expect(result.capability_matrix['cap-1']).toEqual(['conn-a']);
    });

    test('Edge 3: Large capability set', () => {
        const caps = {};
        for (let i = 0; i < 100; i++) caps[`cap-${i}`] = true;

        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            },
            capabilities_by_connector_key: {
                'conn-a': caps
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(Object.keys(result.capability_matrix).length).toBe(100);
    });

    test('Edge 4: Partial capabilities', () => {
        const input = createValidInput({
            connector_states_by_key: {
                'conn-a': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} },
                'conn-b': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            },
            capabilities_by_connector_key: {
                'conn-a': { 'cap-x': true }
                // conn-b missing
            }
        });
        const result = mergeGlobalConnectorState(input);
        expect(result.capability_matrix['cap-x']).toEqual(['conn-a']);
    });

    // --- Regression (1) ---

    test('Regression: Feature Flag Disabled', () => {
        process.env.FF_GLOBAL_CONNECTOR_STATE_MERGER = 'false';
        const input = createValidInput();
        const result = mergeGlobalConnectorState(input);

        expect(result.status).toBe('OK');
        expect(result.stop_reason).toBe('FEATURE_DISABLED');
        expect(result.global_health).toBe('UNKNOWN');
        expect(result.merged_state).toEqual({});

        process.env.FF_GLOBAL_CONNECTOR_STATE_MERGER = 'true';
    });

    // --- Determinism (1) ---

    test('Determinism: Order Independence', () => {
        const input1 = createValidInput({
            connector_states_by_key: {
                'conn-a': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} },
                'conn-b': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            }
        });

        const input2 = createValidInput({
            connector_states_by_key: {
                'conn-b': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} },
                'conn-a': { health_state: 'OK', drift_status: 'RESOLVED', auth_state: 'VALID', api_version_state: {}, structural_state: {} }
            }
        });

        const result1 = mergeGlobalConnectorState(input1);
        const result2 = mergeGlobalConnectorState(input2);

        expect(result1.determinism_hash).toBe(result2.determinism_hash);
        expect(JSON.stringify(result1.merged_state)).toBe(JSON.stringify(result2.merged_state));
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
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
})();
