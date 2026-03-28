const {
    runBudgetRebalancer,
    _internal
} = require('../budget_rebalancer_engine');
const assert = require('assert');

function describe(name, fn) {
    console.log(name);
    fn();
}

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (e) {
        console.error(`  ✗ ${name}`);
        console.error(e);
        process.exit(1);
    }
}

function expect(actual) {
    return {
        toBe: (expected) => assert.strictEqual(actual, expected),
        toBeCloseTo: (expected, precision = 2) => {
            const diff = Math.abs(actual - expected);
            const tolerance = Math.pow(10, -precision) / 2;
            if (diff >= tolerance) {
                // assert.ok(diff < tolerance, ...);
                // Using simple error throw for clarity
                throw new Error(`Expected ${actual} to be close to ${expected} with precision ${precision} (diff: ${diff})`);
            }
        },
        toBeGreaterThan: (expected) => assert.ok(actual > expected, `Expected ${actual} > ${expected}`),
        toBeLessThan: (expected) => assert.ok(actual < expected, `Expected ${actual} < ${expected}`),
        toBeGreaterThanOrEqual: (expected) => assert.ok(actual >= expected, `Expected ${actual} >= ${expected}`),
        toBeLessThanOrEqual: (expected) => assert.ok(actual <= expected, `Expected ${actual} <= ${expected}`),
    };
}

