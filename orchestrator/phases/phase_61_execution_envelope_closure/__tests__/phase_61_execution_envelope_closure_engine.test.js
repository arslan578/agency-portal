const { execute } = require('../phase_61_execution_envelope_closure_engine');
const tracing = require('../../../shared/tracing');
const metrics = require('../../../shared/metrics');
const { logStructured } = require('../../../shared/logging');

// Mock shared modules
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));
jest.mock('../../../shared/metrics', () => ({
    count: jest.fn(),
    gauge: jest.fn()
}));
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));

describe('Phase 61: Execution Envelope Closure Engine', () => {

    const createBaseInput = (overrides = {}) => {
        return {
            execution_id: 'exec_test_1',
            phase: '60',
            feature_flags: {
                FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE: true
            },
            execution_envelope: {
                header: {
                    tenant_id: 'tenant_1',
                    workspace_id: 'ws_1',
                    requested_at: '2025-12-06T00:00:00.000Z'
                },
                plan: {
                    plan_id: 'plan_abc',
                    version: 'v1',
                    steps: [
                        { step_id: 's1', connector_id: 'google_ads' }
                    ]
                },
                safety: {
                    safety_horizon: { max_parallel_connectors: 3 }
                },
                metadata: {
                    closure_mode: 'STRICT'
                },
                annotations: {},
                ...overrides.execution_envelope
            },
            ...overrides
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE = 'true';
    });

    afterEach(() => {
        delete process.env.FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE;
    });

    // --- Happy Path Tests (6) ---

    test('HP1: Basic closure with clean envelope', async () => {
        const input = createBaseInput();
        const result = await execute(input);

        expect(result.closure_status).toBe('CLOSED');
        expect(result.closed_envelope).not.toBeNull();
        expect(result.closed_envelope.header.tenant_id).toBe('tenant_1');
        expect(result.closure_summary.has_forbidden_fields).toBe(false);
        expect(result.closure_issues).toHaveLength(0);
        // Verify output key sorting by snapshot (optional) or structure check
    });

    test('HP2: Forbidden structural fields removed', async () => {
        const input = createBaseInput({
            execution_envelope: {
                raw_input_body: { some: 'bad data' },
                internal_debug_payload: { secret: 'token' },
                header: { tenant_id: 'tenant_1', workspace_id: 'ws_1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] }
            }
        });
        const result = await execute(input);

        expect(result.closed_envelope.raw_input_body).toBeUndefined();
        expect(result.closed_envelope.internal_debug_payload).toBeUndefined();
        expect(result.closure_summary.has_forbidden_fields).toBe(true);
        expect(result.closure_summary.forbidden_fields_removed).toContain('raw_input_body');
        expect(result.closure_summary.forbidden_fields_removed).toContain('internal_debug_payload');
        expect(result.closure_issues.length).toBeGreaterThanOrEqual(2);
    });

    test('HP3: Forbidden paths via annotations', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                metadata: { secret_debug_token: '123' },
                annotations: {
                    forbidden_field_paths: ['metadata.secret_debug_token']
                }
            }
        });
        const result = await execute(input);
        expect(result.closed_envelope.metadata.secret_debug_token).toBeUndefined();
        expect(result.closure_summary.forbidden_fields_removed).toContain('metadata.secret_debug_token');
    });

    test('HP4: PII redaction via annotations', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1', user_email: 'user@example.com' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                annotations: {
                    pii_fields: ['header.user_email']
                }
            }
        });
        const result = await execute(input);
        expect(result.closed_envelope.header.user_email).toBe('[[REDACTED]]');
        expect(result.closure_summary.pii_fields_redacted).toContain('header.user_email');
        expect(result.closure_issues).toContainEqual(expect.objectContaining({ code: 'PII_REDACTED' }));
    });

    test('HP5: Closure mode normalization', async () => {
        // Test relaxed
        const inputRelaxed = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                metadata: { closure_mode: 'RELAXED' }
            }
        });
        const resultRelaxed = await execute(inputRelaxed);
        expect(resultRelaxed.observability.closure_mode).toBe('RELAXED');

        // Test missing/invalid -> STRICT
        const inputInvalid = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                metadata: { closure_mode: 'INVALID_MODE' }
            }
        });
        const resultInvalid = await execute(inputInvalid);
        expect(resultInvalid.closed_envelope.metadata.closure_mode).toBe('STRICT');
        expect(resultInvalid.observability.closure_mode).toBe('STRICT');
        expect(resultInvalid.closure_issues).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_CLOSURE_MODE' }));
    });

    test('HP6: Feature flag disabled skip', async () => {
        process.env.FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE = 'false';
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                raw_input_body: { keep_me: true }
            }
        });
        const result = await execute(input);
        expect(result.closure_status).toBe('SKIPPED_FEATURE_DISABLED');
        expect(result.closed_envelope.raw_input_body).toEqual({ keep_me: true });
        expect(result.closure_summary.has_forbidden_fields).toBe(false); // No check performed
    });


    // --- Negative Tests (6) ---

    test('NEG1: Missing execution_id', async () => {
        const input = createBaseInput();
        delete input.execution_id;
        const result = await execute(input);
        expect(result.closure_status).toBe('INVALID_ENVELOPE');
        expect(result.accepted_envelope).toBeUndefined(); // closed_envelope is field name in output
        expect(result.closed_envelope).toBeNull();
        expect(result.closure_issues).toContainEqual(expect.objectContaining({ code: 'MISSING_FIELD', path: 'execution_id' }));
    });

    test('NEG2: Missing execution_envelope', async () => {
        const input = createBaseInput();
        delete input.execution_envelope;
        const result = await execute(input);
        expect(result.closure_status).toBe('INVALID_ENVELOPE');
        expect(result.closure_issues).toContainEqual(expect.objectContaining({ code: 'MISSING_FIELD', path: 'execution_envelope' }));
    });

    test('NEG3: execution_envelope not an object', async () => {
        const input = createBaseInput({ execution_envelope: 'not-an-object' });
        const result = await execute(input);
        expect(result.closure_status).toBe('INVALID_ENVELOPE');
        // Might fail on header field check or top level check logic depending on impl order
        // Current impl checks missing envelope first or internal validation logic.
        // My engine implementation returns early if execution_envelope is not object?
        // Let's check engine code carefully: yes "if (!input?.execution_envelope || typeof ... !== 'object')"
    });

    test('NEG4: Missing plan.plan_id', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { version: 'v1', steps: [] } // Missing plan_id
            }
        });
        const result = await execute(input);
        expect(result.closure_status).toBe('INVALID_ENVELOPE');
        expect(result.closure_issues).toContainEqual(expect.objectContaining({ path: 'execution_envelope.plan.plan_id' }));
    });

    test('NEG5: plan.steps not an array', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: {} } // Not array
            }
        });
        const result = await execute(input);
        expect(result.closure_status).toBe('INVALID_ENVELOPE');
        expect(result.closure_issues).toContainEqual(expect.objectContaining({ code: 'INVALID_TYPE', path: 'execution_envelope.plan.steps' }));
    });

    test('NEG6: Invalid closure_mode (Implicitly tested in HP5 but verified as WARN case here)', async () => {
        // Re-verify the warning aspect specifically
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                metadata: { closure_mode: 'AGGRESSIVE' }
            }
        });
        const result = await execute(input);
        expect(result.closure_status).toBe('CLOSED');
        expect(result.closure_issues).toContainEqual(expect.objectContaining({
            code: 'UNKNOWN_CLOSURE_MODE',
            severity: 'WARN'
        }));
    });


    // --- Edge Cases (4) ---

    test('EC1: Empty plan.steps array', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] }
            }
        });
        const result = await execute(input);
        expect(result.closure_status).toBe('CLOSED');
        expect(result.observability.step_count).toBe(0);
    });

    test('EC2: No annotations block', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                // No annotations
            }
        });
        const result = await execute(input);
        expect(result.closure_status).toBe('CLOSED');
        expect(result.closure_summary.forbidden_fields_removed).toEqual([]);
        expect(result.closure_summary.pii_fields_redacted).toEqual([]);
        // Should have removed raw_input_body etc by default even if no annotations block
        // (Base input logic doesn't add them unless specified)
    });

    test('EC3: Nested forbidden paths multiple levels deep', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                connectors: {
                    google_ads: {
                        debug: { trace_dump: 'bad stuff', other: 'ok' }
                    }
                },
                annotations: {
                    forbidden_field_paths: ['connectors.google_ads.debug.trace_dump']
                }
            }
        });
        const result = await execute(input);
        expect(result.closed_envelope.connectors.google_ads.debug.trace_dump).toBeUndefined();
        expect(result.closed_envelope.connectors.google_ads.debug.other).toBe('ok');
    });

    test('EC4: Pre-existing closed_envelope field inside execution_envelope', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                closed_envelope: { junk: true } // Inject junk field
            }
        });
        const result = await execute(input);
        // The output of execute has its OWN closed_envelope property.
        // The *inner* closed_envelope inside the input's execution envelope should be preserved 
        // unless it's explicitly forbidden. It acts like any other field.
        expect(result.closed_envelope.closed_envelope).toEqual({ junk: true });
        // And the top level result key is the sanitized envelope
        expect(result.closed_envelope.header).toBeDefined();
    });


    // --- Regression & Determinism (4) ---

    test('RG1: Regression: feature-disabled path must not sanitize', async () => {
        process.env.FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE = 'false';
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                raw_input_body: { secret: 'data' }
            }
        });

        // Run twice to ensure stability
        const result1 = await execute(input);
        const result2 = await execute(input);

        expect(result1.closed_envelope.raw_input_body).toBeDefined();
        expect(result2.closed_envelope.raw_input_body).toBeDefined();
        expect(result1.closure_status).toBe('SKIPPED_FEATURE_DISABLED');
    });

    test('DET1: Deterministic output under repeated calls', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                // Unsorted keys in input
                z_field: 1,
                a_field: 2,
                connectors: {
                    b_conn: {},
                    a_conn: {}
                }
            }
        });

        const results = [];
        for (let i = 0; i < 50; i++) {
            results.push(JSON.stringify(await execute(input)));
        }

        const first = results[0];
        for (let i = 1; i < 50; i++) {
            expect(results[i]).toBe(first);
        }

        // Verify sorting happened
        const parsed = JSON.parse(first);
        const keys = Object.keys(parsed.closed_envelope);
        const connKeys = Object.keys(parsed.closed_envelope.connectors);
        // In JS, object key iteration order for non-integer keys is insertion order compliant in newer standards,
        // but our sortKeysDeep function creates a new object inserting keys in sorted order.
        // So JSON.stringify should reflect that order.
        // Let's assume 'a_field' comes before 'z_field'
        expect(keys.indexOf('a_field')).toBeLessThan(keys.indexOf('z_field'));
        expect(connKeys.indexOf('a_conn')).toBeLessThan(connKeys.indexOf('b_conn'));
    });

    test('EC5: Overlapping forbidden and PII paths', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1', user_email: 'x' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                annotations: {
                    pii_fields: ['header.user_email'],
                    forbidden_field_paths: ['header.user_email']
                }
            }
        });
        const result = await execute(input);
        expect(result.closed_envelope.header.user_email).toBeUndefined(); // Deleted wins
        expect(result.closure_summary.forbidden_fields_removed).toContain('header.user_email');
        // Implementation check: if deleted, PII logic won't find it to redact. 
        // So pii_fields_redacted should NOT contain it (or handled gracefully).
        expect(result.closure_summary.pii_fields_redacted).not.toContain('header.user_email');
    });

    test('RG2: Multiple occurrences of same forbidden path', async () => {
        const input = createBaseInput({
            execution_envelope: {
                header: { tenant_id: 't1', workspace_id: 'w1' },
                plan: { plan_id: 'p1', version: 'v1', steps: [] },
                target: { delete_me: 1 },
                annotations: {
                    forbidden_field_paths: ['target.delete_me', 'target.delete_me']
                }
            }
        });
        const result = await execute(input);
        expect(result.closed_envelope.target.delete_me).toBeUndefined();
        // Should only list it once in summary ideally, or implementation logic handles duplicate attempts
        // My implementation dedupes paths before processing!
        expect(result.closure_summary.forbidden_fields_removed).toHaveLength(1);
    });

});
