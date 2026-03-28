"use strict";

const { execute } = require('../phase_76_counterfactual_replay_engine');
const { createHash } = require('crypto');

// Mocks
jest.mock('../../../shared/logging', () => ({ logStructured: jest.fn() }));
jest.mock('../../../shared/metrics', () => ({ count: jest.fn() }));
jest.mock('../../../shared/tracing', () => ({ startSpan: jest.fn(() => ({ end: jest.fn() })) }));

// Mock Phase 75 (Replay Helper)
const phase75 = require('../../phase_75_deterministic_replay_engine/phase_75_deterministic_replay_engine');
jest.mock('../../phase_75_deterministic_replay_engine/phase_75_deterministic_replay_engine');

const BASE_INPUT = {
    execution_id: 'exec_76_test',
    phase: '76',
    feature_flags: { FF_COUNTERFACTUAL_REPLAY_ENGINE: true },
    baseline: {
        sealed_envelope: { budget: 1000 },
        state_snapshot: { state: 'initial' },
        commit_seal: { canonical_sha256: 'abc' },
        canonical_form: { canonical_sha256: 'abc' },
        trace_deltas: [{ delta_id: 'd1', op: 'SET', path: 'budget', value: 1000 }],
        baseline_replay_result: {
            status: 'SUCCESS',
            summary: { spend: 1000, impressions: 50000 },
            trace_digest: 'digest_1'
        }
    },
    scenarios: [],
    options: {
        max_scenarios: 10,
        strict_commit_seal_check: true,
        deterministic_sort_key: 'scenario_id'
    }
};

