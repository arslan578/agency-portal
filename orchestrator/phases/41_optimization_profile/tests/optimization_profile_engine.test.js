/**
 * Phase 41: Optimization Loop Profiling Engine - Test Suite
 * 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const { generateOptimizationProfile } = require('../optimization_profile_engine');
const assert = require('assert');

// Test runner shims
const tests = [];

function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

function runTest(name, fn) {
    tests.push({ name, fn });
}

function expect(actual) {
    return {
        toBe: (expected) => assert.strictEqual(actual, expected),
        toEqual: (expected) => assert.deepStrictEqual(actual, expected),
        toBeTruthy: () => assert.ok(actual),
        toBeFalsy: () => assert.ok(!actual),
        toBeDefined: () => assert.notStrictEqual(actual, undefined),
        toBeGreaterThan: (expected) => assert.ok(actual > expected),
        toBeLessThan: (expected) => assert.ok(actual < expected)
    };
}

// Helper to create trace
function createTrace(rounds) {
    return rounds.map((r, i) => ({
        round_index: i,
        initial_budgets: r.initial_budgets || {},
        final_budgets: r.final_budgets || {},
        delta_by_venue: r.delta_by_venue || {},
        global_delta: r.global_delta || 0,
        brakes: r.brakes || [],
        diagnostics: r.diagnostics || {}
    }));
}

describe('Phase 41: Optimization Loop Profiling Engine', () => {

    // ========== HAPPY PATH (6 tests) ==========

    runTest('1. Complete trace profiling', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10, B: -5 }, global_delta: 5, brakes: [] },
            { delta_by_venue: { A: 5, B: -2 }, global_delta: 3, brakes: [] },
            { delta_by_venue: { A: 1, B: 0 }, global_delta: 1, brakes: [] }
        ]);

        const result = generateOptimizationProfile({
            optimization_trace: trace,
            initial_budgets: { A: 100, B: 100 },
            final_budgets: { A: 116, B: 93 }
        });

        expect(result.ok).toBe(true);
        expect(result.profile.per_round.length).toBe(3);
        expect(result.profile.per_round[0].absolute_delta).toBe(15);
        expect(result.profile.per_round[1].absolute_delta).toBe(7);
        expect(result.profile.per_round[2].absolute_delta).toBe(1);
        expect(result.profile.convergence_score).toBeGreaterThan(0);
        expect(result.profile.stability_tag).toBeDefined();
    });

    runTest('2. Convergence detection', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 100 }, global_delta: 100 },
            { delta_by_venue: { A: 50 }, global_delta: 50 },
            { delta_by_venue: { A: 25 }, global_delta: 25 },
            { delta_by_venue: { A: 10 }, global_delta: 10 }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.convergence_score).toBeGreaterThan(0.8);
        expect(result.profile.stability_tag).toBe('STABLE');
    });

    runTest('3. Oscillation detection', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10, B: -5 }, global_delta: 5 },
            { delta_by_venue: { A: -8, B: 4 }, global_delta: -4 },
            { delta_by_venue: { A: 6, B: -3 }, global_delta: 3 },
            { delta_by_venue: { A: -4, B: 2 }, global_delta: -2 }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.oscillation_flag).toBe(true);
        expect(result.profile.per_round[1].oscillation_detected).toBe(true);
    });

    runTest('4. Brake event logging', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10 }, global_delta: 10, brakes: ['DRIFT_BRAKE'] },
            { delta_by_venue: { A: 5 }, global_delta: 5, brakes: [] },
            { delta_by_venue: { A: 2 }, global_delta: 2, brakes: ['SEVERITY_BRAKE', 'POLICY_GUARD'] }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.brake_events.length).toBe(3);
        expect(result.profile.brake_events[0]).toEqual({ round_index: 0, brake: 'DRIFT_BRAKE' });
        expect(result.profile.brake_events[1].round_index).toBe(2);
        expect(result.profile.brake_events[2].round_index).toBe(2);
    });

    runTest('5. Stability classification', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        // STABLE case
        const stableTrace = createTrace([
            { delta_by_venue: { A: 10 }, global_delta: 10 },
            { delta_by_venue: { A: 5 }, global_delta: 5 },
            { delta_by_venue: { A: 1 }, global_delta: 1 }
        ]);

        const stableResult = generateOptimizationProfile({ optimization_trace: stableTrace });
        expect(stableResult.profile.stability_tag).toBe('STABLE');

        // DAMPED case
        const dampedTrace = createTrace([
            { delta_by_venue: { A: 10 }, global_delta: 10 },
            { delta_by_venue: { A: 8 }, global_delta: 8 }
        ]);

        const dampedResult = generateOptimizationProfile({ optimization_trace: dampedTrace });
        expect(dampedResult.profile.stability_tag).toBe('DAMPED');
    });

    runTest('6. Termination reason extraction', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 1 }, global_delta: 1 }
        ]);

        const result = generateOptimizationProfile({
            optimization_trace: trace,
            diagnostics: { termination_reason: 'CONVERGED' }
        });

        expect(result.ok).toBe(true);
        expect(result.profile.termination_reason).toBe('CONVERGED');
    });

    // ========== NEGATIVE PATH (6 tests) ==========

    runTest('7. Missing optimization_trace', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const result = generateOptimizationProfile({});

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
        expect(result.message).toBeDefined();
    });

    runTest('8. Malformed trace structure', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const result = generateOptimizationProfile({
            optimization_trace: [
                { round_index: 0, delta_by_venue: {} },
                "not an object"
            ]
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('MALFORMED_TRACE');
    });

    runTest('9. Missing budgets', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10 }, global_delta: 10 }
        ]);

        // Should still succeed even without budgets (they're optional)
        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
    });

    runTest('10. Invalid round data', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const result = generateOptimizationProfile({
            optimization_trace: [
                { delta_by_venue: { A: 10 } } // Missing round_index
            ]
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('MALFORMED_TRACE');
    });

    runTest('11. Empty trace', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const result = generateOptimizationProfile({
            optimization_trace: []
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
    });

    runTest('12. NaN in deltas', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: NaN, B: 10 }, global_delta: NaN }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        // NaN values should be gracefully handled
        expect(result.profile.per_round[0].absolute_delta).toBe(10);
    });

    // ========== EDGE CASES (4 tests) ==========

    runTest('13. Single round trace', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10 }, global_delta: 10 }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.per_round.length).toBe(1);
        expect(result.profile.convergence_score).toBe(0);
        expect(result.profile.oscillation_flag).toBe(false);
    });

    runTest('14. Zero deltas (perfect stability)', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 0, B: 0 }, global_delta: 0 },
            { delta_by_venue: { A: 0, B: 0 }, global_delta: 0 }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.per_round[0].absolute_delta).toBe(0);
        expect(result.profile.convergence_score).toBe(1);
        expect(result.profile.stability_tag).toBe('STABLE');
    });

    runTest('15. All venues oscillating', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10, B: 10 }, global_delta: 20 },
            { delta_by_venue: { A: -10, B: -10 }, global_delta: -20 },
            { delta_by_venue: { A: 10, B: 10 }, global_delta: 20 }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.oscillation_flag).toBe(true);
        // Convergence score is 0 (no improvement), so with oscillation it's OSCILLATORY not UNSTABLE
        expect(result.profile.stability_tag).toBe('OSCILLATORY');
    });

    runTest('16. Extreme convergence score', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 1000 }, global_delta: 1000 },
            { delta_by_venue: { A: 0 }, global_delta: 0 }
        ]);

        const result = generateOptimizationProfile({ optimization_trace: trace });

        expect(result.ok).toBe(true);
        expect(result.profile.convergence_score).toBe(1);
    });

    // ========== REGRESSION (1 test) ==========

    runTest('17. Termination reason normalization', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 1 }, global_delta: 1 }
        ]);

        // Test various termination reason formats
        const validReasons = ['CONVERGED', 'MAX_ROUNDS', 'BRAKE_TRIGGERED', 'OSCILLATION_DAMP', 'PLATEAU', 'INFEASIBLE'];

        for (const reason of validReasons) {
            const result = generateOptimizationProfile({
                optimization_trace: trace,
                diagnostics: { termination_reason: reason }
            });

            expect(result.profile.termination_reason).toBe(reason);
        }

        // Test invalid reason -> UNKNOWN
        const invalidResult = generateOptimizationProfile({
            optimization_trace: trace,
            diagnostics: { termination_reason: 'INVALID_REASON_123' }
        });

        expect(invalidResult.profile.termination_reason).toBe('UNKNOWN');
    });

    // ========== DETERMINISM (1 test) ==========

    runTest('18. Identical trace → identical profile', () => {
        process.env.FF_OPTIMIZATION_PROFILE_V1 = 'true';

        const trace = createTrace([
            { delta_by_venue: { A: 10, B: -5 }, global_delta: 5, brakes: ['BRAKE_1'] },
            { delta_by_venue: { A: 5, B: -2 }, global_delta: 3, brakes: [] },
            { delta_by_venue: { A: 1, B: 0 }, global_delta: 1, brakes: ['BRAKE_2'] }
        ]);

        const input = {
            optimization_trace: trace,
            initial_budgets: { A: 100, B: 100 },
            final_budgets: { A: 116, B: 93 },
            diagnostics: { termination_reason: 'CONVERGED' }
        };

        const result1 = generateOptimizationProfile(input);
        const result2 = generateOptimizationProfile(input);

        expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

});

// Run all tests
(async () => {
    console.log('Starting tests...');
    for (const test of tests) {
        try {
            await test.fn();
            console.log(`  ✓ ${test.name}`);
        } catch (e) {
            console.error(`  ✗ ${test.name}`);
            console.error(`    ${e.message}`);
            console.error(e.stack);
            process.exit(1);
        }
    }
    console.log(`\n✅ All ${tests.length} tests passed!`);
})();
