"use strict";

const { logStructured } = require("../../shared/logging");
const metrics = require("../../shared/metrics");
const tracing = require("../../shared/tracing");
const { createHash } = require('crypto');

const PHASE_ID = "77";
const FEATURE_FLAG = "FF_TIME_TRAVEL_STATE_RECONSTRUCTOR";

const REQUIRED_INPUT_FIELDS = [
    'execution_id',
    'phase',
    'feature_flags',
    'tenant_context',
    'time_travel_request',
    'state_material',
    'metadata'
];

const FORBIDDEN_FIELDS = [
    '_debug',
    'debug_info',
    'internal_only'
];

/**
 * Phase 77: Time Travel State Reconstructor
 * 
 * Restores historical state at a requested point in time/execution/ledger using
 * pure logic reconstruction from snapshots and compressed deltas.
 */
function execute(input) {
    let span;
    try {
        const safeExecId = (input && typeof input === 'object' && input.execution_id) ? input.execution_id : 'unknown';
        span = tracing.startSpan("PHASE_77_TIME_TRAVEL_STATE_RECONSTRUCTOR", { execution_id: safeExecId });

        // 1. Validation & Feature Flag Check
        validateInput(input);

        if (input.phase !== PHASE_ID) {
            throw { code: 'INVALID_PHASE', message: `phase must equal "${PHASE_ID}"` };
        }

        if (!input.feature_flags[FEATURE_FLAG]) {
            return buildErrorResponse(input, 'FEATURE_FLAG_DISABLED', `Feature flag ${FEATURE_FLAG} is required`);
        }

        const baseline = input.state_material.baseline_snapshot;
        const deltas = input.state_material.deltas || [];
        const replayMaterial = input.state_material.replay_material;
        const constraints = input.constraints || {};

        // 2. Normalize and Sort
        // Normalize input structures? We'll normalize as we process or rely on input being reasonably distinct
        // But for hash outputs we need strictly sorted keys.
        // We'll sort deltas first.
        const sortedDeltas = sortDeltas(deltas);

        // check limits
        if (constraints.max_deltas !== undefined && sortedDeltas.length > constraints.max_deltas) {
            return buildErrorResponse(input, 'DELTA_LIMIT_EXCEEDED', `Candidate deltas count ${sortedDeltas.length} exceeds limit ${constraints.max_deltas}`);
        }

        // 3. Resolve Anchor
        const resolution = resolveAnchor(input.time_travel_request, baseline, sortedDeltas, replayMaterial);

        if (resolution.error) {
            if (input.time_travel_request.strict) {
                return buildErrorResponse(input, resolution.error.code, resolution.error.message);
            }
            // Only BEFORE_BASELINE and AFTER_LAST_DELTA may be clamped.
            // All other anchor errors must return ERROR even when strict=false.
            if (!['ANCHOR_BEFORE_BASELINE', 'ANCHOR_AFTER_LAST_DELTA'].includes(resolution.error.code)) {
                return buildErrorResponse(input, resolution.error.code, resolution.error.message);
            }

            if (['ANCHOR_BEFORE_BASELINE', 'ANCHOR_AFTER_LAST_DELTA'].includes(resolution.error.code)) {
                // Apply clamping
                resolution.resolvedTime = resolution.clampedTime;
                resolution.warnings.push({
                    code: 'ANCHOR_CLAMPED_TO_RANGE',
                    message: resolution.error.message // or generic "Requested anchor ... clamped..."
                });
                resolution.error = null; // Clear error
            } else {
                // This else block is now unreachable due to the new check above.
                // It's kept for now to reflect the exact instruction, but could be removed.
                return buildErrorResponse(input, resolution.error.code, resolution.error.message);
            }
        }

        // Effective Horizon Check
        if (constraints.max_effective_horizon_days) {
            const baseTime = Date.parse(baseline.effective_time);
            const targetTime = Date.parse(resolution.resolvedTime);
            const diffDays = Math.abs(targetTime - baseTime) / (1000 * 60 * 60 * 24);
            if (diffDays > constraints.max_effective_horizon_days) {
                return buildErrorResponse(input, 'EFFECTIVE_HORIZON_EXCEEDED', `Horizon ${diffDays.toFixed(2)} days exceeds limit ${constraints.max_effective_horizon_days}`);
            }
        }

        // 4. Reconstruct Per Domain
        const requestedDomains = input.time_travel_request.domains || ["CONNECTOR", "POLICY", "CAPABILITY", "SAFETY"];
        const domainResults = {};
        const warnings = [...(resolution.warnings || [])];
        const errors = [];
        let partialSuccess = false;
        let partialFailure = false;
        let uniqueAppliedDeltas = new Set();

        for (const domain of requestedDomains) {
            try {
                // Check baseline
                if (!baseline.domains || !baseline.domains[domain]) {
                    throw { code: 'BASELINE_MISSING_DOMAIN', message: `Baseline missing domain ${domain}` };
                }

                const baseState = baseline.domains[domain]; // assume normalized/deep cloned later?
                const result = applyDeltasForDomain(baseState, sortedDeltas, domain, resolution.resolvedTime, resolution.anchorType);

                domainResults[domain] = {
                    state: result.state, // Should be normalized/sorted
                    provenance: {
                        baseline_anchor: {
                            anchor_type: baseline.anchor_type || 'EXECUTION_ID',
                            anchor_value: baseline.anchor_value,
                            effective_time: baseline.effective_time
                        },
                        applied_delta_ids: result.appliedIds,
                        applied_delta_count: result.appliedIds.length,
                        skipped_delta_ids: result.skippedIds,
                        last_effective_time: result.lastEffectiveTime
                    }
                };
                result.appliedIds.forEach(id => uniqueAppliedDeltas.add(id));
                partialSuccess = true;

            } catch (err) {
                partialFailure = true;
                errors.push({
                    code: err.code || 'RECONSTRUCTION_ERROR',
                    message: err.message,
                    domain: domain
                });
            }
        }

        // 5. Output Construction
        let status = 'OK';
        if (partialFailure) {
            status = partialSuccess ? 'PARTIAL' : 'ERROR';
        }

        // If status is ERROR because EVERYTHING failed, we return standard error response or domain-empty response?
        // Spec: "When status is ERROR, domains may be omitted or empty and at least one error must be present."
        if (status === 'ERROR' && errors.length > 0) {
            // Convert to error response format
            return {
                execution_id: input.execution_id,
                phase: PHASE_ID,
                status: 'ERROR',
                feature_flags: input.feature_flags,
                errors: errors
            };
        }

        const output = {
            execution_id: input.execution_id,
            phase: PHASE_ID,
            status: status,
            feature_flags: input.feature_flags,
            requested_anchor: {
                mode: input.time_travel_request.mode,
                anchor: input.time_travel_request.anchor,
                resolved_anchor: {
                    anchor_type: resolution.anchorType || 'TIME', // Could be inferred
                    effective_time: resolution.resolvedTime,
                    source: resolution.anchorType
                }
            },
            domains: domainResults,
            limits: {
                max_deltas: constraints.max_deltas,
                max_effective_horizon_days: constraints.max_effective_horizon_days,
                deltas_applied_total: uniqueAppliedDeltas.size
            },
            warnings: warnings,
            errors: errors,
            metadata: {
                contract_version: 'time_travel_state_reconstructor_output_v1',
                // canonical hash computation happens below
                replay_safe: true
            }
        };

        // Compute Hashes
        const cleanedOutput = normalizeAndSort(removeUndefined(output));
        const canonicalJson = JSON.stringify(cleanedOutput);
        const hash = createHash('sha256').update(canonicalJson).digest('hex');
        output.metadata.canonical_hash = `sha256:${hash}`;

        const structureJson = JSON.stringify(normalizeAndSort(structureOnly(cleanedOutput)));
        const structureHash = createHash('sha256').update(structureJson).digest('hex');
        output.metadata.structure_hash = `sha256:${structureHash}`;

        // Observability
        emitObservability(input.execution_id, status, output);

        span.end();
        return output;

    } catch (err) {
        if (span) span.end();

        // Properly propagate spec-level error codes
        if (err && typeof err === 'object' && err.code && err.message) {
            return buildErrorResponse(input, err.code, err.message);
        }

        return buildErrorResponse(input, 'INTERNAL_ERROR', err && err.message ? err.message : 'Unexpected error');
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function validateInput(input) {
    if (!input || typeof input !== 'object') throw new Error('Invalid input');

    // Recursive forbidden check
    checkForForbiddenFields(input);

    for (const field of REQUIRED_INPUT_FIELDS) {
        if (input[field] === undefined) {
            throw { code: 'MISSING_REQUIRED_FIELD', message: `Missing required field: ${field}` }; // Throw internal error obj to catch block if we wanted, but here we are top level.
        }
    }

    if (!input.tenant_context || typeof input.tenant_context !== 'object') {
        throw { code: 'MISSING_REQUIRED_FIELD', message: 'tenant_context must be present and an object' };
    }
    if (typeof input.tenant_context.tenant_id !== 'string') {
        throw { code: 'INVALID_TENANT_CONTEXT', message: 'tenant_context.tenant_id must be a string' };
    }

    // We'll throw simple Errors and let top-catch handle or buildErrorResponse handle specific codes.
    // Ideally we want specific codes.
    // Let's refactor: validateInput returns void or throws {code, message}
}

function checkForForbiddenFields(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            throw { code: 'FORBIDDEN_FIELD_PRESENT', message: `Forbidden field ${path ? path + '.' + key : key} present` };
        }
        const val = obj[key];
        const type = typeof val;
        if (type === 'function' || type === 'symbol' || type === 'bigint') {
            throw { code: 'NON_SERIALIZABLE_VALUE', message: `Forbidden type ${type} at ${path ? path + '.' + key : key}` };
        }
        if (val && typeof val === 'object') {
            checkForForbiddenFields(val, path ? path + '.' + key : key);
        }
    }
}

