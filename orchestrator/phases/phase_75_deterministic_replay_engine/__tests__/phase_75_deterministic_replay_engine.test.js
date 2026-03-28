"use strict";

const { execute } = require('../phase_75_deterministic_replay_engine');
const { createHash } = require('crypto');

// Mock shared modules
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../../shared/metrics', () => ({
    count: jest.fn()
}));
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

const BASE_INPUT = {
    execution_id: 'exec_75_test',
    phase: '75',
    feature_flags: { FF_DETERMINISTIC_REPLAY_ENGINE: true },
    sealed_envelope: {
        commit_seal: {
            seal_id: 'seal_123',
            canonical_sha256: 'WILL_BE_CALCULATED_BELOW',
            structure_sha256: 'abc'
        }
    },
    archive_payload: {
        canonical_execution_form: {
            canonical_trace: {
                version: 'canonical_trace_v1',
                steps: []
            }
        },
        trace_delta_bundle: {
            version: 'trace_delta_v1',
            deltas: []
        },
        state_snapshot: {
            version: 'state_snapshot_v1',
            snapshot: { state: 'initial' }
        }
    },
    replay_request: {
        mode: 'FULL',
        filters: {},
        verify_only: false,
        reconstruct_only: false
    }
};

// Helper to compute hash for tests
function computeHash(obj) {
    // Normalize date
    const replacer = (key, value) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return Object.keys(value).sort().reduce((sorted, k) => {
                sorted[k] = value[k];
                return sorted;
            }, {});
        }
        return value;
    };
    // Simple normalization for test setup
    // We need to match the engine's rigorous normalization
    let json = JSON.stringify(obj);
    // Cheat slightly: we know the engine normalizes. We should use a helper if we were strict. 
    // Instead, let's just make input objects clean.
    return createHash('sha256').update(json).digest('hex');
}

/**
 * Normalization helper for test data setup to ensure hashes match engine expectations
 */
function normalizeForHash(obj) {
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(normalizeForHash);
    if (typeof obj === 'object' && obj !== null) {
        const sorted = {};
        Object.keys(obj).sort().forEach(k => {
            sorted[k] = normalizeForHash(obj[k]);
        });
        return sorted;
    }
    return obj;
}


