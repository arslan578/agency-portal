/**
 * Phase 53: Connector Escalation Logic Engine
 * 
 * Generates deterministic escalation plans based on Phase 51 outcomes, Phase 52 rebuild
 * plans, connector capabilities, and policy constraints. Pure planning engine—no execution.
 * 
 * Input Contract: connector_escalation_input_v1
 * Output Contract: connector_escalation_plan_v1
 * Feature Flag: FF_CONNECTOR_ESCALATION_ENGINE
 *
 * // Phase 53 reads routing_flags and error_surface definitions from Phase 27B connector_backplane_v1.
 */

const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

/**
 * Execute Phase 53: Connector Escalation Logic
 */
async function execute(envelope) {
    // 1. Feature Flag Check
    const featureFlagEnabled = process.env.FF_CONNECTOR_ESCALATION_ENGINE === 'true';

    if (!featureFlagEnabled) {
        return createFeatureDisabledResponse(envelope);
    }

    // 2. Input Validation
    const validationError = validateInput(envelope);
    if (validationError) {
        return createErrorResponse(envelope, validationError);
    }

    // 3. Start Span
    const span = startSpan('connector_escalation_engine_v1', {
        execution_id: envelope.execution_id,
        trace_domain: envelope.trace_domain,
        connector_key: envelope.connector_key
    });

    try {
        const {
            execution_id,
            trace_domain,
            connector_key,
            phase_51,
            phase_52,
            connector_capabilities,
            policy_constraints
        } = envelope;

        // 4. Policy Hard Stop Check (Supreme Priority)
        if (isPolicyHardStop(phase_51.stop_reason, policy_constraints.escalation_hard_stops)) {
            const result = createHardStopResponse(envelope);
            logEscalation(envelope, 'HARD_STOP', 'POLICY_BLOCKED');
            metrics.count('escalation_invoked', 1);
            metrics.count('policy_blocked', 1);
            return result;
        }

        // 5. Determine Escalation Strategy
        const strategy = determineStrategy(
            phase_51,
            phase_52,
            connector_capabilities,
            policy_constraints
        );

        // 6. Generate Strategy Details
        const details = generateStrategyDetails(
            strategy,
            phase_51,
            connector_capabilities,
            policy_constraints
        );

        // 7. Create Snapshot
        const snapshot = createSnapshot({
            execution_id,
            connector_key,
            rebuild_type: phase_52.rebuild_type,
            phase_51_stop_reason: phase_51.stop_reason,
            chosen_strategy: strategy,
            connector_capabilities,
            policy_constraints
        });

        // 8. Assemble Response
        const response = {
            execution_id,
            trace_domain,
            connector_key,
            escalation_plan: {
                strategy,
                details,
                snapshot
            },
            status: 'SUCCESS',
            status_code: 'OK'
        };

        // 9. Observability
        logEscalation(envelope, strategy, 'OK');
        metrics.count('escalation_invoked', 1);
        metrics.count(`strategy_chosen_${strategy.toLowerCase()}`, 1);

        return response;

    } catch (error) {
        logStructured('connector_escalation_error', {
            execution_id: envelope?.execution_id,
            error: error.message
        });
        metrics.count('escalation_error', 1);
        return createErrorResponse(envelope, error.message);
    } finally {
        span.end();
    }
}

/**
 * Validate input envelope
 */
function validateInput(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        return 'Envelope must be an object';
    }

    const required = [
        'execution_id', 'trace_domain', 'connector_key',
        'tenant_id', 'workspace_id', 'phase_51', 'phase_52',
        'connector_capabilities', 'policy_constraints'
    ];

    for (const field of required) {
        if (!envelope[field]) {
            return `Missing required field: ${field}`;
        }
    }

    // Validate phase_51
    if (!envelope.phase_51.status || !envelope.phase_51.stop_reason) {
        return 'phase_51 must include status and stop_reason';
    }

    // Validate phase_52
    if (!envelope.phase_52.rebuild_type) {
        return 'phase_52 must include rebuild_type';
    }

    // Validate connector_capabilities
    const caps = envelope.connector_capabilities;
    if (!Array.isArray(caps.fallback_connectors) ||
        !Array.isArray(caps.credential_modes) ||
        !Array.isArray(caps.api_versions)) {
        return 'connector_capabilities arrays must be valid arrays';
    }

    // Validate policy_constraints
    const policy = envelope.policy_constraints;
    if (!Array.isArray(policy.escalation_hard_stops)) {
        return 'policy_constraints.escalation_hard_stops must be an array';
    }

    return null;
}