describe('Phase 76: Counterfactual Replay Engine', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Default Phase 75 mock behavior
        phase75.execute.mockReturnValue({
            status: 'OK',
            replay_trace: { steps: [] } // Default empty steps
        });
    });

    // -------------------------------------------------------------------------
    // Happy Path (6)
    // -------------------------------------------------------------------------

    test('HP-1: Single scenario, delta override applied correctly', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{
            scenario_id: 'sc1',
            mode: 'DELTA_MUTATION',
            delta_overrides: [{
                target_delta_id: 'd1',
                replacement: { delta_id: 'd1', op: 'SET', path: 'budget', value: 1200 }
            }]
        }];

        // Mock replay to return increased spend
        phase75.execute.mockReturnValue({
            status: 'OK',
            replay_trace: {
                steps: [{ payload: { spend: 1200, impressions: 60000 } }]
            }
        });

        const output = execute(input);

        expect(output.status).toBe('OK');
        const sc = output.scenarios[0];
        expect(sc.status).toBe('SUCCESS');
        expect(sc.replay_summary.spend).toBe(1200);
        expect(sc.comparative_metrics.spend_delta).toBe(200); // 1200 - 1000
    });

    test('HP-2: Single scenario, envelope override applied correctly', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{
            scenario_id: 'sc2',
            mode: 'ENVELOPE_MUTATION',
            envelope_overrides: { budget: 1500 }
        }];

        phase75.execute.mockImplementation((replayInput) => {
            // Check that envelope was updated
            if (replayInput.sealed_envelope.budget === 1500) {
                return { status: 'OK', replay_trace: { steps: [{ payload: { spend: 1500 } }] } };
            }
            return { status: 'ERROR', errors: [] };
        });

        const output = execute(input);
        expect(output.scenarios[0].replay_summary.spend).toBe(1500);
    });

    test('HP-3: Multiple scenarios sorted deterministically', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [
            { scenario_id: 'b' },
            { scenario_id: 'a' },
            { scenario_id: 'c' }
        ];

        const output = execute(input);
        expect(output.scenarios).toHaveLength(3);
        expect(output.scenarios[0].scenario_id).toBe('a');
        expect(output.scenarios[1].scenario_id).toBe('b');
        expect(output.scenarios[2].scenario_id).toBe('c');
    });

    test('HP-4: Baseline commit seal valid with strict check', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.options.strict_commit_seal_check = true;
        input.baseline.commit_seal.canonical_sha256 = 'match';
        input.baseline.canonical_form.canonical_sha256 = 'match';

        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.baseline.commit_seal_valid).toBe(true);
    });

    test('HP-5: Scenario constraints respected without violation', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{
            scenario_id: 'sc5',
            constraints: { max_cost_multiplier: 1.5 }
        }];

        // Baseline spend 1000. Scenario spend 1400 -> Index 1.4 (safe)
        phase75.execute.mockReturnValue({
            status: 'OK',
            replay_trace: { steps: [{ payload: { spend: 1400 } }] }
        });

        const output = execute(input);
        expect(output.scenarios[0].status).toBe('SUCCESS');
        expect(output.scenarios[0].violations).toHaveLength(0);
        expect(output.scenarios[0].comparative_metrics.cost_index).toBe(1.4);
    });

    test('HP-6: No scenarios produces valid empty scenario output', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [];
        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.scenarios).toHaveLength(0);
    });


    // -------------------------------------------------------------------------
    // Negative Path (6)
    // -------------------------------------------------------------------------

    test('NP-1: Missing execution id returns error', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.execution_id;
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('INVALID_INPUT_CONTRACT');
    });

    test('NP-2: Incorrect phase id returns error', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.phase = '75';
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('INVALID_PHASE');
    });

    test('NP-3: Feature flag disabled returns error', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.feature_flags.FF_COUNTERFACTUAL_REPLAY_ENGINE = false;
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('FEATURE_FLAG_DISABLED');
    });

    test('NP-4: Commit seal mismatch with strict option', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.options.strict_commit_seal_check = true;
        input.baseline.commit_seal.canonical_sha256 = 'hash1';
        input.baseline.canonical_form.canonical_sha256 = 'hash2';

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('COMMIT_SEAL_MISMATCH');
    });

    test('NP-5: Scenario count above max_scenarios', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.options.max_scenarios = 1;
        input.scenarios = [{ scenario_id: '1' }, { scenario_id: '2' }];
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('MAX_SCENARIOS_EXCEEDED');
    });

    test('NP-6: Invalid scenario shape rejected', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{ description: 'Missing ID' }];
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('INVALID_SCENARIO');
    });

    // -------------------------------------------------------------------------
    // Edge Case Tests (4)
    // -------------------------------------------------------------------------

    test('EC-1: Duplicate scenario ids detected', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{ scenario_id: 'dup' }, { scenario_id: 'dup' }];
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].message).toMatch(/Duplicate scenario_id/);
    });

    test('EC-2: Unknown delta targets in overrides result in warning', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{
            scenario_id: 'sc_warn',
            delta_overrides: [{ target_delta_id: 'missing_id', replacement: {} }]
        }];
        const output = execute(input);
        expect(output.status).toBe('OK');
        const sc = output.scenarios[0];
        expect(sc.warnings).toHaveLength(1);
        expect(sc.warnings[0].code).toBe('UNKNOWN_DELTA_TARGET');
    });

    test('EC-3: Empty trace_deltas handled gracefully', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.baseline.trace_deltas = []; // Empty
        input.scenarios = [{ scenario_id: 'empty_base' }];

        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.scenarios[0].status).toBe('SUCCESS');
    });

    test('EC-4: Zero cost multiplier constraint violation', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{
            scenario_id: 'strict_cost',
            constraints: { max_cost_multiplier: 1.0 }
        }];

        // Scenario +10%
        phase75.execute.mockReturnValue({
            status: 'OK',
            replay_trace: { steps: [{ payload: { spend: 1100 } }] }
        });

        const output = execute(input);
        const sc = output.scenarios[0];
        expect(sc.violations).toHaveLength(1);
        expect(sc.violations[0].type).toBe('CONSTRAINT_VIOLATION');
    });


    // -------------------------------------------------------------------------
    // Guards (2)
    // -------------------------------------------------------------------------

    test('Guard-1: Scenario output ordering stable across insertion', () => {
        // Construct mixed key order objects
        const input1 = JSON.parse(JSON.stringify(BASE_INPUT));
        const input2 = JSON.parse(JSON.stringify(BASE_INPUT));

        // Key order differences
        input1.baseline = { commit_seal: {}, sealed_envelope: {}, ...input1.baseline };
        input2.baseline = { sealed_envelope: {}, commit_seal: {}, ...input2.baseline };

        const output1 = execute(input1);
        const output2 = execute(input2);

        expect(JSON.stringify(output1)).toBe(JSON.stringify(output2));
    });

    test('Guard-2: Deterministic Run ID stable across runs', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        let prevId = null;
        for (let i = 0; i < 50; i++) {
            const output = execute(input);
            const id = output.meta.deterministic_run_id;
            if (prevId && id !== prevId) throw new Error('Unstable Run ID');
            prevId = id;
        }
        expect(true).toBe(true);
    });

    // -------------------------------------------------------------------------
    // Robustness (2)
    // -------------------------------------------------------------------------

    test('Rob-1: Forbidden fields in input rejection', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input._debug = true;
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('FORBIDDEN_FIELD_PRESENT');
    });

    test('Rob-2: Replay helper failure surfaced', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.scenarios = [{ scenario_id: 'fail_sc' }];

        phase75.execute.mockReturnValue({
            status: 'ERROR',
            errors: [{ message: 'Simulated Replay Fail' }]
        });

        const output = execute(input);
        expect(output.status).toBe('OK'); // Overall engine OK
        const sc = output.scenarios[0];
        expect(sc.status).toBe('REPLAY_ERROR');
        expect(sc.reason).toBe('Simulated Replay Fail');
    });

    // -------------------------------------------------------------------------
    // Constraint Tests (Added Patch)
    // -------------------------------------------------------------------------

    test('FC-1: Adding a new connector violates forbid_new_connectors constraint', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.baseline.sealed_envelope = {
            connectors: { google: {} }
        };

        input.scenarios = [{
            scenario_id: 'new_conn',
            constraints: { forbid_new_connectors: true },
            envelope_overrides: {
                connectors: {
                    google: {},
                    meta: {}   // NEW connector not in baseline
                }
            }
        }];

        phase75.execute.mockReturnValue({
            status: 'OK',
            replay_trace: { steps: [] }
        });

        const out = execute(input);
        const sc = out.scenarios[0];

        expect(sc.violations.length).toBe(1);
        expect(sc.violations[0].message).toMatch(/meta/);
    });

    test('FC-2: No violation when connectors remain unchanged under forbid_new_connectors', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.baseline.sealed_envelope = {
            connectors: { google: {} }
        };

        input.scenarios = [{
            scenario_id: 'no_change',
            constraints: { forbid_new_connectors: true },
            envelope_overrides: {
                connectors: {
                    google: { budget: 200 } // Same connector, just modified
                }
            }
        }];

        phase75.execute.mockReturnValue({
            status: 'OK',
            replay_trace: { steps: [] }
        });

        const out = execute(input);
        const sc = out.scenarios[0];

        expect(sc.violations.length).toBe(0);
    });

});
