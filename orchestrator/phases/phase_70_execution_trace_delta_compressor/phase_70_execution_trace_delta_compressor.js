/**
 * Phase 70: Execution Trace Delta Compressor
 * 
 * Role: Formal Execution Model Layer
 * Purpose: Computes minimal deterministic deltas from canonical execution traces.
 * Contract: execution_trace_delta_compressor_v1
 * Mode: Pure Logic (No IO, No Randomness, No Timestamps)
 */

const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

module.exports = { execute };

// --- Constants ---

const PHASE_ID = '70';
const FEATURE_FLAG = 'FF_EXECUTION_TRACE_DELTA_COMPRESSOR';
const REQUIRED_INPUT_KEYS = new Set([
    'execution_id', 'phase', 'feature_flags', 'canonical_trace'
]);

// --- Helper Functions ---

function isSafeType(value) {
    if (value === null) return true;
    if (value === undefined) return false; // Strict
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (value instanceof Date) return false; // Patch 70-TP1: Explicit Date Rejection
    if (Array.isArray(value)) return value.every(isSafeType);
    if (typeof value === 'object') return Object.values(value).every(isSafeType);
    return false; // Functions, Symbols, etc.
}

function hasForbiddenKeys(obj, path = '') {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
        if (key.startsWith('_debug')) return true;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (hasForbiddenKeys(obj[key], `${path}.${key}`)) return true;
        }
    }
    return false;
}

function validateInput(input) {
    if (!input || typeof input !== 'object') {
        return { ok: false, error: 'Invalid input structure' };
    }

    // 1. Strict Key Check
    for (const key of Object.keys(input)) {
        if (!REQUIRED_INPUT_KEYS.has(key)) {
            return { ok: false, error: `Unknown top-level field: ${key}` };
        }
    }

    // 2. Required Fields
    for (const field of REQUIRED_INPUT_KEYS) {
        if (input[field] === undefined) {
            return { ok: false, error: `Missing required field: ${field}` };
        }
    }

    // 3. Type Safety
    if (!isSafeType(input)) {
        // Patch 70-TP1: Date objects trigger INPUT_INVALID
        return { ok: false, error: 'Input contains forbidden types (Undefined, Infinity, Function, Date)' };
    }

    // 4. Forbidden Prefixes
    if (hasForbiddenKeys(input)) {
        return { ok: false, error: 'Input contains forbidden keys starting with _debug' };
    }

    // 5. Phase & Flag
    if (input.phase !== PHASE_ID) {
        return { ok: false, error: `Invalid phase: expected ${PHASE_ID}, got ${input.phase}` };
    }

    if (input.feature_flags[FEATURE_FLAG] !== true) {
        return { ok: false, status: 'FEATURE_DISABLED' };
    }

    // 6. Trace Validation
    if (!input.canonical_trace || !Array.isArray(input.canonical_trace.steps) || input.canonical_trace.steps.length === 0) {
        return { ok: false, error: 'Missing or empty canonical_trace.steps' };
    }

    return null; // Valid
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Minimal Delta Computation
// Returns undefined if identical, or the delta object/value
function computeDelta(prev, curr) {
    if (prev === curr) return undefined;

    // Primitive types (or null) - if different, return curr
    if (prev === null || curr === null || typeof prev !== 'object' || typeof curr !== 'object') {
        return curr;
    }

    // Arrays: Determine minimal delta via full replacement if changed (simplest for deterministic replay)
    // Or recursive diff? Arrays are safer to replace for simple delta logic unless specifically indexed.
    // Spec says "minimal delta". But deeply nested arrays are tricky.
    // Strategy: If array, deep compare. If diff, return full array (safe).
    if (Array.isArray(prev) || Array.isArray(curr)) {
        if (JSON.stringify(prev) === JSON.stringify(curr)) return undefined;
        return curr;
    }

    // Objects: Recursive diff with Deletion Detection (Patch 70-TP1)
    const delta = {};
    let hasChange = false;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

    for (const key of allKeys) {
        const pVal = prev[key];
        const cVal = curr[key];

        if (cVal === undefined) {
            // Patch 70-TP1: Explicit deletion detection
            if (pVal !== undefined) {
                delta[key] = null; // Signal deletion by setting to null
                hasChange = true;
            }
        } else {
            const subDelta = computeDelta(pVal, cVal);
            if (subDelta !== undefined) {
                delta[key] = subDelta;
                hasChange = true;
            }
        }
    }

    return hasChange ? delta : undefined;
}

// Deterministic Sorting
function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);

    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
}

