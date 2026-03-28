const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Phase 63: Commit Seal Engine
 * 
 * Applies a cryptographic style commit seal to finalize the execution envelope.
 * Pure logic, no external IO.
 */

const ALGORITHM = 'SHA256_CANONICAL_JSON_V1';
const SEAL_VERSION = 'v1';
const SCOPE = 'EXECUTION_ENVELOPE_AND_STATE_SNAPSHOT_V1';
const PREVIOUS_HASH_SENTINEL = 'NONE';
const CONTRACT_NAME = 'commit_seal_engine_v1';

const FORBIDDEN_FIELDS = ['commit_seal', 'canonical_form', 'archive_pointer'];

/**
 * Deterministic Key Sorting and Normalization Helper
 * 
 * - Rejects undefined, function, symbol, bigint.
 * - Converts Date objects to ISO 8601 strings.
 * - Sorts object keys lexicographically.
 * - Preserves primitives.
 */
function normalizeAndSort(value, path = 'root') {
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
        const sorted = {};
        Object.keys(value).sort().forEach(key => {
            const v = value[key];
            // Explicit check for undefined strictly required by spec/tightening patterns
            if (v === undefined) {
                throw new Error(`Non-serializable type "undefined" at path "${path}.${key}"`);
            }
            sorted[key] = normalizeAndSort(v, `${path}.${key}`);
        });
        return sorted;
    }

    // Primitives
    if (typeof value === 'number') {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            throw new Error(`Non-serializable number "${value}" at path "${path}"`);
        }
    }

    return value;
}

/**
 * Compute SHA-256 hash of a normalized object
 */
