"use strict";

const { createHash } = require("crypto");
const { logStructured } = require("../../shared/logging");
const metrics = require("../../shared/metrics");
const tracing = require("../../shared/tracing");

const PHASE_ID = "78";
const FEATURE_FLAG = "FF_FORMAL_AUDIT_LEDGER_WRITER";

const FORBIDDEN_FIELDS = ['_debug', 'debug_info', 'internal_only'];

function computeObjectHash(obj) {
    const normalized = normalizeAndSort(obj);
    const json = JSON.stringify(normalized);
    return createHash('sha256').update(json).digest('hex');
}

function getReplaySha(deterministicReplayRecord) {
    if (!deterministicReplayRecord || typeof deterministicReplayRecord !== 'object') {
        return null;
    }
    if (typeof deterministicReplayRecord.replay_sha256 === 'string' && deterministicReplayRecord.replay_sha256.length > 0) {
        return deterministicReplayRecord.replay_sha256;
    }
    if (deterministicReplayRecord.metadata && typeof deterministicReplayRecord.metadata.canonical_hash === 'string' && deterministicReplayRecord.metadata.canonical_hash.length > 0) {
        return deterministicReplayRecord.metadata.canonical_hash;
    }
    return null;
}

function canonicalTimeTravelSubcategory(variant) {
    const rawType = (variant && (variant.variant_type || variant.type)) || '';
    const upper = String(rawType).toUpperCase();
    if (upper === 'FORK') return 'FORK';
    if (upper === 'RESTORE') return 'RESTORE';
    return 'VARIANT';
}

