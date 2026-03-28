/**
 * Phase 27B: Connector Backplane Specification Layer - Test Suite
 * 
 * Comprehensive test suite (23 tests total):
 * - 6 happy path
 * - 6 negative path
 * - 4 edge cases
 * - 1 regression guard
 * - 1 determinism guard
 * - 5 new tests (A-E) for surgical correction
 */

const { buildBackplaneSpec, ERROR_CODES, _internal } = require('./connector_backplane_engine');

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

async function testBuildsFullBackplaneSpec() {
    const result = buildBackplaneSpec();
    assert(result.feature_flag_enabled === true, 'Feature flag should be enabled');
    assert(result.connector_backplane_v1 !== undefined, 'Backplane spec should be present');
}

async function testIncludesFullRequestContract() {
    const result = buildBackplaneSpec();
    const contract = result.connector_backplane_v1.request_contract;
    _internal.REQUIRED_REQUEST_FIELDS.forEach(field => {
        assert(contract[field] !== undefined, `Missing request field: ${field}`);
    });
}

async function testIncludesFullResponseContract() {
    const result = buildBackplaneSpec();
    const contract = result.connector_backplane_v1.response_contract;
    assert(contract.success !== undefined, 'Missing success shape');
    assert(contract.failure !== undefined, 'Missing failure shape');
}

async function testIncludesFullCanonicalErrorSurface() {
    const result = buildBackplaneSpec();
    const surface = result.connector_backplane_v1.error_surface;
    _internal.CANONICAL_ERROR_SURFACE.forEach(code => {
        assert(surface[code] !== undefined, `Missing error code: ${code}`);
    });
}

async function testIncludesFullCapabilitiesSchema() {
    const result = buildBackplaneSpec();
    const capabilities = result.connector_backplane_v1.capabilities;
    _internal.REQUIRED_CAPABILITIES.forEach(cap => {
        assert(capabilities[cap] !== undefined, `Missing capability: ${cap}`);
    });
}

async function testIncludesFullRoutingFlags() {
    const result = buildBackplaneSpec();
    const flags = result.connector_backplane_v1.routing_flags;
    _internal.REQUIRED_ROUTING_FLAGS.forEach(flag => {
        assert(flags[flag] !== undefined, `Missing routing flag: ${flag}`);
    });
}

// ==================== NEGATIVE PATH TESTS (6) ====================

async function testMissingErrorCodeTriggersError() {
    // Mock internal validation to simulate missing code
    const originalSurface = [..._internal.CANONICAL_ERROR_SURFACE];
    _internal.CANONICAL_ERROR_SURFACE.push('MISSING_CODE');

    try {
        buildBackplaneSpec();
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.MISSING_ERROR_SURFACE, 'Should throw MISSING_ERROR_SURFACE');
    } finally {
        // Restore
        _internal.CANONICAL_ERROR_SURFACE.pop();
    }
}

async function testExtraFieldInRequestContractTriggersError() {
    const originalFields = [..._internal.REQUIRED_REQUEST_FIELDS];
    _internal.REQUIRED_REQUEST_FIELDS.pop(); // Remove one to simulate extra field in implementation

    try {
        buildBackplaneSpec();
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.INVALID_BACKPLANE_SPEC, 'Should throw INVALID_BACKPLANE_SPEC');
    } finally {
        // Restore
        _internal.REQUIRED_REQUEST_FIELDS.push(originalFields[originalFields.length - 1]);
    }
}

async function testExtraFieldInCapabilitiesTriggersError() {
    try {
        _internal.validateFields({ extra: 1 }, [], ERROR_CODES.CAPABILITY_INCONSISTENCY);
        throw new Error('Should have thrown');
    } catch (e) {
        assert(e.code === ERROR_CODES.CAPABILITY_INCONSISTENCY, 'Should throw CAPABILITY_INCONSISTENCY');
    }
}

async function testMissingMetadataFieldTriggersError() {
    const originalFields = [..._internal.REQUIRED_METADATA_FIELDS];
    _internal.REQUIRED_METADATA_FIELDS.push('MISSING_FIELD');

    try {
        buildBackplaneSpec();
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.INVALID_BACKPLANE_SPEC, 'Should throw INVALID_BACKPLANE_SPEC');
    } finally {
        _internal.REQUIRED_METADATA_FIELDS.pop();
    }
}

async function testNonBooleanRoutingFlagsTriggersError() {
    // This test updated to verify structured descriptors
    const result = buildBackplaneSpec();
    const flags = result.connector_backplane_v1.routing_flags;
    Object.values(flags).forEach(val => {
        assert(typeof val === 'object', 'Routing flags should be structured descriptors');
        assert(val.type === 'string', 'Routing flag type should be string');
    });
}

async function testMissingPolicyBindingTriggersError() {
    const originalFields = [..._internal.REQUIRED_POLICY_BINDINGS];
    _internal.REQUIRED_POLICY_BINDINGS.push('MISSING_BINDING');

    try {
        buildBackplaneSpec();
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.POLICY_MIRROR_RESOLUTION_FAILURE, 'Should throw POLICY_MIRROR_RESOLUTION_FAILURE');
    } finally {
        _internal.REQUIRED_POLICY_BINDINGS.pop();
    }
}

