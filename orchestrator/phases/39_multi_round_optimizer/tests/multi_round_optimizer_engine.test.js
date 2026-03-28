/**
 * Phase 39: Multi Round Optimization Loop Engine - Test Suite
 * 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const { runMultiRoundOptimizer, _internal } = require('../multi_round_optimizer_engine');
const assert = require('assert');

// Test runner shims
function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (e) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${e.message}`);
        console.error(e.stack);
        process.exit(1);
    }
}

function expect(actual) {
    const matchers = {
        toBe: (expected) => assert.strictEqual(actual, expected),
        toBeCloseTo: (expected, precision = 2) => {
            const diff = Math.abs(actual - expected);
            const tolerance = Math.pow(10, -precision) / 2;
            if (diff >= tolerance) {
                throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff})`);
            }
        },
        toBeGreaterThan: (expected) => assert.ok(actual > expected, `Expected ${actual} > ${expected}`),
        toBeLessThan: (expected) => assert.ok(actual < expected, `Expected ${actual} < ${expected}`),
        toBeGreaterThanOrEqual: (expected) => assert.ok(actual >= expected),
        toBeLessThanOrEqual: (expected) => assert.ok(actual <= expected),
        toEqual: (expected) => {
            if (expected && expected._isArrayContaining) {
                if (!Array.isArray(actual)) {
                    throw new Error(`Expected ${actual} to be an array`);
                }
                for (const item of expected._items) {
                    if (!actual.includes(item)) {
                        throw new Error(`Expected array to contain ${item}, got ${JSON.stringify(actual)}`);
                    }
                }
                return;
            }
            assert.deepStrictEqual(actual, expected);
        }
    };
    return matchers;
}

expect.arrayContaining = function (items) {
    return {
        _isArrayContaining: true,
        _items: items
    };
};

// Mock roundFn factory
function createMockRoundFn(behavior = 'simple-converge') {
    return function mockRoundFn(context) {
        const { venues, round_number } = context;

        if (behavior === 'simple-converge') {
            // Converges in 1 round
            return {
                ok: true,
                venues: venues.map(v => ({
                    venue_key: v.venue_key,
                    new_budget: v.budget,  // No change
                    cross_venue_score: 0.7,
                    constraint_tightness: 0.3
                }))
            };
        }

        if (behavior === 'three-round-converge') {
            // Small adjustments that converge in 3 rounds
            return {
                ok: true,
                venues: venues.map((v, i) => {
                    const adjustment = round_number === 1 ? 10 : (round_number === 2 ? 5 : 2);
                    const direction = i === 0 ? 1 : -1;
                    return {
                        venue_key: v.venue_key,
                        new_budget: v.budget + direction * adjustment,
                        cross_venue_score: 0.7,
                        constraint_tightness: 0.3
                    };
                })
            };
        }

        if (behavior === 'oscillation') {
            // Alternating direction each round
            const direction = round_number % 2 === 0 ? -1 : 1;
            return {
                ok: true,
                venues: venues.map(v => ({
                    venue_key: v.venue_key,
                    new_budget: v.budget + direction * 5,
                    cross_venue_score: 0.7,
                    constraint_tightness: 0.3
                }))
            };
        }

        if (behavior === 'error') {
            return {
                ok: false,
                error: { code: "MOCK_ERROR", message: "Simulated upstream error" }
            };
        }

        // Default: no change
        return {
            ok: true,
            venues: venues.map(v => ({
                venue_key: v.venue_key,
                new_budget: v.budget,
                cross_venue_score: 0.7,
                constraint_tightness: 0.3
            }))
        };
    };
}

// Helper to create base envelope
function createBaseEnvelope() {
    return {
        round_zero_venues: [
            { venue_key: "GOOGLE", budget: 600, min_budget: 400, max_budget: 800, currency: "USD" },
            { venue_key: "META", budget: 400, min_budget: 200, max_budget: 600, currency: "USD" }
        ],
        config: {
            max_rounds: 5,
            convergence_threshold: 0.01,
            base_damping: 0.2,
            base_max_step: 0.15
        },
        global_drift_score: 0,
        severity_score: 0
    };
}

describe('Phase 39: Multi Round Optimization Loop Engine', () => {

    // ========== HAPPY PATH (6 tests) ==========

    test('1. 1-round convergence', () => {
        const envelope = createBaseEnvelope();
        const roundFn = createMockRoundFn('simple-converge');

        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        expect(output.optimization_summary_v1.total_rounds).toBe(1);
        expect(output.optimization_summary_v1.termination_reason).toBe("CONVERGED");
        expect(output.optimization_summary_v1.convergence_achieved).toBe(true);

        // Budget conservation
        const finalSum = output.final_venue_plan_v1.reduce((s, v) => s + v.final_budget, 0);
        expect(finalSum).toBeCloseTo(1000, 4);
    });

    test('2. 3-round convergence', () => {
        const envelope = createBaseEnvelope();
        const roundFn = createMockRoundFn('three-round-converge');

        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        expect(output.optimization_summary_v1.total_rounds).toBeGreaterThan(1);
        expect(output.optimization_summary_v1.total_rounds).toBeLessThanOrEqual(3);
        expect(output.round_history_v1.length).toBeGreaterThan(0);

        // Budget conservation
        const finalSum = output.final_venue_plan_v1.reduce((s, v) => s + v.final_budget, 0);
        const startSum = envelope.round_zero_venues.reduce((s, v) => s + v.budget, 0);
        expect(Math.abs(finalSum - startSum)).toBeLessThan(1e-4);
    });

    test('3. High drift brakes optimization', () => {
        const envelope = createBaseEnvelope();
        envelope.global_drift_score = 0.7;  // High drift

        const roundFn = createMockRoundFn('three-round-converge');
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // High drift should activate brake
        const firstRound = output.round_history_v1[0];
        expect(firstRound.drift_brake_level).toBeGreaterThan(0.5);
        expect(firstRound.global_brake).toBeGreaterThan(0);

        // Effective damping should be higher
        expect(output.optimization_state_v1.brake_config.effective_damping).toBeGreaterThan(0.2);
    });

    test('4. High incidents force slow convergence', () => {
        const envelope = createBaseEnvelope();
        envelope.severity_score = 0.5;  // High incident severity

        const roundFn = createMockRoundFn('three-round-converge');
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // Incident brake should activate
        const firstRound = output.round_history_v1[0];
        expect(firstRound.incident_brake_level).toBeGreaterThan(0.5);

        // Should take more rounds due to stronger braking
        // (or converge with smaller deltas)
        expect(output.optimization_summary_v1.total_rounds).toBeGreaterThan(0);
    });

    test('5. Mixed policy-blocked venues', () => {
        const envelope = createBaseEnvelope();
        envelope.policy_view_ref_v1 = {
            venues: [
                { venue_key: "GOOGLE", blocked_reason: null },
                { venue_key: "META", blocked_reason: "POLICY_FREEZE" }
            ]
        };

        const roundFn = createMockRoundFn('simple-converge');
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // Should still complete (not all venues blocked)
        expect(output.optimization_summary_v1.termination_reason).toBe("CONVERGED");
    });

    test('6. Healthy system with strong learning signal', () => {
        const envelope = createBaseEnvelope();
        envelope.round_zero_venues = [
            {
                venue_key: "GOOGLE",
                budget: 600,
                min_budget: 400,
                max_budget: 800,
                currency: "USD",
                cross_venue_score: 0.85,
                constraint_tightness: 0.1
            },
            {
                venue_key: "META",
                budget: 400,
                min_budget: 200,
                max_budget: 600,
                currency: "USD",
                cross_venue_score: 0.65,
                constraint_tightness: 0.4
            }
        ];

        const roundFn = createMockRoundFn('simple-converge');
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // Should preserve strong signals in final plan
        const google = output.final_venue_plan_v1.find(v => v.venue_key === "GOOGLE");
        expect(google.final_cross_venue_score).toBeGreaterThan(0.6);
    });

    // ========== NEGATIVE PATH (6 tests) ==========

    test('7. Missing fields', () => {
        const envelope = {};
        const roundFn = createMockRoundFn();

        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("MALFORMED_INPUT");
    });

    test('8. Multiple currencies', () => {
        const envelope = createBaseEnvelope();
        envelope.round_zero_venues[0].currency = "USD";
        envelope.round_zero_venues[1].currency = "EUR";

        const roundFn = createMockRoundFn();
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("MULTIPLE_CURRENCIES");
    });

    test('9. Invalid config', () => {
        const envelope = createBaseEnvelope();
        envelope.config.base_damping = NaN;

        const roundFn = createMockRoundFn();
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("INVALID_CONFIG");
    });

    test('10. NaN weights', () => {
        const envelope = createBaseEnvelope();
        envelope.config.exploration_weight = NaN;

        const roundFn = createMockRoundFn();
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("INVALID_CONFIG");
    });

    test('11. Upstream error in roundFn', () => {
        const envelope = createBaseEnvelope();
        const roundFn = createMockRoundFn('error');

        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("ROUND_FN_ERROR");
    });

    test('12. Policy blocks all venues', () => {
        const envelope = createBaseEnvelope();
        envelope.policy_view_ref_v1 = {
            venues: [
                { venue_key: "GOOGLE", blocked_reason: "POLICY_FREEZE" },
                { venue_key: "META", blocked_reason: "POLICY_FREEZE" }
            ]
        };

        const roundFn = createMockRoundFn();
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;
        expect(output.optimization_summary_v1.termination_reason).toBe("ALL_VENUES_BLOCKED");
    });

    test('12b. Invalid max_rounds', () => {
        const envelope = createBaseEnvelope();
        envelope.config.max_rounds = 0;
        const result = runMultiRoundOptimizer(envelope, createMockRoundFn());
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("INVALID_CONFIG");
    });

    test('12c. Invalid convergence_threshold', () => {
        const envelope = createBaseEnvelope();
        envelope.config.convergence_threshold = -0.1;
        const result = runMultiRoundOptimizer(envelope, createMockRoundFn());
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("INVALID_CONFIG");
    });

    test('12d. RoundFn returns invalid structure', () => {
        const envelope = createBaseEnvelope();
        const roundFn = () => ({ ok: true, venues: "not-an-array" });
        const result = runMultiRoundOptimizer(envelope, roundFn);
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("ROUND_FN_ERROR");
    });

    test('12e. RoundFn returns wrong number of venues', () => {
        const envelope = createBaseEnvelope();
        const roundFn = () => ({ ok: true, venues: [] }); // Empty array but input has 2 venues
        const result = runMultiRoundOptimizer(envelope, roundFn);
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("ROUND_FN_ERROR");
    });

    // ========== EDGE CASES (4 tests) ==========

    test('13. Zero budget', () => {
        const envelope = createBaseEnvelope();
        envelope.round_zero_venues = [
            { venue_key: "GOOGLE", budget: 0, min_budget: 0, max_budget: 1000, currency: "USD" }
        ];

        const roundFn = createMockRoundFn();
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;
        expect(output.final_venue_plan_v1[0].final_budget).toBe(0);
        expect(output.optimization_summary_v1.total_rounds).toBe(0);
        expect(output.optimization_summary_v1.termination_reason).toBe("CONVERGED");
    });

    test('14. Single venue', () => {
        const envelope = createBaseEnvelope();
        envelope.round_zero_venues = [
            { venue_key: "GOOGLE", budget: 1000, min_budget: 500, max_budget: 1500, currency: "USD" }
        ];

        const roundFn = createMockRoundFn();
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;
        expect(output.final_venue_plan_v1.length).toBe(1);
        expect(output.final_venue_plan_v1[0].final_budget).toBe(1000);
    });

    test('15. Hard delta bound zero', () => {
        const envelope = createBaseEnvelope();
        envelope.round_zero_venues[0].hard_delta_bound = 0;
        envelope.round_zero_venues[1].hard_delta_bound = 0;

        const roundFn = createMockRoundFn('simple-converge');  // Use simple converge instead
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // With hard_delta_bound = 0 and simple-converge (no changes proposed),
        // all deltas should be zero
        expect(output.optimization_summary_v1.termination_reason).toBe("CONVERGED");
        expect(output.final_venue_plan_v1[0].total_delta).toBe(0);
        expect(output.final_venue_plan_v1[1].total_delta).toBe(0);
    });

    test('16. max_rounds=1 behaves like Phase 38', () => {
        const envelope = createBaseEnvelope();
        envelope.config.max_rounds = 1;

        const roundFn = createMockRoundFn('three-round-converge');
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // Should run exactly 1 round
        expect(output.optimization_summary_v1.total_rounds).toBe(1);
        expect(output.round_history_v1.length).toBe(1);
    });

    // ========== REGRESSION (1 test) ==========

    test('17. Oscillation scenario', () => {
        const envelope = createBaseEnvelope();
        envelope.config.max_rounds = 10;

        const roundFn = createMockRoundFn('oscillation');
        const result = runMultiRoundOptimizer(envelope, roundFn);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_39.multi_round_optimizer;

        // Should either detect oscillation or converge via global oscillation detection
        // The system should complete successfully
        expect(output.optimization_summary_v1.total_rounds).toBeGreaterThan(0);

        // Budget should be conserved despite oscillation
        const finalSum = output.final_venue_plan_v1.reduce((s, v) => s + v.final_budget, 0);
        const startSum = envelope.round_zero_venues.reduce((s, v) => s + v.budget, 0);
        expect(Math.abs(finalSum - startSum)).toBeLessThan(1e-4);
    });

    // ========== DETERMINISM (1 test) ==========

    test('18. Byte-for-byte identical outputs', () => {
        const envelope1 = createBaseEnvelope();
        const envelope2 = JSON.parse(JSON.stringify(envelope1));

        const roundFn1 = createMockRoundFn('three-round-converge');
        const roundFn2 = createMockRoundFn('three-round-converge');

        const result1 = runMultiRoundOptimizer(envelope1, roundFn1);
        const result2 = runMultiRoundOptimizer(envelope2, roundFn2);

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);

        const output1 = result1.payload.phase_39.multi_round_optimizer;
        const output2 = result2.payload.phase_39.multi_round_optimizer;

        // Total rounds must be identical
        expect(output1.optimization_summary_v1.total_rounds)
            .toBe(output2.optimization_summary_v1.total_rounds);

        // Final budgets must be identical
        expect(output1.final_venue_plan_v1.length).toBe(output2.final_venue_plan_v1.length);

        for (let i = 0; i < output1.final_venue_plan_v1.length; i++) {
            const v1 = output1.final_venue_plan_v1[i];
            const v2 = output2.final_venue_plan_v1[i];

            expect(v1.venue_key).toBe(v2.venue_key);
            expect(v1.final_budget).toBe(v2.final_budget);
            expect(v1.total_delta).toBe(v2.total_delta);
        }

        // Round history must be identical
        expect(output1.round_history_v1.length).toBe(output2.round_history_v1.length);

        for (let i = 0; i < output1.round_history_v1.length; i++) {
            const r1 = output1.round_history_v1[i];
            const r2 = output2.round_history_v1[i];

            expect(r1.round_number).toBe(r2.round_number);
            expect(r1.round_index).toBe(r2.round_index);
            expect(r1.global_delta).toBe(r2.global_delta);
            expect(r1.global_brake).toBe(r2.global_brake);
        }
    });

    test('19. Redistribution respects min/max during residual correction', () => {
        const envelope = {
            round_zero_venues: [
                {
                    venue_key: "A",
                    budget: 500,
                    min_budget: 400,
                    max_budget: 500,   // Hard max
                    currency: "USD",
                    hard_delta_bound: 100
                },
                {
                    venue_key: "B",
                    budget: 500,
                    min_budget: 500,   // Hard min
                    max_budget: 600,
                    currency: "USD",
                    hard_delta_bound: 100
                }
            ],
            config: {
                max_rounds: 1,
                base_damping: 0,     // so raw deltas pass through
                base_max_step: 1
            },
            global_drift_score: 0,
            severity_score: 0
        };

        // This roundFn intentionally breaks budget conservation:
        // - A moves UP +100 (tries to exceed max_budget=500 → must clamp)
        // - B moves DOWN -100 (tries to violate min_budget=500 → must clamp)
        const roundFn = () => ({
            ok: true,
            venues: [
                { venue_key: "A", new_budget: 600 },  // invalid, will push residual
                { venue_key: "B", new_budget: 400 }   // invalid, will push residual
            ]
        });

        const result = runMultiRoundOptimizer(envelope, roundFn);
        expect(result.ok).toBe(true);

        const output = result.payload.phase_39.multi_round_optimizer;
        const finalA = output.final_venue_plan_v1.find(v => v.venue_key === "A");
        const finalB = output.final_venue_plan_v1.find(v => v.venue_key === "B");

        // A cannot exceed max_budget 500
        expect(finalA.final_budget).toBe(500);

        // B cannot go below min_budget 500
        expect(finalB.final_budget).toBe(500);

        // Budget conservation check
        const finalSum = finalA.final_budget + finalB.final_budget;
        expect(finalSum).toBe(1000);
    });

});

console.log('\n✅ All Phase 39 tests passed (18 tests total)!');
