const { execute } = require('../phase_64_canonical_execution_form_generator');

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

describe('Phase 64: Canonical Execution Form Generator', () => {

    // Setup
    const createBaseInput = () => ({
        execution_id: 'exec_test_64',
        phase: '64',
        feature_flags: { FF_CANONICAL_EXECUTION_FORM_GENERATOR: true },
        sealed_envelope: {
            closure_envelope: { id: 'env_1', data: { a: 1, c: 3, b: 2 } },
            state_snapshot: { id: 'snap_1' },
            commit_seal: {
                algorithm: 'sha256',
                value: 'seal_val',
                inputs: { envelope_hash: 'h1', snapshot_hash: 'h2' }
            }
        }
    });

    beforeAll(() => {
        process.env.FF_CANONICAL_EXECUTION_FORM_GENERATOR = 'true';
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Happy Paths (6) ---

    test('HP1: Basic Canonicalization', async () => {
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.status).toBe('OK');
        expect(result.canonical_form).toBeDefined();
        expect(result.canonical_form.canonical_json.closure_envelope.data).toEqual({ a: 1, b: 2, c: 3 }); // Sorted keys output check? logic sorts it, test checks equality.
        // Actually to verify sorting strictly, we'd check keys order, but ToEqual checks semantics.
        // We trust the engine logic for sorting if invariants hold.
    });

    test('HP2: Nested Objects Sorting', async () => {
        const input = createBaseInput();
        input.sealed_envelope.nested = { z: 1, a: { y: 2, x: 3 } };
        const result = await execute(input);
        const keys = Object.keys(result.canonical_form.canonical_json.nested);
        expect(keys).toEqual(['a', 'z']);
        const innerKeys = Object.keys(result.canonical_form.canonical_json.nested.a);
        expect(innerKeys).toEqual(['x', 'y']);
    });

    test('HP3: Array Preservation', async () => {
        const input = createBaseInput();
        input.sealed_envelope.list = [3, 1, 2];
        const result = await execute(input);
        expect(result.canonical_form.canonical_json.list).toEqual([3, 1, 2]); // Order maintained
    });

    test('HP4: Date Normalization', async () => {
        const input = createBaseInput();
        const d = new Date('2025-01-01T12:00:00Z');
        input.sealed_envelope.timestamp = d;
        const result = await execute(input);
        expect(result.canonical_form.canonical_json.timestamp).toBe('2025-01-01T12:00:00.000Z');
    });

    test('HP5: Hashing Structure', async () => {
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.canonical_form.hashes.structure_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(result.canonical_form.hashes.canonical_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(result.canonical_form.canonical_bytes).toBeDefined();
    });

    test('HP6: Base64 Encoding', async () => {
        const input = createBaseInput();
        const result = await execute(input);
        const decoded = Buffer.from(result.canonical_form.canonical_bytes, 'base64').toString('utf8');
        // Should be valid JSON
        expect(() => JSON.parse(decoded)).not.toThrow();
    });

    // --- Negative Paths (6) ---

    test('NEG1: Missing required field (execution_id)', async () => {
        const input = createBaseInput();
        delete input.execution_id;
        const result = await execute(input);
        expect(result.status).toBe('ERROR_MISSING_FIELD');
    });

    test('NEG2: Undefined in Input', async () => {
        const input = createBaseInput();
        input.sealed_envelope.bad = undefined;
        const result = await execute(input);
        // Normalized checks throw error, caught -> ERROR_UNSERIALIZABLE_TYPE
        expect(result.status).toBe('ERROR_UNSERIALIZABLE_TYPE');
    });

    test('NEG3: Function in Input', async () => {
        const input = createBaseInput();
        input.sealed_envelope.bad = () => { };
        const result = await execute(input);
        expect(result.status).toBe('ERROR_UNSERIALIZABLE_TYPE');
    });

    test('NEG4: Feature Flag Disabled', async () => {
        const input = createBaseInput();
        input.feature_flags.FF_CANONICAL_EXECUTION_FORM_GENERATOR = false;
        process.env.FF_CANONICAL_EXECUTION_FORM_GENERATOR = 'false'; // Ensure logic checks input or env correctly

        // We need to bypass the strict input check inside execute?
        // Wait, spec 6 lists "Feature disabled -> status: FEATURE_DISABLED"
        // But validation usually comes first.
        // If validation passes, then we check flag.

        const result = await execute(input);
        expect(result.status).toBe('FEATURE_DISABLED');
        expect(result.canonical_form).toBeUndefined();
    });

    test('NEG5: Forbidden field _debug', async () => {
        const input = createBaseInput();
        input._debug = { trace: 1 };
        const result = await execute(input);
        expect(result.status).toBe('ERROR_UNSERIALIZABLE_TYPE'); // Mapped to this generic error
    });

    test('NEG6: Wrong Phase', async () => {
        const input = createBaseInput();
        input.phase = '63';
        const result = await execute(input);
        expect(result.status).toBe('ERROR_UNSERIALIZABLE_TYPE'); // Mapped behavior
    });

    // --- Edge Cases (4) ---

    test('EC1: Empty Objects', async () => {
        const input = createBaseInput();
        input.sealed_envelope = { closure_envelope: {}, state_snapshot: {}, commit_seal: {} };
        const result = await execute(input);
        expect(result.status).toBe('OK');
    });

    test('EC2: Deep Nesting', async () => {
        const input = createBaseInput();
        let curr = input.sealed_envelope;
        for (let i = 0; i < 50; i++) {
            curr.next = { val: i };
            curr = curr.next;
        }
        const result = await execute(input);
        expect(result.status).toBe('OK');
    });

    test('EC3: Large Array', async () => {
        const input = createBaseInput();
        input.sealed_envelope.long_list = Array.from({ length: 1000 }, (_, i) => i);
        const result = await execute(input);
        expect(result.status).toBe('OK');
    });

    test('EC4: Non-Finite Numbers', async () => {
        const input = createBaseInput();
        input.sealed_envelope.badNum = Infinity;
        const result = await execute(input);
        expect(result.status).toBe('ERROR_UNSERIALIZABLE_TYPE');
    });

    // --- Guards ---

    test('RG1: Canonical Key Ordering Regression Guard', async () => {
        const input = createBaseInput();
        input.sealed_envelope.unordered = { z: 1, m: 2, a: 3 };
        const result = await execute(input);
        const jsonStr = Buffer.from(result.canonical_form.canonical_bytes, 'base64').toString('utf8');
        // Ensure keys are strictly "a", "m", "z" in text
        expect(jsonStr).toContain('"a":3');
        expect(jsonStr).toContain('"m":2');
        expect(jsonStr).toContain('"z":1');
        // Simple regex check for order?
        const aIndex = jsonStr.indexOf('"a":3');
        const mIndex = jsonStr.indexOf('"m":2');
        const zIndex = jsonStr.indexOf('"z":1');
        expect(aIndex).toBeLessThan(mIndex);
        expect(mIndex).toBeLessThan(zIndex);
    });

    test('DET1: Determinism Guard 100 Runs', async () => {
        const input = createBaseInput();
        const first = await execute(input);
        const signature = first.canonical_form.hashes.canonical_sha256;

        for (let i = 0; i < 100; i++) {
            const res = await execute(input);
            expect(res.canonical_form.hashes.canonical_sha256).toBe(signature);
        }
    });
});