describe('Phase 75: Deterministic Replay Engine', () => {

    // Setup Valid Hash for BASE_INPUT
    beforeEach(() => {
        const cleanTrace = normalizeForHash(BASE_INPUT.archive_payload.canonical_execution_form.canonical_trace);
        const hash = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');
        BASE_INPUT.sealed_envelope.commit_seal.canonical_sha256 = hash;
    });

    // ---------------------------------------------------------------------------
    // Happy Path (8)
    // ---------------------------------------------------------------------------

    test('HP-1: simpleOneStepReplay - Full Reconstruction', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const delta = { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'REQ', payload_delta: { foo: 'bar' } };
        const expectedStep = { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'REQ', payload: { foo: 'bar' } };

        input.archive_payload.trace_delta_bundle.deltas = [delta];
        input.archive_payload.canonical_execution_form.canonical_trace.steps = [expectedStep];

        // update hash
        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        input.sealed_envelope.commit_seal.canonical_sha256 = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');

        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.verification_report.status).toBe('MATCH');
        expect(output.replay_trace.steps).toHaveLength(1);
        expect(output.replay_trace.steps[0].connector_id).toBe('meta');
    });

    test('HP-2: multiStepMultiConnector - Full Replay', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const deltas = [
            { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'A', payload_delta: { a: 1 } },
            { step_index: 1, phase: '58', connector_id: 'google', event_type: 'B', payload_delta: { b: 2 } }
        ];
        const expectedSteps = [
            { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'A', payload: { a: 1 } },
            { step_index: 1, phase: '58', connector_id: 'google', event_type: 'B', payload: { b: 2 } }
        ];

        input.archive_payload.trace_delta_bundle.deltas = deltas;
        input.archive_payload.canonical_execution_form.canonical_trace.steps = expectedSteps;

        // update hash
        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        input.sealed_envelope.commit_seal.canonical_sha256 = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');

        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.verification_report.status).toBe('MATCH');
        expect(output.replay_trace.steps).toHaveLength(2);
        expect(output.replay_trace.steps[1].connector_id).toBe('google');
    });

    test('HP-3: partialReplayPhaseRange', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const steps = [
            { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'A', payload_delta: {} },
            { step_index: 1, phase: '58', connector_id: 'meta', event_type: 'B', payload_delta: {} },
            { step_index: 2, phase: '59', connector_id: 'meta', event_type: 'C', payload_delta: {} }
        ];
        input.archive_payload.trace_delta_bundle.deltas = steps;
        // Canonical stays full, so verification will technically fail mismatch usually, 
        // unless we accept that verify is skipped or we only care about reconstruction output structure here.
        // The Spec HP-3 says: "Replay includes only steps for phases 58 and 59."

        input.replay_request.mode = 'PARTIAL_PHASE_RANGE';
        input.replay_request.filters.phase_range = [58, 59];

        const output = execute(input); // Verification might MISMATCH (length), that's fine for this test focusing on reconstruction

        const replaySteps = output.replay_trace.steps;
        expect(replaySteps).toHaveLength(2);
        expect(replaySteps[0].phase).toBe('58');
        expect(replaySteps[1].phase).toBe('59');
    });

    test('HP-4: partialReplayStepRange', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const steps = [
            { step_index: 0, phase: '57', connector_id: 'c1', event_type: 'E', payload_delta: {} },
            { step_index: 1, phase: '57', connector_id: 'c2', event_type: 'E', payload_delta: {} },
            { step_index: 2, phase: '57', connector_id: 'c3', event_type: 'E', payload_delta: {} }
        ];
        input.archive_payload.trace_delta_bundle.deltas = steps;

        input.replay_request.mode = 'PARTIAL_STEP_RANGE';
        input.replay_request.filters.step_range = [1, 1]; // Only step 1

        const output = execute(input);
        const replaySteps = output.replay_trace.steps;
        expect(replaySteps).toHaveLength(1);
        expect(replaySteps[0].step_index).toBe(1);
    });

    test('HP-5: replayWithConnectorFilter', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const steps = [
            { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'E', payload_delta: {} },
            { step_index: 1, phase: '57', connector_id: 'google', event_type: 'E', payload_delta: {} }
        ];
        input.archive_payload.trace_delta_bundle.deltas = steps;

        input.replay_request.filters.connector_ids = ['meta'];

        const output = execute(input);
        const replaySteps = output.replay_trace.steps;
        expect(replaySteps).toHaveLength(1);
        expect(replaySteps[0].connector_id).toBe('meta');
    });

    test('HP-6: verifyOnlyMode', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // Valid data
        const delta = { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'A', payload_delta: {} };
        const expectedStep = { step_index: 0, phase: '57', connector_id: 'meta', event_type: 'A', payload: {} };

        input.archive_payload.trace_delta_bundle.deltas = [delta];
        input.archive_payload.canonical_execution_form.canonical_trace.steps = [expectedStep];

        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        input.sealed_envelope.commit_seal.canonical_sha256 = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');

        input.replay_request.verify_only = true;

        const output = execute(input);
        expect(output.replay_trace.steps).toHaveLength(0); // Should be empty/omitted
        expect(output.verification_report.status).toBe('VERIFY_ONLY');
        expect(output.verification_report.mismatch_count).toBe(0);
    });

    test('HP-7: reconstructOnlyMode', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.replay_request.reconstruct_only = true;

        const steps = [{ step_index: 0, phase: '57', connector_id: 'meta', event_type: 'A', payload_delta: {} }];
        input.archive_payload.trace_delta_bundle.deltas = steps;
        // Mismatch canonical to prove verification is skipped
        input.archive_payload.canonical_execution_form.canonical_trace.steps = [];

        const output = execute(input);
        expect(output.replay_trace.steps).toHaveLength(1);
        expect(output.verification_report.status).toBe('RECONSTRUCT_ONLY');
    });

    test('HP-8: sealMatchHappyPath', () => {
        // Already covered by HP-1 setup essentially, but explicit here
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // Provide blank but valid trace
        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        const hash = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');
        input.sealed_envelope.commit_seal.canonical_sha256 = hash;

        const output = execute(input);
        expect(output.verification_report.seal_verification.status).toBe('MATCH');
        expect(output.verification_report.seal_verification.actual_sha256).toBe(hash);
    });

    // ---------------------------------------------------------------------------
    // Negative Path (6)
    // ---------------------------------------------------------------------------

    test('NP-1: invalidInputNotObject', () => {
        const output = execute(null);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('INVALID_INPUT_CONTRACT');
    });

    test('NP-2: missingRequiredFieldExecutionId', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.execution_id;
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].message).toMatch(/execution_id/);
    });

    test('NP-3: wrongPhaseValue', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.phase = '74';
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].message).toMatch(/Invalid phase/);
    });

    test('NP-4: forbiddenTopLevelFieldPresent', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input._debug = true;
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].message).toMatch(/Forbidden field/);
    });

    test('NP-5: unsupportedReplayMode', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.replay_request.mode = 'BAD_MODE';
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].message).toMatch(/Invalid replay mode/);
    });

    test('NP-6: invalidArchivePayloadShape', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.archive_payload.trace_delta_bundle;
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].code).toBe('INVALID_ARCHIVE_STRUCTURE');
    });

    // ---------------------------------------------------------------------------
    // Edge Case Tests (4)
    // ---------------------------------------------------------------------------

    test('EC-1: emptyDeltaArrayFullMode', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.archive_payload.trace_delta_bundle.deltas = [];
        input.archive_payload.canonical_execution_form.canonical_trace.steps = [];

        // update hash
        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        input.sealed_envelope.commit_seal.canonical_sha256 = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');

        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.replay_trace.steps).toHaveLength(0);
        expect(output.verification_report.status).toBe('MATCH');
    });

    test('EC-2: strictValidationRejectsUndefined', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.archive_payload.state_snapshot.snapshot = { bad: undefined };
        // This assumes normalizeAndSort is called and throws
        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.errors[0].message).toMatch(/Undefined value/);
    });

    test('EC-3: Non-contiguous steps (not enforced failure, but mismatch check)', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const deltaSteps = [
            { step_index: 0, phase: '57', connector_id: 'a', event_type: 'E', payload_delta: {} },
            { step_index: 2, phase: '57', connector_id: 'b', event_type: 'E', payload_delta: {} } // Skips 1
        ];
        input.archive_payload.trace_delta_bundle.deltas = deltaSteps;
        // Canonical expects contiguous 0, 1, 2 typically, OR just that they match.
        // If canonical also has 0, 2, it matches. 
        // But usually canonical implies continuous execution. 
        // Let's assume canonical has 0, 1, 2
        input.archive_payload.canonical_execution_form.canonical_trace.steps = [
            { step_index: 0, phase: '57', connector_id: 'a', event_type: 'E', payload_delta: {} },
            { step_index: 1, phase: '57', connector_id: 'missing', event_type: 'E', payload_delta: {} },
            { step_index: 2, phase: '57', connector_id: 'b', event_type: 'E', payload_delta: {} }
        ];

        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        input.sealed_envelope.commit_seal.canonical_sha256 = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');

        const output = execute(input);
        // Length differs (2 vs 3) -> Mismatch
        expect(output.verification_report.status).toBe('MISMATCH');
        expect(output.verification_report.mismatch_count).toBeGreaterThan(0);
    });

    test('EC-4: Seal Mismatch', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.sealed_envelope.commit_seal.canonical_sha256 = 'bad_hash';
        const output = execute(input);
        expect(output.verification_report.seal_verification.status).toBe('MISMATCH');
        expect(output.verification_report.status).toBe('MISMATCH');
    });

    // ---------------------------------------------------------------------------
    // Guards (2)
    // ---------------------------------------------------------------------------

    test('Guard-1: regressionKeepZeroPayloadValues', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        const payload = { val: 0, str: '', nul: null };
        const step = { step_index: 0, phase: '57', connector_id: 'a', event_type: 'E', payload_delta: payload };

        input.archive_payload.trace_delta_bundle.deltas = [step];
        input.archive_payload.canonical_execution_form.canonical_trace.steps = [step];

        // Hash works
        const cleanTrace = normalizeForHash(input.archive_payload.canonical_execution_form.canonical_trace);
        input.sealed_envelope.commit_seal.canonical_sha256 = createHash('sha256').update(JSON.stringify(cleanTrace)).digest('hex');

        const output = execute(input);
        expect(output.status).toBe('OK');
        const outPayload = output.replay_trace.steps[0].payload;
        expect(outPayload.val).toBe(0);
        expect(outPayload.str).toBe('');
        expect(outPayload.nul).toBeNull();
    });

    test('Guard-2: Determinism Across 100 Runs', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // Add some complex data
        input.state_snapshot = { a: 1, b: [3, 2, 1], c: { y: 2, x: 1 } };

        let prevHash = null;
        for (let i = 0; i < 100; i++) {
            const out = execute(input);
            const hash = createHash('sha256').update(JSON.stringify(out)).digest('hex');
            if (prevHash && hash !== prevHash) {
                throw new Error('Non-deterministic output detected');
            }
            prevHash = hash;
        }
        expect(true).toBe(true);
    });

});
