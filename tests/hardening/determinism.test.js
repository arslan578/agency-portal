const stableJson = require('../../orchestrator/shared/serialization/stable_json');

describe('Determinism Guardrails', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    test('Default (Legacy): Uses native stringify (unsorted)', () => {
        delete process.env.FF_STABLE_JSON;
        const input = { z: 1, a: 2 };

        // Native JSON.stringify usually preserves specific insertion order or optimization order, 
        // but key order isn't guaranteed by the spec to be sorted.
        // However, for small objects literal definition order is often preserved in V8.
        // z comes before a here.
        const output = stableJson.stringify(input);
        expect(output).toBe('{"z":1,"a":2}');
    });

    test('Stable Mode: Sorts keys recursively', () => {
        process.env.FF_STABLE_JSON = 'true';
        const input = { z: 1, a: { d: 4, c: 3 }, b: 2 };

        const output = stableJson.stringify(input);

        // Expected: a (with c,d), b, z
        const expected = '{"a":{"c":3,"d":4},"b":2,"z":1}';
        expect(output).toBe(expected);
    });

    test('Byte-Identical Identity Check', () => {
        process.env.FF_STABLE_JSON = 'true';
        const input1 = { a: 1, b: 2 };
        const input2 = { b: 2, a: 1 }; // Different order

        const s1 = stableJson.stringify(input1);
        const s2 = stableJson.stringify(input2);

        expect(s1).toBe(s2);
    });

    test('Array order is preserved (Lists are ordered data)', () => {
        process.env.FF_STABLE_JSON = 'true';
        const input = { list: ['b', 'a', 'c'] };

        const output = stableJson.stringify(input);
        // Arrays must NOT be sorted, only object keys
        expect(output).toBe('{"list":["b","a","c"]}');
    });
});