function execute(input) {
    let span;
    try {
        // 1. Basic validation without span if needed (type check)
        if (!input || typeof input !== 'object') {
            return validationError(input, 'INVALID_INPUT', 'Input must be a non-null object');
        }

        // 2. Start span
        const safeExecId = (input.execution_id && typeof input.execution_id === 'string') ? input.execution_id : 'unknown';
        const safeTenantId = (input.tenant_context && typeof input.tenant_context.tenant_id === 'string') ? input.tenant_context.tenant_id : 'unknown';

        span = tracing.startSpan("phase_78_formal_audit_ledger_writer", {
            execution_id: safeExecId,
            phase: PHASE_ID,
            tenant_id: safeTenantId
        });

        // 3. Validate contract
        const validation = validateContract(input);
        if (validation) return validation;

        // 4. Short-circuit if feature flag disabled (with observability)
        if (!isFeatureFlagEnabled(input)) {
            const disabledOutput = {
                execution_id: input.execution_id,
                phase: PHASE_ID,
                status: "DISABLED",
                feature_flags: input.feature_flags,
                ledger_batch: { entries: [] },
                errors: [],
                metadata: {}
            };

            logStructured("phase_78_formal_audit_ledger_writer", {
                execution_id: input.execution_id,
                phase: PHASE_ID,
                status: "DISABLED",
                tenant_id: input.tenant_context.tenant_id,
                entry_count: 0
            });

            metrics.count("kaivo_phase_78_invocations_total", 1, { phase: PHASE_ID, status: "DISABLED" });
            metrics.count("kaivo_phase_78_entries_written_total", 0, { phase: PHASE_ID, status: "DISABLED" });
            metrics.count("kaivo_phase_78_errors_total", 0, { phase: PHASE_ID, status: "DISABLED" });

            if (span) span.setAttribute("status", "DISABLED");

            return disabledOutput;
        }

        // 5. Build ledger entries deterministically
        const entries = [];
        const tenantId = input.tenant_context.tenant_id;
        const sequenceBase = 1; // Start sequence

        const policySummary = input.policy_summary ? normalizeAndSort(input.policy_summary) : null;
        const safetySummary = input.safety_summary ? normalizeAndSort(input.safety_summary) : null;

        const baselineReplaySha = getReplaySha(input.deterministic_replay_record);
        if (!baselineReplaySha) {
            return validationError(input, 'MISSING_FIELD', 'deterministic_replay_record.replay_sha256 (or metadata.canonical_hash) is required', 'deterministic_replay_record.replay_sha256');
        }

        const traceDeltaRef = computeObjectHash(input.trace_delta_bundle);

        // Helper to push entry
        const pushEntry = (category, subcategory, refData) => {
            const sequenceNo = entries.length + 1;

            // Base structure before normalization
            const entry = {
                ledger_entry_id: "", // Computed later
                execution_id: input.execution_id,
                tenant_id: tenantId,
                sequence_no: sequenceNo,
                category: category,
                subcategory: subcategory,
                commit_sha256: input.commit_seal.commit_sha256,
                canonical_sha256: input.commit_seal.canonical_sha256,
                structure_sha256: input.commit_seal.structure_sha256,
                trace_delta_ref: traceDeltaRef,
                // Ref payloads
                replay_ref: refData.replay_ref || null,
                time_travel_ref: refData.time_travel_ref || null,
                // Contexts
                cost_projection: input.cost_expectation_model ? normalizeAndSort(input.cost_expectation_model) : null,
                rate_limit_projection: input.rate_limit_forecast ? normalizeAndSort(input.rate_limit_forecast) : null,
                // Summaries
                policy_summary: policySummary,
                safety_summary: safetySummary,
                // Logical clocks
                created_at_logical: sequenceNo,
                logical_clock_vector: {
                    execution: sequenceNo,
                    replay: refData.logical_replay || 1,
                    time_travel: refData.logical_time_travel || 0
                }
            };

            // Generate ID
            // execution_id + ":" + sequence_no + ":" + commit_sha256
            const idStr = `${entry.execution_id}:${entry.sequence_no}:${entry.commit_sha256}`;
            const hash = createHash('sha256').update(idStr).digest('hex');
            entry.ledger_entry_id = hash;

            entries.push(normalizeAndSort(entry));
        };

        // A. Baseline
        pushEntry("EXECUTION", "BASELINE", {
            replay_ref: {
                replay_sha256: baselineReplaySha,
                scenario_type: "BASELINE"
            },
            time_travel_ref: null,
            logical_replay: 1,
            logical_time_travel: 0
        });

        // B. Counterfactuals
        if (input.counterfactual_scenarios && Array.isArray(input.counterfactual_scenarios)) {
            for (const scenario of input.counterfactual_scenarios) {
                const scenarioReplaySha =
                    (scenario && typeof scenario.replay_sha256 === 'string' && scenario.replay_sha256.length > 0)
                        ? scenario.replay_sha256
                        : baselineReplaySha;

                pushEntry("EXECUTION", "COUNTERFACTUAL", {
                    replay_ref: {
                        replay_sha256: scenarioReplaySha,
                        scenario_type: "COUNTERFACTUAL"
                    },
                    logical_replay: 1,
                    logical_time_travel: 0
                });
            }
        }

        // C. Time Travel
        if (input.state_time_travel_material && Array.isArray(input.state_time_travel_material.time_travel_variants)) {
            for (const variant of input.state_time_travel_material.time_travel_variants) {
                const subcategory = canonicalTimeTravelSubcategory(variant);

                const timeTravelRef = {
                    variant_id: variant.variant_id || variant.id || null,
                    origin_snapshot_id: variant.origin_snapshot_id || input.state_time_travel_material.baseline_state_material?.snapshot_id || null
                };

                pushEntry("STATE_TIME_TRAVEL", subcategory, {
                    replay_ref: {
                        replay_sha256: baselineReplaySha,
                        scenario_type: "STATE_TIME_TRAVEL"
                    },
                    time_travel_ref: timeTravelRef,
                    logical_replay: 1,
                    logical_time_travel: 1
                });
            }
        }

        // Final Sort of Entries
        // "ordered deterministically by: 1. tenant_id 2. execution_id 3. sequence_no"
        // Since we built them sequentially per execution, and input is single execution, they should be sorted by sequence_no.
        // We trust the push order but a sort ensures invariants.
        entries.sort((a, b) => {
            if (a.tenant_id !== b.tenant_id) return a.tenant_id.localeCompare(b.tenant_id);
            if (a.execution_id !== b.execution_id) return a.execution_id.localeCompare(b.execution_id);
            return a.sequence_no - b.sequence_no;
        });

        // 6. Compute batch hash
        const ledgerBatch = {
            version: "formal_audit_ledger_writer_v1",
            tenant_id: tenantId,
            currency: input.tenant_context.currency,
            entries: entries // already normalized individually, but strictly `entries` array structure needs to be hashed?
            // "batch_sha256 must be a SHA-256 hash of the canonicalized ledger_batch object"
        };

        const sortedBatch = normalizeAndSort(ledgerBatch);
        const batchJson = JSON.stringify(sortedBatch);
        const batchHash = createHash('sha256').update(batchJson).digest('hex');

        const output = {
            execution_id: input.execution_id,
            phase: PHASE_ID,
            status: "OK",
            feature_flags: input.feature_flags,
            ledger_batch: {
                ...sortedBatch,
                batch_sha256: batchHash
            },
            errors: [],
            metadata: {}
        };

        // 7. Emit observability
        logStructured("phase_78_formal_audit_ledger_writer", {
            execution_id: input.execution_id,
            phase: PHASE_ID,
            status: "OK",
            tenant_id: tenantId,
            entry_count: entries.length
        });

        metrics.count("kaivo_phase_78_invocations_total", 1, { phase: PHASE_ID });
        metrics.count("kaivo_phase_78_entries_written_total", entries.length, { phase: PHASE_ID });
        metrics.count("kaivo_phase_78_errors_total", 0, { phase: PHASE_ID, status: "OK" });

        span.setAttribute("status", "OK");

        // 8. Return output
        return output;

    } catch (err) {
        // Convert to error-as-value
        if (span) span.setAttribute("status", "ERROR");

        // Observability on crash
        logStructured("phase_78_formal_audit_ledger_writer", {
            execution_id: input?.execution_id || 'unknown',
            phase: PHASE_ID,
            status: "ERROR",
            error: err.message
        });
        metrics.count("kaivo_phase_78_invocations_total", 1, { phase: PHASE_ID }); // It was invoked
        metrics.count("kaivo_phase_78_errors_total", 1, { phase: PHASE_ID, status: "ERROR" });

        return {
            execution_id: input?.execution_id || 'unknown',
            phase: PHASE_ID,
            status: "ERROR",
            feature_flags: input?.feature_flags || {},
            ledger_batch: { entries: [] },
            errors: [{
                code: "UNEXPECTED_ERROR",
                message: err.message || "An unexpected internal error occurred",
                severity: "ERROR"
            }],
            metadata: {}
        };
    } finally {
        if (span && typeof span.end === "function") {
            span.end();
        }
    }
}

