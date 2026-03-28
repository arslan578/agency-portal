/**
 * Phase 6B: Creative Compliance Engine - Test Suite
 * 
 * Comprehensive test suite (18 tests):
 * - 6 happy path
 * - 6 negative path
 * - 4 edge cases
 * - 1 regression guard
 * - 1 determinism guard
 */

const { evaluateCreativeCompliance } = require('../creative_compliance_engine');

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

function runTest(name, fn) {
    total_tests++;
    try {
        fn();
        passed_tests++;
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
    }
}

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

async function testSimplePass() {
    const input = {
        execution_id: 'exec_001',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Great Deal',
                body_text: 'Limited time offer'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google', 'meta']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.execution_id === 'exec_001', 'Should preserve execution_id');
    assert(result.payload.overall_status === 'PASS', 'Overall status should be PASS');
    assert(result.payload.creatives.cr1.status === 'PASS', 'Creative should PASS');
    assert(result.payload.metrics.total_creatives === 1, 'Should count 1 creative');
    assert(result.payload.metrics.pass_count === 1, 'Should have 1 PASS');
}

async function testSingleWarn() {
    const input = {
        execution_id: 'exec_002',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Great Deal',
                body_text: 'A'.repeat(150) // Exceeds Meta's 125 char limit
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google', 'meta']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'WARN', 'Overall status should be WARN');
    assert(result.payload.creatives.cr1.status === 'WARN', 'Creative should WARN');
    assert(result.payload.creatives.cr1.platform_findings.meta.status === 'WARN', 'Meta should WARN');
    assert(result.payload.metrics.warn_count === 1, 'Should have 1 WARN');
}

async function testSingleFail() {
    const input = {
        execution_id: 'exec_003',
        creatives: {
            cr1: {
                creative_type: 'INVALID_TYPE',
                language: 'en',
                headline: 'Great Deal'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'FAIL', 'Overall status should be FAIL');
    assert(result.payload.creatives.cr1.status === 'FAIL', 'Creative should FAIL');
    assert(result.payload.metrics.fail_count === 1, 'Should have 1 FAIL');
}

async function testMixedCreatives() {
    const input = {
        execution_id: 'exec_004',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Good',
                body_text: 'Short'
            },
            cr2: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Good',
                body_text: 'A'.repeat(150) // WARN for Meta
            },
            cr3: {
                creative_type: 'INVALID_TYPE',
                language: 'en',
                headline: 'Bad'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['meta']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'FAIL', 'Overall status should be FAIL (worst)');
    assert(result.payload.metrics.total_creatives === 3, 'Should have 3 creatives');
    assert(result.payload.metrics.pass_count === 1, 'Should have 1 PASS');
    assert(result.payload.metrics.warn_count === 1, 'Should have 1 WARN');
    assert(result.payload.metrics.fail_count === 1, 'Should have 1 FAIL');
}

async function testDeterministicOrdering() {
    const input = {
        execution_id: 'exec_005',
        creatives: {
            cr3: { creative_type: 'TEXT', language: 'en', headline: 'C' },
            cr1: { creative_type: 'TEXT', language: 'en', headline: 'A' },
            cr2: { creative_type: 'TEXT', language: 'en', headline: 'B' }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['tiktok', 'google', 'meta'] // Unsorted
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');

    // Verify creative IDs are processed in sorted order
    const creative_keys = Object.keys(result.payload.creatives);
    assert(deepEqual(creative_keys, ['cr1', 'cr2', 'cr3']), 'Creative IDs should be sorted');

    // Verify platform findings are sorted
    for (const creative_result of Object.values(result.payload.creatives)) {
        const platform_keys = Object.keys(creative_result.platform_findings);
        assert(deepEqual(platform_keys, ['google', 'meta', 'tiktok']), 'Platform keys should be sorted');
    }
}

async function testFeatureFlagOff() {
    // Save original value
    const originalValue = process.env.FF_CREATIVE_COMPLIANCE_EVAL;

    // Turn off feature flag
    process.env.FF_CREATIVE_COMPLIANCE_EVAL = 'false';

    const input = {
        execution_id: 'exec_006',
        creatives: {
            cr1: { creative_type: 'TEXT', language: 'en', headline: 'Test' }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'PASS', 'Should return PASS when disabled');
    assert(result.payload.metrics.total_creatives === 0, 'Should have 0 creatives');
    assert(deepEqual(result.payload.creatives, {}), 'Should have empty creatives object');

    // Restore original value
    if (originalValue !== undefined) {
        process.env.FF_CREATIVE_COMPLIANCE_EVAL = originalValue;
    } else {
        delete process.env.FF_CREATIVE_COMPLIANCE_EVAL;
    }
}

// ==================== NEGATIVE PATH TESTS (6) ====================

async function testMissingExecutionId() {
    const input = {
        creatives: {
            cr1: { creative_type: 'TEXT', language: 'en', headline: 'Test' }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === false, 'Should return ok: false');
    assert(result.error.code === 'INVALID_INPUT', 'Should have INVALID_INPUT error');
    assert(result.error.message.includes('execution_id'), 'Error should mention execution_id');
}

async function testMissingCreatives() {
    const input = {
        execution_id: 'exec_007',
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === false, 'Should return ok: false');
    assert(result.error.code === 'INVALID_INPUT', 'Should have INVALID_INPUT error');
    assert(result.error.message.includes('creatives'), 'Error should mention creatives');
}

async function testUnsupportedCreativeType() {
    const input = {
        execution_id: 'exec_008',
        creatives: {
            cr1: {
                creative_type: 'HOLOGRAM',
                language: 'en',
                headline: 'Future!'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true (structured error)');
    assert(result.payload.overall_status === 'FAIL', 'Overall status should be FAIL');
    assert(result.payload.creatives.cr1.status === 'FAIL', 'Creative should FAIL');
    assert(result.payload.creatives.cr1.reasons.some(r => r.includes('Unsupported')), 'Should have unsupported reason');
}

async function testCreativeMissingRequiredFields() {
    const input = {
        execution_id: 'exec_009',
        creatives: {
            cr1: {
                headline: 'Missing type and language'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === false, 'Should return ok: false');
    assert(result.error.code === 'INVALID_INPUT', 'Should have INVALID_INPUT error');
    assert(result.error.message.includes('required fields'), 'Error should mention required fields');
}

async function testPolicyMirrorFailure() {
    const input = {
        execution_id: 'exec_pm_fail',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Test'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const failingResolver = async () => {
        throw new Error('Policy service unavailable');
    };

    const result = await evaluateCreativeCompliance(input, {
        policyResolver: failingResolver
    });

    assert(result.ok === false, 'Should return ok: false');
    assert(result.error.code === 'KNOWLEDGE_RESOLUTION_FAILURE', 'Should use KNOWLEDGE_RESOLUTION_FAILURE');
    assert(result.error.message.includes('Policy service unavailable'), 'Error message should bubble underlying failure');
}

async function testComplianceInferenceFailure() {
    const input = {
        execution_id: 'exec_ci_fail',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Test'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    // Resolver that always returns a simple policy
    const resolver = async () => ({
        max_headline_length: 30,
        max_description_length: 90,
        max_body_text_length: 5000,
        allowed_languages: ['en']
    });

    // Inference engine that fails
    const failingInference = async () => {
        throw new Error('Inference engine down');
    };

    const result = await evaluateCreativeCompliance(input, {
        policyResolver: resolver,
        inferenceEngine: failingInference
    });

    // Inference failure is treated as part of the evaluation failure
    assert(result.ok === false, 'Should return ok: false');
    // The error manifests as KNOWLEDGE_RESOLUTION_FAILURE (caught in platform loop)
    const validCodes = ['CREATIVE_UNSCANNABLE', 'KNOWLEDGE_RESOLUTION_FAILURE'];
    assert(validCodes.includes(result.error.code), `Should use valid error code, got: ${result.error.code}`);
}

// ==================== EDGE CASE TESTS (4) ====================

async function testEmptyTextWithVideoType() {
    const input = {
        execution_id: 'exec_010',
        creatives: {
            cr1: {
                creative_type: 'VIDEO',
                language: 'en',
                media_url: 'https://example.com/video.mp4',
                duration_ms: 30000
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['youtube']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'PASS', 'Video without text should PASS');
}

async function testInvalidLanguageCode() {
    const input = {
        execution_id: 'exec_011',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'xx', // Invalid/unsupported language
                headline: 'Test'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'WARN', 'Invalid language should WARN');
    assert(result.payload.creatives.cr1.platform_findings.google.status === 'WARN', 'Google should WARN for invalid language');
}

async function testSinglePlatformConfigured() {
    const input = {
        execution_id: 'exec_012',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Single platform'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['reddit'] // Only one platform
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'PASS', 'Should PASS with single platform');
    assert(Object.keys(result.payload.creatives.cr1.platform_findings).length === 1, 'Should have 1 platform finding');
}

async function testExtremelyLongText() {
    const input = {
        execution_id: 'exec_013',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'A'.repeat(1000), // Very long headline
                body_text: 'B'.repeat(10000) // Very long body
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google', 'meta', 'tiktok']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'WARN', 'Extremely long text should WARN');
    assert(result.payload.creatives.cr1.reasons.length > 0, 'Should have reasons for violations');
}

// ==================== REGRESSION GUARD TEST (1) ====================

async function testWarnNotEscalatedToFail() {
    // Regression: Ensure WARN does not escalate to FAIL
    const input = {
        execution_id: 'exec_014',
        creatives: {
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'A'.repeat(50), // WARN for Meta (>40 chars)
                body_text: 'Short'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['meta']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === true, 'Should return ok: true');
    assert(result.payload.overall_status === 'WARN', 'Overall status should be WARN, not FAIL');
    assert(result.payload.creatives.cr1.status === 'WARN', 'Creative status should be WARN');
    assert(result.payload.metrics.warn_count === 1, 'Should count as WARN');
    assert(result.payload.metrics.fail_count === 0, 'Should not count as FAIL');
}

async function testStrictModePolicyViolation() {
    const originalStrict = process.env.FF_STRICT_CREATIVE_COMPLIANCE;
    process.env.FF_STRICT_CREATIVE_COMPLIANCE = 'true';

    const input = {
        execution_id: 'exec_strict',
        creatives: {
            cr1: {
                creative_type: 'INVALID_TYPE',
                language: 'en',
                headline: 'Bad'
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['google']
        }
    };

    const result = await evaluateCreativeCompliance(input);

    assert(result.ok === false, 'Should return ok: false in strict mode with FAIL');
    assert(result.error.code === 'POLICY_VIOLATION', 'Should set POLICY_VIOLATION code');
    assert(result.error.fatal === true, 'Should mark fatal true');
    assert(result.payload.overall_status === 'FAIL', 'Payload should still carry FAIL report');

    if (originalStrict !== undefined) {
        process.env.FF_STRICT_CREATIVE_COMPLIANCE = originalStrict;
    } else {
        delete process.env.FF_STRICT_CREATIVE_COMPLIANCE;
    }
}

// ==================== DETERMINISM GUARD TEST (1) ====================

async function testDeterminismGuard() {
    const input = {
        execution_id: 'exec_015',
        creatives: {
            cr2: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Test 2',
                body_text: 'B'.repeat(100)
            },
            cr1: {
                creative_type: 'TEXT',
                language: 'en',
                headline: 'Test 1',
                body_text: 'A'.repeat(100)
            },
            cr3: {
                creative_type: 'VIDEO',
                language: 'en',
                media_url: 'test.mp4',
                duration_ms: 45000
            }
        },
        policy_context: {
            tenant_id: 'tenant_1',
            workspace_id: 'workspace_1',
            locale: 'en-US',
            platforms: ['meta', 'google', 'tiktok'] // Unsorted platforms
        }
    };

    // Run evaluation twice
    const result1 = await evaluateCreativeCompliance(input);
    const result2 = await evaluateCreativeCompliance(input);

    assert(result1.ok === true, 'First run should succeed');
    assert(result2.ok === true, 'Second run should succeed');
    assert(deepEqual(result1.payload, result2.payload), 'Results should be identical');

    // Verify creative order independence
    const reordered_input = {
        ...input,
        creatives: {
            cr3: input.creatives.cr3,
            cr1: input.creatives.cr1,
            cr2: input.creatives.cr2
        }
    };

    const result3 = await evaluateCreativeCompliance(reordered_input);
    assert(deepEqual(result1.payload, result3.payload), 'Results should be identical regardless of input order');
}

// ==================== RUN ALL TESTS ====================

async function runAllTests() {
    console.log('\n=== Phase 6B: Creative Compliance Engine - Test Suite ===\n');

    // Enable feature flag for all tests (except the one that explicitly turns it off)
    const originalFlagValue = process.env.FF_CREATIVE_COMPLIANCE_EVAL;
    process.env.FF_CREATIVE_COMPLIANCE_EVAL = 'true';

    console.log('--- Happy Path Tests (6) ---');
    await runAsyncTest('1. Simple PASS - single creative, all platforms', testSimplePass);
    await runAsyncTest('2. Single WARN - one platform warning', testSingleWarn);
    await runAsyncTest('3. Single FAIL - one platform failure', testSingleFail);
    await runAsyncTest('4. Mixed creatives - PASS + WARN + FAIL', testMixedCreatives);
    await runAsyncTest('5. Deterministic ordering', testDeterministicOrdering);
    await runAsyncTest('6. Feature flag OFF', testFeatureFlagOff);

    console.log('\n--- Negative Path Tests (6) ---');
    await runAsyncTest('7. Missing execution_id', testMissingExecutionId);
    await runAsyncTest('8. Missing creatives', testMissingCreatives);
    await runAsyncTest('9. Unsupported creative_type', testUnsupportedCreativeType);
    await runAsyncTest('10. Creative missing required fields', testCreativeMissingRequiredFields);
    await runAsyncTest('11. Policy Mirror failure', testPolicyMirrorFailure);
    await runAsyncTest('12. Compliance inference failure', testComplianceInferenceFailure);

    console.log('\n--- Edge Case Tests (4) ---');
    await runAsyncTest('13. Empty text with VIDEO type', testEmptyTextWithVideoType);
    await runAsyncTest('14. Invalid language code', testInvalidLanguageCode);
    await runAsyncTest('15. Single platform configured', testSinglePlatformConfigured);
    await runAsyncTest('16. Extremely long text', testExtremelyLongText);

    console.log('\n--- Regression Guard Tests (2) ---');
    await runAsyncTest('17. WARN not escalated to FAIL', testWarnNotEscalatedToFail);
    await runAsyncTest('18. Strict mode POLICY_VIOLATION', testStrictModePolicyViolation);

    console.log('\n--- Determinism Guard Test (1) ---');
    await runAsyncTest('19. Determinism guard', testDeterminismGuard);

    console.log(`\n=== Test Results: ${passed_tests}/${total_tests} passed ===\n`);

    // Restore original flag value
    if (originalFlagValue !== undefined) {
        process.env.FF_CREATIVE_COMPLIANCE_EVAL = originalFlagValue;
    } else {
        delete process.env.FF_CREATIVE_COMPLIANCE_EVAL;
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
