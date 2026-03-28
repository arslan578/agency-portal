"use strict";

const { createHash } = require("crypto");
const { logStructured } = require("../../shared/logging");
const metrics = require("../../shared/metrics");
const tracing = require("../../shared/tracing");

const PHASE_ID = "79";
const FEATURE_FLAG = "FF_GLOBAL_STATE_CONSISTENCY_AUDITOR";
const FORBIDDEN_FIELDS = ['_debug', 'debug_info', 'internal_only'];

function execute(input) {
    let span;
    try {
        if (!input || typeof input !== 'object') {
            return validationError(input, 'INVALID_INPUT', 'Input must be a non-null object');
        }

        const safeExecId = (input.execution_id && typeof input.execution_id === 'string') ? input.execution_id : 'unknown';
        span = tracing.startSpan("phase_79_global_state_consistency_auditor", {
            execution_id: safeExecId,
            phase: PHASE_ID
        });

        // 3. Validate contract
        const validation = validateContract(input);
        if (validation) return validation;

        // 4. Feature Flag Check
        if (!isFeatureFlagEnabled(input)) {
            // Feature flag disabled → passthrough error (per spec & EC15 test)
            logStructured("phase_79_global_state_consistency_auditor", {
                execution_id: safeExecId,
                phase: PHASE_ID,
                status: "DISABLED"
            });

            metrics.count("kaivo_phase_79_disabled_total", 1, { phase: PHASE_ID });

            if (span) span.setAttribute("status", "ERROR");

            return {
                status: "ERROR",
                execution_id: safeExecId,
                phase: PHASE_ID,
                consistency_report: {},
                overall_consistent: false,
                canonical_sha256: "",
                structure_sha256: "",
                error: "Feature flag FF_GLOBAL_STATE_CONSISTENCY_AUDITOR disabled"
            };
        }

        // 5. Execute Auditor Logic
        const report = {
            envelope_vs_snapshot: checkEnvelopeVsSnapshot(input),
            snapshot_vs_canonical: checkSnapshotVsCanonical(input),
            canonical_vs_archive: checkCanonicalVsArchive(input),
            health_vs_drift: checkHealthVsDrift(input),
            safety_horizon_alignment: checkSafetyHorizonAlignment(input),
            policy_gradient_alignment: checkPolicyGradientAlignment(input),
            delta_chain_integrity: checkDeltaChainIntegrity(input),
            replay_consistency: checkReplayConsistency(input)
        };

        const overallConsistent = Object.values(report).every(r => r.ok);

        // Prefer the Phase 64 / Commit Seal canonical hash as the single source of truth.
        // Only fall back to recomputing if it is missing or malformed.
        const canonicalSha =
            (input.commit_seal &&
                typeof input.commit_seal.canonical_sha256 === "string" &&
                input.commit_seal.canonical_sha256.length > 0)
                ? input.commit_seal.canonical_sha256
                : computeHash(input.canonical_form);

        const structureSha = computeStructureHash(input.canonical_form);

        const status = overallConsistent ? "OK" : "INCONSISTENT";

        // 6. Observability
        logStructured("phase_79_global_state_consistency_auditor", {
            execution_id: safeExecId,
            phase: PHASE_ID,
            status: status,
            overall_consistent: overallConsistent
        });

        // Metrics? Prompt says "Must include observability: metrics, structured logs, tracing."
        // Let's emit metrics.
        metrics.count("kaivo_phase_79_audits_total", 1, { phase: PHASE_ID, status });
        if (!overallConsistent) {
            metrics.count("kaivo_phase_79_inconsistencies_total", 1, { phase: PHASE_ID });
        }

        span.setAttribute("status", status);

        return {
            status: status,
            execution_id: safeExecId,
            phase: PHASE_ID,
            consistency_report: report,
            overall_consistent: overallConsistent,
            canonical_sha256: canonicalSha,
            structure_sha256: structureSha
        };

    } catch (err) {
        logStructured("phase_79_global_state_consistency_auditor", {
            execution_id: input?.execution_id || 'unknown',
            phase: PHASE_ID,
            status: "ERROR",
            error: err.message
        });
        if (span) span.setAttribute("status", "ERROR");
        return {
            status: "ERROR",
            execution_id: input?.execution_id || 'unknown',
            phase: PHASE_ID,
            consistency_report: {},
            overall_consistent: false,
            canonical_sha256: "",
            structure_sha256: "",
            error: err.message
        };
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Check Implementation
// -----------------------------------------------------------------------------

function checkEnvelopeVsSnapshot(input) {
    const details = [];
    // 1. Snapshot fields must exist in sealed envelope (unless optional)

    // Also "No forbidden fields".
    try {
        checkForForbidden(input.state_snapshot);
    } catch (e) {
        details.push(`Forbidden field check failed: ${e.message}`);
    }

    if (input.state_snapshot && input.sealed_envelope) {
        // Deviation 1: Strict Phase 61 invariant
        if (!input.sealed_envelope.snapshot || typeof input.sealed_envelope.snapshot !== 'object') {
            details.push("Sealed envelope does not contain a valid snapshot field (Phase 61 invariant).");
            return { ok: false, details };
        }

        const normalizedSnapshot = normalizeAndSort(input.state_snapshot);
        const normalizedEnvelope = normalizeAndSort(input.sealed_envelope.snapshot);

        if (JSON.stringify(normalizedSnapshot) !== JSON.stringify(normalizedEnvelope)) {
            details.push("Snapshot and envelope.snapshot mismatch after normalization.");
        }
    }

    return { ok: details.length === 0, details };
}

function checkSnapshotVsCanonical(input) {
    const details = [];
    const snapHash = computeHash(input.state_snapshot);
    const canonHash = computeHash(input.canonical_form);

    if (input.commit_seal && input.commit_seal.canonical_sha256) {
        if (canonHash !== input.commit_seal.canonical_sha256) {
            details.push(`Canonical form hash mismatch. Computed: ${canonHash}, Sealed: ${input.commit_seal.canonical_sha256}`);
        }
    }

    if (snapHash !== canonHash) {
        details.push(
            `Normalized Snapshot hash ${snapHash} does not match Canonical Form hash ${canonHash}.`
        );
    }

    // Deviation 2: Envelope Snapshot vs Canonical Hash
    if (input.sealed_envelope && input.sealed_envelope.snapshot) {
        const envSnapHash = computeHash(input.sealed_envelope.snapshot);
        if (envSnapHash !== canonHash) {
            details.push("Canonical form does not match normalized envelope snapshot.");
        }
    }

    return { ok: details.length === 0, details };
}

function checkCanonicalVsArchive(input) {
    const details = [];
    if (input.archive_metadata) {
        const mh = input.archive_metadata.canonical_sha256 || input.archive_metadata.canonical_hash;
        const ch = input.archive_metadata.commit_sha256 || input.archive_metadata.commit_hash;

        if (input.commit_seal) {
            if (mh && mh !== input.commit_seal.canonical_sha256) {
                details.push(`Archive canonical hash mismatch.`);
            }
            if (ch && ch !== input.commit_seal.commit_sha256) {
                details.push(`Archive commit hash mismatch.`);
            }
        }
    }
    return { ok: details.length === 0, details };
}

function checkHealthVsDrift(input) {
    const details = [];
    if (input.health_state && input.capability_drift_state) {
        const connectors = input.health_state.connectors || {};
        const drifts = input.capability_drift_state.connectors || {};

        for (const cid of Object.keys(connectors)) {
            const status = connectors[cid].status;
            const drift = drifts[cid] || { severity: 0, mode: "NORMAL" };

            if (status === "CRITICAL") {
                if (drift.severity <= 0) {
                    details.push(`Connector ${cid} is CRITICAL but drift severity is 0.`);
                }
            }

            if (drift.mode === "RECOVERY") {
                if (status === "DEGRADED" || status === "CRITICAL") {
                    details.push(`Connector ${cid} in RECOVERY but health is ${status}.`);
                }
            }
        }
    }
    return { ok: details.length === 0, details };
}

function checkSafetyHorizonAlignment(input) {
    const details = [];
    if (input.safety_horizon) {
        if (input.safety_horizon.forbidden_actions_detected && input.safety_horizon.forbidden_actions_detected.length > 0) {
            details.push("Forbidden actions detected in Safety Horizon.");
        }
    }
    return { ok: details.length === 0, details };
}

function checkPolicyGradientAlignment(input) {
    const details = [];
    // Deviation 3: Strict two-way comparator
    const snapshotPolicy = input.state_snapshot && input.state_snapshot.policy_coefficients;
    const gradientUpdate = input.policy_gradients && input.policy_gradients.last_update;

    if (!snapshotPolicy && gradientUpdate) {
        details.push("Snapshot missing policy coefficients but policy gradient update exists.");
        return { ok: false, details };
    }

    if (snapshotPolicy && !gradientUpdate) {
        details.push("Policy gradient update missing but snapshot contains policy coefficients.");
        return { ok: false, details };
    }

    if (!snapshotPolicy && !gradientUpdate) {
        return { ok: true, details };
    }

    const normalizedPolicy = normalizeAndSort(snapshotPolicy);
    const normalizedUpdate = normalizeAndSort(gradientUpdate);

    if (JSON.stringify(normalizedPolicy) !== JSON.stringify(normalizedUpdate)) {
        details.push("Policy coefficients do not match the last recorded gradient update.");
    }

    return { ok: details.length === 0, details };
}

function checkDeltaChainIntegrity(input) {
    const details = [];
    if (input.delta_history && input.delta_history.final_snapshot_hash) {
        const snapHash = computeHash(input.state_snapshot);
        if (input.delta_history.final_snapshot_hash !== snapHash) {
            details.push("Delta chain final hash does not match snapshot hash.");
        }
    }
    return { ok: details.length === 0, details };
}

function checkReplayConsistency(input) {
    const details = [];
    if (input.replay_verification) {
        const replayHash = input.replay_verification.canonical_hash || input.replay_verification.replay_sha256;

        // Deviation 4: Use Phase 64 committed hash, not recomputed one
        let targetHash;
        if (input.commit_seal && input.commit_seal.canonical_sha256) {
            targetHash = input.commit_seal.canonical_sha256;
        } else {
            targetHash = computeHash(input.canonical_form);
        }

        if (replayHash && replayHash !== targetHash) {
            details.push(`Replay hash ${replayHash} mismatches canonical hash ${targetHash}.`);
        }
    }
    return { ok: details.length === 0, details };
}


// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function validateContract(input) {
    const required = [
        'execution_id', 'phase', 'feature_flags', 'sealed_envelope',
        'state_snapshot', 'commit_seal', 'canonical_form', 'archive_metadata',
        'health_state', 'capability_drift_state', 'safety_horizon',
        'policy_gradients', 'delta_history', 'replay_verification'
    ];

    for (const field of required) {
        if (input[field] === undefined) {
            return validationError(input, 'MISSING_FIELD', `Missing required field: ${field}`);
        }
    }

    if (input.phase !== PHASE_ID) {
        return validationError(input, 'INVALID_PHASE', `Invalid phase ${input.phase}`);
    }

    // Forbidden check
    try {
        checkForForbidden(input);
    } catch (e) {
        return validationError(input, 'FORBIDDEN_FIELD', e.message);
    }

    return null;
}

function validationError(input, code, message) {
    const execId = (input && typeof input === 'object' && typeof input.execution_id === 'string')
        ? input.execution_id
        : 'unknown';
    return {
        status: "ERROR",
        execution_id: execId,
        phase: PHASE_ID,
        consistency_report: {},
        overall_consistent: false,
        canonical_sha256: "",
        structure_sha256: "",
        error: message
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

function isFeatureFlagEnabled(input) {
    return !!(input.feature_flags && input.feature_flags[FEATURE_FLAG]);
}

function normalizeAndSort(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(normalizeAndSort);
    const sorted = {};
    Object.keys(value).sort().forEach(k => {
        sorted[k] = normalizeAndSort(value[k]);
    });
    return sorted;
}

function computeHash(obj) {
    const norm = normalizeAndSort(obj);
    return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

function computeStructureHash(obj) {
    return createHash('sha256').update(JSON.stringify(structureOnly(obj))).digest('hex');
}

function structureOnly(value) {
    if (value === null || typeof value !== 'object') return null;
    if (Array.isArray(value)) return value.map(() => null);
    const out = {};
    Object.keys(value).sort().forEach(k => {
        out[k] = structureOnly(value[k]);
    });
    return out;
}

module.exports = { execute };
