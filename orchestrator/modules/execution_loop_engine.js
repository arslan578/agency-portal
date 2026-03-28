/**
 * Phase 27: Execution Loop Engine (Pure Logic)
 *
 * Pure logic controller that integrates outputs from Phases 22-26.
 * Produces a deterministic ExecutionLoopPlan with decision: CONTINUE, STOP, or ABORT.
 * No IO, no state mutation, no time-based logic.
 */

/**
 * Main entry point for Phase 27.
 *
 * @param {object} input - { loop_context, loop_config }
 * @returns {object} - Orchestrator envelope
 */
function decideLoopAction(input) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Input Validation
        if (!input || typeof input !== "object") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "EXECUTION_LOOP_DECIDE_V1 requires { loop_context, loop_config } payload");
        }

        const { loop_context, loop_config } = input;

        if (!loop_context || typeof loop_context !== "object") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing or invalid 'loop_context'");
        }

        if (typeof loop_context.loop_id !== "string" || loop_context.loop_id.trim() === "") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing or invalid 'loop_id'");
        }

        if (typeof loop_context.iteration_index !== "number") {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing or invalid 'iteration_index'");
        }

        // 2. Merge config with defaults
        const config = {
            max_iterations: 5,
            max_no_change_iterations: 2,
            treat_partial_as_retryable: true,
            treat_timeout_as_retryable: true,
            treat_failed_as_retryable: true,
            ...(loop_config || {})
        };

        // 3. Extract context data
        const iteration_index = loop_context.iteration_index;
        const no_change_iterations = loop_context.no_change_iterations || 0;
        const last_run_result = loop_context.last_run_result || null;
        const last_drift_report = loop_context.last_drift_report || null;
        const last_resolution = loop_context.last_resolution || null;
        const last_correction = loop_context.last_correction || null;
        const last_connector_plan = loop_context.last_connector_plan || null;

        // 4. Derive status indicators
        const runStatus = deriveRunStatus(last_run_result);
        const correctionAction = last_correction?.action || null;
        const has_drift = last_drift_report?.summary?.has_drift || false;

        const connectorActions = Array.isArray(last_connector_plan?.connector_actions)
            ? last_connector_plan.connector_actions
            : [];
        const hasConnectorActions = connectorActions.length > 0;

        // 5. Apply decision rules
        const decision = makeLoopDecision({
            iteration_index,
            no_change_iterations,
            runStatus,
            correctionAction,
            has_drift,
            hasConnectorActions,
            config
        });

        // 6. Build ExecutionLoopPlan
        const loopPlan = {
            loop_id: loop_context.loop_id,
            previous_iteration_index: iteration_index,
            next_iteration_index: decision.decision === "CONTINUE" ? iteration_index + 1 : iteration_index,
            decision: decision.decision,
            reason: decision.reason,
            control: {
                should_execute_connector_plan: decision.decision === "CONTINUE" && hasConnectorActions,
                is_terminal: decision.decision === "ABORT" || decision.decision === "STOP"
            },
            diagnostics: {
                run_status: runStatus,
                correction_action: correctionAction,
                has_drift,
                no_change_iterations: decision.next_no_change_count,
                max_iterations: config.max_iterations
            }
        };

        return {
            ok: true,
            module: "execution_loop_engine",
            timestamp,
            payload: loopPlan
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Status Derivation ----------

function deriveRunStatus(last_run_result) {
    if (!last_run_result || !last_run_result.summary) return "UNKNOWN";

    const summary = last_run_result.summary;

    if (summary.failed > 0) return "FAILED";
    if (summary.skipped > 0 && summary.success === 0) return "SKIPPED";
    if (summary.success > 0 && summary.failed === 0) return "SUCCESS";
    if (summary.success === 0 && summary.failed === 0 && summary.skipped === 0) return "NO_OP";

    return "PARTIAL";
}

// ---------- Decision Logic ----------

function makeLoopDecision(params) {
    const {
        iteration_index,
        no_change_iterations,
        runStatus,
        correctionAction,
        has_drift,
        hasConnectorActions,
        config
    } = params;

    // Rule 1: Hard ABORT conditions
    if (correctionAction === "ABORT_EXECUTION") {
        return {
            decision: "ABORT",
            reason: { code: "ABORT_CORRECTION", message: "Correction decision requested abort" },
            next_no_change_count: 0
        };
    }

    if (runStatus === "FAILED" && !config.treat_failed_as_retryable) {
        return {
            decision: "ABORT",
            reason: { code: "ABORT_FAILED_NOT_RETRYABLE", message: "Run failed and retries disabled" },
            next_no_change_count: 0
        };
    }

    if (iteration_index >= config.max_iterations) {
        return {
            decision: "ABORT",
            reason: { code: "ABORT_MAX_ITERATIONS", message: `Max iterations (${config.max_iterations}) reached` },
            next_no_change_count: 0
        };
    }

    // Calculate no-change status
    const isNoChange = runStatus === "SUCCESS" && correctionAction === "NO_ACTION" && !has_drift && !hasConnectorActions;
    const next_no_change_count = isNoChange ? no_change_iterations + 1 : 0;

    // Rule 2a: Check no-change limit first (before other STOP conditions)
    if (next_no_change_count >= config.max_no_change_iterations) {
        return {
            decision: "STOP",
            reason: { code: "STOP_NO_CHANGE_LIMIT", message: `No change for ${next_no_change_count} iterations` },
            next_no_change_count
        };
    }

    // Rule 2b: Clean STOP conditions
    if (runStatus === "SUCCESS" || runStatus === "NO_OP") {
        if (correctionAction === "NO_ACTION" && !has_drift) {
            return {
                decision: "STOP",
                reason: { code: "STOP_SUCCESS_NO_DRIFT", message: "Execution succeeded with no drift" },
                next_no_change_count
            };
        }
    }

    // Rule 3: Continue conditions
    if (hasConnectorActions && iteration_index < config.max_iterations) {
        return {
            decision: "CONTINUE",
            reason: { code: "CONTINUE_CONNECTOR_PLAN", message: "Connector plan available for execution" },
            next_no_change_count
        };
    }

    // Defensive STOP: no connector plan and not stable enough
    return {
        decision: "STOP",
        reason: { code: "STOP_NO_CONNECTOR_PLAN", message: "No connector plan available" },
        next_no_change_count
    };
}

// ---------- Envelope Helper ----------

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_loop_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    decideLoopAction
};