// Invariant Hash
function computeInvariantHash(deltas) {
    const stringified = JSON.stringify(deltas);
    return crypto.createHash('sha256').update(stringified).digest('hex');
}

// --- Core Logic ---

function execute(input) {
    const span = tracing.startSpan('phase_70', { execution_id: input?.execution_id });

    try {
        // 1. Validation
        const valResult = validateInput(input);
        if (valResult) {
            span.end();
            if (valResult.error) {
                return {
                    ok: false,
                    status: 'INPUT_INVALID',
                    execution_id: input?.execution_id || 'unknown',
                    phase: PHASE_ID,
                    deltas: [],
                    invariant_hash: '',
                    error: valResult.error // Helpful context, though output contract strictly defines shape
                };
            }
            // Feature Disabled
            return {
                ok: false,
                status: 'FEATURE_DISABLED',
                execution_id: input.execution_id,
                phase: PHASE_ID,
                deltas: [],
                invariant_hash: ''
            };
        }

        const runId = input.execution_id;

        // Patch 70-TP1: Pre-process steps to enforce sorted keys before delta computation
        // Ensure canonical_trace inputs are normalized
        const sortedTrace = sortKeys(input.canonical_trace);
        const steps = sortedTrace.steps;

        const deltas = [];

        // 2. Delta Computation
        // Step 0: Diff against empty object
        const step0 = steps[0];
        const d0 = {
            step_id: step0.step_id,
            envelope_delta: sortKeys(deepClone(step0.envelope)),
            snapshot_delta: sortKeys(deepClone(step0.snapshot))
        };
        deltas.push(d0);

        // Steps 1..N
        for (let i = 1; i < steps.length; i++) {
            const prev = steps[i - 1];
            const curr = steps[i];

            // Envelope Delta
            const envDelta = computeDelta(prev.envelope, curr.envelope);
            // Snapshot Delta
            const snapDelta = computeDelta(prev.snapshot, curr.snapshot);

            deltas.push({
                step_id: curr.step_id,
                envelope_delta: envDelta ? sortKeys(envDelta) : {},
                snapshot_delta: snapDelta ? sortKeys(snapDelta) : {}
            });
        }

        // 3. Invariant Hash
        const invariantHash = computeInvariantHash(deltas);

        // 4. Observability
        metrics.count('kaivo.phase_70.execution', 1, { execution_id: runId });
        metrics.gauge('kaivo.phase_70.delta_count', deltas.length, { execution_id: runId });

        logStructured('phase_70_execution_trace_delta_compressor', {
            execution_id: runId,
            number_of_steps: steps.length,
            delta_count: deltas.length,
            invariant_hash: invariantHash
        });

        span.end();

        return {
            ok: true,
            status: 'DELTA_COMPUTED',
            execution_id: runId,
            phase: PHASE_ID,
            deltas: deltas, // Sorted by step order, keys sorted internally
            invariant_hash: invariantHash
        };

    } catch (e) {
        span.end();
        return {
            ok: false,
            status: 'INPUT_INVALID',
            execution_id: input?.execution_id || 'unknown',
            phase: PHASE_ID,
            error: `Internal Exception: ${e.message}`,
            deltas: [],
            invariant_hash: ''
        };
    }
}