/**
 * Check if policy enforces hard stop
 */
function isPolicyHardStop(stopReason, hardStops) {
    return Array.isArray(hardStops) && hardStops.includes(stopReason);
}

/**
 * Determine escalation strategy based on inputs
 */
function determineStrategy(phase_51, phase_52, capabilities, policy) {
    const { status, stop_reason } = phase_51;
    const { rebuild_type } = phase_52;

    // Clean success → no escalation
    if (status === 'SUCCESS' && stop_reason === 'SUCCESS') {
        return 'NO_ESCALATION';
    }

    // Determine available options based on rebuild type
    const options = getAvailableOptions(rebuild_type, phase_51, capabilities, policy);

    if (options.length === 0) {
        return 'NO_ESCALATION';
    }

    // Return highest priority option
    return options[0];
}

/**
 * Get available escalation options in priority order
 */
function getAvailableOptions(rebuildType, phase_51, capabilities, policy) {
    const options = [];

    if (rebuildType === 'NO_REBUILD') {
        // Priority: credential → fallback → API → sandbox
        if (policy.allow_credential_rotation && capabilities.credential_modes.length > 0) {
            options.push('CREDENTIAL_ROTATION');
        }
        if (policy.allow_fallback && capabilities.fallback_connectors.length > 0) {
            options.push('FALLBACK_CONNECTOR');
        }
        if (policy.allow_api_upgrade && capabilities.api_versions.length > 1) {
            options.push('API_VERSION_UPGRADE');
        }
        if (policy.allow_sandbox_retry && capabilities.sandbox_supported) {
            options.push('SANDBOX_RETRY');
        }
    } else if (rebuildType === 'PARTIAL_REBUILD') {
        // Limited options
        if (policy.allow_credential_rotation && capabilities.credential_modes.length > 0) {
            options.push('CREDENTIAL_ROTATION');
        }
        if (policy.allow_fallback && capabilities.fallback_connectors.length > 0) {
            options.push('FALLBACK_CONNECTOR');
        }
        // API upgrade only if version-related issue
        if (policy.allow_api_upgrade &&
            capabilities.api_versions.length > 1 &&
            (phase_51.stop_reason.includes('VERSION') || phase_51.stop_reason.includes('API'))) {
            options.push('API_VERSION_UPGRADE');
        }
        if (policy.allow_sandbox_retry && capabilities.sandbox_supported) {
            options.push('SANDBOX_RETRY');
        }
    } else if (rebuildType === 'FULL_REBUILD') {
        // Priority: fallback → credential → API → sandbox → composite
        if (policy.allow_fallback && capabilities.fallback_connectors.length > 0) {
            options.push('FALLBACK_CONNECTOR');
        }
        if (policy.allow_credential_rotation && capabilities.credential_modes.length > 0) {
            options.push('CREDENTIAL_ROTATION');
        }
        if (policy.allow_api_upgrade && capabilities.api_versions.length > 1) {
            options.push('API_VERSION_UPGRADE');
        }
        if (policy.allow_sandbox_retry && capabilities.sandbox_supported) {
            options.push('SANDBOX_RETRY');
        }
        // Composite only if multiple options and policy allows
        if (policy.allow_composite_strategies && options.length > 1) {
            options.push('COMPOSITE');
        }
    }

    return options;
}

/**
 * Generate strategy-specific details
 */
