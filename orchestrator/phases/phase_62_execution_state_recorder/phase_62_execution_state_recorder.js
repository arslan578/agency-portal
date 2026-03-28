const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Phase 62: Execution State Recorder
 * 
 * Creates a deterministic, serializable state snapshot for replay and diagnostics.
 * Pure logic, no external IO.
 */

// Feature Flag check executed at runtime inside execute()

/**
 * Deterministic Key Sorting and Normalization
 * Recurses through object, sorts keys, converts Dates to ISO strings.
 * Throws error on non-serializable types if strict check is needed, 
 * but JSON.stringify will handle most. We explicitly check though per spec.
 */
function normalizeAndSort(value, path = 'root') {
    // Spec requires: undefined must never appear anywhere in snapshot
    if (value === undefined) {
        throw new Error(`Non-serializable type "undefined" at path "${path}"`);
    }

    if (value === null) {
        return null;
    }

    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        throw new Error(`Non-serializable type "${typeof value}" at path "${path}"`);
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeAndSort(item, `${path}[${index}]`));
    }

    if (typeof value === 'object') {
        // Handle specific object types that shouldn't be here if simple JSON
        // buffer, etc? Spec says "closed_envelope" is input, which is JSON-like.
        // We assume standard objects.

        const sorted = {};
        Object.keys(value).sort().forEach(key => {
            const v = value[key];
            if (v === undefined) {
                throw new Error(`Non-serializable type "undefined" at path "${path}.${key}"`);
            }
            sorted[key] = normalizeAndSort(v, `${path}.${key}`);
        });
        return sorted;
    }

    // Primitives (string, number, boolean)
    if (typeof value === 'number') {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            // JSON.stringify converts these to null, but spec says "No non-serializable values"
            // Strict interpretation: reject if we want strict replay safety? 
            // Spec says: "All fields must be JSON-serializable primitives (no undefined, NaN, Infinity...)"
            throw new Error(`Non-serializable number "${value}" at path "${path}"`);
        }
    }

    return value;
}

/**
 * Recursively count leaf fields
 */
function countFields(value) {
    if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
            return value.reduce((acc, item) => acc + countFields(item), 0);
        }
        return Object.values(value).reduce((acc, item) => acc + countFields(item), 0);
    }
    return 1; // Leaf
}

/**
 * Recursively check for forbidden fields
 */
function assertNoForbiddenFields(obj, path = 'root') {
    if (!obj || typeof obj !== 'object') return;

    const forbidden = ['snapshot', 'raw_request', 'raw_response'];

    for (const key of Object.keys(obj)) {
        if (forbidden.includes(key)) {
            throw new Error(`Forbidden field "${key}" at path "${path}.${key}"`);
        }
        const child = obj[key];
        if (child && typeof child === 'object') {
            assertNoForbiddenFields(child, `${path}.${key}`);
        }
    }
}

/**
 * Main Execute Function
 * @param {Object} input - input_contract_v1
 * @returns {Promise<Object>} - output_contract_v1
 */
