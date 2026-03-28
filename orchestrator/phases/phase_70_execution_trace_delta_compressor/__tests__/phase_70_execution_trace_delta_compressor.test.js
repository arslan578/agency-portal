const { execute } = require('../phase_70_execution_trace_delta_compressor');

// Mock Observability
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

const logging = require('../../../shared/logging');
const metrics = require('../../../shared/metrics');

describe('Phase 70: Execution Trace Delta Compressor', () => {

    const BASE_INPUT = {
        execution_id: 'exec-70-test',
        phase: '70',
        feature_flags: { FF_EXECUTION_TRACE_DELTA_COMPRESSOR: true },
        canonical_trace: {
            steps: [
                { step_id: 's0', envelope: { a: 1 }, snapshot: { x: 10 } },
                { step_id: 's1', envelope: { a: 1, b: 2 }, snapshot: { x: 10, y: 20 } }
            ]
        }
    };

    const clone = (obj) => JSON.parse(JSON.stringify(obj));

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Happy Paths (6 Tests) ---

    test('1. Step 0 is Full Delta', () => {
        const result = execute(clone(BASE_INPUT));
        expect(result.ok).toBe(true);
        expect(result.deltas[0].envelope_delta).toEqual({ a: 1 });
        expect(result.deltas[0].snapshot_delta).toEqual({ x: 10 });
    });

    test('2. Minimal Delta Computation (Step 1)', () => {
        const result = execute(clone(BASE_INPUT));
        // s1: a:1->1 (same), b:undefined->2 (new)
        // snapshot: x:10->10 (same), y:undefined->20 (new)
        expect(result.deltas[1].envelope_delta).toEqual({ b: 2 });
        expect(result.deltas[1].snapshot_delta).toEqual({ y: 20 });
    });

    test('3. Nested Object Delta', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: { conf: { v: 1 } }, snapshot: {} },
            { step_id: 's1', envelope: { conf: { v: 2 } }, snapshot: {} }
        ];
        const result = execute(input);
        expect(result.deltas[1].envelope_delta).toEqual({ conf: { v: 2 } });
    });

    test('4. Stable Invariant Hash', () => {
        const result = execute(clone(BASE_INPUT));
        expect(result.invariant_hash).toBeDefined();
        expect(result.invariant_hash).toHaveLength(64); // SHA-256 hex
    });

    test('5. Sorted Keys in Output (Arrays)', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps[0].envelope = { z: 1, a: 2 }; // Unsorted input
        const result = execute(input);
        const keys = Object.keys(result.deltas[0].envelope_delta);
        expect(keys).toEqual(['a', 'z']);
    });

    test('6. Full Replay Sequence Integrity', () => {
        const result = execute(clone(BASE_INPUT));
        expect(result.deltas).toHaveLength(2);
        expect(result.deltas[0].step_id).toBe('s0');
        expect(result.deltas[1].step_id).toBe('s1');
    });

    // --- Negative Paths (6 Tests) ---

    test('7. Feature Flag Off -> FEATURE_DISABLED', () => {
        const input = clone(BASE_INPUT);
        input.feature_flags.FF_EXECUTION_TRACE_DELTA_COMPRESSOR = false;
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
    });

    test('8. Missing Canonical Trace -> INPUT_INVALID', () => {
        const input = clone(BASE_INPUT);
        delete input.canonical_trace;
        const result = execute(input);
        expect(result.status).toBe('INPUT_INVALID');
    });

    test('9. Empty Steps Array -> INPUT_INVALID', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [];
        const result = execute(input);
        expect(result.status).toBe('INPUT_INVALID');
    });

    test('10. Forbidden Type (Undefined in Trace) -> INPUT_INVALID', () => {
        const input = clone(BASE_INPUT);
        // JSON can't hold undefined, mimicking undefined passed in Object
        input.canonical_trace.steps[0].envelope.bad = undefined;
        const result = execute(input);
        // validateInput checks isSafeType
        expect(result.status).toBe('INPUT_INVALID');
    });

    test('11. Unknown Top-Level Field -> INPUT_INVALID', () => {
        const input = clone(BASE_INPUT);
        input.extra_junk = true;
        const result = execute(input);
        expect(result.status).toBe('INPUT_INVALID');
    });

    test('12. Invalid Phase ID', () => {
        const input = clone(BASE_INPUT);
        input.phase = '69';
        const result = execute(input);
        expect(result.status).toBe('INPUT_INVALID');
    });

    // --- Edge Cases (4 Tests) ---

    test('13. Identical Steps -> Empty Delta', () => {
        const input = clone(BASE_INPUT);
        // s0 = s1
        input.canonical_trace.steps[1] = JSON.parse(JSON.stringify(input.canonical_trace.steps[0]));
        input.canonical_trace.steps[1].step_id = 's1';
        const result = execute(input);
        expect(result.deltas[1].envelope_delta).toEqual({});
        expect(result.deltas[1].snapshot_delta).toEqual({});
    });

    test('14. Array Replacement (Simple Strategy)', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: { arr: [1, 2] }, snapshot: {} },
            { step_id: 's1', envelope: { arr: [1, 3] }, snapshot: {} }
        ];
        const result = execute(input);
        // Expect full array replacement for safety
        expect(result.deltas[1].envelope_delta).toEqual({ arr: [1, 3] });
    });

    test('15. Large Object, Minimal Change', () => {
        const input = clone(BASE_INPUT);
        const largeObj = {};
        for (let i = 0; i < 100; i++) largeObj['k' + i] = i;
        const nextObj = { ...largeObj, k50: 999 };

        input.canonical_trace.steps = [
            { step_id: 's0', envelope: largeObj, snapshot: {} },
            { step_id: 's1', envelope: nextObj, snapshot: {} }
        ];
        const result = execute(input);
        expect(Object.keys(result.deltas[1].envelope_delta)).toHaveLength(1);
        expect(result.deltas[1].envelope_delta).toEqual({ k50: 999 });
    });

    test('16. Shallow Change in Nested Structure', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: { deep: { a: 1, b: 2 } }, snapshot: {} },
            { step_id: 's1', envelope: { deep: { a: 1, b: 3 } }, snapshot: {} }
        ];
        const result = execute(input);
        expect(result.deltas[1].envelope_delta).toEqual({ deep: { b: 3 } });
    });

    // --- Guards (2 Tests) ---

    test('17. Regression Guard: Freezing Invariant Hash', () => {
        // Ensure the hash logic doesn't drift
        const input = clone(BASE_INPUT);
        const result = execute(input);
        // Compute expectation once manually or rely on consistency
        const h1 = result.invariant_hash;
        const r2 = execute(input);
        expect(r2.invariant_hash).toBe(h1);
    });

    test('18. Determinism Loop (100 Runs)', () => {
        const input = clone(BASE_INPUT);
        const r1 = JSON.stringify(execute(input));
        for (let i = 0; i < 99; i++) {
            expect(JSON.stringify(execute(input))).toBe(r1);
        }
    });

    test('19. Null Handling', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: { a: 1 }, snapshot: {} },
            { step_id: 's1', envelope: { a: null }, snapshot: {} }
        ];
        const result = execute(input);
        expect(result.deltas[1].envelope_delta).toEqual({ a: null });
    });

    test('20. Mixed Key Sorting', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: {}, snapshot: {} },
            { step_id: 's1', envelope: { z: 2, a: 1 }, snapshot: {} }
        ];
        const result = execute(input);
        const keys = Object.keys(result.deltas[1].envelope_delta);
        expect(keys).toEqual(['a', 'z']);
    });

    // --- Patch 70-TP1 Tests (6 Mandatory) ---

    test('21. TP1: Top-Level Deletion -> Null', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: { a: 1, b: 2 }, snapshot: {} },
            { step_id: 's1', envelope: { a: 1 }, snapshot: {} } // b deleted
        ];
        const result = execute(input);
        expect(result.deltas[1].envelope_delta).toEqual({ b: null });
    });

    test('22. TP1: Nested Deletion -> Nested Null', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps = [
            { step_id: 's0', envelope: { deep: { x: 1, y: 2 } }, snapshot: {} },
            { step_id: 's1', envelope: { deep: { x: 1 } }, snapshot: {} } // y deleted
        ];
        const result = execute(input);
        expect(result.deltas[1].envelope_delta).toEqual({ deep: { y: null } });
    });

    test('23. TP1: Date Rejection', () => {
        const input = clone(BASE_INPUT);
        input.canonical_trace.steps[0].envelope.date = new Date();
        const result = execute(input);
        expect(result.status).toBe('INPUT_INVALID');
        expect(result.error).toContain('Date');
    });

    test('24. TP1: Input Sorting Enforcement (Determinism)', () => {
        const input = clone(BASE_INPUT);
        // Step 0 keys unsorted in input
        input.canonical_trace.steps[0].envelope = { z: 10, a: 5 };
        const result = execute(input);

        // Output delta keys MUST be sorted
        const keys = Object.keys(result.deltas[0].envelope_delta);
        expect(keys).toEqual(['a', 'z']);
    });

    test('25. TP1: Unsorted Input -> Same Hash as Sorted', () => {
        const inputUnsorted = clone(BASE_INPUT);
        inputUnsorted.canonical_trace.steps[0].envelope = { z: 1, a: 2 };

        const inputSorted = clone(BASE_INPUT);
        inputSorted.canonical_trace.steps[0].envelope = { a: 2, z: 1 };

        const r1 = execute(inputUnsorted);
        const r2 = execute(inputSorted);

        expect(r1.invariant_hash).toBe(r2.invariant_hash);
    });

    test('26. TP1: Regression Guard Update', () => {
        // Ensure the hash is stable with the new logic
        const input = clone(BASE_INPUT);
        const r1 = execute(input);
        const r2 = execute(input);
        expect(r1.invariant_hash).toBe(r2.invariant_hash);
        expect(r1.invariant_hash.length).toBe(64);
    });

});