function generateStrategyDetails(strategy, phase_51, capabilities, policy) {
    switch (strategy) {
        case 'NO_ESCALATION':
            return null;

        case 'FALLBACK_CONNECTOR':
            return {
                target_connector: capabilities.fallback_connectors[0],
                reason: `Primary connector failed with ${phase_51.stop_reason}`
            };

        case 'CREDENTIAL_ROTATION':
            return {
                credential_mode: capabilities.credential_modes[1] || capabilities.credential_modes[0],
                reason: `Credential rotation due to ${phase_51.stop_reason}`
            };

        case 'API_VERSION_UPGRADE':
            return {
                target_version: capabilities.api_versions[capabilities.api_versions.length - 1],
                reason: `API upgrade attempt for ${phase_51.stop_reason}`
            };

        case 'SANDBOX_RETRY':
            return {
                sandbox_mode: true,
                reason: `Safe sandbox retry after ${phase_51.stop_reason}`
            };

        case 'COMPOSITE':
            const compositeStrategies = [];
            if (policy.allow_fallback && capabilities.fallback_connectors.length > 0) {
                compositeStrategies.push('FALLBACK_CONNECTOR');
            }
            if (policy.allow_credential_rotation && capabilities.credential_modes.length > 0) {
                compositeStrategies.push('CREDENTIAL_ROTATION');
            }
            return {
                strategies: compositeStrategies,
                order: compositeStrategies,
                reason: `Composite escalation for ${phase_51.stop_reason}`
            };

        case 'HARD_STOP':
            return {
                blocked_reason: phase_51.stop_reason,
                policy_rule: 'escalation_hard_stops'
            };

        default:
            return null;
    }
}

/**
 * Create deterministic snapshot
 */
function createSnapshot(input) {
    return {
        execution_id: input.execution_id,
        connector_key: input.connector_key,
        rebuild_type: input.rebuild_type,
        phase_51_stop_reason: input.phase_51_stop_reason,
        chosen_strategy: input.chosen_strategy,
        ordered_capabilities: {
            fallback_connectors: [...input.connector_capabilities.fallback_connectors],
            credential_modes: [...input.connector_capabilities.credential_modes],
            api_versions: [...input.connector_capabilities.api_versions]
        },
        policy_flags: {
            allow_fallback: input.policy_constraints.allow_fallback,
            allow_credential_rotation: input.policy_constraints.allow_credential_rotation,
            allow_api_upgrade: input.policy_constraints.allow_api_upgrade,
            allow_sandbox_retry: input.policy_constraints.allow_sandbox_retry,
            allow_composite_strategies: input.policy_constraints.allow_composite_strategies
        }
    };
}

/**
 * Create response when feature flag is disabled
 */
function createFeatureDisabledResponse(envelope) {
    return {
        execution_id: envelope?.execution_id,
        trace_domain: envelope?.trace_domain,
        connector_key: envelope?.connector_key,
        status: 'SUCCESS',
        status_code: 'FEATURE_DISABLED',
        escalation_plan: {
            strategy: 'NO_ESCALATION',
            details: null,
            snapshot: {
                feature_enabled: false
            }
        }
    };
}

/**
 * Create hard stop response
 */
function createHardStopResponse(envelope) {
    return {
        execution_id: envelope.execution_id,
        trace_domain: envelope.trace_domain,
        connector_key: envelope.connector_key,
        status: 'HARD_STOP',
        status_code: 'POLICY_BLOCKED',
        escalation_plan: {
            strategy: 'HARD_STOP',
            details: {
                blocked_reason: envelope.phase_51.stop_reason,
                policy_rule: 'escalation_hard_stops'
            },
            snapshot: createSnapshot({
                execution_id: envelope.execution_id,
                connector_key: envelope.connector_key,
                rebuild_type: envelope.phase_52.rebuild_type,
                phase_51_stop_reason: envelope.phase_51.stop_reason,
                chosen_strategy: 'HARD_STOP',
                connector_capabilities: envelope.connector_capabilities,
                policy_constraints: envelope.policy_constraints
            })
        }
    };
}

/**
 * Create error response
 */
function createErrorResponse(envelope, errorMessage) {
    return {
        execution_id: envelope?.execution_id,
        trace_domain: envelope?.trace_domain,
        connector_key: envelope?.connector_key,
        status: 'ERROR',
        status_code: 'INVALID_INPUT',
        escalation_plan: null,
        error_message: errorMessage
    };
}

/**
 * Log escalation decision
 */
function logEscalation(envelope, strategy, statusCode) {
    logStructured('connector_escalation_decision', {
        execution_id: envelope.execution_id,
        trace_domain: envelope.trace_domain,
        connector_key: envelope.connector_key,
        chosen_strategy: strategy,
        status_code: statusCode
    });
}

module.exports = { execute };