function computeHash(normalizedObject) {
    const json = JSON.stringify(normalizedObject);
    return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Main Execute Function
 * @param {Object} input - input_contract_v1
 * @returns {Promise<Object>} - output_contract_v1
 */
async function execute(input) {
    const execution_id = input?.execution_id || 'unknown';

    // 1. Validation (Must happen BEFORE Feature Flags)
    metrics.count('phase_63_invocations_total', 1);
    const span = tracing.startSpan('phase_63_commit_seal', { execution_id });

    try {
        if (!input || typeof input !== 'object') throw new Error('Input must be an object');
        if (input.phase !== '63') throw new Error('Phase mismatch');
        if (!input.execution_id) throw new Error('Missing execution_id');
        if (!input.execution_envelope || typeof input.execution_envelope !== 'object') throw new Error('Missing or invalid execution_envelope');
        if (!input.state_snapshot || typeof input.state_snapshot !== 'object') throw new Error('Missing or invalid state_snapshot');

        // Strict previous_commit_seal type check
        if (input.previous_commit_seal !== undefined &&
            (input.previous_commit_seal === null || typeof input.previous_commit_seal !== 'object')) {
            throw new Error('Invalid previous_commit_seal: must be an object if present');
        }

        // Check for forbidden fields
        for (const field of FORBIDDEN_FIELDS) {
            if (input[field] !== undefined) {
                logStructured('phase_63_commit_seal', {
                    execution_id,
                    phase: '63',
                    status: 'FORBIDDEN_FIELD',
                    feature_flags: input.feature_flags,
                    has_previous_seal: Boolean(input.previous_commit_seal),
                    algorithm: null
                });
                metrics.count('phase_63_invalid_input_total', 1);
                span.end();
                return {
                    execution_id,
                    phase: '63',
                    feature_flags: input.feature_flags,
                    ok: false,
                    status: 'FORBIDDEN_FIELD',
                    contract: CONTRACT_NAME,
                    execution_envelope: input.execution_envelope,
                    state_snapshot: input.state_snapshot
                };
            }
        }

        // 2. Feature Flag Check
        const FF_COMMIT_SEAL_ENGINE = process.env.FF_COMMIT_SEAL_ENGINE === 'true' ||
            (input?.feature_flags?.FF_COMMIT_SEAL_ENGINE === true);

        if (!FF_COMMIT_SEAL_ENGINE) {
            metrics.count('phase_63_feature_disabled_total', 1);
            span.end();
            // Strict output shape: No spread, no extra fields.
            return {
                execution_id: input.execution_id,
                phase: '63',
                feature_flags: input.feature_flags,
                ok: false,
                status: 'FEATURE_DISABLED',
                contract: CONTRACT_NAME,
                execution_envelope: input.execution_envelope,
                state_snapshot: input.state_snapshot
            };
        }

        // 3. Canonicalization & Hashing
        let canonicalEnvelope, canonicalSnapshot;
        try {
            canonicalEnvelope = normalizeAndSort(input.execution_envelope, 'execution_envelope');
            canonicalSnapshot = normalizeAndSort(input.state_snapshot, 'state_snapshot');
        } catch (err) {
            throw err; // Passed to catch block below
        }

        const envelope_hash_v1 = computeHash(canonicalEnvelope);
        const state_hash_v1 = computeHash(canonicalSnapshot);

        // 4. Combined Hash
        const previous_hash = input.previous_commit_seal?.hash || PREVIOUS_HASH_SENTINEL;

        const combinedObject = {
            execution_id: input.execution_id,
            phase: '63',
            envelope_hash_v1,
            state_hash_v1,
            previous_hash
        };

        const canonicalCombined = normalizeAndSort(combinedObject, 'combined_hash_input');
        const finalHash = computeHash(canonicalCombined);

        // Double-Hash Integrity Check (Determinism Guard)
        const finalHashCheck = computeHash(canonicalCombined);
        if (finalHash !== finalHashCheck) {
            logStructured('phase_63_commit_seal', {
                execution_id,
                phase: '63',
                status: 'INTEGRITY_MISMATCH',
                error: 'Hash recomputation mismatch'
            });
            span.end();
            return {
                execution_id,
                phase: '63',
                feature_flags: input.feature_flags,
                ok: false,
                status: 'INTEGRITY_MISMATCH',
                contract: CONTRACT_NAME,
                execution_envelope: input.execution_envelope,
                state_snapshot: input.state_snapshot
            };
        }

        // 5. Construct Commit Seal
        const commit_seal = {
            seal_version: SEAL_VERSION,
            algorithm: ALGORITHM,
            scope: SCOPE,
            hash: finalHash,
            input_fingerprint: {
                execution_id: input.execution_id,
                phase: '63'
            },
            previous_hash,
            sealed_source: {
                envelope_hash_v1,
                state_hash_v1
            }
        };

        // Observability
        const hashLength = finalHash.length;
        metrics.gauge('phase_63_commit_seal_hash_length', hashLength);
        metrics.count('phase_63_sealed_total', 1);

        logStructured('phase_63_commit_seal', {
            execution_id,
            phase: '63',
            status: 'SEALED',
            feature_flags: input.feature_flags,
            has_previous_seal: Boolean(input.previous_commit_seal),
            algorithm: commit_seal.algorithm
        });

        // 6. Return Output
        span.end();
        return {
            execution_id: input.execution_id,
            phase: '63',
            feature_flags: input.feature_flags,
            ok: true,
            status: 'SEALED',
            contract: CONTRACT_NAME,
            execution_envelope: input.execution_envelope,
            state_snapshot: input.state_snapshot,
            commit_seal
        };

    } catch (error) {
        metrics.count('phase_63_invalid_input_total', 1);

        logStructured('phase_63_commit_seal', {
            execution_id,
            phase: '63',
            status: 'INVALID_INPUT',
            feature_flags: input?.feature_flags,
            has_previous_seal: Boolean(input?.previous_commit_seal),
            algorithm: null,
            error: error.message
        });

        span.end();

        return {
            execution_id: input?.execution_id || 'unknown',
            phase: '63',
            feature_flags: input?.feature_flags,
            ok: false,
            status: 'INVALID_INPUT',
            contract: CONTRACT_NAME,
            execution_envelope: input?.execution_envelope,
            state_snapshot: input?.state_snapshot,
            debug: {
                diagnostics: {
                    message: error.message
                }
            }
        };
    }
}

// Export internal helpers for testing if possible, but structure prevents easy export without changing contract. 
// We will mock `computeHash` logic by intercepting crypto if needed, or rely on internal logic.
// The user prompt suggests "mock computeHash to produce mismatch". Since computeHash is local, we can't mock it directly via require.
// We might need to export it or use `rewire` or similar. 
// However, the prompt says "Add a double-hash mismatch unit test by injecting a mock to force mismatched values."
// If I can't export it, I can't mock it easily in Jest without rewiring.
// Standard Node pattern: Export it as `_test_computeHash` or similar? 
// Or I can modify `computeHash` to check a global test flag? No, unsafe.
// I will export it for testing purposes.
module.exports = { execute, contract: CONTRACT_NAME, PREVIOUS_HASH_SENTINEL, _computeHash: computeHash };