function validateContract(input) {
    // Required fields check
    const required = [
        'execution_id', 'phase', 'feature_flags', 'tenant_context',
        'commit_seal', 'canonical_execution_form', 'trace_delta_bundle',
        'deterministic_replay_record', 'cost_expectation_model',
        'rate_limit_forecast', 'state_time_travel_material'
    ];

    for (const field of required) {
        if (input[field] === undefined) {
            return validationError(input, 'MISSING_FIELD', `Missing required field: ${field}`, field);
        }
    }

    if (input.phase !== "78") {
        return validationError(input, 'INVALID_PHASE', 'Phase must be "78"', 'phase');
    }

    // Tenant context check
    if (!input.tenant_context || typeof input.tenant_context !== 'object') {
        return validationError(input, 'INVALID_INPUT', 'tenant_context must be an object', 'tenant_context');
    }
    if (!input.tenant_context.tenant_id) {
        return validationError(input, 'MISSING_FIELD', 'tenant_context.tenant_id is required', 'tenant_context.tenant_id');
    }
    // Spec requires currency too? "tenant_context must at least contain: tenant_id, currency"
    // NG2 test specifically checks tenant_id, but spec lists currency as required. I should check it.
    // However, NG tests don't explicitly fail on currency, but HP tests use it. "HP5: Tenant and currency propagation".
    // I will check it to be spec compliant.
    // Wait, prompt NG2 says "Missing tenant_id". NG tests might imply relaxed checks elsewhere?
    // "1.3 Input contract... Required... tenant_id (string), currency (string)".
    // So I must validate currency too if I want full contract compliance.
    if (!input.tenant_context.currency) {
        return validationError(input, 'MISSING_FIELD', 'tenant_context.currency is required', 'tenant_context.currency');
    }

    // deterministic_replay_record must carry a usable hash
    const replaySha = getReplaySha(input.deterministic_replay_record);
    if (!replaySha) {
        return validationError(
            input,
            'MISSING_FIELD',
            'deterministic_replay_record.replay_sha256 (or metadata.canonical_hash) is required',
            'deterministic_replay_record.replay_sha256'
        );
    }


    // Forbidden fields check (recursive)
    try {
        checkForForbidden(input);
    } catch (e) {
        return validationError(input, e.code, e.message, e.path);
    }

    return null; // OK
}