function buildErrorResponse(input, code, message) {
    return {
        execution_id: input?.execution_id || 'unknown',
        phase: PHASE_ID,
        status: 'ERROR',
        feature_flags: input?.feature_flags || {},
        errors: [{ code, message }]
    };
}

function sortDeltas(deltas) {
    return [...deltas].sort((a, b) => {
        if (a.effective_time < b.effective_time) return -1;
        if (a.effective_time > b.effective_time) return 1;
        if (a.delta_id < b.delta_id) return -1;
        if (a.delta_id > b.delta_id) return 1;
        return 0;
    });
}

function resolveAnchor(req, baseline, deltas, replayMaterial) {
    const baselineTime = baseline.effective_time;
    const lastDeltaTime = deltas.length > 0 ? deltas[deltas.length - 1].effective_time : baselineTime;

    let targetTime = null;
    let anchorType = 'TIME';

    if (req.mode === 'AT_TIME') {
        targetTime = req.anchor; // Assume ISO string
        // Simple regex check?
        if (!/^\d{4}-\d{2}-\d{2}T/.test(targetTime)) {
            return { error: { code: 'INVALID_ANCHOR_FORMAT', message: 'Invalid ISO timestamp format' } };
        }
        anchorType = 'TIME';
    } else if (req.mode === 'AT_EXECUTION') {
        const execId = req.anchor;
        // Find max effective time of deltas with this exec id? OR replay material?
        // Spec: "Interpret anchor as an execution id... Resolve to the max effective_time among deltas whose execution id matches."
        // We assume deltas have provenance metadata? Input contract doesn't explicitly list execution_id on delta, but says "source_phase: 70".
        // Let's assume input deltas might have metadata or we look at replay material.
        // Spec says: "well-formed metadata inside deltas or replay_material.canonical_trace.events"
        // Let's look at deltas first (assuming they might have it in a Meta field we blindly accepted? Contract for delta did not list it explicitly but implied).
        // Let's look at replay_material.canonical_trace.events if available?
        // Actually, let's scan deltas for a matching property if passing through.
        // If not found, error ANCHOR_NOT_FOUND.

        // Simpler implementation: Check deltas for `execution_id` property (implied extensibility). 
        // Or check replay_material events (Phase 70 trace events have execution_id).
        let foundTime = null;
        if (replayMaterial && replayMaterial.canonical_trace && replayMaterial.canonical_trace.events) {
            for (const evt of replayMaterial.canonical_trace.events) {
                if (evt.execution_id === execId && evt.effective_time) {
                    if (!foundTime || evt.effective_time > foundTime) foundTime = evt.effective_time; // Max time?
                }
            }
        }
        // Also check delta metadata if available?
        for (const d of deltas) {
            if (d.execution_id === execId) {
                if (!foundTime || d.effective_time > foundTime) foundTime = d.effective_time;
            }
        }

        if (!foundTime) {
            return { error: { code: 'ANCHOR_NOT_FOUND', message: `Execution ID ${execId} not found in material` } };
        }
        targetTime = foundTime;
        anchorType = 'EXECUTION_ID';

    } else if (req.mode === 'AT_LEDGER_CURSOR') {
        // Look in replay material events for cursor
        const cursor = req.anchor;
        let foundTime = null;
        if (replayMaterial && replayMaterial.canonical_trace && replayMaterial.canonical_trace.events) {
            for (const evt of replayMaterial.canonical_trace.events) {
                if (evt.ledger_cursor === cursor) {
                    foundTime = evt.effective_time;
                    break;
                }
            }
        }
        if (!foundTime) {
            return { error: { code: 'ANCHOR_NOT_FOUND', message: `Cursor ${cursor} not found` } };
        }
        targetTime = foundTime;
        anchorType = 'LEDGER_CURSOR';

    } else {
        return { error: { code: 'INVALID_MODE', message: `Mode ${req.mode} not supported` } };
    }

    // Checking Range
    if (targetTime < baselineTime) {
        return {
            resolvedTime: targetTime,
            clampedTime: baselineTime,
            anchorType,
            error: { code: 'ANCHOR_BEFORE_BASELINE', message: 'Anchor precedes baseline' },
            warnings: []
        };
    }

    // Check after last delta? 
    // "If after last_delta... clamp to last_delta time"
    if (targetTime > lastDeltaTime) {
        return {
            resolvedTime: targetTime,
            clampedTime: lastDeltaTime,
            anchorType,
            error: { code: 'ANCHOR_AFTER_LAST_DELTA', message: 'Anchor follows last delta' },
            warnings: []
        };
    }

    return { resolvedTime: targetTime, anchorType, warnings: [] };
}

