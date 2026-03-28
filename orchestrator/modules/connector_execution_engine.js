/**
 * Phase 47 v3: Connector Execution Engine (Pure Logic)
 *
 * Canonical, deterministic, replay-native connector execution layer.
 * Executes LIVE mode actions and converts replay plans into REPLAY mode execution.
 * 
 * NO IO. NO MUTATION. DETERMINISTIC.
 */

/**
 * Main entry point for Phase 47 Connector Execution Engine.
 *
 * @param {object} input - Phase47ConnectorInputV1
 * @param {object} options - { now?, hrtime?, timestampProvider?, executor? }
 * @returns {object} - Envelope with Phase47ConnectorResultV1
 */
function executeConnector(input, options = {}) {
    const timestampProvider = options.timestampProvider || (() => new Date().toISOString());
    const timestamp = timestampProvider();
    const now = options.now || (() => new Date().toISOString());
    const hrtime = options.hrtime || (() => Date.now());

    try {
        // 1. Input Validation
        const validationError = validateInput(input);
        if (validationError) {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", validationError);
        }

        const { mode, connector_key, execution_id, iteration_index, request, replay_snapshot, observability, meta } = input;

        // 2. Deterministic Timing
        const started_at = now();
        const hr_start = hrtime();

        let result;

        // 3. Mode-Specific Execution
        if (mode === "LIVE") {
            result = executeLiveMode(input, options, started_at, hr_start, hrtime, now);
        } else if (mode === "REPLAY") {
            result = executeReplayMode(input, started_at, hr_start, hrtime, now);
        }

        return {
            ok: result.ok,
            module: "connector_execution_engine",
            timestamp,
            payload: result,
            error: result.ok ? null : result.error
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Input Validation ----------

function validateInput(input) {
    if (!input || typeof input !== "object") {
        return "Input must be an object";
    }

    // Check mode
    if (!input.mode || !["LIVE", "REPLAY"].includes(input.mode)) {
        return "Invalid or missing mode. Must be 'LIVE' or 'REPLAY'";
    }

    // Check meta
    if (!input.meta || typeof input.meta !== "object") {
        return "Missing or invalid meta";
    }

    if (input.meta.input_contract_version !== "Phase47ConnectorInputV1") {
        return "Invalid input_contract_version. Expected 'Phase47ConnectorInputV1'";
    }

    // Check required fields
    if (!input.connector_key || typeof input.connector_key !== "string") {
        return "Missing or invalid connector_key";
    }

    if (!input.execution_id || typeof input.execution_id !== "string") {
        return "Missing or invalid execution_id";
    }

    if (typeof input.iteration_index !== "number") {
        return "Missing or invalid iteration_index";
    }

    // Mode-specific validation
    if (input.mode === "LIVE") {
        if (!input.request) {
            return "LIVE mode requires 'request' field";
        }
        if (input.replay_snapshot) {
            return "LIVE mode cannot have 'replay_snapshot' field";
        }
    }

    if (input.mode === "REPLAY") {
        if (!input.replay_snapshot) {
            return "REPLAY mode requires 'replay_snapshot' field";
        }
        if (input.request) {
            return "REPLAY mode cannot have 'request' field";
        }
    }

    return null; // Valid
}

// ---------- LIVE Mode Execution ----------

function executeLiveMode(input, options, started_at, hr_start, hrtime, now) {
    const { connector_key, execution_id, request } = input;
    const executor = options.executor || (() => ({ raw: null, normalized: null }));

    try {
        // Execute stub
        const response = executor(request);

        const finished_at = now();
        const hr_end = hrtime();
        const duration_ms = hr_end - hr_start;

        return {
            ok: true,
            connector_key,
            execution_id,
            mode: "LIVE",
            replay_source: "LIVE_EXECUTION",
            status: "SUCCESS",
            connector: connector_key,
            request: {
                raw: request?.raw_request || null,
                normalized: request?.normalized_request || null
            },
            response: {
                raw: response?.raw || null,
                normalized: response?.normalized || null
            },
            error: {
                code: null,
                message: null
            },
            metrics: {
                duration_ms,
                started_at,
                finished_at
            },
            logs: [],
            started_at,
            finished_at
        };
    } catch (err) {
        const finished_at = now();
        const hr_end = hrtime();
        const duration_ms = hr_end - hr_start;

        return {
            ok: false,
            connector_key,
            execution_id,
            mode: "LIVE",
            replay_source: "LIVE_EXECUTION",
            status: "FAILED",
            connector: connector_key,
            request: {
                raw: request?.raw_request || null,
                normalized: request?.normalized_request || null
            },
            response: {
                raw: null,
                normalized: null
            },
            error: {
                code: "EXECUTION_ERROR",
                message: err.message || "Unknown execution error"
            },
            metrics: {
                duration_ms,
                started_at,
                finished_at
            },
            logs: [],
            started_at,
            finished_at
        };
    }
}

// ---------- REPLAY Mode Execution ----------

function executeReplayMode(input, started_at, hr_start, hrtime, now) {
    const { connector_key, execution_id, replay_snapshot } = input;

    // Extract preserved response
    const connectorResponses = replay_snapshot?.connector_responses;
    if (!connectorResponses || typeof connectorResponses !== "object") {
        return createInvalidReplayResult(connector_key, execution_id, "Malformed replay_snapshot: missing connector_responses", started_at, hr_start, hrtime, now);
    }

    const preservedResult = connectorResponses[connector_key];
    if (!preservedResult) {
        return createInvalidReplayResult(connector_key, execution_id, `Connector '${connector_key}' not found in replay snapshot`, started_at, hr_start, hrtime, now);
    }

    // Validate strict Phase47ConnectorResultV1 structure
    const validationError = validateConnectorResult(preservedResult);
    if (validationError) {
        return createInvalidReplayResult(connector_key, execution_id, `Invalid connector result in snapshot: ${validationError}`, started_at, hr_start, hrtime, now);
    }

    // Copy EXACTLY, set mode and replay_source
    return {
        ...preservedResult,
        mode: "REPLAY",
        replay_source: "REPLAY_SNAPSHOT"
    };
}

function createInvalidReplayResult(connector_key, execution_id, errorMessage, started_at, hr_start, hrtime, now) {
    const finished_at = now();
    const hr_end = hrtime();
    const duration_ms = hr_end - hr_start;

    return {
        ok: false,
        connector_key,
        execution_id,
        mode: "REPLAY",
        replay_source: "REPLAY_SNAPSHOT",
        status: "FAILED",
        connector: connector_key,
        request: {
            raw: null,
            normalized: null
        },
        response: {
            raw: null,
            normalized: null
        },
        error: {
            code: "INVALID_INPUT",
            message: errorMessage
        },
        metrics: {
            duration_ms,
            started_at,
            finished_at
        },
        logs: [],
        started_at,
        finished_at
    };
}

// ---------- Connector Result Validation ----------

function validateConnectorResult(result) {
    if (!result || typeof result !== "object") {
        return "Result must be an object";
    }

    const requiredFields = [
        "ok", "connector_key", "execution_id", "mode", "replay_source",
        "status", "connector",
        "request", "response", "error", "metrics", "logs", "started_at", "finished_at"
    ];

    for (const field of requiredFields) {
        if (!(field in result)) {
            return `Missing required field: ${field}`;
        }
    }

    // Validate nested structures
    if (!result.request || typeof result.request !== "object") {
        return "request must be an object";
    }
    if (!("raw" in result.request) || !("normalized" in result.request)) {
        return "request must have 'raw' and 'normalized' fields";
    }

    if (!result.response || typeof result.response !== "object") {
        return "response must be an object";
    }
    if (!("raw" in result.response) || !("normalized" in result.response)) {
        return "response must have 'raw' and 'normalized' fields";
    }

    if (!result.error || typeof result.error !== "object") {
        return "error must be an object";
    }

    if (!result.metrics || typeof result.metrics !== "object") {
        return "metrics must be an object";
    }

    if (!Array.isArray(result.logs)) {
        return "logs must be an array";
    }

    return null; // Valid
}

// ---------- Envelope Helper ----------

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "connector_execution_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    executeConnector
};
