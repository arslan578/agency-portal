const { execute } = require('../phase_62_execution_state_recorder');
const crypto = require('crypto');

// Mock dependencies
// Mock dependencies
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../../shared/metrics', () => ({
    count: jest.fn(),
    gauge: jest.fn()
}));
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

describe('Phase 62: Execution State Recorder', () => {

    const FIXED_DATE = '2025-12-06T12:00:00.000Z';

    beforeAll(() => {
        // Freeze time
        jest.useFakeTimers();
        jest.setSystemTime(new Date(FIXED_DATE));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        process.env.FF_EXECUTION_STATE_RECORDER = 'true';
        jest.clearAllMocks();
    });

    const createBaseInput = () => ({
        execution_id: 'exec_test_123',
        phase: '62',
        feature_flags: { FF_EXECUTION_STATE_RECORDER: true },
        closed_envelope: {
            header: {
                tenant_id: 'tenant_1',
                workspace_id: 'ws_1',
                run_sequence: 1
            },
            plan: { steps: [] },
            metadata: { closure_mode: 'STRICT' }
        },
        snapshot_hints: { max_bytes: 1024 * 1024 }
    });

    // --- Happy Path (6 Tests) ---

    test('HP1: Minimal valid input', async () => {
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('OK');
        expect(result.snapshot).not.toBeNull();
        expect(result.snapshot.header.recorded_at).toBe(FIXED_DATE);
        expect(result.snapshot.header.source_phase).toBe('61');
    });

    test('HP2: Rich envelope with projections', async () => {
        const input = createBaseInput();
        input.closed_envelope.connectors = { google_ads: { status: 'ready' } };
        input.closed_envelope.policy_context = { version: '1.0' };

        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.snapshot.state_views.connectors).toEqual({ google_ads: { status: 'ready' } });
        expect(result.snapshot.state_views.policy).toEqual({ version: '1.0' });
    });

    test('HP3: Key sorting', async () => {
        const input = createBaseInput();
        input.closed_envelope.unordered = { z: 1, a: 2, m: 3 };

        const result = await execute(input);
        expect(result.ok).toBe(true);

        const keys = Object.keys(result.snapshot.closed_envelope.unordered);
        expect(keys).toEqual(['a', 'm', 'z']);

        // Ensure stringify order
        const str = JSON.stringify(result.snapshot.closed_envelope.unordered);
        expect(str).toBe('{"a":2,"m":3,"z":1}');
    });

    test('HP4: Serialization check (size estimate)', async () => {
        const input = createBaseInput();
        const result = await execute(input);

        expect(result.ok).toBe(true);
        const actualBytes = Buffer.byteLength(JSON.stringify(result.snapshot), 'utf8');
        expect(result.snapshot.meta.size_bytes_estimate).toBe(actualBytes);
    });

    test('HP5: Header propagation', async () => {
        const input = createBaseInput();
        input.closed_envelope.header = {
            tenant_id: 't1', workspace_id: 'w1', brand_id: 'b1',
            manifest_version: 'v1', run_sequence: 99
        };
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.snapshot.header.tenant_id).toBe('t1');
        expect(result.snapshot.header.brand_id).toBe('b1');
        expect(result.snapshot.header.run_sequence).toBe(99);
    });

    test('HP6: Warnings list via hints', async () => {
        const input = createBaseInput();
        input.snapshot_hints.include_debug_traces = true;
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.snapshot.meta.warnings).toContain('Debug traces included per hint');
    });

    // --- Negative Path (6 Tests) ---

    test('NEG1: Feature disabled', async () => {
        process.env.FF_EXECUTION_STATE_RECORDER = 'false';
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
        expect(result.snapshot).toBeNull();
    });

    test('NEG2: Missing required field (closed_envelope)', async () => {
        const input = createBaseInput();
        delete input.closed_envelope;
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('NEG3: Forbidden field present (snapshot)', async () => {
        const input = createBaseInput();
        input.snapshot = { bad: 'data' };
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT_FORBIDDEN_FIELDS');
    });

    test('NEG4: Non-serializable value (BigInt)', async () => {
        const input = createBaseInput();
        input.closed_envelope.bad = 10n; // BigInt
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('NON_SERIALIZABLE_FIELD');
        expect(result.error.path).toContain('closed_envelope.bad');
    });

    test('NEG5: Snapshot too large', async () => {
        const input = createBaseInput();
        input.snapshot_hints.max_bytes = 10; // Very small
        // Create bigger payload
        input.closed_envelope.payload = 'x'.repeat(100);

        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('SNAPSHOT_TOO_LARGE');
    });

    test('NEG6: Phase mismatch', async () => {
        const input = createBaseInput();
        input.phase = '61';
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('NEG7: Undefined value inside envelope rejected', async () => {
        const input = createBaseInput();
        input.closed_envelope.bad = { inner: undefined };
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('NON_SERIALIZABLE_FIELD');
        expect(result.error.path).toContain('closed_envelope.bad.inner');
    });

    test('NEG8: Forbidden field nested inside envelope', async () => {
        const input = createBaseInput();
        input.closed_envelope.deep = { raw_request: 'nope' };
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT_FORBIDDEN_FIELDS');
        expect(result.error.path).toContain('closed_envelope.deep.raw_request');
    });

    // --- Edge Cases (4 Tests) ---

    test('EC1: Empty envelope', async () => {
        const input = createBaseInput();
        input.closed_envelope = {};
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.snapshot.closed_envelope).toEqual({});
        expect(result.snapshot.meta.field_count).toBe(0); // Empty object has 0 fields
    });

    test('EC2: Dates normalized', async () => {
        const input = createBaseInput();
        const d = new Date('2023-01-01T00:00:00Z');
        input.closed_envelope.timestamp = d;
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.snapshot.closed_envelope.timestamp).toBe('2023-01-01T00:00:00.000Z');
    });

    test('EC3: Deep nesting', async () => {
        const input = createBaseInput();
        input.closed_envelope.a = { b: { c: { d: { e: 'deep' } } } };
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.snapshot.closed_envelope.a.b.c.d.e).toBe('deep');
        expect(result.snapshot.meta.field_count).toBeGreaterThan(4);
    });

    test('EC4: Input immutability', async () => {
        const input = createBaseInput();
        input.closed_envelope.obj = { inner: 1 };
        const originalJson = JSON.stringify(input);

        await execute(input);

        expect(JSON.stringify(input)).toBe(originalJson);
    });

    // --- Regression & Determinism (2 Tests) ---

    test('RG1: Regression Guard - Null/Empty/Zero Handling', async () => {
        const input = createBaseInput();
        input.closed_envelope.vals = {
            nullVal: null,
            emptyStr: "",
            zero: 0,
            falseVal: false
        };
        const result = await execute(input);
        expect(result.ok).toBe(true);
        const out = result.snapshot.closed_envelope.vals;
        expect(out.nullVal).toBeNull();
        expect(out.emptyStr).toBe("");
        expect(out.zero).toBe(0);
        expect(out.falseVal).toBe(false);
    });

    test('DET1: Determinism Guard - Repeated Runs', async () => {
        const input = createBaseInput();
        // Mixed keys to force sort
        input.closed_envelope = {
            c: { x: 1, a: 2 },
            b: [3, 2, 1],
            a: 'start'
        };

        const result1 = await execute(input);
        const result2 = await execute(input);

        expect(result1.snapshot.envelope_hash).toBe(result2.snapshot.envelope_hash);
        expect(JSON.stringify(result1.snapshot)).toBe(JSON.stringify(result2.snapshot));

        // Hash should be robust
        expect(result1.snapshot.envelope_hash).toHaveLength(64); // SHA-256 hex
    });

});