function applyDeltasForDomain(baseState, sortedDeltas, domain, targetTime, anchorType) {
    let currentState = deepClone(baseState); // Start pure
    const appliedIds = [];
    const skippedIds = [];
    let lastTime = null;

    for (const delta of sortedDeltas) {
        // Check filtering
        if (!delta.applies_to_domains || !delta.applies_to_domains.includes(domain)) {
            skippedIds.push(delta.delta_id);
            continue;
        }
        // Check time
        if (delta.effective_time > targetTime) {
            // Future relative to anchor
            continue;
        }
        // Apply
        if (delta.patch && delta.patch[domain]) {
            currentState = deepMergePatch(currentState, delta.patch[domain]);
            appliedIds.push(delta.delta_id);
            lastTime = delta.effective_time;
        }
    }

    // Normalize state at end
    currentState = normalizeAndSort(currentState);

    return {
        state: currentState,
        appliedIds,
        skippedIds,
        lastEffectiveTime: lastTime // null if no deltas applied
    };
}

function deepMergePatch(base, patch) {
    // Deterministic merge with null = delete
    if (patch === undefined) return base;

    // If patch is primitive or array, it replaces base?
    if (patch === null) return undefined; // Should we return undefined to signal deletion at parent key loop?
    // Actually, deepMergePatch typically returns the new value.
    // But if we are iterating keys of patch, we handle nulls there.
    // If top level patch is null? "Keys set to null represent deletions".
    // A top level null patch doesn't make sense for "applying to a domain object" usually, unless wiping domain.

    if (typeof patch !== 'object' || Array.isArray(patch)) {
        return deepClone(patch);
    }

    if (typeof base !== 'object' || base === null || Array.isArray(base)) {
        // Base is primitive/array, Patch is object -> replace? Or merge into empty object?
        // Consistent with 76: replace if types mismatch often, but if patch is object it usually patches an object.
        // If base is primitive, we assume it's being replaced by an object structure.
        base = {};
    }

    const result = { ...base };

    for (const key of Object.keys(patch)) {
        const pVal = patch[key];
        if (pVal === null) {
            delete result[key];
        } else {
            result[key] = deepMergePatch(base[key], pVal);
        }
    }

    return result;
}

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const out = {};
    for (const k in obj) out[k] = deepClone(obj[k]);
    return out;
}

