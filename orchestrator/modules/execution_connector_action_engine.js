/**
 * Phase 26: Execution Connector Action Engine (Pure Logic)
 *
 * Translates a Phase 25 CorrectionDecision into a concrete ConnectorActionPlan
 * with specific jobs for connector runners. No IO.
 */

/**
 * Main entry point for Phase 26.
 *
 * @param {object} input - { plan, connector_bundle, correction }
 * @returns {object} - Orchestrator envelope
 */
function buildConnectorActions(input) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Input Validation
        if (!input || typeof input !== "object") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "EXECUTION_CONNECTOR_ACTION_V1 requires { plan, connector_bundle, correction } payload");
        }

        const { plan, connector_bundle, correction } = input;

        // Validate plan
        if (!plan || typeof plan !== "object") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'plan'");
        }

        // Validate connector_bundle
        if (!connector_bundle || typeof connector_bundle !== "object" || !Array.isArray(connector_bundle.venues)) {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'connector_bundle' or 'connector_bundle.venues'");
        }

        // Validate correction
        if (!correction || typeof correction !== "object" ||
            typeof correction.action !== "string" ||
            typeof correction.reason !== "string" ||
            typeof correction.requires_connector_io !== "boolean" ||
            typeof correction.requires_rebuild !== "boolean" ||
            typeof correction.is_terminal !== "boolean") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Invalid or missing 'correction'");
        }

        // 2. Map action to connector actions
        const connector_actions = mapCorrectionToActions(correction, connector_bundle);

        if (!connector_actions.ok) {
            return createErrorEnvelope(timestamp, connector_actions.error.code, connector_actions.error.message);
        }

        // 3. Build success envelope with deep clones
        return {
            ok: true,
            module: "execution_connector_action_engine",
            timestamp,
            payload: {
                plan: JSON.parse(JSON.stringify(plan)),
                connector_bundle: JSON.parse(JSON.stringify(connector_bundle)),
                correction: JSON.parse(JSON.stringify(correction)),
                connector_actions: connector_actions.data
            }
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Action Mapping Logic ----------

function mapCorrectionToActions(correction, connector_bundle) {
    const { action, reason, targets, requires_connector_io, requires_rebuild, is_terminal } = correction;

    const connector_actions = {
        action,
        is_terminal,
        requires_rebuild,
        requires_connector_io,
        summary: "",
        jobs: []
    };

    switch (action) {
        case "ABORT_EXECUTION":
            connector_actions.summary = "Global abort: all connector operations halted";
            connector_actions.jobs = [{
                job_id: "GLOBAL:ABORT:0",
                venue_key: "*",
                connector_key: "*",
                mode: "ABORT",
                scope: "GLOBAL",
                request_ids: [],
                reason
            }];
            break;

        case "GLOBAL_REBUILD":
        case "REBUILD_CONNECTOR_REQUESTS": // Accept both forms
            connector_actions.summary = "Global rebuild required";
            connector_actions.jobs = [{
                job_id: "GLOBAL:REBUILD:0",
                venue_key: "*",
                connector_key: "*",
                mode: "REBUILD",
                scope: "GLOBAL",
                request_ids: [],
                reason
            }];
            break;

        case "VENUE_REBUILD":
            if (!targets || !Array.isArray(targets.venues) || targets.venues.length === 0) {
                return {
                    ok: false,
                    error: { code: "INVALID_CORRECTION_TARGETS", message: "VENUE_REBUILD requires non-empty targets.venues array" }
                };
            }

            connector_actions.summary = `Rebuild required for ${targets.venues.length} venue(s)`;
            connector_actions.jobs = buildVenueRebuildJobs(targets.venues, connector_bundle, reason);
            break;

        case "GLOBAL_RETRY":
        case "RETRY_CONNECTOR_IO": // Accept both forms if global
            connector_actions.summary = "Global retry of failed connector requests";
            connector_actions.jobs = buildGlobalRetryJobs(connector_bundle, reason);
            break;

        case "VENUE_RETRY":
            if (!targets || !Array.isArray(targets.venues) || targets.venues.length === 0) {
                return {
                    ok: false,
                    error: { code: "INVALID_CORRECTION_TARGETS", message: "VENUE_RETRY requires non-empty targets.venues array" }
                };
            }

            connector_actions.summary = `Retry required for ${targets.venues.length} venue(s)`;
            connector_actions.jobs = buildVenueRetryJobs(targets.venues, connector_bundle, reason);
            break;

        case "NO_ACTION":
            connector_actions.summary = "No connector action required";
            connector_actions.jobs = [{
                job_id: "GLOBAL:NOOP:0",
                venue_key: "*",
                connector_key: "*",
                mode: "NOOP",
                scope: "GLOBAL",
                request_ids: [],
                reason: reason || "No connector action required"
            }];
            break;

        default:
            return {
                ok: false,
                error: { code: "UNSUPPORTED_ACTION", message: `Unknown action: ${action}` }
            };
    }

    return { ok: true, data: connector_actions };
}

// ---------- Job Builders ----------

function buildVenueRebuildJobs(targetVenues, connector_bundle, reason) {
    const jobs = [];
    const sortedVenues = [...targetVenues].sort();

    for (const venue_key of sortedVenues) {
        const venueEntry = connector_bundle.venues.find(v => v.venue_key === venue_key);

        if (!venueEntry) {
            // Venue not found, create NOOP job
            jobs.push({
                job_id: `${venue_key}:NOOP:0`,
                venue_key,
                connector_key: "unknown",
                mode: "NOOP",
                scope: "VENUE",
                request_ids: [],
                reason: `Venue '${venue_key}' not found in connector bundle`
            });
        } else {
            jobs.push({
                job_id: `${venue_key}:REBUILD:0`,
                venue_key,
                connector_key: venueEntry.connector_key || venueEntry.platform_kind || "unknown",
                mode: "REBUILD",
                scope: "VENUE",
                request_ids: [],
                reason
            });
        }
    }

    return jobs;
}

function buildGlobalRetryJobs(connector_bundle, reason) {
    const jobs = [];
    const sortedVenues = [...connector_bundle.venues].sort((a, b) => a.venue_key.localeCompare(b.venue_key));

    for (const venue of sortedVenues) {
        const retryableRequestIds = collectRetryableRequests(venue.requests || []);

        jobs.push({
            job_id: `${venue.venue_key}:RETRY:0`,
            venue_key: venue.venue_key,
            connector_key: venue.connector_key || venue.platform_kind || "unknown",
            mode: "RETRY",
            scope: "GLOBAL",
            request_ids: retryableRequestIds,
            reason
        });
    }

    return jobs;
}

function buildVenueRetryJobs(targetVenues, connector_bundle, reason) {
    const jobs = [];
    const sortedVenues = [...targetVenues].sort();

    for (const venue_key of sortedVenues) {
        const venueEntry = connector_bundle.venues.find(v => v.venue_key === venue_key);

        if (!venueEntry) {
            // Venue not found, create NOOP job
            jobs.push({
                job_id: `${venue_key}:NOOP:0`,
                venue_key,
                connector_key: "unknown",
                mode: "NOOP",
                scope: "VENUE",
                request_ids: [],
                reason: `Venue '${venue_key}' not found in connector bundle`
            });
        } else {
            const retryableRequestIds = collectRetryableRequests(venueEntry.requests || []);

            jobs.push({
                job_id: `${venue_key}:RETRY:0`,
                venue_key,
                connector_key: venueEntry.connector_key || venueEntry.platform_kind || "unknown",
                mode: "RETRY",
                scope: "VENUE",
                request_ids: retryableRequestIds,
                reason
            });
        }
    }

    return jobs;
}

function collectRetryableRequests(requests) {
    // A request is retryable if status is missing, "FAILED", or "TIMEOUT"
    // Do not retry "SUCCESS" or "PENDING"
    return requests
        .filter(req => {
            const status = req.status;
            return !status || status === "FAILED" || status === "TIMEOUT";
        })
        .map(req => req.request_id);
}

// ---------- Envelope Helper ----------

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_connector_action_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    buildConnectorActions
};
