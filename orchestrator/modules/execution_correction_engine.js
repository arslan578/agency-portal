/**
 * Phase 25: Execution Correction Engine (Pure Logic)
 *
 * Transforms a DriftResolutionPlan (Phase 24) into a deterministic "next action"
 * instruction for the orchestrator.
 */

/**
 * Main entry point for Phase 25.
 *
 * @param {object} input - { plan, resolution }
 * @returns {object} - Orchestrator envelope
 */
function determineCorrection(input) {
    const timestamp = new Date().toISOString();

    // 1. Input Validation
    if (!input || typeof input !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "EXECUTION_CORRECTION_V1 requires { plan, resolution } payload");
    }

    const { plan, resolution } = input;

    // Validate plan (Phase 14)
    if (!plan || typeof plan !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'plan'");
    }

    // Validate resolution (Phase 25 Input Contract)
    if (!resolution || typeof resolution !== "object" ||
        typeof resolution.global_requires_retry !== "boolean" ||
        typeof resolution.global_requires_rebuild !== "boolean" ||
        typeof resolution.global_is_terminal !== "boolean" ||
        !Array.isArray(resolution.venues)) {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'resolution'");
    }

    try {
        // 2. Initialize Output Structure
        const correction = {
            action: "NO_ACTION",
            reason: "no_correction_needed",
            targets: null,
            requires_connector_io: false,
            requires_rebuild: false,
            is_terminal: false
        };

        // 3. Deterministic Logic

        // Rule 1: Terminal Condition (highest priority)
        const anyVenueTerminal = resolution.venues.some(v => v.is_terminal);

        if (resolution.global_is_terminal || anyVenueTerminal || isTerminalDeadEnd(resolution)) {
            correction.action = "ABORT_EXECUTION";
            correction.reason = "terminal_state_detected";
            correction.targets = null;
            correction.requires_connector_io = false;
            correction.requires_rebuild = false;
            correction.is_terminal = true;
        }
        // Rule 2: Global Rebuild
        else if (resolution.global_requires_rebuild) {
            correction.action = "REBUILD_CONNECTOR_REQUESTS";
            correction.reason = "global_rebuild_required";
            correction.targets = null;
            correction.requires_connector_io = false;
            correction.requires_rebuild = true;
            correction.is_terminal = false;
        }
        // Rule 3: Venue-Level Rebuild
        else if (resolution.venues.some(v => v.requires_rebuild)) {
            const rebuildVenues = resolution.venues
                .filter(v => v.requires_rebuild)
                .map(v => v.venue_key)
                .sort(); // Lexicographical sort

            correction.action = "REBUILD_CONNECTOR_REQUESTS";
            correction.reason = "venue_rebuild_required";
            correction.targets = rebuildVenues;
            correction.requires_connector_io = false;
            correction.requires_rebuild = true;
            correction.is_terminal = false;
        }
        // Rule 4: Global Retry
        else if (resolution.global_requires_retry) {
            correction.action = "RETRY_CONNECTOR_IO";
            correction.reason = "global_retry_required";
            correction.targets = null;
            correction.requires_connector_io = true;
            correction.requires_rebuild = false;
            correction.is_terminal = false;
        }
        // Rule 5: Venue-Level Retry
        else if (resolution.venues.some(v => v.requires_retry)) {
            const retryVenues = resolution.venues
                .filter(v => v.requires_retry)
                .map(v => v.venue_key)
                .sort(); // Lexicographical sort

            correction.action = "RETRY_CONNECTOR_IO";
            correction.reason = "venue_retry_required";
            correction.targets = retryVenues;
            correction.requires_connector_io = true;
            correction.requires_rebuild = false;
            correction.is_terminal = false;
        }
        // Rule 6: Default Case (already initialized)

        return createSuccessEnvelope(timestamp, plan, resolution, correction);

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Logic Helpers ----------

function isTerminalDeadEnd(resolution) {
    // A dead-end occurs when issues exist but no valid corrective path exists.
    // This means:
    // - At least one venue has issues
    // - No global or venue-level retry flags
    // - No global or venue-level rebuild flags

    const hasIssues = resolution.venues.some(v => v.issues && v.issues.length > 0);
    const anyRetry = resolution.global_requires_retry || resolution.venues.some(v => v.requires_retry);
    const anyRebuild = resolution.global_requires_rebuild || resolution.venues.some(v => v.requires_rebuild);

    return hasIssues && !anyRetry && !anyRebuild;
}

// ---------- Envelope Helpers ----------

function createSuccessEnvelope(timestamp, plan, resolution, correction) {
    // Deep clone to ensure immutability
    return {
        ok: true,
        module: "execution_correction_engine",
        timestamp,
        payload: {
            plan: JSON.parse(JSON.stringify(plan)),
            resolution: JSON.parse(JSON.stringify(resolution)),
            correction: JSON.parse(JSON.stringify(correction))
        }
    };
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_correction_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    determineCorrection
};