function normalizeAndSort(value) {
    if (value === undefined) return undefined; // Should satisfy forbidden check earlier? Or acceptable?
    // Forbidden check already done on input. Output might have undefineds if we deleted stuff?
    // JSON.stringify strips undefineds.
    if (value === null) return null;

    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(normalizeAndSort);

    const sorted = {};
    Object.keys(value).sort().forEach(k => {
        const v = normalizeAndSort(value[k]);
        if (v !== undefined) {
            sorted[k] = v;
        }
    });
    return sorted;
}

function removeUndefined(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefined).filter(v => v !== undefined);
    const out = {};
    for (const k of Object.keys(obj)) {
        const v = removeUndefined(obj[k]);
        if (v !== undefined) out[k] = v;
    }
    return out;
}

function structureOnly(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
        return value.map(() => null); // arrays encode length but not content
    }
    if (typeof value !== 'object') {
        return null; // primitive collapsed to null
    }
    const out = {};
    Object.keys(value).sort().forEach(k => {
        out[k] = structureOnly(value[k]);
    });
    return out;
}

function emitObservability(executionId, status, output) {
    logStructured("PHASE_77_EXECUTION", {
        execution_id: executionId,
        phase: PHASE_ID,
        status: status,
        requested_anchor: output?.requested_anchor,
        resolved_anchor: output?.requested_anchor?.resolved_anchor,
        domains_reconstructed: output?.domains ? Object.keys(output.domains) : [],
        deltas_applied_total: output?.limits?.deltas_applied_total || 0
    });
    metrics.count("kaivo.phase_77.invocations", 1, { status });
    if (output?.limits?.deltas_applied_total) {
        metrics.count("kaivo.phase_77.deltas_applied", output.limits.deltas_applied_total);
    }
    if (output?.errors?.length > 0) {
        for (const e of output.errors) {
            metrics.count("kaivo.phase_77.reconstruction_errors", 1, { code: e.code });
        }
    }
}

module.exports = { execute };
