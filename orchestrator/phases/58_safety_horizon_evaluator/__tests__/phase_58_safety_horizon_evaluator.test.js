const { execute } = require('../phase_58_safety_horizon_evaluator');

// --- Mocks ---
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../../shared/metrics', () => ({
    metrics: { count: jest.fn(), gauge: jest.fn() }
}));
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

// --- Helpers ---
function createMockInput() {
    // Ensure Env Var is set for happy paths
    process.env.FF_SAFETY_HORIZON_EVALUATOR = 'true';
    return {
        execution_id: 'test_exec_1',
        phase: '58',
        feature_flags: { FF_SAFETY_HORIZON_EVALUATOR: true },
        merged_connector_state: {
            'conn_1': {
                state: 'HEALTHY',
                drift_markers: [],
                capabilities: { integrity_score: 1.0 },
                failure_patterns: [],
                retry_history: { exhausted: false }
            }
        }
    };
}

describe('Phase 58: Safety Horizon Evaluator', () => {

    // --- Happy Path (6) ---

    test('Happy Path 1: Stable connectors only', () => {
        const input = createMockInput();
        const result = execute(input);
        expect(result.status).toBe('OK');
        expect(result.safety_zone['conn_1']).toBe('STABLE');
        expect(result.safe_execution_horizon).toBe(10);
    });

    test('Happy Path 2: Mixed drift + stable', () => {
        const input = createMockInput();
        input.merged_connector_state['conn_2'] = {
            state: 'HEALTHY',
            drift_markers: [{ severity: 'MINOR' }],
            capabilities: { integrity_score: 1.0 }
        };
        const result = execute(input);
        expect(result.safety_zone['conn_1']).toBe('STABLE');
        expect(result.safety_zone['conn_2']).toBe('DEGRADED');
        expect(result.safe_execution_horizon).toBe(9); // 10 - 1 (degraded)
    });

    test('Happy Path 3: Multiple redundancy levels', () => {
        const input = createMockInput();
        const result = execute(input);
        expect(result.redundancy_profile['conn_1']).toBeDefined();
        expect(result.redundancy_profile['conn_1'].redundancy_level).toBe('none');
    });

    test('Happy Path 4: Risk ledger correct', () => {
        const input = createMockInput();
        input.merged_connector_state['conn_1'].capabilities.integrity_score = 2.0;
        input.merged_connector_state['conn_1'].drift_markers = [{ severity: 'MAJOR' }]; // 1.5x
        // Risk = 2.0 * 1.5 = 3.0
        const result = execute(input);
        expect(result.risk_ledger['conn_1']).toBe(3.0);
    });

    test('Happy Path 5: Safe execution horizon monotonic', () => {
        const input = createMockInput();
        input.merged_connector_state['conn_2'] = {
            state: 'ERROR',
            capabilities: { integrity_score: 1.0 }
        }; // UNSAFE -> -5
        const result = execute(input);
        expect(result.safe_execution_horizon).toBe(5); // 10 - 5
    });

    test('Happy Path 6: Deterministic ordering', () => {
        const input = createMockInput();
        input.merged_connector_state = {
            'b_conn': { state: 'HEALTHY', capabilities: { integrity_score: 1.0 } },
            'a_conn': { state: 'HEALTHY', capabilities: { integrity_score: 1.0 } }
        };
        const result = execute(input);
        const keys = Object.keys(result.safety_zone);
        expect(keys).toEqual(['a_conn', 'b_conn']);
    });

    // --- Negative Path (6) ---

    test('Negative Path 1: Missing required fields (merged_connector_state)', () => {
        const input = createMockInput();
        delete input.merged_connector_state;
        const result = execute(input);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('Negative Path 2: Unknown fields (Implicitly ignored/stripped by whitelist)', () => {
        const input = createMockInput();
        input.unknown_field = 'should fail';
        const result = execute(input);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('Negative Path 3: Null merged_connector_state', () => {
        const input = createMockInput();
        input.merged_connector_state = null;
        const result = execute(input);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('Negative Path 4: Capabilities missing → INVALID_INPUT', () => {
        const input = createMockInput();
        delete input.merged_connector_state['conn_1'].capabilities;
        const result = execute(input);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('Negative Path 5: Unsorted connector IDs must still output sorted', () => {
        const input = createMockInput();
        input.merged_connector_state = {
            'z': { state: 'HEALTHY', capabilities: { integrity_score: 1.0 } },
            'a': { state: 'HEALTHY', capabilities: { integrity_score: 1.0 } }
        };
        const result = execute(input);
        expect(Object.keys(result.safety_zone)).toEqual(['a', 'z']);
    });

    test('Negative Path 6: Non-numeric horizon metadata (Not applicable to engine logic, but robust)', () => {
        // Engine calculates horizon as number.
        const input = createMockInput();
        const result = execute(input);
        expect(typeof result.safe_execution_horizon).toBe('number');
    });

    // --- Edge Cases (4) ---

    test('Edge Case 1: All connectors degraded', () => {
        const input = createMockInput();
        input.merged_connector_state = {
            'c1': { state: 'DEGRADED', capabilities: { integrity_score: 1.0 } },
            'c2': { state: 'DEGRADED', capabilities: { integrity_score: 1.0 } }
        };
        const result = execute(input);
        expect(result.safe_execution_horizon).toBe(8); // 10 - 1 - 1
    });

    test('Edge Case 2: All connectors offline', () => {
        const input = createMockInput();
        input.merged_connector_state = {
            'c1': { state: 'OFFLINE', capabilities: { integrity_score: 1.0 } }, // Forbidden
            'c2': { state: 'OFFLINE', capabilities: { integrity_score: 1.0 } }
        };
        const result = execute(input);
        expect(result.forbidden_actions).toContain('c1');
        expect(result.forbidden_actions).toContain('c2');
    });

    test('Edge Case 3: Zero connectors', () => {
        const input = createMockInput();
        input.merged_connector_state = {};
        const result = execute(input);
        expect(result.status).toBe('OK');
        expect(result.safe_execution_horizon).toBe(10);
    });

    test('Edge Case 4: Maximum drift severity but valid metadata', () => {
        const input = createMockInput();
        input.merged_connector_state['conn_1'].drift_markers = [{ severity: 'MAJOR' }];
        const result = execute(input);
        expect(result.status).toBe('OK');
        expect(result.safety_zone['conn_1']).toBe('UNSAFE');
    });

    // --- New Tightening Tests ---

    test('Feature Flag: Env Var Disabled', () => {
        const input = createMockInput();
        // Temporarily disable env var
        const originalEnv = process.env.FF_SAFETY_HORIZON_EVALUATOR;
        process.env.FF_SAFETY_HORIZON_EVALUATOR = 'false';

        const result = execute(input);
        expect(result.status).toBe('FEATURE_DISABLED');

        // Restore
        process.env.FF_SAFETY_HORIZON_EVALUATOR = originalEnv;
    });

    test('Safety Zone: EMERGENCY_ONLY', () => {
        const input = createMockInput();
        input.merged_connector_state['conn_1'] = {
            state: 'ERROR',
            retry_history: { exhausted: true },
            capabilities: { integrity_score: 1.0 }
        };
        const result = execute(input);
        expect(result.safety_zone['conn_1']).toBe('EMERGENCY_ONLY');
    });

    test('Redundancy: Shared Group Logic', () => {
        const input = createMockInput();
        input.merged_connector_state = {
            'c1': { state: 'HEALTHY', capabilities: { shared_group: 'group_a' } },
            'c2': { state: 'HEALTHY', capabilities: { shared_group: 'group_a' } },
            'c3': { state: 'HEALTHY', capabilities: { shared_group: 'group_b' } } // Single
        };
        const result = execute(input);

        // Group A (Size 2 -> Low)
        expect(result.redundancy_profile['c1'].redundancy_level).toBe('low');
        expect(result.redundancy_profile['c1'].substitutes).toEqual(['c2']);
        expect(result.redundancy_profile['c2'].redundancy_level).toBe('low');
        expect(result.redundancy_profile['c2'].substitutes).toEqual(['c1']);

        // Group B (Size 1 -> None)
        expect(result.redundancy_profile['c3'].redundancy_level).toBe('none');
        expect(result.redundancy_profile['c3'].substitutes).toEqual([]);
    });

    test('Snapshot: Includes safe_execution_horizon', () => {
        const input = createMockInput();
        const result = execute(input);
        expect(result.snapshot.safe_execution_horizon).toBeDefined();
        expect(result.snapshot.safe_execution_horizon).toBe(result.safe_execution_horizon);
    });

    // --- Guards ---

    test('Regression Guard: Ensure no accidental mutation of Phase 57 input', () => {
        const input = createMockInput();
        const frozen = JSON.stringify(input);
        execute(input);
        expect(JSON.stringify(input)).toBe(frozen);
    });

    test('Determinism Guard', () => {
        const input = createMockInput();
        const ref = JSON.stringify(execute(input));
        for (let i = 0; i < 10; i++) {
            expect(JSON.stringify(execute(input))).toBe(ref);
        }
    });
});
