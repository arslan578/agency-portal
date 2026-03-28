const { execute } = require('../phase_68_safety_horizon_recalibration_engine');

// Mock Observability
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../../shared/metrics', () => ({
    increment: jest.fn(),
    gauge: jest.fn()
}));
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

const logging = require('../../../shared/logging');
const metrics = require('../../../shared/metrics');
const tracing = require('../../../shared/tracing');

describe('Phase 68: Safety Horizon Recalibration Engine (Final Hardened)', () => {

    const BASE_INPUT = {
        execution_id: 'exec-test-1',
        phase: '68',
        feature_flags: { FF_SAFETY_HORIZON_RECALIBRATION: true },
        prior_safety_horizon: {
            thresholds: { max_concurrency: 100, other_metric: 50 },
            forbidden_actions: [],
            risk_score: 0,
            horizon_version: 'v1'
        },
        health_evolution: { health_update: { health_score: 100 } },
        capability_drift: { severity_score: 0 },
        violation_history: { recent_violations: [] },
        usage_patterns: { call_frequency: 100 },
        policy_constraints: {}
    };

    const clone = (obj) => JSON.parse(JSON.stringify(obj));

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Core Logic Refinements ---

    test('1. Usage Pattern High Freq bumps Risk', () => {
        const input = clone(BASE_INPUT);
        input.usage_patterns.call_frequency = 1500; // > 1000
        const result = execute(input);
        expect(result.status).toBe('RECALIBRATED');
        expect(result.recalibrated_safety_horizon.risk_score).toBe(0.5); // +0.5
        expect(result.reasons).toContainStrings('Risk score bumped');
    });

    test('2. Health Drop Risk Math (0.05 factor)', () => {
        const input = clone(BASE_INPUT);
        input.health_evolution.health_update.health_score = 80; // Delta 20
        const result = execute(input);
        expect(result.recalibrated_safety_horizon.risk_score).toBe(1.0); // 20 * 0.05 = 1.0
    });

    test('3. Drift reduces Targeted Thresholds Only', () => {
        const input = clone(BASE_INPUT);
        input.prior_safety_horizon.thresholds.other_metric = 50;
        input.capability_drift.severity_score = 2; // 20%

        const result = execute(input);

        // Targeted: max_concurrency (100 -> 80)
        expect(result.recalibrated_safety_horizon.thresholds.max_concurrency).toBe(80);
        // Untargeted: other_metric (50 -> 50)
        expect(result.recalibrated_safety_horizon.thresholds.other_metric).toBe(50);

        // Granular Reason Check
        expect(result.reasons[0]).toContain("Threshold 'max_concurrency' reduced from 100 to 80");
    });

    test('4. Versioning Increment (v1 -> v2)', () => {
        const input = clone(BASE_INPUT);
        input.usage_patterns.call_frequency = 2000; // Trigger change
        const result = execute(input);
        expect(result.recalibrated_safety_horizon.horizon_version).toBe('v2');
    });

    // --- Strictness & Forward-Hardening ---

    test('5. Reject Undefined REQUIRED Field', () => {
        const input = clone(BASE_INPUT);
        delete input.prior_safety_horizon; // Required
        const result = execute(input);
        expect(result.status).toBe('ERROR');
        expect(result.reasons[0]).toContain('Missing required field');
    });

    test('6. Allow Missing OPTIONAL Field', () => {
        const input = clone(BASE_INPUT);
        delete input.usage_patterns; // Optional
        const result = execute(input);
        // Should process fine, no changes
        expect(result.ok).toBe(true);
        expect(result.status).toBe('NO_CHANGE');
    });

    test('7. Reject Unknown Top-Level Field', () => {
        const input = clone(BASE_INPUT);
        input.extra_field = 'suspicious';
        const result = execute(input);
        expect(result.status).toBe('ERROR');
        expect(result.reasons[0]).toContain('Unknown top-level field');
    });

    test('8. Reject _debug keys deep in object', () => {
        const input = clone(BASE_INPUT);
        input.usage_patterns = { _debug_dump: true, call_frequency: 100 };
        const result = execute(input);
        expect(result.status).toBe('ERROR');
        expect(result.reasons[0]).toContain('_debug');
    });

    // --- Observability ---

    test('9. Observability Hooks Called', () => {
        const input = clone(BASE_INPUT);
        execute(input);
        expect(logging.logStructured).toHaveBeenCalledWith('PHASE_68_COMPLETE', expect.anything());
        expect(metrics.increment).toHaveBeenCalledWith('phase_68_recalibration_attempt');
        expect(metrics.gauge).toHaveBeenCalledWith('phase_68_risk_score', expect.any(Number));
        expect(tracing.startSpan).toHaveBeenCalled();
    });

    // --- Immutability & Determinism Stability ---

    test('10. Unsorted Prior vs Sorted New = NO_CHANGE', () => {
        // Test that sorting issues don't trigger false positives
        const input = clone(BASE_INPUT);
        input.prior_safety_horizon.forbidden_actions = ['B', 'A']; // Unsorted
        // Logic will sort new to ['A', 'B']. 
        // Diff check should compare Sorted(Prior) vs Sorted(New) -> Equal -> No Change.

        const result = execute(input);
        expect(result.recalibrated_safety_horizon.forbidden_actions).toEqual(['A', 'B']); // Output is sorted
        expect(result.status).toBe('NO_CHANGE');
    });

    test('11. Policy Override with No Net Change', () => {
        const input = clone(BASE_INPUT);
        input.usage_patterns.call_frequency = 5000; // +0.5 risk
        input.policy_constraints.max_risk_score = 0; // Cap back to 0

        const result = execute(input);

        expect(result.recalibrated_safety_horizon.risk_score).toBe(0);
        // Net change 0 -> 0 should be NO_CHANGE
        expect(result.status).toBe('NO_CHANGE');
        // Version should mainain v1 if NO_CHANGE
        expect(result.recalibrated_safety_horizon.horizon_version).toBe('v1');
    });

    test('12. Determinism (50 Runs)', () => {
        const input = clone(BASE_INPUT);
        input.health_evolution.health_update.health_score = 90;

        const r1 = JSON.stringify(execute(input));
        for (let i = 0; i < 49; i++) {
            expect(JSON.stringify(execute(input))).toBe(r1);
        }
    });

});

// Helper for array string inclusion
expect.extend({
    toContainStrings(received, sub) {
        const pass = received.some(s => s.includes(sub));
        return {
            pass,
            message: () => `expected array to contain string matching "${sub}"`
        };
    }
});
