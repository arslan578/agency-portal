const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Phase 61: Execution Envelope Closure Engine
 * 
 * Freezes the execution envelope into a deterministic, immutable "closed envelope".
 * Pure logic, deterministic, no IO.
 */

/**
 * Deep clone helper
 */
function deepClone(obj) {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj || null));
}

/**
 * Deterministic Key Sorting (Recursive)
 */
function sortKeysDeep(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }
    if (value && typeof value === 'object') {
        const sorted = {};
        Object.keys(value).sort().forEach((k) => {
            sorted[k] = sortKeysDeep(value[k]);
        });
        return sorted;
    }
    return value;
}

/**
 * Main Execution Function
 * @param {Object} input - ExecutionEnvelopeClosureInputV1
 * @returns {Promise<Object>} - ExecutionEnvelopeClosureOutputV1
 */
async function execute(input) {
    // 1. Feature Flag Check
    const FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE = process.env.FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE === 'true';

    if (!FF_EXECUTION_ENVELOPE_CLOSURE_ENGINE) {
        // Minimal validation for logging
        const execution_id = input?.execution_id || 'unknown';
        const closure_status = 'SKIPPED_FEATURE_DISABLED';

        logStructured('phase_61_execution_envelope_closure', { execution_id, closure_status, reason: 'FEATURE_DISABLED' });
        metrics.count('phase_61.closure_skipped', 1, { reason: 'FEATURE_DISABLED' });

        // Start span even for skip to track pipeline continuity
        const span = tracing.startSpan('phase_61_execution_envelope_closure', { execution_id, status: closure_status });
        span.end();

        return {
            execution_id,
            phase: '61',
            feature_flags: input?.feature_flags || {}, // Echo input flags or empty
            closure_status,
            closure_issues: [{
                code: 'FEATURE_DISABLED',
                severity: 'INFO',
                message: 'Execution envelope closure skipped because feature flag is disabled.'
            }],
            closed_envelope: deepClone(input?.execution_envelope), // Deep clone input
            closure_summary: {
                has_forbidden_fields: false,
                forbidden_fields_removed: [],
                pii_fields_redacted: [],
                warnings: []
            },
            observability: {
                closure_mode: 'RELAXED', // Default assumption for skipped
                connector_count: 0,
                step_count: 0
            }
        };
    }

    const span = tracing.startSpan('phase_61_execution_envelope_closure', {
        execution_id: input?.execution_id || 'unknown'
    });

    try {
        // 2. Validation
        const validationErrors = [];
        if (!input?.execution_id || typeof input.execution_id !== 'string') {
            validationErrors.push({ code: 'MISSING_FIELD', path: 'execution_id', severity: 'ERROR', message: 'Missing execution_id' });
        }
        if (!input?.execution_envelope || typeof input.execution_envelope !== 'object') {
            validationErrors.push({ code: 'MISSING_FIELD', path: 'execution_envelope', severity: 'ERROR', message: 'Missing execution_envelope' });
        } else {
            const env = input.execution_envelope;
            if (!env.header?.tenant_id) validationErrors.push({ code: 'MISSING_FIELD', path: 'execution_envelope.header.tenant_id', severity: 'ERROR', message: 'Missing tenant_id' });
            if (!env.header?.workspace_id) validationErrors.push({ code: 'MISSING_FIELD', path: 'execution_envelope.header.workspace_id', severity: 'ERROR', message: 'Missing workspace_id' });
            if (!env.plan?.plan_id) validationErrors.push({ code: 'MISSING_FIELD', path: 'execution_envelope.plan.plan_id', severity: 'ERROR', message: 'Missing plan_id' });
            if (!env.plan?.version) validationErrors.push({ code: 'MISSING_FIELD', path: 'execution_envelope.plan.version', severity: 'ERROR', message: 'Missing plan version' });
            if (!Array.isArray(env.plan?.steps)) validationErrors.push({ code: 'INVALID_TYPE', path: 'execution_envelope.plan.steps', severity: 'ERROR', message: 'Steps must be an array' });
        }

        if (validationErrors.length > 0) {
            metrics.count('phase_61.closure_invalid', 1, { reason: 'VALIDATION_FAILED' });
            logStructured('phase_61_execution_envelope_closure', {
                execution_id: input?.execution_id || 'unknown',
                closure_status: 'INVALID_ENVELOPE',
                errors: validationErrors
            });
            span.end();
            return {
                execution_id: input?.execution_id || 'unknown',
                phase: '61',
                feature_flags: input?.feature_flags || {},
                closure_status: 'INVALID_ENVELOPE',
                closure_issues: validationErrors,
                closed_envelope: null,
                closure_summary: {
                    has_forbidden_fields: false,
                    forbidden_fields_removed: [],
                    pii_fields_redacted: [],
                    warnings: []
                },
                observability: { closure_mode: 'STRICT', connector_count: 0, step_count: 0 }
            };
        }

        // 3. Sanitization
        const cloned = deepClone(input.execution_envelope);
        const annotations = cloned.annotations || {};
        const ForbiddenBase = ['raw_input_body', 'internal_debug_payload', 'unredacted_user_input'];
        const forbiddenPaths = [
            ...ForbiddenBase,
            ...(annotations.forbidden_field_paths || []),
            ...(annotations.debug_only_fields || [])
        ];
        const piiPaths = annotations.pii_fields || [];

        const closure_issues = [];
        const forbidden_fields_removed = [];
        const pii_fields_redacted = [];

        // Remove forbidden
        // Deduplicate paths
        const uniqueForbidden = [...new Set(forbiddenPaths)];

        uniqueForbidden.forEach(path => {
            const parts = path.split('.');
            let current = cloned;
            let exists = true;
            for (let i = 0; i < parts.length - 1; i++) {
                current = current[parts[i]];
                if (!current || typeof current !== 'object') { exists = false; break; }
            }
            if (exists && current && Object.prototype.hasOwnProperty.call(current, parts[parts.length - 1])) {
                delete current[parts[parts.length - 1]];
                forbidden_fields_removed.push(path);
                closure_issues.push({
                    code: 'FORBIDDEN_FIELD_REMOVED',
                    path: path,
                    severity: 'INFO',
                    message: `Removed forbidden field at path ${path}`
                });
            }
        });

        // Redact PII
        const uniquePii = [...new Set(piiPaths)];
        uniquePii.forEach(path => {
            // Check if forbidden deletion already nuked it? "Forbidden deletion wins" (EC5)
            // If already deleted, it won't be found.
            const parts = path.split('.');
            let current = cloned;
            let exists = true;
            for (let i = 0; i < parts.length - 1; i++) {
                current = current[parts[i]];
                if (!current || typeof current !== 'object') { exists = false; break; }
            }
            if (exists && current && Object.prototype.hasOwnProperty.call(current, parts[parts.length - 1])) {
                const leaf = parts[parts.length - 1];
                const valid = current[leaf] !== undefined && current[leaf] !== null;
                if (valid) {
                    current[leaf] = '[[REDACTED]]';
                    pii_fields_redacted.push(path);
                    closure_issues.push({
                        code: 'PII_REDACTED',
                        path: path,
                        severity: 'INFO',
                        message: `Redacted PII at path ${path}`
                    });
                }
            }
        });

        // 4. Normalization
        if (!cloned.metadata || typeof cloned.metadata !== 'object') {
            cloned.metadata = {};
        }

        let mode = cloned.metadata.closure_mode;
        if (mode !== 'STRICT' && mode !== 'RELAXED') {
            if (mode) {
                closure_issues.push({
                    code: 'UNKNOWN_CLOSURE_MODE',
                    severity: 'WARN',
                    message: `Unknown closure_mode '${mode}', defaulting to STRICT`
                });
            }
            mode = 'STRICT';
        }
        cloned.metadata.closure_mode = mode;

        const connectors = cloned.connectors || {};
        const connectorCount = Object.keys(connectors).length;
        const steps = (cloned.plan && Array.isArray(cloned.plan.steps)) ? cloned.plan.steps : [];
        const stepCount = steps.length;

        // Sort keys
        const sortedEnvelope = sortKeysDeep(cloned);

        // 5. Output Assembly
        const closure_status = 'CLOSED';
        const closure_summary = {
            has_forbidden_fields: forbidden_fields_removed.length > 0,
            forbidden_fields_removed,
            pii_fields_redacted,
            warnings: closure_issues.filter(i => i.severity === 'WARN').map(i => i.message)
        };
        const observability = {
            closure_mode: mode,
            policy_snapshot_id: sortedEnvelope.policy_context?.policy_snapshot_id,
            policy_version: sortedEnvelope.policy_context?.policy_version,
            connector_count: connectorCount,
            step_count: stepCount
        };

        metrics.count('phase_61.closure_closed', 1, { closure_mode: mode });
        metrics.gauge('phase_61.connector_count', connectorCount);
        metrics.gauge('phase_61.step_count', stepCount);

        logStructured('phase_61_execution_envelope_closure', {
            execution_id: input.execution_id,
            closure_status,
            connector_count: connectorCount,
            step_count: stepCount
        });

        span.end();

        return {
            execution_id: input.execution_id,
            phase: '61',
            feature_flags: input.feature_flags,
            closure_status,
            closure_issues,
            closed_envelope: sortedEnvelope,
            closure_summary,
            observability
        };

    } catch (error) {
        // Unexpected error - should rarely happen in pure logic
        logStructured('phase_61_unexpected_error', { message: error.message, stack: error.stack });
        span.end();
        // Fallback or rethrow? Spec says "Engine never throws".
        // Use INVALID_ENVELOPE as fallback.
        return {
            execution_id: input?.execution_id || 'unknown',
            phase: '61',
            feature_flags: input?.feature_flags || {},
            closure_status: 'INVALID_ENVELOPE',
            closure_issues: [{ code: 'UNEXPECTED_ERROR', severity: 'ERROR', message: error.message }],
            closed_envelope: null,
            closure_summary: {
                has_forbidden_fields: false,
                forbidden_fields_removed: [],
                pii_fields_redacted: [],
                warnings: []
            },
            observability: { closure_mode: 'STRICT', connector_count: 0, step_count: 0 }
        };
    }
}

module.exports = { execute };
