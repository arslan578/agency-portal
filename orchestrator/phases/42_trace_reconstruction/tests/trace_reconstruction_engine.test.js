/**
 * Phase 42: Optimization Trace Reconstruction Engine - Test Suite
 * 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const { reconstructTrace } = require('../trace_reconstruction_engine');
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

describe('Phase 42: Optimization Trace Reconstruction Engine', () => {

    // ========== HAPPY PATH (6 tests) ==========

    runTest('1. Single round, single venue', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-123',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            {
                                venue_key: 'A',
                                budget_before: 100,
                                budget_after: 110
                            }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds.length).toBe(1);
        expect(result.reconstruction.rounds[0].round_index).toBe(0);
        expect(result.reconstruction.rounds[0].deltas.length).toBe(1);
        expect(result.reconstruction.rounds[0].deltas[0].venue_key).toBe('A');
        expect(result.reconstruction.rounds[0].deltas[0].delta).toBe(10);
        expect(result.reconstruction.rounds[0].deltas[0].sign).toBe('POS');
        expect(result.reconstruction.rounds[0].global_delta).toBe(10);
    });

    runTest('2. Multi-round, multi-venue', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-456',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 110 },
                            { venue_key: 'B', budget_before: 200, budget_after: 190 }
                        ]
                    },
                    {
                        round_index: 1,
                        venue_states: [
                            { venue_key: 'A', budget_before: 110, budget_after: 115 },
                            { venue_key: 'B', budget_before: 190, budget_after: 185 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds.length).toBe(2);
        expect(result.reconstruction.rounds[0].deltas[0].delta).toBe(10);
        expect(result.reconstruction.rounds[0].deltas[1].delta).toBe(-10);
        expect(result.reconstruction.rounds[0].global_delta).toBe(20);
        expect(result.reconstruction.rounds[1].deltas[0].delta).toBe(5);
        expect(result.reconstruction.rounds[1].deltas[1].delta).toBe(-5);
    });

    runTest('3. All positive deltas', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-pos',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 120 },
                            { venue_key: 'B', budget_before: 200, budget_after: 230 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds[0].deltas[0].sign).toBe('POS');
        expect(result.reconstruction.rounds[0].deltas[1].sign).toBe('POS');
    });

    runTest('4. All negative deltas', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-neg',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 80 },
                            { venue_key: 'B', budget_before: 200, budget_after: 170 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds[0].deltas[0].sign).toBe('NEG');
        expect(result.reconstruction.rounds[0].deltas[1].sign).toBe('NEG');
    });

    runTest('5. Mixed deltas', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-mixed',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 120 },
                            { venue_key: 'B', budget_before: 200, budget_after: 180 },
                            { venue_key: 'C', budget_before: 300, budget_after: 300 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds[0].deltas[0].sign).toBe('POS');
        expect(result.reconstruction.rounds[0].deltas[1].sign).toBe('NEG');
        expect(result.reconstruction.rounds[0].deltas[2].sign).toBe('ZERO');
    });

    runTest('6. Stable ordering across rounds and venues', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-order',
            trace: {
                rounds: [
                    {
                        round_index: 2,
                        venue_states: [
                            { venue_key: 'C', budget_before: 300, budget_after: 310 },
                            { venue_key: 'A', budget_before: 100, budget_after: 105 }
                        ]
                    },
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'B', budget_before: 200, budget_after: 210 },
                            { venue_key: 'A', budget_before: 100, budget_after: 110 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        // Rounds should be sorted by round_index
        expect(result.reconstruction.rounds[0].round_index).toBe(0);
        expect(result.reconstruction.rounds[1].round_index).toBe(2);
        // Venues should be sorted lexicographically within each round
        expect(result.reconstruction.rounds[0].deltas[0].venue_key).toBe('A');
        expect(result.reconstruction.rounds[0].deltas[1].venue_key).toBe('B');
        expect(result.reconstruction.rounds[1].deltas[0].venue_key).toBe('A');
        expect(result.reconstruction.rounds[1].deltas[1].venue_key).toBe('C');
    });

    // ========== NEGATIVE PATH (6 tests) ==========

    runTest('7. Missing round_index', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-bad',
            trace: {
                rounds: [
                    {
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 110 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(false);
        expect(result.diagnostics.error).toBe('INVALID_ROUND_INDEX');
    });

    runTest('8. Duplicate round_index', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-dup',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [{ venue_key: 'A', budget_before: 100, budget_after: 110 }]
                    },
                    {
                        round_index: 0,
                        venue_states: [{ venue_key: 'B', budget_before: 200, budget_after: 210 }]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(false);
        expect(result.diagnostics.error).toBe('DUPLICATE_ROUND_INDEX');
    });

    runTest('9. Non-number budgets', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-nan',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 'not-a-number', budget_after: 110 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(false);
        expect(result.diagnostics.error).toBe('INVALID_BUDGET_BEFORE');
    });

    runTest('10. Negative budgets', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-neg-budget',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: -100, budget_after: 110 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(false);
        expect(result.diagnostics.error).toBe('INVALID_BUDGET_BEFORE');
    });

    runTest('11. Missing venue_key', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-no-key',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { budget_before: 100, budget_after: 110 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(false);
        expect(result.diagnostics.error).toBe('INVALID_VENUE_KEY');
    });

    runTest('12. Inconsistent venue lists across rounds', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        // This should still succeed - no requirement for consistency
        const input = {
            execution_id: 'exec-inconsistent',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 110 }
                        ]
                    },
                    {
                        round_index: 1,
                        venue_states: [
                            { venue_key: 'B', budget_before: 200, budget_after: 210 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds.length).toBe(2);
    });

    // ========== EDGE CASES (4 tests) ==========

    runTest('13. Empty rounds array', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-empty',
            trace: {
                rounds: []
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds).toEqual([]);
        expect(result.diagnostics.empty_trace).toBe(true);
    });

    runTest('14. Zero deltas everywhere', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-zeros',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'A', budget_before: 100, budget_after: 100 },
                            { venue_key: 'B', budget_before: 200, budget_after: 200 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds[0].deltas[0].delta).toBe(0);
        expect(result.reconstruction.rounds[0].deltas[0].sign).toBe('ZERO');
        expect(result.reconstruction.rounds[0].deltas[1].delta).toBe(0);
        expect(result.reconstruction.rounds[0].deltas[1].sign).toBe('ZERO');
        expect(result.reconstruction.rounds[0].global_delta).toBe(0);
    });

    runTest('15. One venue only', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-single',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'ONLY', budget_before: 500, budget_after: 550 }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds[0].deltas.length).toBe(1);
        expect(result.reconstruction.rounds[0].global_delta).toBe(50);
    });

    runTest('16. High precision floats', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-float',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: [
                            {
                                venue_key: 'A',
                                budget_before: 100.123456789,
                                budget_after: 100.987654321
                            }
                        ]
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(true);
        expect(result.reconstruction.rounds[0].deltas[0].delta).toBe(100.987654321 - 100.123456789);
    });

    // ========== REGRESSION (1 test) ==========

    runTest('17. Previously malformed snapshot', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        // Simulate a malformed snapshot that previously caused issues
        const input = {
            execution_id: 'exec-regression',
            trace: {
                rounds: [
                    {
                        round_index: 0,
                        venue_states: null // This was previously allowed incorrectly
                    }
                ]
            }
        };

        const result = reconstructTrace(input);

        expect(result.ok).toBe(false);
        expect(result.diagnostics.error).toBe('INVALID_VENUE_STATES');
    });

    // ========== DETERMINISM (1 test) ==========

    runTest('18. Identical inputs → identical outputs', () => {
        process.env.FF_OPTIMIZATION_TRACE_RECON_V1 = 'true';

        const input = {
            execution_id: 'exec-determinism',
            trace: {
                rounds: [
                    {
                        round_index: 1,
                        venue_states: [
                            { venue_key: 'B', budget_before: 200, budget_after: 210 },
                            { venue_key: 'A', budget_before: 100, budget_after: 115 }
                        ]
                    },
                    {
                        round_index: 0,
                        venue_states: [
                            { venue_key: 'C', budget_before: 300, budget_after: 290 }
                        ]
                    }
                ]
            }
        };

        const result1 = reconstructTrace(input);
        const result2 = reconstructTrace(input);

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