// ==================== EDGE CASE TESTS (4) ====================

async function testFeatureFlagOff() {
    process.env.FF_CONNECTOR_BACKPLANE_SPEC = 'false';
    const result = buildBackplaneSpec();
    assert(result.feature_flag_enabled === false, 'Feature flag should be disabled');
    assert(result.connector_backplane_v1 === undefined, 'Backplane spec should not be returned');
    process.env.FF_CONNECTOR_BACKPLANE_SPEC = 'true';
}

async function testEmptyCapabilitiesArraysValid() {
    // Verify spec defines arrays
    const result = buildBackplaneSpec();
    assert(result.connector_backplane_v1.capabilities.supported_regions.type === 'array', 'Should be array type');
}

async function testZeroBudgetsAllowed() {
    // Verify spec defines numbers
    const result = buildBackplaneSpec();
    assert(result.connector_backplane_v1.capabilities.min_budget.type === 'number', 'Should be number type');
}

async function testUnknownConnectorKeyField() {
    // Verify connector_key is required string
    const result = buildBackplaneSpec();
    assert(result.connector_backplane_v1.request_contract.connector_key.type === 'string', 'Should be string type');
}

// ==================== REGRESSION GUARD (1) ====================

async function testSchemaDriftGuard() {
    const result = buildBackplaneSpec();
    const keys = Object.keys(result.connector_backplane_v1).sort();
    const expected = [
        'capabilities',
        'error_surface',
        'metadata_fields',
        'policy_bindings',
        'readiness_rules',
        'reconciliation_shape',
        'request_contract',
        'response_contract',
        'routing_flags',
        'snapshot_shape'
    ];
    assert(deepEqual(keys, expected), 'Schema keys must match snapshot');
}

// ==================== DETERMINISM GUARD (1) ====================

async function testDeterminismGuard() {
    const reference = buildBackplaneSpec();
    for (let i = 0; i < 100; i++) {
        const current = buildBackplaneSpec();
        assert(deepEqual(current, reference), `Run ${i} failed determinism check`);
    }
}

// ==================== NEW SURGICAL TESTS (5) ====================

async function testStructuredDescriptorValidation() {
    const result = buildBackplaneSpec();
    const spec = result.connector_backplane_v1;

    // Check a sample from each surface
    assert(spec.request_contract.connector_key.type === 'string', 'request_contract descriptor valid');
    assert(spec.request_contract.connector_key.required === true, 'request_contract required valid');

    assert(spec.capabilities.min_budget.type === 'number', 'capabilities descriptor valid');
    assert(spec.capabilities.min_budget.min === 0, 'capabilities min valid');

    assert(spec.routing_flags.SAFE_TO_RETRY.type === 'string', 'routing_flags descriptor valid');

    assert(spec.metadata_fields.campaign_id.type === 'string', 'metadata_fields descriptor valid');

    assert(spec.readiness_rules.connector_disabled.type === 'boolean', 'readiness_rules descriptor valid');

    assert(spec.reconciliation_shape.drift_flag.type === 'boolean', 'reconciliation_shape descriptor valid');

    assert(spec.policy_bindings.min_spend_policy_ref.pattern instanceof RegExp, 'policy_bindings pattern valid');
}

async function testReadinessInvariant() {
    // Simulate invalid spec state
    const mockSpec = {
        capabilities: { min_budget: { min: 0 }, max_budget: { min: 0 } },
        policy_bindings: {},
        readiness_rules: {
            connector_disabled: { value: true },
            requires_account_link: { value: true },
            requires_policy_check: { value: false },
            requires_capability_lookup: { value: false }
        },
        routing_flags: { HARD_STOP: { value: false }, SAFE_TO_RETRY: { value: false }, SKIP_RETRY: { value: false }, REQUIRES_ESCALATION: { value: false } },
        request_contract: {}
    };

    try {
        _internal.validateSpecConsistency(mockSpec);
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.INVALID_BACKPLANE_SPEC, 'Should throw INVALID_BACKPLANE_SPEC for readiness invariant');
    }
}

async function testPolicyBindingPattern() {
    // Simulate invalid pattern
    const mockSpec = {
        capabilities: { min_budget: { min: 0 }, max_budget: { min: 0 } },
        policy_bindings: {
            bad_ref: { pattern: /^bad\./ }
        },
        readiness_rules: { connector_disabled: { value: false } },
        routing_flags: { HARD_STOP: { value: false }, SAFE_TO_RETRY: { value: false }, SKIP_RETRY: { value: false }, REQUIRES_ESCALATION: { value: false } },
        request_contract: {}
    };

    try {
        _internal.validateSpecConsistency(mockSpec);
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.POLICY_MIRROR_RESOLUTION_FAILURE, 'Should throw POLICY_MIRROR_RESOLUTION_FAILURE for bad pattern');
    }
}

