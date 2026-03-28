/**
 * Phase 40: Optimization Loop Dispatcher Engine - Test Suite
 * 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const { createRealRoundFn } = require('../optimizer_dispatcher_engine');
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
        toBeDefined: () => assert.notStrictEqual(actual, undefined)
    };
}

// ... mock factories ...

// ... describe block ...

// Helper to run tests sequentially
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

// Mock factories
function createMockPhase(name, behavior = 'success') {
    return async (envelope) => {
        if (behavior === 'fail') {
            return { ok: false, error: { message: `${name} failed` } };
        }
        if (behavior === 'throw') {
            throw new Error(`${name} threw`);
        }
        if (behavior === 'missing_envelope') {
            return { ok: true }; // Missing envelope/payload
        }

        // Success: return new envelope (simulated)
        // In real engine, we wrap this to { ok: true, envelope: result }
        // So here we return the "result" which IS the envelope.
        const newEnvelope = JSON.parse(JSON.stringify(envelope));

        // Simulate phase-specific updates
        if (name === 'Phase35') {
            newEnvelope.payload = { analysis: { world_aware_optimization_v1: { recommended_venues: [] } } };
        } else if (name === 'Phase38') {
            newEnvelope.payload = {
                analysis: {
                    cross_venue_optimization_v1: {
                        recommended_venues: [
                            { venue_key: "A", allocated_budget: 100, score: 0.8, constraint_tightness: 0.1 },
                            { venue_key: "B", allocated_budget: 200, score: 0.6, constraint_tightness: 0.2 }
                        ]
                    }
                }
            };
        }

        return { ok: true, envelope: newEnvelope }; // Mocking the WRAPPED dependency contract
    };
}

// Helper to create context
function createContext() {
    return {
        execution_id: "exec-123",
        round_index: 0,
        envelope: {
            payload: {},
            meta: {}
        }
    };
}

describe('Phase 40: Optimization Loop Dispatcher Engine', () => {

    // ========== HAPPY PATH (6 tests) ==========

    runTest('1. Correct sequencing', async () => {
        const callOrder = [];
        const deps = {
            optimizeWorldAwareVenues: async (env) => { callOrder.push(35); return { ok: true, envelope: env }; },
            aggregateLearningSignals: async (env) => { callOrder.push(36); return { ok: true, envelope: env }; },
            runBudgetRebalancer: async (env) => { callOrder.push(37); return { ok: true, envelope: env }; },
            runCrossVenueOptimizer: async (env) => {
                callOrder.push(38);
                const newEnv = JSON.parse(JSON.stringify(env));
                newEnv.payload = { analysis: { cross_venue_optimization_v1: { recommended_venues: [] } } };
                return { ok: true, envelope: newEnv };
            }
        };

        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());

        expect(result.ok).toBe(true);
        expect(callOrder).toEqual([35, 36, 37, 38]);
    });

    runTest('2. Envelope replacement', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => {
                const newEnv = { ...env, step: 35 };
                return { ok: true, envelope: newEnv };
            },
            aggregateLearningSignals: async (env) => {
                expect(env.step).toBe(35);
                const newEnv = { ...env, step: 36 };
                return { ok: true, envelope: newEnv };
            },
            runBudgetRebalancer: async (env) => {
                expect(env.step).toBe(36);
                const newEnv = { ...env, step: 37 };
                return { ok: true, envelope: newEnv };
            },
            runCrossVenueOptimizer: async (env) => {
                expect(env.step).toBe(37);
                const newEnv = { ...env, step: 38, payload: { analysis: { cross_venue_optimization_v1: { recommended_venues: [] } } } };
                return { ok: true, envelope: newEnv };
            }
        };

        const roundFn = createRealRoundFn({}, deps);
        await roundFn(createContext());
    });

    runTest('3. Learning signals flow-through', async () => {
        // Verify Phase 36 output reaches Phase 37
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => {
                const newEnv = { ...env, signals: "valid" };
                return { ok: true, envelope: newEnv };
            },
            runBudgetRebalancer: async (env) => {
                expect(env.signals).toBe("valid");
                return { ok: true, envelope: env };
            },
            runCrossVenueOptimizer: async (env) => {
                const newEnv = { ...env, payload: { analysis: { cross_venue_optimization_v1: { recommended_venues: [] } } } };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        await roundFn(createContext());
    });

    runTest('4. Min/max preservation', async () => {
        // Verify Phase 38 output structure
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "A", allocated_budget: 100, score: 0.9, constraint_tightness: 0.5 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.venues[0].constraint_tightness).toBe(0.5);
    });

    runTest('5. Blocked venues', async () => {
        // Verify blocked venues are handled (passed through)
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "BLOCKED", allocated_budget: 0, score: 0, constraint_tightness: 1 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.venues[0].venue_key).toBe("BLOCKED");
        expect(result.venues[0].new_budget).toBe(0);
    });

    runTest('6. Score continuity', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "A", allocated_budget: 100, score: 0.12345, constraint_tightness: 0 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.venues[0].cross_venue_score).toBe(0.12345);
    });

    // ========== NEGATIVE PATH (6 tests) ==========

    runTest('7. Phase 35 failure', async () => {
        const deps = {
            optimizeWorldAwareVenues: async () => ({ ok: false, error: { message: "35 failed" } }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => ({ ok: true, envelope: env })
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PHASE_35_FAILED");
    });

    runTest('8. Phase 36 failure', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async () => ({ ok: false, error: { message: "36 failed" } }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => ({ ok: true, envelope: env })
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PHASE_36_FAILED");
    });

    runTest('9. Phase 37 failure', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async () => ({ ok: false, error: { message: "37 failed" } }),
            runCrossVenueOptimizer: async (env) => ({ ok: true, envelope: env })
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PHASE_37_FAILED");
    });

    runTest('10. Phase 38 failure', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async () => ({ ok: false, error: { message: "38 failed" } })
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PHASE_38_FAILED");
    });

    runTest('11. Missing envelope in result', async () => {
        const deps = {
            optimizeWorldAwareVenues: async () => ({ ok: true }), // Missing envelope
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => ({ ok: true, envelope: env })
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PHASE_35_FAILED");
    });

    runTest('12. Malformed venue data', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = { ...env, payload: { analysis: { cross_venue_optimization_v1: { recommended_venues: "not-array" } } } };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PHASE_38_FAILED");
    });

    // ========== EDGE CASES (4 tests) ==========

    runTest('13. Zero budget', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "A", allocated_budget: 0, score: 0, constraint_tightness: 0 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(true);
        expect(result.venues[0].new_budget).toBe(0);
    });

    runTest('14. Single venue', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "SINGLE", allocated_budget: 100, score: 1, constraint_tightness: 0 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(true);
        expect(result.venues.length).toBe(1);
    });

    runTest('15. All venues blocked', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "A", allocated_budget: 0, score: 0, constraint_tightness: 1 },
                                    { venue_key: "B", allocated_budget: 0, score: 0, constraint_tightness: 1 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(true);
        expect(result.venues.every(v => v.new_budget === 0)).toBe(true);
    });

    runTest('16. Min==Max everywhere', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "LOCKED", allocated_budget: 500, score: 0.5, constraint_tightness: 1 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(true);
        expect(result.venues[0].new_budget).toBe(500);
    });

    // ========== REGRESSION (1 test) ==========

    runTest('17. Oscillatory inputs', async () => {
        // Simulate inputs that might cause oscillation in Phase 39, but Phase 40 just processes them
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "OSC", allocated_budget: 100, score: 0.5, constraint_tightness: 0 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const result = await roundFn(createContext());
        expect(result.ok).toBe(true);
    });

    // ========== DETERMINISM (1 test) ==========

    runTest('18. Identical context -> Identical result', async () => {
        const deps = {
            optimizeWorldAwareVenues: async (env) => ({ ok: true, envelope: env }),
            aggregateLearningSignals: async (env) => ({ ok: true, envelope: env }),
            runBudgetRebalancer: async (env) => ({ ok: true, envelope: env }),
            runCrossVenueOptimizer: async (env) => {
                const newEnv = {
                    ...env, payload: {
                        analysis: {
                            cross_venue_optimization_v1: {
                                recommended_venues: [
                                    { venue_key: "A", allocated_budget: 100, score: 0.8, constraint_tightness: 0.1 }
                                ]
                            }
                        }
                    }
                };
                return { ok: true, envelope: newEnv };
            }
        };
        const roundFn = createRealRoundFn({}, deps);
        const ctx1 = createContext();
        const ctx2 = createContext();

        const res1 = await roundFn(ctx1);
        const res2 = await roundFn(ctx2);

        expect(JSON.stringify(res1)).toBe(JSON.stringify(res2));
    });

});

// Tests will run automatically via the async block defined at the top
// Helper to run tests sequentially
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
