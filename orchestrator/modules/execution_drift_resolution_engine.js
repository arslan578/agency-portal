/**
 * Phase 24: Execution Drift Resolution Engine (Pure Logic)
 *
 * Consumes ExecutionIndexedPlan (Phase 14), ExecutionRunResult (Phase 22),
 * and ExecutionDriftReport (Phase 23) to produce a deterministic DriftResolutionPlan.
 */

/**
 * Main entry point for Phase 24.
 *
 * @param {object} input - { plan, run, drift }
 * @returns {object} - Orchestrator envelope
 */
function resolveDrift(input) {
    const timestamp = new Date().toISOString();

    // 1. Input Validation
    if (!input || typeof input !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "EXECUTION_DRIFT_RESOLUTION_V1 requires { plan, run, drift } payload");
    }

    const { plan, run, drift } = input;

    // Validate plan (Phase 14)
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.venues) || typeof plan.stats !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'plan' (Phase 14)");
    }

    // Validate run (Phase 22)
    if (!run || typeof run !== "object" || typeof run.run_id !== "string" || run.run_id.trim() === "" ||
        !run.connector_payload || !run.connector_payload.connector_requests || !Array.isArray(run.connector_payload.connector_requests.venues) ||
        !run.connector_result || !Array.isArray(run.connector_result.venues)) {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'run' (Phase 22)");
    }

    // Validate drift (Phase 23)
    if (!drift || typeof drift !== "object" || !drift.summary || typeof drift.summary.has_drift !== "boolean" ||
        !Array.isArray(drift.venues)) {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'drift' (Phase 23)");
    }

    try {
        // 2. Initialize Output Structure
        const resolutionPlan = {
            run_id: run.run_id,
            has_drift: drift.summary.has_drift,
            highest_severity: "NONE",
            actions: {
                global: [],
                venues: {}
            },
            summary: {
                total_actions: 0,
                venues_with_actions: 0,
                requires_rerun: false,
                requires_rebuild: false
            }
        };

        if (!resolutionPlan.has_drift) {
            return createSuccessEnvelope(timestamp, resolutionPlan);
        }

        // 3. Process Drift Issues
        let maxSeverity = "NONE";
        let requiresRerun = false;
        let requiresRebuild = false;
        let totalActions = 0;
        let venuesWithActions = 0;

        // Sort drift venues deterministically (Phase 23 should already sort, but we enforce)
        // Note: Phase 23 puts _global_ last. We need global actions separate.
        // We iterate through drift.venues and split into global vs venue-specific.

        const globalDrift = drift.venues.find(v => v.venue_key === "_global_");
        const venueDrifts = drift.venues.filter(v => v.venue_key !== "_global_").sort((a, b) => a.venue_key.localeCompare(b.venue_key));

        // Process Global Drift
        if (globalDrift && Array.isArray(globalDrift.issues)) {
            const actions = mapIssuesToActions(globalDrift.issues);
            if (actions.length > 0) {
                resolutionPlan.actions.global = actions;
                totalActions += actions.length;

                // Update flags based on actions
                for (const action of actions) {
                    if (action.type === "REBUILD_REQUESTS") requiresRebuild = true;
                    if (action.type === "RETRY") requiresRerun = true;
                    maxSeverity = updateMaxSeverity(maxSeverity, action.severity);
                }
            }
        }

        // Process Venue Drifts
        for (const vDrift of venueDrifts) {
            if (!vDrift.issues || vDrift.issues.length === 0) continue;

            const actions = mapIssuesToActions(vDrift.issues);
            if (actions.length > 0) {
                resolutionPlan.actions.venues[vDrift.venue_key] = actions;
                totalActions += actions.length;
                venuesWithActions++;

                // Update flags based on actions
                for (const action of actions) {
                    if (action.type === "REBUILD_REQUESTS") requiresRebuild = true;
                    if (action.type === "RETRY") requiresRerun = true;
                    maxSeverity = updateMaxSeverity(maxSeverity, action.severity);
                }
            }
        }

        // 4. Finalize Summary
        // CRITICAL implies rebuild, which implies rerun is irrelevant (rebuild supersedes)
        // But spec says: CRITICAL -> requires_rebuild = true, requires_rerun = false
        // WARNING -> requires_rerun = true, requires_rebuild = false
        // If we have mixed CRITICAL and WARNING, CRITICAL wins for rebuild, but do we keep rerun?
        // Spec says "A. CRITICAL Drift -> requires_rebuild = true, requires_rerun = false"
        // This implies if ANY critical drift exists, we set rebuild=true, rerun=false globally?
        // Or is it additive?
        // "Triggering conditions" list implies mapping from issue to action/flags.
        // Let's follow the logic:
        // If we have ANY rebuild action, requires_rebuild becomes true.
        // If we have ANY retry action, requires_rerun becomes true.
        // BUT, if requires_rebuild is true, does it override requires_rerun?
        // The spec says: "A. CRITICAL Drift -> requires_rebuild = true, requires_rerun = false"
        // This suggests that if the outcome is CRITICAL, we rebuild. Rebuild implies we will rerun the new requests.
        // So if requires_rebuild is true, we should force requires_rerun to false to match the spec's "A" outcome.

        if (requiresRebuild) {
            requiresRerun = false;
        }

        resolutionPlan.highest_severity = maxSeverity;
        resolutionPlan.summary.total_actions = totalActions;
        resolutionPlan.summary.venues_with_actions = venuesWithActions;
        resolutionPlan.summary.requires_rerun = requiresRerun;
        resolutionPlan.summary.requires_rebuild = requiresRebuild;

        return createSuccessEnvelope(timestamp, resolutionPlan);

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Logic Helpers ----------

function mapIssuesToActions(issues) {
    // Sort issues: severity DESC, code ASC
    const sortedIssues = [...issues].sort((a, b) => {
        const severityOrder = { "CRITICAL": 3, "WARNING": 2, "INFO": 1, "NONE": 0 };
        const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (sevDiff !== 0) return sevDiff;
        return a.code.localeCompare(b.code);
    });

    return sortedIssues.map(issue => {
        let type = "NOOP";
        let severity = "INFO";
        let reasonPrefix = "info drift";

        // A. CRITICAL Drift
        if (["VENUE_MISSING_IN_ACTUAL", "VENUE_UNEXPECTED_IN_ACTUAL", "CONNECTOR_ERROR", "SUMMARY_TOTAL_VENUES_MISMATCH"].includes(issue.code)) {
            type = "REBUILD_REQUESTS";
            severity = "CRITICAL";
            reasonPrefix = "critical drift";
        }
        // B. WARNING Drift
        else if (["BUDGET_MISMATCH", "UNITS_MISMATCH"].includes(issue.code)) {
            type = "RETRY";
            severity = "WARNING";
            reasonPrefix = "warning drift";
        }
        // C. INFO Drift
        else {
            type = "NOOP";
            severity = "INFO";
            reasonPrefix = "info drift";
        }

        return {
            type,
            severity,
            reason: `${reasonPrefix}: ${issue.code}`,
            source_issue: issue.code
        };
    });
}

function updateMaxSeverity(current, newSev) {
    const order = { "NONE": 0, "INFO": 1, "WARNING": 2, "CRITICAL": 3 };
    return order[newSev] > order[current] ? newSev : current;
}

// ---------- Envelope Helpers ----------

function createSuccessEnvelope(timestamp, payload) {
    return {
        ok: true,
        module: "execution_drift_resolution_engine",
        timestamp,
        payload
    };
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_drift_resolution_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    resolveDrift
};