async function execute(input) {
    const execution_id = input?.execution_id || 'unknown';

    // 1. Feature Flag Check
    const FF_EXECUTION_STATE_RECORDER = process.env.FF_EXECUTION_STATE_RECORDER === 'true' &&
        input?.feature_flags?.FF_EXECUTION_STATE_RECORDER === true;

    if (!FF_EXECUTION_STATE_RECORDER) {
        // Brief debug log (allowed)
        // logStructured('phase_62_debug', { message: 'Skipped due to feature flag' }); 

        return {
            ok: false,
            status: 'FEATURE_DISABLED',
            execution_id,
            phase: '62',
            snapshot_contract: 'execution_state_snapshot_v1',
            snapshot: null
        };
    }

    const span = tracing.startSpan('phase_62_execution_state_recorder', { execution_id });

    try {
        // 2. Validation
        if (!input || typeof input !== 'object') throw new Error('Input must be an object');
        if (input.phase !== '62') throw new Error('Phase mismatch');
        if (!input.execution_id) throw new Error('Missing execution_id');
        if (!input.closed_envelope) throw new Error('Missing closed_envelope');

        // Forbidden fields check
        if (input.snapshot || input.raw_request || input.raw_response) {
            logStructured('phase_62_execution_state_recorder', {
                phase: '62',
                execution_id,
                status: 'INVALID_INPUT_FORBIDDEN_FIELDS',
                snapshot_bytes: 0,
                warnings_count: 0
            });
            metrics.count('kaivo.phase62.snapshot_failed', 1, { reason: 'FORBIDDEN_FIELDS' });
            span.end();
            return {
                ok: false,
                status: 'INVALID_INPUT_FORBIDDEN_FIELDS',
                execution_id,
                phase: '62',
                snapshot_contract: 'execution_state_snapshot_v1',
                snapshot: null
            };
        }

        try {
            assertNoForbiddenFields(input.closed_envelope, 'closed_envelope');
        } catch (err) {
            logStructured('phase_62_execution_state_recorder', {
                phase: '62',
                execution_id,
                status: 'INVALID_INPUT_FORBIDDEN_FIELDS',
                snapshot_bytes: 0,
                warnings_count: 0,
                error: err.message
            });
            metrics.count('kaivo.phase62.snapshot_failed', 1, { reason: 'FORBIDDEN_FIELDS_DEEP' });
            span.end();
            return {
                ok: false,
                status: 'INVALID_INPUT_FORBIDDEN_FIELDS',
                execution_id,
                phase: '62',
                snapshot_contract: 'execution_state_snapshot_v1',
                snapshot: null,
                error: {
                    code: 'INVALID_INPUT_FORBIDDEN_FIELDS',
                    message: err.message,
                    path: err.message.match(/path "(.+)"/)?.[1]
                }
            };
        }

        // 3. Normalization & Cloning
        let sortedEnvelope;
        try {
            // This deep clones AND sorts AND validates types
            sortedEnvelope = normalizeAndSort(input.closed_envelope, 'closed_envelope');
        } catch (err) {
            // Catch non-serializable errors
            logStructured('phase_62_execution_state_recorder', {
                phase: '62',
                execution_id,
                status: 'NON_SERIALIZABLE_FIELD',
                snapshot_bytes: 0,
                warnings_count: 0,
                error: err.message
            });
            metrics.count('kaivo.phase62.snapshot_failed', 1, { reason: 'NON_SERIALIZABLE' });
            span.end();
            return {
                ok: false,
                status: 'NON_SERIALIZABLE_FIELD',
                execution_id,
                phase: '62',
                snapshot_contract: 'execution_state_snapshot_v1',
                snapshot: null,
                error: {
                    code: 'NON_SERIALIZABLE_FIELD',
                    message: err.message,
                    path: err.message.includes('path "')
                        ? err.message.split('path "')[1].slice(0, -1)
                        : null
                }
            };
        }

        // 4. Snapshot Construction
        const recordedAt = new Date().toISOString();
        const header = {
            execution_id: input.execution_id,
            snapshot_version: 1,
            recorded_at: recordedAt,
            tenant_id: sortedEnvelope.header?.tenant_id,
            workspace_id: sortedEnvelope.header?.workspace_id,
            brand_id: sortedEnvelope.header?.brand_id,
            run_sequence: sortedEnvelope.header?.run_sequence,
            source_phase: '61',
            manifest_version: sortedEnvelope.header?.manifest_version
        };

        // Projections
        const state_views = {
            connectors: sortedEnvelope.connectors || {},
            policy: sortedEnvelope.policy_context || {}, // inferred mapping
            safety: sortedEnvelope.safety_horizon || {}, // inferred mapping
            optimizer: sortedEnvelope.optimization_plan || {}, // inferred mapping
            timeline: sortedEnvelope.timeline || {} // inferred mapping
        };

        const trace = {
            trace_id: sortedEnvelope.trace_id || input.trace_id, // Fallback if input has it top level? Envelope usually has it.
            span_ids: sortedEnvelope.span_ids || []
        };
        // If empty in envelope, check standard casing
        if (!trace.trace_id && sortedEnvelope.header?.trace_id) trace.trace_id = sortedEnvelope.header.trace_id;

        // 5. Hashing & serialization
        const deterministicJson = JSON.stringify(sortedEnvelope);
        const envelope_hash = crypto.createHash('sha256').update(deterministicJson).digest('hex');

        // Construct full snapshot object
        const snapshot = {
            header,
            envelope_hash,
            closed_envelope: sortedEnvelope,
            state_views,
            trace,
            meta: {
                size_bytes_estimate: 0, // Fill below
                field_count: countFields(sortedEnvelope), // Rough count
                warnings: []
            }
        };

        // 6. Size Check & Final Serialization
        let serialized;

        // Initial estimate with 0
        snapshot.meta.size_bytes_estimate = 0;
        try {
            serialized = JSON.stringify(snapshot);
        } catch (e) {
            throw new Error(`Final serialization failed: ${e.message}`);
        }

        let sizeBytes = Buffer.byteLength(serialized, 'utf8');

        // Refine to account for the digits of the size itself
        // e.g. "size_bytes_estimate":0 (1 digit) -> "size_bytes_estimate":1234 (4 digits) = +3 bytes
        snapshot.meta.size_bytes_estimate = sizeBytes;
        serialized = JSON.stringify(snapshot);
        sizeBytes = Buffer.byteLength(serialized, 'utf8');
        // Set final exact size
        snapshot.meta.size_bytes_estimate = sizeBytes;

        const maxBytes = input.snapshot_hints?.max_bytes ?? 1048576; // 1MB default
        if (sizeBytes > maxBytes) {
            logStructured('phase_62_execution_state_recorder', {
                phase: '62',
                execution_id,
                status: 'SNAPSHOT_TOO_LARGE',
                snapshot_bytes: sizeBytes,
                warnings_count: 0
            });
            metrics.count('kaivo.phase62.snapshot_failed', 1, { reason: 'TOO_LARGE' });
            span.end();
            return {
                ok: false,
                status: 'SNAPSHOT_TOO_LARGE',
                execution_id,
                phase: '62',
                snapshot_contract: 'execution_state_snapshot_v1',
                snapshot: null
            };
        }

        // Warnings hint
        if (input.snapshot_hints?.include_debug_traces === true) {
            snapshot.meta.warnings.push('Debug traces included per hint');
        }

        // 7. Success
        logStructured('phase_62_execution_state_recorder', {
            phase: '62',
            execution_id,
            status: 'OK',
            snapshot_bytes: sizeBytes,
            warnings_count: snapshot.meta.warnings.length
        });
        metrics.count('kaivo.phase62.snapshot_created', 1);
        metrics.gauge('kaivo.phase62.snapshot_bytes', sizeBytes);

        span.end();
        return {
            ok: true,
            status: 'OK',
            execution_id,
            phase: '62',
            snapshot_contract: 'execution_state_snapshot_v1',
            snapshot
        };

    } catch (error) {
        // Catch-all for unexpected errors or invalid input thrown errors
        const status = (error.message === 'Missing execution_id' || error.message === 'Phase mismatch' || error.message === 'Missing closed_envelope')
            ? 'INVALID_INPUT'
            : 'Uncaught Error'; // Or fallback

        logStructured('phase_62_execution_state_recorder', {
            phase: '62',
            execution_id: execution_id,
            status: 'INVALID_INPUT', // If validation failed
            error: error.message
        });
        metrics.count('kaivo.phase62.snapshot_failed', 1, { reason: 'ERROR' });
        span.end();

        return {
            ok: false,
            status: 'INVALID_INPUT', // Simplify generic errors to invalid input if validation failed
            execution_id,
            phase: '62',
            snapshot_contract: 'execution_state_snapshot_v1',
            snapshot: null,
            error: {
                message: error.message
            }
        };
    }
}

module.exports = { execute, contract: 'execution_state_recorder_v1' };
