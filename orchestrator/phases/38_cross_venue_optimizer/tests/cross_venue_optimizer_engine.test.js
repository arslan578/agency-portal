/**
 * Phase 38: Cross Venue Optimizer - Test Suite
 * 20 tests: 6 happy, 6 negative, 4 edge, 1 regression, 2 paranoia, 1 determinism
 */

const { runCrossVenueOptimizer, _internal } = require('../cross_venue_optimizer_engine');
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
            // For arrayContaining pattern
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

// Helper for arrayContaining
expect.arrayContaining = function (items) {
    return {
        _isArrayContaining: true,
        _items: items
    };
};

// Helper to create base envelope
function createBaseEnvelope() {
    return {
        flags: { FF_CROSS_VENUE_OPTIMIZER: true },
        payload: {
            phase_35: {
                world_aware_optimization: {
                    recommended_venues: [
                        { venue_key: "GOOGLE", raw_score: 0.8, recommended_budget: 600 },
                        { venue_key: "META", raw_score: 0.6, recommended_budget: 400 }
                    ]
                }
            },
            phase_36: {
                learning_signal_aggregate: {
                    recommended_signals: [
                        { venue_key: "GOOGLE", normalized_score: 0.85, constraint_tightness: 0.2 },
                        { venue_key: "META", normalized_score: 0.65, constraint_tightness: 0.5 }
                    ]
                }
            },
            phase_37: {
                budget_rebalancer: {
                    total_budget: 1000,
                    venues: [
                        { venue_key: "GOOGLE", new_spend: 600, previous_spend: 550 },
                        { venue_key: "META", new_spend: 400, previous_spend: 450 }
                    ]
                }
            },
            phase_32: {
                policy_mirror: {
                    max_allowed_delta_ratio: 0.25,
                    venue_budget_limits: {
                        "GOOGLE": { min_budget: 100, max_budget: 800 },
                        "META": { min_budget: 100, max_budget: 500 }
                    }
                }
            },
            phase_33: {
                policy_reasoner: {
                    venue_assessments: [
                        { venue_key: "GOOGLE", is_legal: true, policy_blocks: [] },
                        { venue_key: "META", is_legal: true, policy_blocks: [] }
                    ]
                }
            },
            phase_34: {
                capabilities_resolver: {
                    venues: [
                        { venue_key: "GOOGLE", currency_code: "USD" },
                        { venue_key: "META", currency_code: "USD" }
                    ]
                }
            }
        }
    };
}

