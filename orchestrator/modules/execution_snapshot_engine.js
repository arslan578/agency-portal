/**
 * Phase 28: Execution Snapshot Engine (Pure Logic)
 *
 * Creates deterministic, replayable snapshots of execution loop state.
 * Handles secret redaction and observability hooks. No IO.
 */

const crypto = require('crypto');

/**
 * Main entry point for Phase 28.
 *
 * @param {object} input - ExecutionSnapshotInput_v1
 * @param {object} options - { timestampProvider?: () => string }
 * @returns {object} - Orchestrator envelope with ExecutionSnapshot_v1
 */
function buildExecutionSnapshot(input, options = {}) {
    const timestampProvider = options.timestampProvider || (() => new Date().toISOString());
    const timestamp = timestampProvider();

    try {
        // 1. Input Validation
        const validationError = validateInput(input);
        if (validationError) {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", validationError);
        }

        // 2. Extract and normalize input
        const {
            execution_id,
            run_id = null,
            campaign_id = null,
            brand_id = null,
            iteration_index,
            max_iterations,
            loop_status,
            artifacts = {},
            observability = null,
            meta
        } = input;

        // 3. Generate deterministic snapshot_id
        const snapshot_id = generateSnapshotId(execution_id, iteration_index, meta.input_contract_version || null);

        // 4. Compute terminal iteration flag
        const is_terminal_iteration = iteration_index >= max_iterations - 1;

        // 5. Schema compatibility check
        const schema_compatible = meta.input_contract_version === "ExecutionSnapshotInput_v1";
        const can_replay = schema_compatible;
        const incompatibility_reason = schema_compatible
            ? null
            : `Input contract version mismatch: expected ExecutionSnapshotInput_v1, got ${meta.input_contract_version}`;

        // 6. Redact secrets from artifacts
        const { redactedArtifacts, hasRedactions } = redactArtifacts(artifacts);

        // 7. Count artifacts
        const artifacts_count = Object.keys(artifacts).filter(key => artifacts[key] !== undefined).length;

        // 8. Process Connector Responses (Phase 46)
        let connector_responses_payload = null;
        if (artifacts.connector_responses_envelope && artifacts.connector_responses_envelope.connector_execution_router) {
            const routerResponse = artifacts.connector_responses_envelope.connector_execution_router;
            if (routerResponse.results && Array.isArray(routerResponse.results)) {
                const responsesMap = {};
                for (const result of routerResponse.results) {
                    if (result.connector_key) {
                        // FIX 1: Strict V1 Schema Guard
                        if (isValidConnectorResultV1(result)) {
                            responsesMap[result.connector_key] = result;
                        } else {
                            logEvent({
                                event: "invalid_connector_result_v1",
                                connector_key: result.connector_key
                            });
                        }
                    }
                }
                connector_responses_payload = {
                    replay_mode: "LIVE", // Default to LIVE when capturing
                    connector_responses: responsesMap
                };
            }
        }

        // 9. Build ExecutionSnapshot_v1
        const snapshot = {
            snapshot_id,
            execution_id,
            run_id,
            contract: {
                input_contract: "ExecutionSnapshotInput_v1",
                output_contract: "ExecutionSnapshot_v1",
                orchestrator_version: meta.orchestrator_version || null,
                schema_version: meta.schema_version || null
            },
            created_at: timestamp,
            loop: {
                iteration_index,
                max_iterations,
                is_terminal_iteration,
                run_status: loop_status.run_status,
                correction_action: loop_status.correction_action,
                has_drift: loop_status.has_drift,
                termination_reason: loop_status.termination_reason || null
            },
            ids: {
                campaign_id,
                brand_id
            },
            artifacts: redactedArtifacts,
            connector_responses: connector_responses_payload,
            replay: {
                can_replay,
                replay_intent: "REPLAY_EXECUTION_SNAPSHOT_V1",
                replay_key: {
                    execution_id,
                    iteration_index,
                    snapshot_id
                },
                incompatibility_reason
            },
            observability: {
                trace_id: observability?.trace_id ?? null,
                parent_span_id: observability?.parent_span_id ?? null,
                span_name: "execution_snapshot_engine",
                metrics: {
                    snapshot_bytes: undefined, // Could be computed if needed
                    artifacts_count
                }
            },
            flags: {
                has_redactions: hasRedactions,
                schema_compatible
            }
        };

        // 10. Emit observability hooks
        emitObservability(snapshot);

        // 11. Return envelope
        return {
            ok: true,
            module: "execution_snapshot_engine",
            timestamp,
            payload: snapshot
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Validation ----------

function validateInput(input) {
    if (!input || typeof input !== "object") {
        return "Input must be an object";
    }

    // Check for forbidden top-level secrets
    const forbiddenKeys = ["access_token", "refresh_token", "client_secret", "api_key"];
    for (const key of forbiddenKeys) {
        if (key in input) {
            return `Forbidden secret field '${key}' found at top level`;
        }
    }

    // Required: execution_id
    if (typeof input.execution_id !== "string" || input.execution_id.trim() === "") {
        return "Missing or invalid 'execution_id'";
    }

    // Required: iteration_index
    if (typeof input.iteration_index !== "number" || !Number.isInteger(input.iteration_index) || input.iteration_index < 0) {
        return "Missing or invalid 'iteration_index' (must be integer >= 0)";
    }

    // Required: max_iterations
    if (typeof input.max_iterations !== "number" || !Number.isInteger(input.max_iterations) || input.max_iterations < 1) {
        return "Missing or invalid 'max_iterations' (must be integer >= 1)";
    }

    // Required: loop_status
    if (!input.loop_status || typeof input.loop_status !== "object") {
        return "Missing or invalid 'loop_status' (must be object)";
    }

    // Required: loop_status.run_status
    const validRunStatuses = ["SUCCESS", "FAILED", "PARTIAL", "NO_OP"];
    if (!validRunStatuses.includes(input.loop_status.run_status)) {
        return `Invalid 'loop_status.run_status' (must be one of: ${validRunStatuses.join(", ")})`;
    }

    // Required: loop_status.correction_action
    if (typeof input.loop_status.correction_action !== "string") {
        return "Missing or invalid 'loop_status.correction_action'";
    }

    // Required: loop_status.has_drift
    if (typeof input.loop_status.has_drift !== "boolean") {
        return "Missing or invalid 'loop_status.has_drift' (must be boolean)";
    }

    // Required: meta.input_contract_version
    if (!input.meta || typeof input.meta.input_contract_version !== "string") {
        return "Missing or invalid 'meta.input_contract_version'";
    }

    return null; // Valid
}

// ---------- Snapshot ID Generation ----------

function generateSnapshotId(execution_id, iteration_index, input_contract_version) {
    const data = JSON.stringify({
        execution_id,
        iteration_index,
        input_contract_version
    });

    return crypto.createHash('sha256')
        .update(data)
        .digest('hex')
        .slice(0, 32);
}

// ---------- Secret Redaction ----------

function redactArtifacts(artifacts) {
    let hasRedactions = false;
    const redactedArtifacts = {};

    for (const [key, value] of Object.entries(artifacts)) {
        if (value === undefined) {
            continue;
        }
        const { redacted, hadRedactions } = redactSecrets(value);
        redactedArtifacts[key] = redacted;
        if (hadRedactions) {
            hasRedactions = true;
        }
    }

    return { redactedArtifacts, hasRedactions };
}

function redactSecrets(obj) {
    let hadRedactions = false;
    const secretKeys = new Set(["access_token", "refresh_token", "client_secret", "api_key"]);

    function redactRecursive(value) {
        if (value === null || value === undefined) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(item => redactRecursive(item));
        }

        if (typeof value === "object") {
            const redacted = {};
            for (const [k, v] of Object.entries(value)) {
                if (secretKeys.has(k)) {
                    redacted[k] = "REDACTED";
                    hadRedactions = true;
                } else {
                    redacted[k] = redactRecursive(v);
                }
            }
            return redacted;
        }

        return value;
    }

    const redacted = redactRecursive(obj);
    return { redacted, hadRedactions };
}

// ---------- Observability ----------

function emitObservability(snapshot) {
    // Metric: kaivo.execution_snapshot.count
    emitMetric("kaivo.execution_snapshot.count", 1, {
        execution_id: snapshot.execution_id,
        run_status: snapshot.loop.run_status
    });

    // Metric: kaivo.execution_snapshot.artifacts_count
    emitMetric("kaivo.execution_snapshot.artifacts_count", snapshot.observability.metrics.artifacts_count, {
        execution_id: snapshot.execution_id
    });

    // Metric: kaivo.execution_snapshot.bytes (if computed)
    if (snapshot.observability.metrics.snapshot_bytes !== undefined) {
        emitMetric("kaivo.execution_snapshot.bytes", snapshot.observability.metrics.snapshot_bytes, {
            execution_id: snapshot.execution_id
        });
    }

    // Structured log event
    logEvent({
        event: "execution_snapshot_created",
        execution_id: snapshot.execution_id,
        snapshot_id: snapshot.snapshot_id,
        iteration_index: snapshot.loop.iteration_index,
        run_status: snapshot.loop.run_status,
        correction_action: snapshot.loop.correction_action,
        has_drift: snapshot.loop.has_drift,
        artifacts_count: snapshot.observability.metrics.artifacts_count,
        has_redactions: snapshot.flags.has_redactions,
        schema_compatible: snapshot.flags.schema_compatible
    });

    // Trace span
    emitTraceSpan({
        span_name: "execution_snapshot_engine",
        attributes: {
            "kaivo.execution_id": snapshot.execution_id,
            "kaivo.snapshot_id": snapshot.snapshot_id,
            "kaivo.iteration_index": snapshot.loop.iteration_index,
            "kaivo.run_status": snapshot.loop.run_status
        }
    });
}

function emitMetric(name, value, tags) {
    // Placeholder for metric emission
    // In production, this would call a metrics library like statsd, prometheus, etc.
    // For now, we just log to demonstrate the pattern
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[METRIC] ${name} = ${value}`, tags);
    }
}

function logEvent(event) {
    // Placeholder for structured logging
    // In production, this would use a structured logger like winston, bunyan, etc.
    if (process.env.NODE_ENV !== 'test') {
        console.log('[EVENT]', JSON.stringify(event));
    }
}

function emitTraceSpan(span) {
    // Placeholder for distributed tracing
    // In production, this would use OpenTelemetry or similar
    if (process.env.NODE_ENV !== 'test') {
        console.log('[TRACE]', JSON.stringify(span));
    }
}

// ---------- Envelope Helper ----------

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_snapshot_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

// ---------- Helper: Connector Result Validation ----------

function isValidConnectorResultV1(obj) {
    if (!obj || typeof obj !== "object") return false;

    const requiredKeys = [
        "ok",
        "status",
        "replay_source",
        "connector",
        "request",
        "response",
        "error",
        "metrics",
        "logs",
        "execution_id",
        "started_at",
        "finished_at"
    ];

    for (const key of requiredKeys) {
        if (!(key in obj)) return false;
    }

    // response must contain both nested keys
    if (!obj.response || typeof obj.response !== "object") return false;
    if (!("raw" in obj.response)) return false;
    if (!("normalized" in obj.response)) return false;

    // logs must be array
    if (!Array.isArray(obj.logs)) return false;

    // metrics must be object, but do not validate platform-specific keys
    if (!obj.metrics || typeof obj.metrics !== "object") return false;

    return true;
}

module.exports = {
    buildExecutionSnapshot
};
