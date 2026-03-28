/**
 * Phase 22: Execution Run Engine v1
 *
 * Orchestrator wrapper around the connector IO layer.
 * Takes a Phase-20-style payload + injected connector config,
 * calls connector_io_engine.run, and returns a run-level envelope with summary.
 */

const connectorIO = require("./connector_io_engine");

/**
 * Main entry point for Phase 22.
 *
 * @param {object} input - Execution run input
 * @param {object} injectedConfig - Optional IO config (same shape as Phase 21C)
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run(input, injectedConfig = {}) {
    const timestamp = new Date().toISOString();

    // 1. Validate input
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope(timestamp, "INVALID_INPUT",
            "Phase 22 requires input with connector_payload");
    }

    if (!input.connector_payload || typeof input.connector_payload !== 'object') {
        return createErrorEnvelope(timestamp, "INVALID_INPUT",
            "connector_payload is required");
    }

    if (!input.connector_payload.connector_requests ||
        !Array.isArray(input.connector_payload.connector_requests.venues)) {
        return createErrorEnvelope(timestamp, "INVALID_INPUT",
            "connector_payload.connector_requests.venues must be an array");
    }

    // 2. Determine run_id
    const run_id = (input.run_id && typeof input.run_id === 'string' && input.run_id.length > 0)
        ? input.run_id
        : `run_${timestamp}`;

    try {
        // 3. Call connector_io_engine
        const ioEnvelope = await connectorIO.run(input.connector_payload, injectedConfig);

        // 4. Handle connector IO error
        if (!ioEnvelope.ok) {
            return {
                ok: false,
                module: "execution_run_engine",
                timestamp,
                payload: null,
                error: {
                    code: "CONNECTOR_IO_ERROR",
                    message: ioEnvelope.error?.message || "Connector IO failed"
                }
            };
        }

        // 5. Extract venues and compute summary
        const venues = ioEnvelope.payload.venues || [];
        const summary = computeSummary(venues);

        return {
            ok: true,
            module: "execution_run_engine",
            timestamp,
            payload: {
                run_id,
                plan: input.plan || null,
                connector_io: {
                    venues
                },
                summary
            }
        };

    } catch (error) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", error.message);
    }
}

/**
 * Compute summary counts from venue results.
 */
function computeSummary(venues) {
    const total_venues = venues.length;
    let skipped = 0;
    let success = 0;
    let failed = 0;

    for (const venue of venues) {
        if (venue.status === "SKIPPED") {
            skipped++;
        } else if (venue.status === "FAILED") {
            failed++;
        } else if (venue.status === "READY" && venue.errors && venue.errors.length > 0) {
            // READY with errors = failed
            failed++;
        } else if (venue.status === "READY" &&
            (!venue.errors || venue.errors.length === 0) &&
            venue.http_status !== null &&
            venue.http_status >= 200 && venue.http_status <= 299) {
            // READY with no errors and successful http_status = success
            success++;
        } else {
            // READY with null http_status or non-2xx status = failed
            failed++;
        }
    }

    return {
        total_venues,
        skipped,
        success,
        failed
    };
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_run_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    run
};
