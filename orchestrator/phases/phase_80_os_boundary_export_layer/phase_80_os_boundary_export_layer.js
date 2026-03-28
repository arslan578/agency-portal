"use strict";

const { createHash } = require("crypto");
const { logStructured } = require("../../shared/logging");
const metrics = require("../../shared/metrics");
const tracing = require("../../shared/tracing");

const PHASE_ID = "80";
const FEATURE_FLAG = "FF_OS_BOUNDARY_EXPORT_LAYER";
const FORBIDDEN_FIELDS = ['_debug', 'debug_info', 'internal_only'];

/**
 * Phase 80: Final OS Boundary Export Layer
 *
 * Terminal phase of the orchestrator.
 * Bridges execution artifacts into the Kaivo OS subsystem.
 * Pure logic, deterministic, replay-safe.
 */
function execute(input) {
    let span;
    try {
        if (!input || typeof input !== 'object') {
            return validationError(input, 'INVALID_INPUT', 'Input must be a non-null object');
        }

        const safeExecId = (input.execution_id && typeof input.execution_id === 'string') ? input.execution_id : 'unknown';
        span = tracing.startSpan("phase_80_os_boundary_export", {
            execution_id: safeExecId,
            phase: PHASE_ID
        });

        // 1. Validation Layer
        const validation = validateContract(input);
        if (validation) return validation;

        // 2. Feature Flag Wrapper
        if (!isFeatureFlagEnabled(input)) {
            logStructured("phase_80_os_boundary_export", {
                execution_id: safeExecId,
                phase: PHASE_ID,
                status: "DISABLED"
            });
            metrics.count("kaivo_phase_80_disabled_total", 1, { phase: PHASE_ID });
            if (span) span.setAttribute("status", "DISABLED");

            return {
                status: "OK",
                execution_id: safeExecId,
                os_export: { bypass: true }
            };
        }

        // 3. Deterministic Export Bundle Constructor
        const exportBundle = constructExportBundle(input);

        // 4. Deterministic Package Manifest
        const packageManifest = constructPackageManifest(input);

        // 5. Output Construction
        // FH Rules: Sorted keys, replay-stable.
        const osExport = {
            package_manifest: sortKeys(packageManifest),
            export_bundle: sortKeys(exportBundle),
            version: "1.0.0",
            exported_at_logical_clock: input.metadata.logical_clock_vector.export
        };

        const output = {
            status: "OK",
            execution_id: safeExecId,
            os_export: sortKeys(osExport)
        };

        // 6. Observability
        logStructured("phase_80_os_boundary_export", {
            event: "phase_80_export",
            execution_id: safeExecId,
            phase: PHASE_ID,
            status: "OK"
        });
        metrics.count("phase_80_export.count", 1, { phase: PHASE_ID, status: "OK" });
        if (span) span.setAttribute("status", "OK");

        return output;

    } catch (err) {
        logStructured("phase_80_os_boundary_export", {
            execution_id: input?.execution_id || 'unknown',
            phase: PHASE_ID,
            status: "ERROR",
            error: err.message
        });
        if (span) span.setAttribute("status", "ERROR");
        return buildErrorResponse(input, "INTERNAL_ERROR", err.message);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Helper Logic
// -----------------------------------------------------------------------------

function validateContract(input) {
    const required = [
        'execution_id', 'phase', 'feature_flags', 'sealed_envelope',
        'canonical_form', 'archive_entry', 'state_evolution',
        'formal_execution_model', 'tenant_context', 'metadata'
    ];

    for (const field of required) {
        if (input[field] === undefined) {
            return validationError(input, 'MISSING_FIELD', `Missing required field: ${field}`);
        }
    }

    if (input.phase !== PHASE_ID) {
        return validationError(input, 'INVALID_PHASE', `Invalid phase ${input.phase}`);
    }

    // Forbidden Check
    try {
        checkForForbidden(input);
    } catch (e) {
        return validationError(input, 'FORBIDDEN_FIELD', e.message);
    }

    // TP1.1 Strict Nested Validation
    if (!input.archive_entry || typeof input.archive_entry.archive_id !== 'string' || !input.archive_entry.archive_id.length) {
        return validationError(input, 'INVALID_ARCHIVE_ENTRY', 'archive_entry.archive_id must be a non-empty string');
    }

    if (!input.metadata || !input.metadata.logical_clock_vector ||
        typeof input.metadata.logical_clock_vector.export !== 'number' ||
        !Number.isFinite(input.metadata.logical_clock_vector.export)) {
        return validationError(input, 'INVALID_LOGICAL_CLOCK', 'metadata.logical_clock_vector.export must be a finite number');
    }

    if (typeof input.state_evolution !== 'object' || input.state_evolution === null) {
        return validationError(input, 'INVALID_STATE_EVOLUTION', 'state_evolution must be a non-null object');
    }

    if (typeof input.formal_execution_model !== 'object' || input.formal_execution_model === null) {
        return validationError(input, 'INVALID_EXEC_MODEL', 'formal_execution_model must be a non-null object');
    }

    return null;
}

function constructExportBundle(input) {
    // Keys must be lexicographically sorted in the final sortKeys call, 
    // but we construct the object here.

    // Hash computation for envelope and canonical form
    const envelopeSha = computeHash(input.sealed_envelope);
    const canonicalSha = computeHash(input.canonical_form);

    return {
        envelope_sha256: envelopeSha,
        canonical_sha256: canonicalSha,
        archive_ref: input.archive_entry.archive_id,
        connector_state_vector: input.state_evolution.connector_state_vector || {},
        policy_gradient_vector: input.state_evolution.policy_gradient_vector || {},
        safety_horizon_vector: input.state_evolution.safety_horizon_vector || {},
        delta_trace_vector: input.formal_execution_model.delta_trace_vector || {},
        replay_model_ref: input.formal_execution_model.replay_model_ref || {}
    };
}

function constructPackageManifest(input) {
    return {
        package_id: "kaivo_execution_export",
        version: "1.0.0",
        execution_id: input.execution_id,
        tenant_context: input.tenant_context,
        capabilities: {
            provides: [
                "canonical_execution_form",
                "sealed_envelope_export",
                "audit_replay_bundle",
                "state_evolution_vectors"
            ],
            requires: []
        },
        dependency_vector: {
            requires_os: ">1.0.0",
            requires_kernel: ">1.0.0"
        }
    };
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function isFeatureFlagEnabled(input) {
    return !!(input.feature_flags && input.feature_flags[FEATURE_FLAG]);
}

function validationError(input, code, message) {
    return buildErrorResponse(input, code, message);
}

function buildErrorResponse(input, code, message) {
    const safeExecId = (input && typeof input === 'object' && input.execution_id) ? input.execution_id : 'unknown';
    return {
        status: "ERROR",
        execution_id: safeExecId,
        os_export: {},
        errors: [{ code, message }]
    };
}

function checkForForbidden(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            throw new Error(`Forbidden field ${key} present`);
        }
        if (obj[key] === undefined) {
            throw new Error(`Undefined value at ${key}`);
        }
        const val = obj[key];
        if (val instanceof Date) throw new Error("Date object forbidden");
        if (typeof val === 'object') checkForForbidden(val, path ? `${path}.${key}` : key);
    }
}

function sortKeys(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sortKeys);

    const sorted = {};
    Object.keys(value).sort().forEach(k => {
        sorted[k] = sortKeys(value[k]);
    });
    return sorted;
}

function computeHash(obj) {
    const norm = sortKeys(obj);
    return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

module.exports = { execute };
