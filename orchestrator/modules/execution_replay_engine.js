/**
 * Phase 29: Execution Replay Engine (Pure Logic)
 *
 * Consumes an ExecutionSnapshot_v1 from Phase 28 and produces a strict,
 * non-inferential ExecutionReplayPlan_v1.
 *
 * NO IO. NO MUTATION. DETERMINISTIC.
 */

/**
 * Main entry point for Phase 29.
 *
 * @param {object} input - ExecutionReplayInput_v1
 * @param {object} options - { timestampProvider?: () => string }
 * @returns {object} - ExecutionReplayEnvelope_v1
 */
function buildExecutionReplayPlan(input, options = {}) {
    const timestampProvider = options.timestampProvider || (() => new Date().toISOString());
    const timestamp = timestampProvider();

    try {
        // 1. Input Validation
        const validationError = validateInput(input);
        if (validationError) {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", validationError);
        }

        const snapshot = input.snapshot;
        const connectorFilter = input.connector_filter || null;
        const replayOptions = input.options || {};

        // 2. Schema Compatibility and Replayability
        const schemaCompatible = snapshot.flags?.schema_compatible ?? false;
        const canReplay = snapshot.replay?.can_replay ?? false;
        const requireSchema = replayOptions.require_schema_compatible ?? true;

        if ((requireSchema && !schemaCompatible) || !canReplay) {
            const incompatibilityReason = snapshot.replay?.incompatibility_reason ||
                `Schema compatible: ${schemaCompatible}, Can replay: ${canReplay}`;

            const plan = {
                ok: false,
                replay_status: "INCOMPATIBLE",
                replay_key: {
                    execution_id: snapshot.replay?.replay_key?.execution_id || snapshot.execution_id,
                    iteration_index: snapshot.replay?.replay_key?.iteration_index ?? snapshot.loop?.iteration_index ?? 0,
                    snapshot_id: snapshot.replay?.replay_key?.snapshot_id || snapshot.snapshot_id
                },
                snapshot_meta: buildSnapshotMeta(snapshot),
                connector_replay_snapshot: null,
                connectors: {
                    available: [],
                    selected: []
                },
                incompatibility_reason: incompatibilityReason
            };

            return {
                ok: false,
                module: "execution_replay_engine",
                timestamp,
                payload: plan,
                error: {
                    code: "INCOMPATIBLE",
                    message: incompatibilityReason
                }
            };
        }

        // 3. Connector Responses Extraction
        const connectorResponses = snapshot.connector_responses;
        const requireConnectorResponses = replayOptions.require_connector_responses ?? false;

        if (!connectorResponses || !connectorResponses.connector_responses) {
            if (requireConnectorResponses) {
                const plan = {
                    ok: false,
                    replay_status: "NO_CONNECTOR_DATA",
                    replay_key: {
                        execution_id: snapshot.replay.replay_key.execution_id,
                        iteration_index: snapshot.replay.replay_key.iteration_index,
                        snapshot_id: snapshot.replay.replay_key.snapshot_id
                    },
                    snapshot_meta: buildSnapshotMeta(snapshot),
                    connector_replay_snapshot: null,
                    connectors: {
                        available: [],
                        selected: []
                    },
                    incompatibility_reason: "No connector responses available in snapshot"
                };

                return {
                    ok: false,
                    module: "execution_replay_engine",
                    timestamp,
                    payload: plan,
                    error: {
                        code: "NO_CONNECTOR_DATA",
                        message: "No connector responses available in snapshot"
                    }
                };
            }

            // Allow null connector_replay_snapshot for READY state
            const plan = {
                ok: true,
                replay_status: "READY",
                replay_key: {
                    execution_id: snapshot.replay.replay_key.execution_id,
                    iteration_index: snapshot.replay.replay_key.iteration_index,
                    snapshot_id: snapshot.replay.replay_key.snapshot_id
                },
                snapshot_meta: buildSnapshotMeta(snapshot),
                connector_replay_snapshot: null,
                connectors: {
                    available: [],
                    selected: []
                }
            };

            return {
                ok: true,
                module: "execution_replay_engine",
                timestamp,
                payload: plan,
                error: null
            };
        }

        // 4. Connector Filter Application
        const available = Object.keys(connectorResponses.connector_responses || {});
        let selected = [...available];

        if (connectorFilter) {
            if (connectorFilter.include && Array.isArray(connectorFilter.include)) {
                selected = selected.filter(k => connectorFilter.include.includes(k));
            }
            if (connectorFilter.exclude && Array.isArray(connectorFilter.exclude)) {
                selected = selected.filter(k => !connectorFilter.exclude.includes(k));
            }
        }

        // 5. Replay Snapshot Construction
        const connectorReplaySnapshot = {
            replay_mode: "REPLAY",
            connector_responses: {}
        };

        for (const key of selected) {
            connectorReplaySnapshot.connector_responses[key] = connectorResponses.connector_responses[key];
        }

        // 6. Build ExecutionReplayPlan_v1
        const plan = {
            ok: true,
            replay_status: "READY",
            replay_key: {
                execution_id: snapshot.replay.replay_key.execution_id,
                iteration_index: snapshot.replay.replay_key.iteration_index,
                snapshot_id: snapshot.replay.replay_key.snapshot_id
            },
            snapshot_meta: buildSnapshotMeta(snapshot),
            connector_replay_snapshot: connectorReplaySnapshot,
            connectors: {
                available,
                selected
            }
        };

        return {
            ok: true,
            module: "execution_replay_engine",
            timestamp,
            payload: plan,
            error: null
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

    if (input.intent !== "REPLAY_EXECUTION_SNAPSHOT_V1") {
        return "Invalid or missing intent. Expected 'REPLAY_EXECUTION_SNAPSHOT_V1'";
    }

    if (!input.snapshot || typeof input.snapshot !== "object") {
        return "Missing or invalid snapshot (must be object)";
    }

    if (!input.snapshot.replay || typeof input.snapshot.replay !== "object") {
        return "Missing or invalid snapshot.replay";
    }

    if (!input.snapshot.replay.replay_key || typeof input.snapshot.replay.replay_key !== "object") {
        return "Missing or invalid snapshot.replay.replay_key";
    }

    return null; // Valid
}

// ---------- Helper: Build Snapshot Meta ----------

function buildSnapshotMeta(snapshot) {
    return {
        created_at: snapshot.created_at || "",
        run_status: snapshot.loop?.run_status || "NO_OP",
        correction_action: snapshot.loop?.correction_action || "",
        has_drift: snapshot.loop?.has_drift ?? false,
        termination_reason: snapshot.loop?.termination_reason ?? null,
        schema_compatible: snapshot.flags?.schema_compatible ?? false
    };
}

// ---------- Envelope Helper ----------

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_replay_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    buildExecutionReplayPlan
};
