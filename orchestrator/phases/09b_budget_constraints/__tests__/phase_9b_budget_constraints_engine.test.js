/**
 * Phase 9B: Budget Constraints Engine - Test Suite
 * 
 * Comprehensive test suite (18 tests total):
 * - 6 happy path
 * - 6 negative path
 * - 4 edge cases
 * - 1 regression guard
 * - 1 determinism guard
 */

const { evaluateBudgetConstraints, ERROR_CODES, _internal } = require('../phase_9b_budget_constraints_engine');

// Test utilities
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// Test counters
let total_tests = 0;
let passed_tests = 0;

async function runAsyncTest(name, fn) {
    total_tests++;
    try {
        await fn();
        passed_tests++;
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
    }
}

// ==================== HAPPY PATH TESTS (6) ====================

async function testValidSingleVenueBudget() {
    const input = {
        execution_id: 'exec_001',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 5000,  // $50
        venues: ['google'],
        objective_normalization: {
            normalized_objectives: { reach: 0.3, conversions: 0.6, frequency: 0.2, value: 0.3 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.OK, 'Status should be OK');
    assert(result.payload.feasibility.global_minimum > 0, 'Should have global minimum');
    assert(result.payload.feasibility.per_venue_minimums.google > 0, 'Should have Google minimum');
    assert(result.payload.recommended_plan !== null, 'Should have recommended plan');
}

async function testValidMultiVenueBudget() {
    const input = {
        execution_id: 'exec_002',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 20000,  // $200
        venues: ['google', 'meta', 'tiktok'],
        objective_normalization: {
            normalized_objectives: { reach: 0.5, conversions: 0.5, frequency: 0.4, value: 0.4 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.OK, 'Status should be OK');
    assert(Object.keys(result.payload.feasibility.per_venue_minimums).length === 3, 'Should have 3 venue minimums');
    assert(result.payload.constraint_reasons.length === 0, 'Should have no constraint reasons for OK status');
}

async function testBudgetMeetsGlobalMinimum() {
    const input = {
        execution_id: 'exec_003',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 10000,  // $100 (exactly MIN_GLOBAL)
        venues: ['meta'],
        objective_normalization: {
            normalized_objectives: { reach: 0.2, conversions: 0.3, frequency: 0.1, value: 0.1 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.OK, 'Status should be OK');
    assert(result.payload.feasibility.global_minimum <= 10000, 'Global minimum should be <= budget');
}

async function testBudgetMeetsVenueMinimums() {
    const input = {
        execution_id: 'exec_004',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 15000,  // $150
        venues: ['google', 'reddit'],
        objective_normalization: {
            normalized_objectives: { reach: 0.4, conversions: 0.4, frequency: 0.3, value: 0.2 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.OK, 'Status should be OK');
    assert(input.total_budget >= result.payload.feasibility.global_minimum, 'Budget meets global minimum');
}

async function testObjectiveDrivenFeasibilityReachHeavy() {
    const input = {
        execution_id: 'exec_005',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 25000,  // $250
        venues: ['google', 'meta', 'tiktok'],
        objective_normalization: {
            normalized_objectives: { reach: 0.9, conversions: 0.2, frequency: 0.6, value: 0.3 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.OK, 'Status should be OK');
    // High reach should enforce higher minimums
    assert(result.payload.feasibility.global_minimum >= 10000, 'High reach enforces minimum');
}

async function testObjectiveDrivenFeasibilityConversionHeavy() {
    const input = {
        execution_id: 'exec_006',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 18000,  // $180
        venues: ['google', 'meta'],
        objective_normalization: {
            normalized_objectives: { reach: 0.3, conversions: 0.9, frequency: 0.2, value: 0.7 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.OK, 'Status should be OK');
    // High conversions should enforce CPA floor
    assert(result.payload.feasibility.global_minimum >= 10000, 'High conversions enforces minimum');
}

// ==================== NEGATIVE PATH TESTS (6) ====================

async function testBudgetBelowGlobalMinimum() {
    const input = {
        execution_id: 'exec_007',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 500,  // $5 (well below MIN_GLOBAL)
        venues: ['google'],
        objective_normalization: {
            normalized_objectives: { reach: 0.4, conversions: 0.4, frequency: 0.3, value: 0.2 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET, 'Status should be UNSUPPORTED_BUDGET');
    assert(result.payload.constraint_reasons.length > 0, 'Should have constraint reasons');
    assert(result.payload.constraint_reasons.some(r => r.includes('below global minimum')), 'Should mention global minimum');
}

async function testBudgetBelowVenueMinimum() {
    const input = {
        execution_id: 'exec_008',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 3000,  // $30 (below TikTok minimum of $50)
        venues: ['tiktok'],
        objective_normalization: {
            normalized_objectives: { reach: 0.4, conversions: 0.3, frequency: 0.2, value: 0.1 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    // With strict precedence (Global > Venue), this is now UNSUPPORTED_BUDGET because 3000 < 5000 (Global Min)
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET, 'Status should be UNSUPPORTED_BUDGET');
    assert(result.payload.constraint_reasons.some(r => r.includes('Tiktok')), 'Should mention TikTok constraint');
}

async function testBudgetViolatesPolicyCap() {
    const input = {
        execution_id: 'exec_009',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 200000000,  // $2M (above default max)
        venues: ['google'],
        objective_normalization: {
            normalized_objectives: { reach: 0.5, conversions: 0.5, frequency: 0.4, value: 0.3 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const context = {
        policy_rules: {
            max_budget: 100000000  // $1M cap
        }
    };

    const result = await evaluateBudgetConstraints(input, context);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET, 'Status should be UNSUPPORTED_BUDGET');
    assert(result.payload.constraint_reasons.some(r => r.includes('exceeds global maximum')), 'Should mention maximum exceeded');
}

async function testCreativeComplianceBlocksVenue() {
    const input = {
        execution_id: 'exec_010',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 15000,  // $150
        venues: ['google', 'meta'],
        objective_normalization: {
            normalized_objectives: { reach: 0.5, conversions: 0.5, frequency: 0.3, value: 0.2 }
        },
        creative_compliance: {
            overall_status: 'WARN',
            platform_findings: {
                google: { status: 'PASS', reasons: [] },
                meta: { status: 'FAIL', reasons: ['Creative violates Meta policy'] }
            }
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.POLICY_BLOCK, 'Status should be POLICY_BLOCK');
    assert(result.payload.constraint_reasons.some(r => r.includes('Meta blocked')), 'Should mention Meta blocked');
}

async function testObjectiveConflictWithSpend() {
    const input = {
        execution_id: 'exec_011',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 8000,  // $80 (insufficient for high reach)
        venues: ['google'],
        objective_normalization: {
            normalized_objectives: { reach: 0.95, conversions: 0.1, frequency: 0.7, value: 0.2 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET || result.payload.status === ERROR_CODES.CONSTRAINTS_VIOLATION, 'Status should indicate budget issue');
}

async function testMissingRequiredFields() {
    const input = {
        execution_id: 'exec_012',
        tenant_id: 'tenant_1'
        // Missing brand_id, total_budget, venues, etc.
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === false, 'Should return ok: false');
    assert(result.error.code === ERROR_CODES.INVALID_INPUT, 'Should have INVALID_INPUT error');
}

// ==================== EDGE CASE TESTS (4) ====================

async function testZeroBudgetRequest() {
    const input = {
        execution_id: 'exec_013',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 0,
        venues: ['google'],
        objective_normalization: {
            normalized_objectives: { reach: 0.3, conversions: 0.3, frequency: 0.2, value: 0.1 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET, 'Status should be UNSUPPORTED_BUDGET');
    assert(result.payload.constraint_reasons.some(r => r.includes('below global minimum')), 'Should mention minimum violation');
}

async function testExtremelyLargeBudget() {
    const input = {
        execution_id: 'exec_014',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 500000000,  // $5M
        venues: ['google', 'meta'],
        objective_normalization: {
            normalized_objectives: { reach: 0.6, conversions: 0.5, frequency: 0.4, value: 0.5 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const context = {
        policy_rules: {
            max_budget: 100000000  // $1M tenant max
        }
    };

    const result = await evaluateBudgetConstraints(input, context);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET, 'Status should be UNSUPPORTED_BUDGET');
    assert(result.payload.constraint_reasons.some(r => r.includes('exceeds')), 'Should mention exceeding maximum');
}

async function testOneVenueFeasibleOthersNot() {
    const input = {
        execution_id: 'exec_015',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 12000,  // $120
        venues: ['google', 'meta', 'tiktok'],
        objective_normalization: {
            normalized_objectives: { reach: 0.4, conversions: 0.4, frequency: 0.3, value: 0.2 }
        },
        creative_compliance: {
            overall_status: 'WARN',
            platform_findings: {
                google: { status: 'PASS', reasons: [] },
                meta: { status: 'FAIL', reasons: ['Creative blocked'] },
                tiktok: { status: 'FAIL', reasons: ['Creative blocked'] }
            }
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.POLICY_BLOCK, 'Status should be POLICY_BLOCK');
    assert(result.payload.constraint_reasons.length >= 2, 'Should have multiple blocked venues');
}

async function testAllVenuesBlockedByPolicy() {
    const input = {
        execution_id: 'exec_016',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 15000,  // $150
        venues: ['google', 'meta', 'tiktok'],
        objective_normalization: {
            normalized_objectives: { reach: 0.5, conversions: 0.5, frequency: 0.4, value: 0.3 }
        },
        creative_compliance: {
            overall_status: 'FAIL',
            platform_findings: {
                google: { status: 'FAIL', reasons: ['Blocked'] },
                meta: { status: 'FAIL', reasons: ['Blocked'] },
                tiktok: { status: 'FAIL', reasons: ['Blocked'] }
            }
        }
    };

    const result = await evaluateBudgetConstraints(input);

    assert(result.ok === true, 'Should return ok: true (but with error status)');
    assert(result.payload.status === ERROR_CODES.POLICY_BLOCK, 'Status should be POLICY_BLOCK');

    // Should contain blocked messages for all 3 venues
    const blockedMessages = result.payload.constraint_reasons.filter(r => r.includes('blocked by creative compliance'));
    assert(blockedMessages.length === 3, 'Should have 3 blocked venue messages');
}

// ==================== REGRESSION GUARD TEST (1) ====================

async function testConstraintReasoningStability() {
    const input = {
        execution_id: 'exec_regression',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 1000,  // $10 (below minimum)
        venues: ['google', 'meta'],
        objective_normalization: {
            normalized_objectives: { reach: 0.9, conversions: 0.2, frequency: 0.5, value: 0.2 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    const result = await evaluateBudgetConstraints(input);

    // Verify constraint reasoning format is stable
    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.status === ERROR_CODES.UNSUPPORTED_BUDGET, 'Status should be UNSUPPORTED_BUDGET');
    assert(Array.isArray(result.payload.constraint_reasons), 'Constraint reasons should be array');
    assert(result.payload.constraint_reasons.every(r => typeof r === 'string'), 'All reasons should be strings');

    // Check reasons are sorted
    const sorted = [...result.payload.constraint_reasons].sort();
    assert(deepEqual(result.payload.constraint_reasons, sorted), 'Constraint reasons should be sorted');
}

// ==================== DETERMINISM GUARD TEST (1) ====================

async function testDeterminismGuard() {
    const input = {
        execution_id: 'exec_determinism',
        tenant_id: 'tenant_1',
        brand_id: 'brand_1',
        total_budget: 15000,  // $150
        venues: ['google', 'meta', 'tiktok'],
        objective_normalization: {
            normalized_objectives: { reach: 0.7, conversions: 0.6, frequency: 0.5, value: 0.4 }
        },
        creative_compliance: {
            overall_status: 'PASS',
            platform_findings: {}
        }
    };

    // Run twice
    const result1 = await evaluateBudgetConstraints(input);
    const result2 = await evaluateBudgetConstraints(input);

    // Verify identical outputs
    assert(deepEqual(result1.payload, result2.payload), 'Two runs should produce identical output');
    assert(result1.payload.status === result2.payload.status, 'Status should be identical');
    assert(deepEqual(result1.payload.feasibility, result2.payload.feasibility), 'Feasibility should be identical');
    assert(deepEqual(result1.payload.constraint_reasons, result2.payload.constraint_reasons), 'Constraint reasons should be identical');
}

// ==================== RUN ALL TESTS ====================

async function runAllTests() {
    console.log('\n=== Phase 9B: Budget Constraints Engine - Test Suite ===\n');

    // Enable feature flag for all tests
    const originalFlagValue = process.env.FF_BUDGET_CONSTRAINTS_ENGINE;
    process.env.FF_BUDGET_CONSTRAINTS_ENGINE = 'true';

    console.log('--- Happy Path Tests (6) ---');
    await runAsyncTest('1. Valid single-venue budget', testValidSingleVenueBudget);
    await runAsyncTest('2. Valid multi-venue budget', testValidMultiVenueBudget);
    await runAsyncTest('3. Budget meets global minimum', testBudgetMeetsGlobalMinimum);
    await runAsyncTest('4. Budget meets venue minimums', testBudgetMeetsVenueMinimums);
    await runAsyncTest('5. Objective-driven feasibility (reach-heavy)', testObjectiveDrivenFeasibilityReachHeavy);
    await runAsyncTest('6. Objective-driven feasibility (conversion-heavy)', testObjectiveDrivenFeasibilityConversionHeavy);

    console.log('\n--- Negative Path Tests (6) ---');
    await runAsyncTest('7. Budget below global minimum', testBudgetBelowGlobalMinimum);
    await runAsyncTest('8. Budget below venue minimum', testBudgetBelowVenueMinimum);
    await runAsyncTest('9. Budget violates policy cap', testBudgetViolatesPolicyCap);
    await runAsyncTest('10. Creative compliance blocks venue', testCreativeComplianceBlocksVenue);
    await runAsyncTest('11. Objective conflict with spend', testObjectiveConflictWithSpend);
    await runAsyncTest('12. Missing required fields', testMissingRequiredFields);

    console.log('\n--- Edge Case Tests (4) ---');
    await runAsyncTest('13. Zero-budget request', testZeroBudgetRequest);
    await runAsyncTest('14. Extremely large budget', testExtremelyLargeBudget);
    await runAsyncTest('15. One venue feasible, others not', testOneVenueFeasibleOthersNot);
    await runAsyncTest('16. All venues blocked by policy', testAllVenuesBlockedByPolicy);

    console.log('\n--- Regression Guard Test (1) ---');
    await runAsyncTest('17. Constraint reasoning stability', testConstraintReasoningStability);

    console.log('\n--- Determinism Guard Test (1) ---');
    await runAsyncTest('18. Determinism guard', testDeterminismGuard);

    console.log(`\n=== Test Results: ${passed_tests}/${total_tests} passed ===\n`);

    // Restore original flag value
    if (originalFlagValue !== undefined) {
        process.env.FF_BUDGET_CONSTRAINTS_ENGINE = originalFlagValue;
    } else {
        delete process.env.FF_BUDGET_CONSTRAINTS_ENGINE;
    }

    if (passed_tests !== total_tests) {
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests };
