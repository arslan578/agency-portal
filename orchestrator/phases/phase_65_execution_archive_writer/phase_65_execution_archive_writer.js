const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Phase 65: Execution Archive Writer
 * 
 * Consumes sealed, canonical execution artifacts and produces a deterministic archive intent.
 * Pure logic, no IO.
 */

const PHASE = '65';
const CONTRACT_NAME = 'execution_archive_writer_v1';
const FEATURE_FLAG = 'FF_EXECUTION_ARCHIVE_WRITER';

// Forbidden fields to redact/reject
const FORBIDDEN_FIELDS = ['_debug', 'raw_pii', 'unredacted', 'internal_secret', 'password', 'secret'];

/**
 * Recursively sort keys and normalize values for determinism.
 * Validates types (no undefined, function, symbol, bigint, Date).
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
        throw new Error(`Non-serializable type "Date" at path "${path}" (Should have been normalized upstream)`);
    }

    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeAndSort(item, `${path}[${index}]`));
    }

    if (typeof value === 'object') {
        const sorted = {};
        Object.keys(value).sort().forEach(key => {
            // Forbidden field check is primarily done in validation/redaction, but good to have here too
            if (FORBIDDEN_FIELDS.includes(key)) {
                throw new Error(`Forbidden field "${key}" encountered at final sort path "${path}"`);
            }
            sorted[key] = normalizeAndSort(value[key], `${path}.${key}`);
        });
        return sorted;
    }

    if (typeof value === 'bigint') {
        throw new Error(`Non-serializable type "bigint" at path "${path}"`);
    }

    throw new Error(`Unsupported type "${typeof value}" at path "${path}"`);
}

/**
 * Deep clone and redact forbidden fields.
 * Throws on illegal types.
 */
function cloneAndRedact(value, path = 'root') {
    if (value === undefined) throw new Error(`Illegal type "undefined" at "${path}"`);
    if (value === null) return null;

    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        throw new Error(`Illegal type "${typeof value}" at "${path}"`);
    }
    if (value instanceof Date) throw new Error(`Illegal type "Date" at "${path}"`);

    if (typeof value !== 'object') return value;

    if (Array.isArray(value)) {
        return value.map((v, i) => cloneAndRedact(v, `${path}[${i}]`));
    }

    const out = {};
    for (const key of Object.keys(value)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            continue; // Redact
        }
        out[key] = cloneAndRedact(value[key], `${path}.${key}`);
    }
    return out;
}

/**
 * Count redacted fields in input (dry run or check)
 * Useful for observability.
 */
function countRedactedFields(value) {
    let count = 0;
    if (!value || typeof value !== 'object') return 0;

    if (Array.isArray(value)) {
        value.forEach(v => count += countRedactedFields(v));
        return count;
    }

    for (const key of Object.keys(value)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            count++;
        } else {
            count += countRedactedFields(value[key]);
        }
    }
    return count;
}

/**
 * Sanitize segment for archive key
 */
function sanitizeSegment(str) {
    if (typeof str !== 'string') str = String(str);
    return str.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Assert value is a 64-character hex string.
 * Throws with specific error message if invalid.
 */
function assertHex64(value, label) {
    if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-fA-F]+$/.test(value)) {
        throw new Error(`Invalid ${label}`);
    }
}

/**
 * Recursively check for forbidden fields in the entire input object.
 */
function forbiddenCheck(obj, path = 'root') {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) return obj.forEach((v, i) => forbiddenCheck(v, `${path}[${i}]`));
    for (const key of Object.keys(obj)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            throw new Error(`Forbidden field "${key}" at "${path}"`);
        }
        forbiddenCheck(obj[key], `${path}.${key}`);
    }
}

/**
 * Main Execute Function
 */
async function execute(input) {
    const start = Date.now();
    const execution_id = input?.execution_id || 'unknown';
    const tenant_id = input?.tenant_context?.tenant_id || 'unknown';
    const workspace_id = input?.tenant_context?.workspace_id || 'unknown';

    const span = tracing.startSpan('phase_65_execution_archive_writer', {
        execution_id,
        tenant_id,
        workspace_id
    });

    let status = 'OK';
    let approxPayloadBytes = 0;
    let redactedCount = 0;

    try {
        // 1. Feature Flag Check
        const FF_ENABLED = input?.feature_flags?.[FEATURE_FLAG] === true;

        if (!FF_ENABLED) {
            span.end();
            return {
                ok: false,
                status: 'FEATURE_DISABLED',
                execution_id,
                phase: PHASE,
                feature_flags: input?.feature_flags || {}
            };
        }

        // 2. Input Validation (Basic)
        if (!input || typeof input !== 'object') {
            status = 'INVALID_INPUT';
            throw new Error('Input must be an object');
        }

        // 3. Redaction Counting & Forbidden Field Check (Recursive on ALL input)
        // Count first as requested, though strictly we reject right after if found.
        redactedCount = countRedactedFields(input);

        try {
            forbiddenCheck(input);
        } catch (e) {
            status = 'FORBIDDEN_FIELD_PRESENT';
            throw e;
        }

        // 4. Input Validation (Detailed)
        if (input.phase !== PHASE) {
            status = 'INVALID_INPUT';
            throw new Error(`Invalid phase: expected "${PHASE}", got "${input.phase}"`);
        }
        if (!input.execution_id) {
            status = 'INVALID_INPUT';
            throw new Error('Missing execution_id');
        }
        if (!input.tenant_context || !input.tenant_context.tenant_id || !input.tenant_context.workspace_id) {
            status = 'INVALID_INPUT';
            throw new Error('Missing or invalid tenant_context');
        }

        // Required artifacts presence
        if (!input.closed_execution_envelope) { status = 'INVALID_INPUT'; throw new Error('Missing closed_execution_envelope'); }
        if (!input.state_snapshot) { status = 'INVALID_INPUT'; throw new Error('Missing state_snapshot'); }
        if (!input.commit_seal) { status = 'INVALID_INPUT'; throw new Error('Missing commit_seal'); }
        if (!input.canonical_execution_form) { status = 'INVALID_INPUT'; throw new Error('Missing canonical_execution_form'); }

        // Strict Field Validation (Canonical & Commit Seal)
        const cef = input.canonical_execution_form;
        if (!cef.canonical_envelope_json || typeof cef.canonical_envelope_json !== 'string' || cef.canonical_envelope_json.length === 0) {
            status = 'INVALID_INPUT'; throw new Error('Invalid canonical_envelope_json');
        }
        if (!cef.canonical_state_json || typeof cef.canonical_state_json !== 'string' || cef.canonical_state_json.length === 0) {
            status = 'INVALID_INPUT'; throw new Error('Invalid canonical_state_json');
        }
        if (!cef.canonical_envelope_bytes_b64 || typeof cef.canonical_envelope_bytes_b64 !== 'string' || cef.canonical_envelope_bytes_b64.length === 0) {
            status = 'INVALID_INPUT'; throw new Error('Invalid canonical_envelope_bytes_b64');
        }
        if (!cef.canonical_state_bytes_b64 || typeof cef.canonical_state_bytes_b64 !== 'string' || cef.canonical_state_bytes_b64.length === 0) {
            status = 'INVALID_INPUT'; throw new Error('Invalid canonical_state_bytes_b64');
        }

        // Validate Canonical JSON Fields are valid JSON
        try {
            JSON.parse(cef.canonical_envelope_json);
            JSON.parse(cef.canonical_state_json);
        } catch (e) {
            status = 'INVALID_INPUT';
            throw new Error('Canonical JSON fields must contain valid JSON');
        }

        // Hash Validation via assertHex64
        try {
            // Validate seal_type
            if (!input.commit_seal.seal_type || typeof input.commit_seal.seal_type !== 'string' || input.commit_seal.seal_type.trim().length === 0) {
                throw new Error('Invalid commit_seal.seal_type');
            }

            assertHex64(cef.canonical_sha256, 'canonical_sha256');
            assertHex64(cef.structure_sha256, 'structure_sha256');

            // Commit Seal Validation
            if (!input.commit_seal.inputs) { throw new Error('Missing commit_seal.inputs'); }
            assertHex64(input.commit_seal.seal_hex, 'commit_seal.seal_hex');
            assertHex64(input.commit_seal.inputs.envelope_sha256, 'commit_seal.inputs.envelope_sha256');
            assertHex64(input.commit_seal.inputs.state_sha256, 'commit_seal.inputs.state_sha256');
        } catch (e) {
            status = 'INVALID_INPUT';
            throw e;
        }

        // 5. Hash Consistency Check
        const envelopeHash = input.commit_seal.inputs.envelope_sha256;
        const canonicalHash = cef.canonical_sha256;

        if (envelopeHash !== canonicalHash) {
            status = 'HASH_MISMATCH';
            throw new Error(`Hash mismatch: commit_seal (${envelopeHash}) vs canonical (${canonicalHash})`);
        }

        // 6. Archive Key Construction
        const tId = sanitizeSegment(input.tenant_context.tenant_id);
        const wId = sanitizeSegment(input.tenant_context.workspace_id);
        const envName = sanitizeSegment(input.tenant_context.environment || 'unknown');
        const eId = sanitizeSegment(input.execution_id);
        const shortCommit = sanitizeSegment(input.commit_seal.seal_hex.slice(0, 12));

        const archiveKey = `${tId}/${wId}/${envName}/${eId}/commit_${shortCommit}.json`;

        // 7. Build Payload & Metadata
        const hints = input.archive_hints || {};
        const retentionClass = hints.retention_class || 'STANDARD';
        const priority = hints.priority || 'NORMAL';
        const labels = hints.labels || {};

        const archive_metadata = {
            retention_class: retentionClass,
            priority: priority,
            labels: labels,
            created_by_phase: PHASE,
            schema_version: CONTRACT_NAME
        };

        // Redact / Clone
        let payload;
        try {
            payload = {
                execution_id: input.execution_id,
                tenant_context: cloneAndRedact(input.tenant_context, 'tenant_context'),
                closed_execution_envelope: cloneAndRedact(input.closed_execution_envelope, 'closed_execution_envelope'),
                state_snapshot: cloneAndRedact(input.state_snapshot, 'state_snapshot'),
                commit_seal: cloneAndRedact(input.commit_seal, 'commit_seal'),
                canonical_execution_form: cloneAndRedact(input.canonical_execution_form, 'canonical_execution_form'),
                archive_metadata: cloneAndRedact(archive_metadata, 'archive_metadata')
            };
        } catch (e) {
            status = 'INVALID_INPUT'; // Types checks inside cloneAndRedact
            throw e;
        }

        const sortedPayload = normalizeAndSort(payload, 'payload');
        const jsonString = JSON.stringify(sortedPayload);
        approxPayloadBytes = Buffer.byteLength(jsonString, 'utf8');

        // 8. Output Construction
        const output = {
            ok: true,
            status: 'OK',
            execution_id: input.execution_id,
            phase: PHASE,
            feature_flags: input.feature_flags,
            archive_descriptor: {
                archive_key: archiveKey,
                retention_class: retentionClass,
                priority: priority,
                tenant_id: input.tenant_context.tenant_id,
                workspace_id: input.tenant_context.workspace_id,
                brand_id: input.tenant_context.brand_id, // preserve if present (undefined removal happens in JSON stringify or normalize?)
                environment: input.tenant_context.environment || 'unknown',
                canonical_sha256: canonicalHash,
                structure_sha256: cef.structure_sha256,
                commit_seal_type: input.commit_seal.seal_type,
                commit_seal_hex: input.commit_seal.seal_hex,
                approx_payload_bytes: approxPayloadBytes
            },
            archive_intent: {
                archive_version: 'archive_v1',
                archive_key: archiveKey,
                payload: sortedPayload
            },
            observability: {
                metrics: {
                    archive_intent_size_bytes: approxPayloadBytes
                },
                logs: {
                    event_name: 'phase_65_archive_intent_created',
                    severity: 'INFO'
                },
                trace: {
                    span_name: 'phase_65_execution_archive_writer'
                }
            }
        };

        // Remove undefined brand_id cleanly manually before sort so it doesn't cause issues if logic changes
        if (output.archive_descriptor.brand_id === undefined) delete output.archive_descriptor.brand_id;

        // 9. Full Output Deterministic Sort
        const finalOutput = normalizeAndSort(output, 'output');

        // 10. Observability Emission
        metrics.count('phase_65_runs', 1, { status: 'OK' });
        metrics.gauge('phase_65_archive_intent_size_bytes', approxPayloadBytes);

        logStructured('phase_65_execution_archive_writer', {
            execution_id,
            tenant_id,
            workspace_id,
            status: 'OK',
            archive_key: archiveKey,
            retention_class: retentionClass,
            priority,
            redacted_fields_count: redactedCount
        });

        span.end();
        return finalOutput;

    } catch (error) {
        // ... (Error handling block remains similar, ensure status is preserved if set)
        // Ensure unexpected errors are INTERNAL_ERROR
        if (!['FEATURE_DISABLED', 'INVALID_INPUT', 'FORBIDDEN_FIELD_PRESENT', 'HASH_MISMATCH'].includes(status)) {
            status = 'INTERNAL_ERROR';
        }

        metrics.count('phase_65_runs', 1, { status });
        logStructured('phase_65_execution_archive_writer_error', {
            execution_id,
            status,
            error: error.message
        });

        span.end();

        return {
            ok: false,
            status: status,
            execution_id: input?.execution_id || execution_id,
            phase: PHASE,
            feature_flags: input?.feature_flags || {}
        };
    }
}

module.exports = { execute };