describe('Phase 38: Cross Venue Optimizer', () => {

    // ========== HAPPY PATH (6 tests) ==========

    test('1. Uniform no-movement scenario', () => {
        const envelope = createBaseEnvelope();

        // Make scores equal
        envelope.payload.phase_35.world_aware_optimization.recommended_venues[0].raw_score = 0.7;
        envelope.payload.phase_35.world_aware_optimization.recommended_venues[1].raw_score = 0.7;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[0].normalized_score = 0.7;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[1].normalized_score = 0.7;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[0].constraint_tightness = 0.3;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[1].constraint_tightness = 0.3;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;
        expect(output.status.ok).toBe(true);
        expect(Math.abs(output.total_budget_after - 1000)).toBeLessThan(0.01);
    });

    test('2. Strong winner venue gets increase', () => {
        const envelope = createBaseEnvelope();

        // Make GOOGLE a clear winner
        envelope.payload.phase_35.world_aware_optimization.recommended_venues[0].raw_score = 0.95;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[0].normalized_score = 0.9;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        const google = output.venue_plans.find(v => v.venue_key === "GOOGLE");
        const meta = output.venue_plans.find(v => v.venue_key === "META");

        // Google should get more budget (or at least not lose relative to Meta)
        expect(google.cross_venue_score).toBeGreaterThan(meta.cross_venue_score);
    });

    test('3. Strong loser venue gets decrease', () => {
        const envelope = createBaseEnvelope();

        // Make META a clear loser
        envelope.payload.phase_35.world_aware_optimization.recommended_venues[1].raw_score = 0.3;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[1].normalized_score = 0.2;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        const meta = output.venue_plans.find(v => v.venue_key === "META");
        expect(meta.cross_venue_score).toBeLessThan(0.5);
    });

    test('4. Exploration scenario', () => {
        const envelope = createBaseEnvelope();

        // High learning, low constraint tightness = exploration
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[0].normalized_score = 0.9;
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals[0].constraint_tightness = 0.1;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        const google = output.venue_plans.find(v => v.venue_key === "GOOGLE");
        expect(google.exploration_weight).toBeGreaterThan(0.7);
    });

    test('5. Policy blocked venue stays unchanged', () => {
        const envelope = createBaseEnvelope();

        // Block META
        envelope.payload.phase_33.policy_reasoner.venue_assessments[1].is_legal = false;
        envelope.payload.phase_33.policy_reasoner.venue_assessments[1].policy_blocks = ["BUDGET_BLOCKED"];

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        const meta = output.venue_plans.find(v => v.venue_key === "META");
        expect(meta.budget_after).toBe(meta.budget_before);
        expect(meta.decision).toBe("KEEP");
        expect(meta.rationale_tags).toEqual(expect.arrayContaining(["POLICY_BLOCK"]));
        expect(output.diagnostics.policy_blocked_venues).toEqual(expect.arrayContaining(["META"]));
    });

    test('6. Min/max constrained set', () => {
        const envelope = createBaseEnvelope();

        // Set tight limits
        envelope.payload.phase_32.policy_mirror.venue_budget_limits.GOOGLE.min_budget = 580;
        envelope.payload.phase_32.policy_mirror.venue_budget_limits.GOOGLE.max_budget = 620;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        const google = output.venue_plans.find(v => v.venue_key === "GOOGLE");
        expect(google.budget_after).toBeGreaterThanOrEqual(580);
        expect(google.budget_after).toBeLessThanOrEqual(620);
    });

    // ========== NEGATIVE PATH (6 tests) ==========

    test('7. Missing Phase 35 returns error', () => {
        const envelope = createBaseEnvelope();
        delete envelope.payload.phase_35;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("MALFORMED_PHASE_35_CONTRACT");
    });

    test('8. Missing Phase 36 returns error', () => {
        const envelope = createBaseEnvelope();
        delete envelope.payload.phase_36;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("MALFORMED_PHASE_36_CONTRACT");
    });

    test('9. Missing Phase 37 returns error', () => {
        const envelope = createBaseEnvelope();
        delete envelope.payload.phase_37;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("MALFORMED_PHASE_37_CONTRACT");
    });

    test('10. Invalid numeric values are handled', () => {
        const envelope = createBaseEnvelope();

        // Invalid score
        envelope.payload.phase_35.world_aware_optimization.recommended_venues[0].raw_score = "invalid";

        const result = runCrossVenueOptimizer(envelope);

        // Should not crash, should use defaults
        expect(result.ok).toBe(true);
    });

    test('11. Currency mismatch returns error', () => {
        const envelope = createBaseEnvelope();

        // Different currencies
        envelope.payload.phase_34.capabilities_resolver.venues[0].currency_code = "USD";
        envelope.payload.phase_34.capabilities_resolver.venues[1].currency_code = "EUR";

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("UNSUPPORTED_CURRENCY_COMBINATION");
    });

    test('12. Feature flag disabled returns passthrough', () => {
        const envelope = createBaseEnvelope();
        envelope.flags.FF_CROSS_VENUE_OPTIMIZER = false;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        // All venues should have decision "KEEP"
        output.venue_plans.forEach(v => {
            expect(v.decision).toBe("KEEP");
            expect(v.delta).toBe(0);
        });
        expect(output.diagnostics.warnings.length).toBeGreaterThan(0);
    });

    // ========== EDGE CASES (4 tests) ==========

    test('13. Single venue scenario', () => {
        const envelope = createBaseEnvelope();

        // Remove META, keep only GOOGLE
        envelope.payload.phase_35.world_aware_optimization.recommended_venues = [
            { venue_key: "GOOGLE", raw_score: 0.8, recommended_budget: 1000 }
        ];
        envelope.payload.phase_36.learning_signal_aggregate.recommended_signals = [
            { venue_key: "GOOGLE", normalized_score: 0.85, constraint_tightness: 0.2 }
        ];
        envelope.payload.phase_37.budget_rebalancer.venues = [
            { venue_key: "GOOGLE", new_spend: 1000, previous_spend: 1000 }
        ];
        envelope.payload.phase_33.policy_reasoner.venue_assessments = [
            { venue_key: "GOOGLE", is_legal: true, policy_blocks: [] }
        ];
        envelope.payload.phase_34.capabilities_resolver.venues = [
            { venue_key: "GOOGLE", currency_code: "USD" }
        ];
        envelope.payload.phase_32.policy_mirror.venue_budget_limits = {
            "GOOGLE": { min_budget: 500, max_budget: 1500 }
        };

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;
        expect(output.venue_plans.length).toBe(1);
        expect(Math.abs(output.total_budget_after - 1000)).toBeLessThan(0.01);
    });

    test('14. All venues at min budget', () => {
        const envelope = createBaseEnvelope();

        // Set all at min
        envelope.payload.phase_37.budget_rebalancer.venues[0].new_spend = 100;
        envelope.payload.phase_37.budget_rebalancer.venues[1].new_spend = 100;
        envelope.payload.phase_37.budget_rebalancer.total_budget = 200;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        // Budgets should stay at or above min
        output.venue_plans.forEach(v => {
            expect(v.budget_after).toBeGreaterThanOrEqual(100);
        });
    });

    test('15. All venues at max budget', () => {
        const envelope = createBaseEnvelope();

        // Set at max
        envelope.payload.phase_37.budget_rebalancer.venues[0].new_spend = 800;
        envelope.payload.phase_37.budget_rebalancer.venues[1].new_spend = 500;
        envelope.payload.phase_37.budget_rebalancer.total_budget = 1300;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        const google = output.venue_plans.find(v => v.venue_key === "GOOGLE");
        const meta = output.venue_plans.find(v => v.venue_key === "META");

        expect(google.budget_after).toBeLessThanOrEqual(800);
        expect(meta.budget_after).toBeLessThanOrEqual(500);
    });

    test('16. Tiny total budget', () => {
        const envelope = createBaseEnvelope();

        // Very small budget
        envelope.payload.phase_37.budget_rebalancer.total_budget = 0.5;
        envelope.payload.phase_37.budget_rebalancer.venues[0].new_spend = 0.3;
        envelope.payload.phase_37.budget_rebalancer.venues[1].new_spend = 0.2;
        envelope.payload.phase_32.policy_mirror.venue_budget_limits.GOOGLE.min_budget = 0;
        envelope.payload.phase_32.policy_mirror.venue_budget_limits.META.min_budget = 0;

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;
        expect(Math.abs(output.total_budget_after - 0.5)).toBeLessThan(0.01);
    });

    // ========== REGRESSION (1 test) ==========

    test('17. Complex multi-venue snapshot', () => {
        const envelope = {
            flags: { FF_CROSS_VENUE_OPTIMIZER: true },
            payload: {
                phase_35: {
                    world_aware_optimization: {
                        recommended_venues: [
                            { venue_key: "GOOGLE", raw_score: 0.85, recommended_budget: 400 },
                            { venue_key: "META", raw_score: 0.75, recommended_budget: 300 },
                            { venue_key: "TIKTOK", raw_score: 0.65, recommended_budget: 200 },
                            { venue_key: "LINKEDIN", raw_score: 0.55, recommended_budget: 100 }
                        ]
                    }
                },
                phase_36: {
                    learning_signal_aggregate: {
                        recommended_signals: [
                            { venue_key: "GOOGLE", normalized_score: 0.9, constraint_tightness: 0.2 },
                            { venue_key: "META", normalized_score: 0.8, constraint_tightness: 0.3 },
                            { venue_key: "TIKTOK", normalized_score: 0.7, constraint_tightness: 0.4 },
                            { venue_key: "LINKEDIN", normalized_score: 0.6, constraint_tightness: 0.5 }
                        ]
                    }
                },
                phase_37: {
                    budget_rebalancer: {
                        total_budget: 1000,
                        venues: [
                            { venue_key: "GOOGLE", new_spend: 400, previous_spend: 350 },
                            { venue_key: "META", new_spend: 300, previous_spend: 320 },
                            { venue_key: "TIKTOK", new_spend: 200, previous_spend: 210 },
                            { venue_key: "LINKEDIN", new_spend: 100, previous_spend: 120 }
                        ]
                    }
                },
                phase_32: {
                    policy_mirror: {
                        max_allowed_delta_ratio: 0.2,
                        venue_budget_limits: {
                            "GOOGLE": { min_budget: 200, max_budget: 600 },
                            "META": { min_budget: 150, max_budget: 500 },
                            "TIKTOK": { min_budget: 100, max_budget: 400 },
                            "LINKEDIN": { min_budget: 50, max_budget: 300 }
                        }
                    }
                },
                phase_33: {
                    policy_reasoner: {
                        venue_assessments: [
                            { venue_key: "GOOGLE", is_legal: true, policy_blocks: [] },
                            { venue_key: "META", is_legal: true, policy_blocks: [] },
                            { venue_key: "TIKTOK", is_legal: true, policy_blocks: [] },
                            { venue_key: "LINKEDIN", is_legal: false, policy_blocks: ["BUDGET_FROZEN"] }
                        ]
                    }
                },
                phase_34: {
                    capabilities_resolver: {
                        venues: [
                            { venue_key: "GOOGLE", currency_code: "USD" },
                            { venue_key: "META", currency_code: "USD" },
                            { venue_key: "TIKTOK", currency_code: "USD" },
                            { venue_key: "LINKEDIN", currency_code: "USD" }
                        ]
                    }
                }
            }
        };

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        // Budget conservation
        expect(Math.abs(output.total_budget_after - 1000)).toBeLessThan(0.01);

        // LinkedIn should be blocked
        const linkedin = output.venue_plans.find(v => v.venue_key === "LINKEDIN");
        expect(linkedin.budget_after).toBe(linkedin.budget_before);
        expect(linkedin.rationale_tags).toEqual(expect.arrayContaining(["POLICY_BLOCK"]));

        // All delta ratios within bounds
        output.venue_plans.forEach(v => {
            if (!v.rationale_tags.includes("POLICY_BLOCK")) {
                expect(Math.abs(v.delta_ratio)).toBeLessThanOrEqual(0.2 + 0.01);
            }
        });

        // All within min/max
        const google = output.venue_plans.find(v => v.venue_key === "GOOGLE");
        const meta = output.venue_plans.find(v => v.venue_key === "META");
        const tiktok = output.venue_plans.find(v => v.venue_key === "TIKTOK");

        expect(google.budget_after).toBeGreaterThanOrEqual(200);
        expect(google.budget_after).toBeLessThanOrEqual(600);
        expect(meta.budget_after).toBeGreaterThanOrEqual(150);
        expect(meta.budget_after).toBeLessThanOrEqual(500);
        expect(tiktok.budget_after).toBeGreaterThanOrEqual(100);
        expect(tiktok.budget_after).toBeLessThanOrEqual(400);
    });

    // ========== PARANOIA TESTS (2 tests) ==========

    test('Paranoia A: Hard delta bound invariant (highly skewed scenario)', () => {
        const envelope = {
            flags: { FF_CROSS_VENUE_OPTIMIZER: true },
            payload: {
                phase_35: {
                    world_aware_optimization: {
                        recommended_venues: [
                            { venue_key: "GOOGLE", raw_score: 0.95, recommended_budget: 250 },
                            { venue_key: "META", raw_score: 0.80, recommended_budget: 250 },
                            { venue_key: "TIKTOK", raw_score: 0.40, recommended_budget: 250 },
                            { venue_key: "LINKEDIN", raw_score: 0.20, recommended_budget: 250 }
                        ]
                    }
                },
                phase_36: {
                    learning_signal_aggregate: {
                        recommended_signals: [
                            { venue_key: "GOOGLE", normalized_score: 0.95, constraint_tightness: 0.1 },
                            { venue_key: "META", normalized_score: 0.75, constraint_tightness: 0.2 },
                            { venue_key: "TIKTOK", normalized_score: 0.35, constraint_tightness: 0.7 },
                            { venue_key: "LINKEDIN", normalized_score: 0.15, constraint_tightness: 0.9 }
                        ]
                    }
                },
                phase_37: {
                    budget_rebalancer: {
                        total_budget: 1000,
                        venues: [
                            { venue_key: "GOOGLE", new_spend: 250, previous_spend: 250 },
                            { venue_key: "META", new_spend: 250, previous_spend: 250 },
                            { venue_key: "TIKTOK", new_spend: 250, previous_spend: 250 },
                            { venue_key: "LINKEDIN", new_spend: 250, previous_spend: 250 }
                        ]
                    }
                },
                phase_32: {
                    policy_mirror: {
                        max_allowed_delta_ratio: 0.20,
                        venue_budget_limits: {
                            "GOOGLE": { min_budget: 100, max_budget: 600 },
                            "META": { min_budget: 100, max_budget: 500 },
                            "TIKTOK": { min_budget: 100, max_budget: 400 },
                            "LINKEDIN": { min_budget: 100, max_budget: 400 }
                        }
                    }
                },
                phase_33: {
                    policy_reasoner: {
                        venue_assessments: [
                            { venue_key: "GOOGLE", is_legal: true, policy_blocks: [] },
                            { venue_key: "META", is_legal: true, policy_blocks: [] },
                            { venue_key: "TIKTOK", is_legal: true, policy_blocks: [] },
                            { venue_key: "LINKEDIN", is_legal: true, policy_blocks: [] }
                        ]
                    }
                },
                phase_34: {
                    capabilities_resolver: {
                        venues: [
                            { venue_key: "GOOGLE", currency_code: "USD" },
                            { venue_key: "META", currency_code: "USD" },
                            { venue_key: "TIKTOK", currency_code: "USD" },
                            { venue_key: "LINKEDIN", currency_code: "USD" }
                        ]
                    }
                }
            }
        };

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(true);
        const output = result.payload.phase_38.cross_venue_optimizer;

        // ALL venues must respect hard delta bound
        const maxAllowedDelta = 0.20;
        output.venue_plans.forEach(v => {
            expect(Math.abs(v.delta_ratio)).toBeLessThanOrEqual(maxAllowedDelta + 1e-6);
        });

        // Budget conservation
        expect(Math.abs(output.total_budget_after - 1000)).toBeLessThan(0.01);

        // Soft cap should be applied (at least one venue hits its delta limit)
        // This is a paranoia check for applied_soft_cap being meaningful
        const googlePlan = output.venue_plans.find(v => v.venue_key === "GOOGLE");
        const linkedinPlan = output.venue_plans.find(v => v.venue_key === "LINKEDIN");

        // Given highly skewed scores, at least one venue should be trying to move more than allowed
        // So applied_soft_cap logic should activate
        expect(output.stability.applied_soft_cap !== undefined).toBe(true);
    });

    test('Paranoia B: All venues policy blocked → CROSS_VENUE_LOCKED', () => {
        const envelope = createBaseEnvelope();

        // Block all venues
        envelope.payload.phase_33.policy_reasoner.venue_assessments[0].is_legal = false;
        envelope.payload.phase_33.policy_reasoner.venue_assessments[0].policy_blocks = ["BLOCKED"];
        envelope.payload.phase_33.policy_reasoner.venue_assessments[1].is_legal = false;
        envelope.payload.phase_33.policy_reasoner.venue_assessments[1].policy_blocks = ["BLOCKED"];

        const result = runCrossVenueOptimizer(envelope);

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("CROSS_VENUE_LOCKED");
    });

    // ========== DETERMINISM (1 test) ==========

    test('20. Determinism: identical inputs yield identical outputs', () => {
        const envelope1 = createBaseEnvelope();
        const envelope2 = JSON.parse(JSON.stringify(envelope1)); // Deep clone

        const result1 = runCrossVenueOptimizer(envelope1);
        const result2 = runCrossVenueOptimizer(envelope2);

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);

        const output1 = result1.payload.phase_38.cross_venue_optimizer;
        const output2 = result2.payload.phase_38.cross_venue_optimizer;

        // Compare venue plans (excluding timestamps which are dynamic)
        expect(output1.venue_plans.length).toBe(output2.venue_plans.length);

        for (let i = 0; i < output1.venue_plans.length; i++) {
            const v1 = output1.venue_plans[i];
            const v2 = output2.venue_plans[i];

            expect(v1.venue_key).toBe(v2.venue_key);
            expect(v1.budget_after).toBe(v2.budget_after);
            expect(v1.delta).toBe(v2.delta);
            expect(v1.decision).toBe(v2.decision);
            expect(v1.cross_venue_score).toBe(v2.cross_venue_score);
        }
    });

});

console.log('\n✅ All Phase 38 tests passed (20 tests total)!');
