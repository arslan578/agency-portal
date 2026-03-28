const { execute, PREVIOUS_HASH_SENTINEL } = require('../phase_63_commit_seal_engine');
const engine = require('../phase_63_commit_seal_engine'); // For mocking _computeHash if needed via spy? 
// Cannot spy on local function used internally unless module calls it from exports.
// `execute` calls `computeHash` which is local.
// To test integrity mismatch, we need `execute` to see different hashes.
// We can mock `crypto.createHash` to return different values on subsequent calls?
const crypto = require('crypto');

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

describe('Phase 63: Commit Seal Engine', () => {

    beforeAll(() => {
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        process.env.FF_COMMIT_SEAL_ENGINE = 'true';
        jest.clearAllMocks();
    });

    const createBaseInput = () => ({
        execution_id: 'exec_test_63',
        phase: '63',
        feature_flags: { FF_COMMIT_SEAL_ENGINE: true },
        execution_envelope: {
            header: { id: 'env_1' },
            data: { value: 100 }
        },
        state_snapshot: {
            header: { id: 'snap_1' },
            trace: { id: 'trace_1' }
        }
    });

    // --- Happy Path (6 Tests) ---

    test('HP1: Valid envelope and snapshot, sealed successfully', async () => {
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('SEALED');
        expect(result.contract).toBe('commit_seal_engine_v1');
        expect(result.commit_seal).toBeDefined();
        expect(result.commit_seal.previous_hash).toBe(PREVIOUS_HASH_SENTINEL);
        expect(result.commit_seal.hash).toHaveLength(64);
        expect(result.execution_envelope).toBe(input.execution_envelope); // Ref equality
    });

    test('HP2: Previous seal provided', async () => {
        const input = createBaseInput();
        input.previous_commit_seal = {
            hash: 'abc123_prev'
        };
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.commit_seal.previous_hash).toBe('abc123_prev');
    });

    test('HP3: Nested objects and arrays', async () => {
        const input = createBaseInput();
        input.execution_envelope.nested = {
            arr: [3, 1, 2],
            obj: { z: 9, a: 1 }
        };
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('SEALED');
        expect(result.execution_envelope.nested.arr).toEqual([3, 1, 2]);
    });

    test('HP4: Dates converted to ISO', async () => {
        const input = createBaseInput();
        const date = new Date('2025-01-01T00:00:00Z');
        input.execution_envelope.timestamp = date;
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.execution_envelope.timestamp).toBe(date);
    });

    test('HP5: Large payload deterministic', async () => {
        const input = createBaseInput();
        input.execution_envelope.large = 'x'.repeat(10000);
        const result1 = await execute(input);
        const result2 = await execute(input);
        expect(result1.commit_seal.hash).toBe(result2.commit_seal.hash);
    });

    test('HP6: Feature flag off (Strict Output Shape)', async () => {
        process.env.FF_COMMIT_SEAL_ENGINE = 'false';
        const input = createBaseInput();
        input.feature_flags = {};

        // Add extra field to ensure no spread
        input.extra_field = "leak";

        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
        expect(result.contract).toBe('commit_seal_engine_v1');
        expect(result.commit_seal).toBeUndefined();

        // Ensure no leakage
        expect(result.extra_field).toBeUndefined();

        // Ensure standard fields present
        expect(result.execution_envelope).toBeDefined();
        expect(result.state_snapshot).toBeDefined();
    });

    // --- Negative Path (6 Tests) ---

    test('NEG1: Missing execution_id', async () => {
        const input = createBaseInput();
        delete input.execution_id;
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
        expect(result.debug.diagnostics.message).toBeDefined();
    });

    test('NEG2: Wrong phase', async () => {
        const input = createBaseInput();
        input.phase = '62';
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('NEG3: Missing execution_envelope', async () => {
        const input = createBaseInput();
        delete input.execution_envelope;
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('NEG4: Forbidden field commit_seal present', async () => {
        const input = createBaseInput();
        input.commit_seal = { fake: true };
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FORBIDDEN_FIELD');
    });

    test('NEG5: Undefined inside input (Strict Check)', async () => {
        const input = createBaseInput();
        // undefined property
        input.execution_envelope = { valid: 1, invalid: undefined };
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
        expect(result.debug.diagnostics.message).toContain('undefined');
    });

    test('NEG6: Non-object state_snapshot', async () => {
        const input = createBaseInput();
        input.state_snapshot = 'invalid-string';
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
    });

    // --- Edge Cases & Tightening Guard Tests ---

    test('EC1: Empty valid objects', async () => {
        const input = createBaseInput();
        input.execution_envelope = {};
        input.state_snapshot = {};
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('SEALED');
    });

    test('EC2: Previous seal missing hash', async () => {
        const input = createBaseInput();
        input.previous_commit_seal = { scope: 'old' }; // No hash
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.commit_seal.previous_hash).toBe(PREVIOUS_HASH_SENTINEL);
    });

    test('EC3: Previous seal not an object (INVALID_INPUT)', async () => {
        const input = createBaseInput();
        input.previous_commit_seal = "invalid_string";
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('EC4: Validation Order Guard', async () => {
        // Feature flag OFF, but Phase mismatch. Should be INVALID_INPUT, NOT FEATURE_DISABLED.
        process.env.FF_COMMIT_SEAL_ENGINE = 'false';
        const input = createBaseInput();
        input.phase = '999'; // Wrong phase

        const result = await execute(input);
        expect(result.ok).toBe(false);
        // If validation happens first, this is INVALID_INPUT.
        expect(result.status).toBe('INVALID_INPUT');
    });

    test('DET1: Determinism Guard - 100 iterations', async () => {
        const input = createBaseInput();
        input.execution_envelope = { unordered: { z: 1, c: 2, a: 3 } };

        const firstResult = await execute(input);
        const firstJson = JSON.stringify(firstResult);

        for (let i = 0; i < 100; i++) {
            const res = await execute(input);
            expect(JSON.stringify(res)).toBe(firstJson);
        }
    });

    test('INT1: Integrity Mismatch Guard', async () => {
        // We simulate a hash mismatch by mocking crypto.createHash
        // BUT we need it to work normally first, then fail on the second pass.
        // This is tricky with `jest.mock`.
        // We'll use a spy implementation that toggles.

        const originalCreateHash = crypto.createHash;
        let callCount = 0;

        const spy = jest.spyOn(crypto, 'createHash').mockImplementation((algo) => {
            const hash = originalCreateHash(algo);
            // We want to sabotage the verification hash (which is the LAST one for the combined object)
            // Sequence of hashes:
            // 1. envelope_hash (computeHash)
            // 2. state_hash (computeHash)
            // 3. combined_hash (computeHash) -> Final Hash
            // 4. combined_hash (computeHash) -> Verification Hash

            // To be robust, we sabotage the 4th update/digest.
            // But we can simply sabotage the `digest` function of the 4th hash.

            const originalUpdate = hash.update.bind(hash);
            hash.update = (data) => {
                originalUpdate(data);
                return hash;
            };

            const originalDigest = hash.digest.bind(hash);
            hash.digest = (enc) => {
                callCount++;
                let res = originalDigest(enc);
                if (callCount === 4) { // 4th hash is the recheck
                    return 'sabotaged_hash_value';
                }
                return res;
            };

            return hash;
        });

        const input = createBaseInput();
        const result = await execute(input);

        expect(result.ok).toBe(false);
        expect(result.status).toBe('INTEGRITY_MISMATCH');
        expect(result.contract).toBe('commit_seal_engine_v1');

        spy.mockRestore();
    });

});
