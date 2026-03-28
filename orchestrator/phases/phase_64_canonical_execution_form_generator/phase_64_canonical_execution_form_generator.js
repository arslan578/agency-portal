const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Phase 64: Canonical Execution Form Generator
 * 
 * Takes the sealed envelope and deterministic snapshot from Phase 63 and produces a canonical execution form.
 * Pure logic, no external IO.
 */

const PHASE = '64';
const CONTRACT_NAME = 'canonical_execution_form_generator_v1';

// Forbidden types and fields
const FORBIDDEN_FIELDS = ['_debug'];

/**
 * Recursively sort keys and normalize values for determinism.
 * 
 * Rules:
 * - Undefined, Function, Symbol -> Throw Error
 * - Date -> ISO String
 * - Number -> Strict JSON number (JS default behavior is mostly fine, but we ensure no NaN/Infinity)
 * - Object -> Sort keys
 * - Array -> Preserve order (if meaningful) or sort? 
 *   Per Phase 64 spec: array order is preserved unless explicitly defined otherwise.
 *   Clarification in spec 4.1: "Since ordering in arrays is generally significant in execution envelopes, we preserve array order but recurse into elements."
 *   So we will preserve array order.
 */
function normalizeAndSort(value, path = 'root') {
    if (value === undefined) {
        throw new Error(`Non-serializable type "undefined" at path "${path}"`);
    }
    if (value === null) return null;

    if (typeof value === 'function' || typeof value === 'symbol') {
        throw new Error(`Non-serializable type "${typeof value}" at path "${path}"`);
    }

    if (typeof value === 'boolean') return value;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error(`Non-serializable number "${value}" at path "${path}"`);
        }
        return value;
    }

    if (typeof value === 'string') return value;

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeAndSort(item, `${path}[${index}]`));
    }

    if (typeof value === 'object') {
        // Forbidden field check for objects (though top-level input check handles most, this is safe)
        // Spec 3.1 says forbidden fields are "top-level" or "any field named _debug"
        // Let's enforce strictness.
        const sorted = {};
        Object.keys(value).sort().forEach(key => {
            if (key === '_debug') {
                throw new Error('Forbidden field "_debug"');
            }
            // Explicit check for undefined property value
            if (value[key] === undefined) {
                throw new Error(`Non-serializable type "undefined" at path "${path}.${key}"`);
            }
            sorted[key] = normalizeAndSort(value[key], `${path}.${key}`);
        });
        return sorted;
    }

    // BigInt not supported in standard JSON
    if (typeof value === 'bigint') {
        throw new Error(`Non-serializable type "bigint" at path "${path}"`);
    }

    throw new Error(`Unsupported type "${typeof value}" at path "${path}"`);
}

/**
 * Compute SHA-256 hash
 */
function sha256(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Main Execute Function
 * @param {Object} input - input_contract_v1
 * @returns {Promise<Object>} - output_contract_v1
 */
async function execute(input) {
    const execution_id = input?.execution_id || 'unknown';
    const span = tracing.startSpan('canonical_execution_form', { execution_id });

    // Default Status
    let status = 'OK';
    let canonicalBytesLen = 0;

    try {
        // 1. Input Validation (Basic Contract)
        if (!input || typeof input !== 'object') {
            status = 'ERROR_MISSING_FIELD';
            throw new Error('Input must be an object');
        }

        if (!input.execution_id) {
            status = 'ERROR_MISSING_FIELD';
            throw new Error('Missing execution_id');
        }

        if (input.phase !== PHASE) {
            status = 'ERROR_UNSERIALIZABLE_TYPE';
            throw new Error(`Invalid phase: expected "${PHASE}", got "${input.phase}"`);
        }

        if (!input.feature_flags) {
            status = 'ERROR_MISSING_FIELD';
            throw new Error('Missing feature_flags');
        }

        // 2. Feature Flag Check (Early Return)
        // Spec: The feature flag is evaluated only after contract validation.
        // But Spec also says "If flag is OFF -> return FEATURE_DISABLED without performing canonicalization"
        // And patch prompt says: "Move the feature-flag check earlier, but after verifying: input is object, execution_id, phase, feature_flags".

        const FF_ENABLED = input.feature_flags.FF_CANONICAL_EXECUTION_FORM_GENERATOR === true ||
            process.env.FF_CANONICAL_EXECUTION_FORM_GENERATOR === 'true';

        if (!FF_ENABLED) {
            metrics.count('canonical_form_failures', 1, { reason: 'feature_disabled' });
            span.end();
            return {
                execution_id: input.execution_id,
                phase: PHASE,
                feature_flags: input.feature_flags,
                status: 'FEATURE_DISABLED'
            };
        }

        // 3. Complete Input Validation (Sealed Envelope)
        if (!input.sealed_envelope || typeof input.sealed_envelope !== 'object') {
            status = 'ERROR_MISSING_FIELD';
            throw new Error('Missing sealed_envelope');
        }

        const env = input.sealed_envelope;
        if (!env.closure_envelope || !env.state_snapshot || !env.commit_seal) {
            status = 'ERROR_MISSING_FIELD';
            throw new Error('sealed_envelope missing required components');
        }

        // Forbidden fields check (top-level check)
        if (input._debug) {
            status = 'ERROR_UNSERIALIZABLE_TYPE';
            throw new Error('Forbidden field "_debug"');
        }

        // 4. Canonicalization
        let canonicalJsonObj;
        try {
            canonicalJsonObj = normalizeAndSort(input.sealed_envelope, 'sealed_envelope');
        } catch (err) {
            status = 'ERROR_UNSERIALIZABLE_TYPE';
            throw err;
        }

        // 5. Hashing & Encoding
        const jsonString = JSON.stringify(canonicalJsonObj);
        const structure_sha256 = sha256(jsonString);

        // canonical_bytes: The UTF-8 encoded bytes of the canonical JSON string, then base64 encoded.
        const buffer = Buffer.from(jsonString, 'utf8');
        const canonical_bytes = buffer.toString('base64');
        canonicalBytesLen = buffer.length;

        const canonical_sha256 = sha256(canonical_bytes);

        // Determinism Check (Guard)
        const checkJson = JSON.stringify(normalizeAndSort(input.sealed_envelope));
        if (checkJson !== jsonString) {
            status = 'ERROR_NON_DETERMINISTIC';
            throw new Error('Non-deterministic canonicalization detected');
        }

        // 6. Output Construction (Strict Order)
        const output = {
            execution_id: input.execution_id,
            phase: PHASE,
            feature_flags: input.feature_flags,
            canonical_form: {
                version: '1',
                canonical_bytes,
                canonical_json: canonicalJsonObj,
                hashes: {
                    canonical_sha256,
                    structure_sha256
                }
            },
            status: 'OK'
        };

        // 7. Observability
        metrics.count('canonical_form_generated', 1);
        metrics.gauge('canonical_form_bytes', canonicalBytesLen);

        logStructured('canonical_execution_form_generated', {
            execution_id: input.execution_id,
            phase: PHASE,
            canonical_bytes_length: canonicalBytesLen,
            status: 'OK'
        });

        span.end();
        return output;

    } catch (error) {
        metrics.count('canonical_form_failures', 1, { status });

        logStructured('canonical_execution_form_generated', {
            execution_id,
            phase: PHASE,
            canonical_bytes_length: 0,
            status: status || 'ERROR_UNKNOWN', // Fallback status if error thrown before set
            error: error.message
        });

        span.end();

        return {
            execution_id: input?.execution_id || execution_id,
            phase: PHASE,
            feature_flags: input?.feature_flags || {},
            status
        };
    }
}

module.exports = { execute };