function checkForForbidden(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;

    // Check top level keys if we are at root? Or all keys? "At top level, reject if..." 
    // Spec: "Forbidden fields: At top level, reject if any of the following exist: undefined properties (anywhere in the tree), _debug..."

    for (const key of Object.keys(obj)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            throw { code: 'FORBIDDEN_FIELD', message: `Forbidden field ${key} present`, path: path ? `${path}.${key}` : key };
        }

        const val = obj[key];
        if (val === undefined) {
            throw { code: 'INVALID_INPUT', message: `Undefined value at ${key}`, path: path ? `${path}.${key}` : key };
        }

        const type = typeof val;
        if (type === 'function' || type === 'symbol' || type === 'bigint') {
            throw { code: 'NON_SERIALIZABLE_VALUE', message: `Non-serializable value ${type} at ${key}`, path: path ? `${path}.${key}` : key };
        }

        if (val instanceof Date) {
            throw { code: 'NON_SERIALIZABLE_VALUE', message: `Date object forbidden at ${key}`, path: path ? `${path}.${key}` : key };
        }

        if (val && typeof val === 'object') {
            checkForForbidden(val, path ? `${path}.${key}` : key);
        }
    }
}

function normalizeAndSort(value) {
    if (value === undefined) throw new Error("Undefined value encountered during normalization"); // Should be caught by validation, but internal safeguard
    if (value === null) return null;

    // Primitives
    if (typeof value !== 'object') return value;

    if (Array.isArray(value)) {
        return value.map(v => normalizeAndSort(v));
    }

    if (value instanceof Date) {
        // Spec says Date objects are forbidden inputs. 
        // If we created one internally (unlikely given "pure logic" constraint), treat as ISO string?
        // But validation bans them.
        // If we somehow have one, fail? Or strict conversion?
        // Spec 2.2 says: "Reject undefined, functions, symbols, BigInt, Date instances."
        throw new Error("Date object encountered");
    }

    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
        sorted[key] = normalizeAndSort(value[key]);
    }
    return sorted;
}

function isFeatureFlagEnabled(input) {
    return !!(input.feature_flags && input.feature_flags[FEATURE_FLAG]);
}

function validationError(input, code, message, path) {
    // Emit error observability
    logStructured("phase_78_formal_audit_ledger_writer", {
        execution_id: input?.execution_id || 'unknown',
        phase: PHASE_ID,
        status: "ERROR",
        error: message,
        code: code
    });
    metrics.count("kaivo_phase_78_errors_total", 1, { phase: PHASE_ID, status: "ERROR", code });

    return {
        execution_id: input?.execution_id || 'unknown',
        phase: PHASE_ID,
        status: "ERROR",
        feature_flags: input?.feature_flags || {},
        ledger_batch: { entries: [] },
        errors: [{
            code: code,
            message: message,
            path: path,
            severity: "ERROR"
        }],
        metadata: {}
    };
}

module.exports = { execute };
