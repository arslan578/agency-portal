/**
 * Phase 43: Multi-Tenant Trace Domain Engine - Test Suite
 * 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const { computeTraceDomain } = require('../trace_domain_engine');
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
        toContain: (substring) => assert.ok(actual.includes(substring))
    };
}

describe('Phase 43: Multi-Tenant Trace Domain Engine', () => {

    // ========== HAPPY PATH (6 tests) ==========

    runTest('1. Full tenant set', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-123',
            tenant: {
                tenant_id: 'acme',
                workspace_id: 'marketing',
                brand_id: 'summer-campaign'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain).toBeDefined();
        expect(result.trace_domain.version).toBe('trace_domain_v1');
        expect(result.trace_domain.domain_key).toBe('TENANT:acme::WS:marketing::BRAND:summer-campaign');
        expect(result.trace_domain.components.tenant_id).toBe('acme');
        expect(result.trace_domain.components.workspace_id).toBe('marketing');
        expect(result.trace_domain.components.brand_id).toBe('summer-campaign');
        expect(result.trace_domain.components.requested_at).toBe('2025-07-29T15:41:00Z');
    });

    runTest('2. Tenant only', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-456',
            tenant: {
                tenant_id: 'solo-tenant'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain.domain_key).toBe('TENANT:solo-tenant::WS:null::BRAND:null');
        expect(result.trace_domain.components.workspace_id).toBe(null);
        expect(result.trace_domain.components.brand_id).toBe(null);
    });

    runTest('3. Tenant + workspace', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-789',
            tenant: {
                tenant_id: 'acme',
                workspace_id: 'sales'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain.domain_key).toBe('TENANT:acme::WS:sales::BRAND:null');
        expect(result.trace_domain.components.workspace_id).toBe('sales');
        expect(result.trace_domain.components.brand_id).toBe(null);
    });

    runTest('4. Tenant + brand', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-101',
            tenant: {
                tenant_id: 'acme',
                brand_id: 'winter-promo'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain.domain_key).toBe('TENANT:acme::WS:null::BRAND:winter-promo');
        expect(result.trace_domain.components.workspace_id).toBe(null);
        expect(result.trace_domain.components.brand_id).toBe('winter-promo');
    });

    runTest('5. All optional IDs null', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-202',
            tenant: {
                tenant_id: 'minimal',
                workspace_id: null,
                brand_id: null
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain.domain_key).toBe('TENANT:minimal::WS:null::BRAND:null');
    });

    runTest('6. Stable domain key prediction', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-stable',
            tenant: {
                tenant_id: 'test-tenant',
                workspace_id: 'test-ws',
                brand_id: 'test-brand'
            },
            metadata: {
                requested_at: '2025-08-01T10:00:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        // Predict exact key format
        const expected = 'TENANT:test-tenant::WS:test-ws::BRAND:test-brand';
        expect(result.trace_domain.domain_key).toBe(expected);
    });

    // ========== NEGATIVE PATH (6 tests) ==========

    runTest('7. Missing tenant', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-bad1',
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_MALFORMED_TENANT_OBJECT');
    });

    runTest('8. Tenant ID empty', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-bad2',
            tenant: {
                tenant_id: '   '
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_INVALID_TENANT_ID');
    });

    runTest('9. Workspace ID invalid type', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-bad3',
            tenant: {
                tenant_id: 'acme',
                workspace_id: 12345
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_INVALID_WORKSPACE_ID');
    });

    runTest('10. Brand ID invalid type', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-bad4',
            tenant: {
                tenant_id: 'acme',
                brand_id: { invalid: 'object' }
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_INVALID_BRAND_ID');
    });

    runTest('11. Missing execution_id', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            tenant: {
                tenant_id: 'acme'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_MISSING_EXECUTION_ID');
    });

    runTest('12. Malformed metadata.requested_at', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        // requested_at is optional, so this should still succeed
        const envelope = {
            execution_id: 'exec-meta',
            tenant: {
                tenant_id: 'acme'
            },
            metadata: {}
        };

        const result = computeTraceDomain(envelope);

        // Should succeed, requested_at is just passed through
        expect(result.trace_domain).toBeDefined();
        expect(result.trace_domain.components.requested_at).toBe(undefined);
    });

    // ========== EDGE CASES (4 tests) ==========

    runTest('13. Extremely long tenant_id', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const longId = 'a'.repeat(1000);
        const envelope = {
            execution_id: 'exec-long',
            tenant: {
                tenant_id: longId
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain.domain_key).toContain(longId);
        expect(result.trace_domain.components.tenant_id).toBe(longId);
    });

    runTest('14. Unicode tenant_id', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-unicode',
            tenant: {
                tenant_id: '测试租户',
                workspace_id: 'ワークスペース'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain.domain_key).toBe('TENANT:测试租户::WS:ワークスペース::BRAND:null');
    });

    runTest('15. Null-only metadata', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-null-meta',
            tenant: {
                tenant_id: 'tenant'
            },
            metadata: null
        };

        const result = computeTraceDomain(envelope);

        expect(result.trace_domain).toBeDefined();
        expect(result.trace_domain.components.requested_at).toBe(undefined);
    });

    runTest('16. Fields explicitly set to null vs undefined', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope1 = {
            execution_id: 'exec-null',
            tenant: {
                tenant_id: 'test',
                workspace_id: null
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const envelope2 = {
            execution_id: 'exec-undefined',
            tenant: {
                tenant_id: 'test'
                // workspace_id is undefined (not present)
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result1 = computeTraceDomain(envelope1);
        const result2 = computeTraceDomain(envelope2);

        // Both should produce the same domain key
        expect(result1.trace_domain.domain_key).toBe(result2.trace_domain.domain_key);
        expect(result1.trace_domain.domain_key).toBe('TENANT:test::WS:null::BRAND:null');
    });

    // ========== REGRESSION (3 tests) ==========

    runTest('17. Domain key identical to previous version', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-regression',
            tenant: {
                tenant_id: 'regression-tenant',
                workspace_id: 'regression-ws',
                brand_id: 'regression-brand'
            },
            metadata: {
                requested_at: '2025-07-29T15:41:00Z'
            }
        };

        const result = computeTraceDomain(envelope);

        // This key format must never change
        const expected = 'TENANT:regression-tenant::WS:regression-ws::BRAND:regression-brand';
        expect(result.trace_domain.domain_key).toBe(expected);
    });

    runTest('18. Empty workspace_id is invalid', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-empty-ws',
            tenant: {
                tenant_id: 'acme',
                workspace_id: ''
            },
            metadata: { requested_at: '2025-07-29T15:41:00Z' }
        };

        const result = computeTraceDomain(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_INVALID_WORKSPACE_ID');
    });

    runTest('19. Empty brand_id is invalid', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-empty-brand',
            tenant: {
                tenant_id: 'acme',
                brand_id: ''
            },
            metadata: { requested_at: '2025-07-29T15:41:00Z' }
        };

        const result = computeTraceDomain(envelope);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('TRACE_DOMAIN_ERROR_INVALID_BRAND_ID');
    });

    // ========== DETERMINISM (1 test) ==========

    runTest('20. 10,000 identical inputs → identical outputs', () => {
        process.env.FF_MULTI_TENANT_TRACE_DOMAINS = 'true';

        const envelope = {
            execution_id: 'exec-determinism',
            tenant: {
                tenant_id: 'determinism-test',
                workspace_id: 'ws-determinism',
                brand_id: 'brand-determinism'
            },
            metadata: {
                requested_at: '2025-08-01T12:00:00Z'
            }
        };

        const results = [];
        for (let i = 0; i < 10000; i++) {
            const result = computeTraceDomain(envelope);
            results.push(JSON.stringify(result.trace_domain));
        }

        // All results must be byte-for-byte identical
        const first = results[0];
        for (const result of results) {
            expect(result).toBe(first);
        }
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