describe('Phase 37: Budget Rebalancer v1', () => {
    const basePolicy = {
        optimizer_adjustment_rate: 0.1,
        venue_budget_limits: {}
    };

    function makeEnvelope(overrides = {}) {
        return {
            execution_id: overrides.execution_id || 'exec-1',
            payload: {
                learning_signals_v1: {
                    venues: overrides.learning_venues || []
                },
                budget_plan_v1: {
                    venues: overrides.budget_venues || []
                },
                policy_mirror_v1: overrides.policy_mirror || basePolicy,
                flags: overrides.flags
            }
        };
    }

    // ----------------------
    // 1–6: Happy path tests
    // ----------------------

    test('1. basic reallocation favors higher scoring venue', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 0.9, constraint_tightness: 0, coverage_penalty: 0 },
                { venue_key: 'B', global_score: 0.1, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 50 },
                { venue_key: 'B', allocated: 50 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const venues = result.payload.rebalance_plan_v1.venues;

        const total = venues.reduce((sum, v) => sum + v.new_spend, 0);
        expect(total).toBeCloseTo(100, 4);

        const a = venues.find(v => v.venue_key === 'A');
        const b = venues.find(v => v.venue_key === 'B');

        expect(a.new_spend).toBeGreaterThan(50);
        expect(b.new_spend).toBeLessThan(50);
    });

    test('2. zero weights produce no-op plan', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 0, constraint_tightness: 0, coverage_penalty: 0 },
                { venue_key: 'B', global_score: 0, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 60 },
                { venue_key: 'B', allocated: 40 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const venues = result.payload.rebalance_plan_v1.venues;

        const a = venues.find(v => v.venue_key === 'A');
        const b = venues.find(v => v.venue_key === 'B');

        expect(a.new_spend).toBeCloseTo(60, 4);
        expect(b.new_spend).toBeCloseTo(40, 4);
        expect(a.delta).toBeCloseTo(0, 4);
        expect(b.delta).toBeCloseTo(0, 4);
    });

    test('3. feature flag disabled returns pass-through plan', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 100 }
            ],
            flags: {
                FF_BUDGET_REBALANCER_V1: false
            }
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const plan = result.payload.rebalance_plan_v1;
        expect(plan.total_budget).toBeCloseTo(100, 4);
        expect(plan.venues[0].new_spend).toBeCloseTo(100, 4);
        expect(plan.venues[0].delta).toBeCloseTo(0, 4);
    });

    test('4. respects min and max limits', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 },
                { venue_key: 'B', global_score: 0.5, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 50 },
                { venue_key: 'B', allocated: 50 }
            ],
            policy_mirror: {
                optimizer_adjustment_rate: 0.5,
                venue_budget_limits: {
                    A: { min_budget: 60, max_budget: 70 },
                    B: { min_budget: 30, max_budget: 40 }
                }
            }
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const venues = result.payload.rebalance_plan_v1.venues;
        const a = venues.find(v => v.venue_key === 'A');
        const b = venues.find(v => v.venue_key === 'B');

        expect(a.new_spend).toBeGreaterThanOrEqual(60);
        expect(a.new_spend).toBeLessThanOrEqual(70);
        expect(b.new_spend).toBeGreaterThanOrEqual(30);
        expect(b.new_spend).toBeLessThanOrEqual(40);

        const total = venues.reduce((sum, v) => sum + v.new_spend, 0);
        expect(total).toBeCloseTo(100, 4);
    });

    test('5. optimizer_adjustment_rate pulled from policy, default if invalid', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 },
                { venue_key: 'B', global_score: 0, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 0 },
                { venue_key: 'B', allocated: 100 }
            ],
            policy_mirror: {
                optimizer_adjustment_rate: 0.5
            }
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const venues = result.payload.rebalance_plan_v1.venues;
        const a = venues.find(v => v.venue_key === 'A');
        const b = venues.find(v => v.venue_key === 'B');

        // With 0.5 rate, A should gain significant budget relative to B
        expect(a.new_spend).toBeGreaterThan(0);
        expect(b.new_spend).toBeLessThan(100);
    });

    test('6. missing learning entry defaults to zeros', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 }
                // B is missing here
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 50 },
                { venue_key: 'B', allocated: 50 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const venues = result.payload.rebalance_plan_v1.venues;

        const b = venues.find(v => v.venue_key === 'B');
        expect(b.reason.global_signal).toBe(0);
        expect(b.reason.constraint_tightness).toBe(0);
        expect(b.reason.coverage_penalty).toBe(0);
    });

    // ----------------------
    // 7–12: Negative tests
    // ----------------------

    test('7. malformed envelope returns MALFORMED_INPUT', () => {
        const result = runBudgetRebalancer(null);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('MALFORMED_INPUT');
    });

    test('8. missing payload returns MALFORMED_INPUT', () => {
        const result = runBudgetRebalancer({ execution_id: 'x' });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('MALFORMED_INPUT');
    });

    test('9. missing learning_signals_v1.venues returns MALFORMED_LEARNING_SIGNALS', () => {
        const result = runBudgetRebalancer({
            execution_id: 'x',
            payload: {
                learning_signals_v1: {},
                budget_plan_v1: { venues: [] },
                policy_mirror_v1: basePolicy
            }
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('MALFORMED_LEARNING_SIGNALS');
    });

    test('10. missing budget_plan_v1.venues returns MALFORMED_BUDGET_PLAN', () => {
        const result = runBudgetRebalancer({
            execution_id: 'x',
            payload: {
                learning_signals_v1: { venues: [] },
                budget_plan_v1: {},
                policy_mirror_v1: basePolicy
            }
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('MALFORMED_BUDGET_PLAN');
    });

    test('11. invalid score values return INVALID_SCORE_VALUE', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: NaN, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 100 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_SCORE_VALUE');
    });

    test('12. invalid budget values return INVALID_BUDGET_VALUE', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: -10 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INVALID_BUDGET_VALUE');
    });

    // ----------------------
    // 13–16: Edge cases
    // ----------------------

    test('13. all pressures negative produce no-op plan', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 0, constraint_tightness: 0, coverage_penalty: 1 },
                { venue_key: 'B', global_score: 0, constraint_tightness: 0, coverage_penalty: 1 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 40 },
                { venue_key: 'B', allocated: 60 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const venues = result.payload.rebalance_plan_v1.venues;
        const a = venues.find(v => v.venue_key === 'A');
        const b = venues.find(v => v.venue_key === 'B');

        expect(a.new_spend).toBeCloseTo(40, 4);
        expect(b.new_spend).toBeCloseTo(60, 4);
    });

    test('14. infeasible min constraints produce INFEASIBLE_REALLOCATION', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 },
                { venue_key: 'B', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 50 },
                { venue_key: 'B', allocated: 50 }
            ],
            policy_mirror: {
                optimizer_adjustment_rate: 0.5,
                venue_budget_limits: {
                    A: { min_budget: 80 },
                    B: { min_budget: 30 }
                }
            }
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INFEASIBLE_REALLOCATION');
    });

    test('15. zero total budget results in zero outputs', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 0, coverage_penalty: 0 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 0 }
            ]
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const plan = result.payload.rebalance_plan_v1;
        expect(plan.total_budget).toBeCloseTo(0, 4);
        expect(plan.venues[0].new_spend).toBeCloseTo(0, 4);
    });

    test('16. getAdjustmentRate falls back to 0.10 for invalid policy', () => {
        const rate1 = _internal.getAdjustmentRate(null);
        const rate2 = _internal.getAdjustmentRate({});
        const rate3 = _internal.getAdjustmentRate({ optimizer_adjustment_rate: -1 });
        const rate4 = _internal.getAdjustmentRate({ optimizer_adjustment_rate: 2 });
        const rate5 = _internal.getAdjustmentRate({ optimizer_adjustment_rate: NaN });

        expect(rate1).toBeCloseTo(0.10);
        expect(rate2).toBeCloseTo(0.10);
        expect(rate3).toBeCloseTo(0.10);
        expect(rate4).toBeCloseTo(0.10);
        expect(rate5).toBeCloseTo(0.10);
    });

    // ----------------------
    // 17. Regression guard
    // ----------------------

    test('17. regression: clamping then diff adjustment still preserves total budget', () => {
        const envelope = makeEnvelope({
            learning_venues: [
                { venue_key: 'A', global_score: 1, constraint_tightness: 1, coverage_penalty: 0 },
                { venue_key: 'B', global_score: 0.2, constraint_tightness: 0, coverage_penalty: 0.1 },
                { venue_key: 'C', global_score: 0.5, constraint_tightness: 0.5, coverage_penalty: 0.2 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 40 },
                { venue_key: 'B', allocated: 30 },
                { venue_key: 'C', allocated: 30 }
            ],
            policy_mirror: {
                optimizer_adjustment_rate: 0.3,
                venue_budget_limits: {
                    A: { min_budget: 30, max_budget: 80 },
                    B: { min_budget: 10, max_budget: 40 },
                    C: { min_budget: 10, max_budget: 40 }
                }
            }
        });

        const result = runBudgetRebalancer(envelope);
        expect(result.ok).toBe(true);
        const plan = result.payload.rebalance_plan_v1;
        const total = plan.venues.reduce((sum, v) => sum + v.new_spend, 0);
        expect(total).toBeCloseTo(100, 4);
    });

    // ----------------------
    // 18. Determinism guard
    // ----------------------

    test('18. determinism: same input snapshot yields identical rebalance_plan_v1', () => {
        const envelope = makeEnvelope({
            execution_id: 'exec-det',
            learning_venues: [
                { venue_key: 'A', global_score: 0.8, constraint_tightness: 0.3, coverage_penalty: 0.1 },
                { venue_key: 'B', global_score: 0.4, constraint_tightness: 0.2, coverage_penalty: 0.2 }
            ],
            budget_venues: [
                { venue_key: 'A', allocated: 70 },
                { venue_key: 'B', allocated: 30 }
            ]
        });

        const result1 = runBudgetRebalancer(envelope);
        const result2 = runBudgetRebalancer(envelope);

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);

        const plan1 = result1.payload.rebalance_plan_v1;
        const plan2 = result2.payload.rebalance_plan_v1;

        expect(plan1.total_budget).toBeCloseTo(plan2.total_budget, 6);
        expect(plan1.venues.length).toBe(plan2.venues.length);

        for (let i = 0; i < plan1.venues.length; i += 1) {
            const v1 = plan1.venues[i];
            const v2 = plan2.venues[i];
            expect(v1.venue_key).toBe(v2.venue_key);
            expect(v1.new_spend).toBeCloseTo(v2.new_spend, 6);
            expect(v1.delta).toBeCloseTo(v2.delta, 6);
        }
    });
});