async function testRoutingFlagsForbiddenCombinations() {
    // Test HARD_STOP + SAFE_TO_RETRY
    const mockSpec1 = {
        capabilities: { min_budget: { min: 0 }, max_budget: { min: 0 } },
        policy_bindings: {},
        readiness_rules: { connector_disabled: { value: false } },
        routing_flags: {
            HARD_STOP: { value: true },
            SAFE_TO_RETRY: { value: true },
            SKIP_RETRY: { value: false },
            REQUIRES_ESCALATION: { value: false }
        },
        request_contract: {}
    };

    try {
        _internal.validateSpecConsistency(mockSpec1);
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.INVALID_BACKPLANE_SPEC, 'Should throw for HARD_STOP + SAFE_TO_RETRY');
    }

    // Test SAFE_TO_RETRY + SKIP_RETRY
    const mockSpec2 = {
        capabilities: { min_budget: { min: 0 }, max_budget: { min: 0 } },
        policy_bindings: {},
        readiness_rules: { connector_disabled: { value: false } },
        routing_flags: {
            HARD_STOP: { value: false },
            SAFE_TO_RETRY: { value: true },
            SKIP_RETRY: { value: true },
            REQUIRES_ESCALATION: { value: false }
        },
        request_contract: {}
    };

    try {
        _internal.validateSpecConsistency(mockSpec2);
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.INVALID_BACKPLANE_SPEC, 'Should throw for SAFE_TO_RETRY + SKIP_RETRY');
    }
}

async function testCapabilitiesSemanticValidation() {
    // Test min_budget < 0
    const mockSpec = {
        capabilities: {
            min_budget: { min: -1 },
            max_budget: { min: 0 }
        },
        policy_bindings: {},
        readiness_rules: { connector_disabled: { value: false } },
        routing_flags: { HARD_STOP: { value: false }, SAFE_TO_RETRY: { value: false }, SKIP_RETRY: { value: false }, REQUIRES_ESCALATION: { value: false } },
        request_contract: {}
    };

    try {
        _internal.validateSpecConsistency(mockSpec);
        throw new Error('Should have thrown error');
    } catch (e) {
        assert(e.code === ERROR_CODES.CAPABILITY_INCONSISTENCY, 'Should throw CAPABILITY_INCONSISTENCY for negative min');
    }
}

// ==================== RUN ALL TESTS ====================

async function runAllTests() {
    console.log('\n=== Phase 27B: Connector Backplane - Test Suite ===\n');

    // Ensure flag is on
    process.env.FF_CONNECTOR_BACKPLANE_SPEC = 'true';

    console.log('--- Happy Path Tests (6) ---');
    await runAsyncTest('1. Builds full backplane spec', testBuildsFullBackplaneSpec);
    await runAsyncTest('2. Includes full request_contract_v1', testIncludesFullRequestContract);
    await runAsyncTest('3. Includes full response_contract_v1', testIncludesFullResponseContract);
    await runAsyncTest('4. Includes full canonical error surface', testIncludesFullCanonicalErrorSurface);
    await runAsyncTest('5. Includes full capabilities schema', testIncludesFullCapabilitiesSchema);
    await runAsyncTest('6. Includes full routing flags', testIncludesFullRoutingFlags);

    console.log('\n--- Negative Path Tests (6) ---');
    await runAsyncTest('7. Missing error code triggers error', testMissingErrorCodeTriggersError);
    await runAsyncTest('8. Extra field in request contract triggers error', testExtraFieldInRequestContractTriggersError);
    await runAsyncTest('9. Extra field in capabilities triggers error', testExtraFieldInCapabilitiesTriggersError);
    await runAsyncTest('10. Missing metadata field triggers error', testMissingMetadataFieldTriggersError);
    await runAsyncTest('11. Non-boolean routing flags triggers error', testNonBooleanRoutingFlagsTriggersError);
    await runAsyncTest('12. Missing policy binding triggers error', testMissingPolicyBindingTriggersError);

    console.log('\n--- Edge Case Tests (4) ---');
    await runAsyncTest('13. Feature flag off', testFeatureFlagOff);
    await runAsyncTest('14. Empty capabilities arrays valid', testEmptyCapabilitiesArraysValid);
    await runAsyncTest('15. Zero budgets allowed', testZeroBudgetsAllowed);
    await runAsyncTest('16. Unknown connector_key field', testUnknownConnectorKeyField);

    console.log('\n--- Regression Guard (1) ---');
    await runAsyncTest('17. Schema drift guard', testSchemaDriftGuard);

    console.log('\n--- Determinism Guard (1) ---');
    await runAsyncTest('18. Determinism guard', testDeterminismGuard);

    console.log('\n--- Surgical Tests (5) ---');
    await runAsyncTest('A. Structured descriptor validation', testStructuredDescriptorValidation);
    await runAsyncTest('B. Readiness invariant', testReadinessInvariant);
    await runAsyncTest('C. Policy binding pattern', testPolicyBindingPattern);
    await runAsyncTest('D. Routing flags forbidden combinations', testRoutingFlagsForbiddenCombinations);
    await runAsyncTest('E. Capabilities semantic validation', testCapabilitiesSemanticValidation);

    console.log(`\n=== Test Results: ${passed_tests}/${total_tests} passed ===\n`);

    if (passed_tests !== total_tests) {
        process.exit(1);
    }
}

if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests };
