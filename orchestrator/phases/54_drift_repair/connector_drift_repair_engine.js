/**
 * Phase 54: Autonomous Drift Repair Engine (CORRECTED VERSION)
 * 
 * Translates escalation plans into deterministic repair blueprints. Pure planning engine—
 * no IO, no connector calls, no side effects.
 * 
 * Input Contract: connector_drift_repair_input_v1
 * Output Contract: connector_drift_repair_plan_v1
 * Feature Flag: FF_AUTONOMOUS_DRIFT_REPAIR
 *
 * // Phase 54 assumes snapshot_shape and metadata_fields from Phase 27B connector_backplane_v1.
 */

const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

/**
 * Allowed top-level envelope fields (strict enforcement)
 */
const ALLOWED_TOP_LEVEL_FIELDS = new Set([
    'execution_id',
    'workspace_id',
    'brand_id',
    'tenant_id',
    'drift_report',
    'rebuild_plan',
    'escalation_plan',
    'connector_capabilities',
    'policy',
    'requested_at',
    'snapshot'
]);

/**
 * Action type priority for deterministic ordering
 */
const ACTION_TYPE_PRIORITY = {
    'ROTATE_CREDENTIALS': 1,
    'UPGRADE_API_VERSION': 2,
    'REBUILD_CONNECTOR': 3,
    'RETRY_CONNECTOR': 4,
    'SANDBOX_RETRY': 5,
    'SWITCH_CONNECTOR': 6
};

const SEVERITY_PRIORITY = {
    'HIGH': 1,
    'MEDIUM': 2,
    'LOW': 3
};

/**
 * Execute Phase 54: Autonomous Drift Repair
 */
async function execute(envelope) {
    // 1. Feature Flag Check
    const featureFlagEnabled = process.env.FF_AUTONOMOUS_DRIFT_REPAIR === 'true';

    if (!featureFlagEnabled) {
        return createFeatureDisabledResponse();
    }

    // 2. Input Validation
    const validationError = validateInput(envelope);
    if (validationError) {
        return createErrorResponse(validationError);
    }

    // 3. Start Span
    const span = startSpan('connector_drift_repair_engine_v1', {
        execution_id: envelope.execution_id,
        workspace_id: envelope.workspace_id,
        brand_id: envelope.brand_id,
        tenant_id: envelope.tenant_id
    });

    try {
        const {
            execution_id,
            drift_report,
            rebuild_plan,
            escalation_plan,
            connector_capabilities,
            policy
        } = envelope;

        // 3.5 Drift connectors must exist in capabilities
        const driftConnectors = new Set(
            drift_report.connector_states.map(state => state.connector_key)
        );

        for (const key of driftConnectors) {
            if (!connector_capabilities[key]) {
                return createConflictResponse(
                    `Connector ${key} has drift but no capabilities entry`,
                    'CAPABILITY_CONFLICT'
                );
            }
        }

        // 4. Policy Supremacy Check (Absolute Override)
        if (policy.forbid_repair === true) {
            const result = createPolicyForbidResponse(envelope);
            logRepairDecision(envelope, 'POLICY_FORBID_REPAIR', 0);
            metrics.count('drift_repair_invoked', 1);
            metrics.count('drift_repair_policy_blocked', 1);
            return result;
        }

        // 4.5 Strategy-level HARD_STOP short-circuit
        if (escalation_plan.strategy === 'HARD_STOP') {
            const snapshot = createSnapshot({
                rebuild_plan,
                escalation_plan,
                drift_report,
                policy,
                connector_capabilities,
                ordered_actions: []
            });

            logRepairDecision(envelope, 'HARD_STOP', 0);
            metrics.count('drift_repair_invoked', 1);
            metrics.count('drift_repair_hard_stop', 1);

            return {
                status: 'SUCCESS',
                status_code: 'HARD_STOP',
                repair_plan: {
                    actions: [],
                    snapshot
                }
            };
        }

        // 5. Strategy Translation (with conflict detection)
        const strategyResult = translateStrategy(
            escalation_plan,
            drift_report,
            connector_capabilities,
            policy
        );

        // Check for strategy conflicts
        if (strategyResult.error) {
            return createConflictResponse(strategyResult.error, strategyResult.code);
        }

        // 6. Generate Rebuild Actions (with conflict detection)
        const rebuildResult = generateRebuildActions(
            rebuild_plan,
            drift_report,
            connector_capabilities,
            policy
        );

        // Check for rebuild conflicts
        if (rebuildResult.error) {
            return createConflictResponse(rebuildResult.error, rebuildResult.code);
        }

        // 7. Merge actions
        const allActions = [...strategyResult.actions, ...rebuildResult.actions];

        // 8. Validate merged actions for conflicts
        const conflictError = validateActionsBeforeSort(allActions, connector_capabilities, policy);
        if (conflictError) {
            return createConflictResponse(conflictError.message, conflictError.code);
        }

        // 9. Deterministic Action Ordering (CORRECTED: type → severity → alphabetical)
        const orderedActions = sortActionsDeterministically(allActions, drift_report);

        // 10. Create Snapshot (with deep clones)
        const snapshot = createSnapshot({
            rebuild_plan,
            escalation_plan,
            drift_report,
            policy,
            connector_capabilities,
            ordered_actions: orderedActions
        });

        // 11. Assemble Response
        const response = {
            status: 'SUCCESS',
            status_code: 'OK',
            repair_plan: {
                actions: orderedActions,
                snapshot
            }
        };

        // 12. Observability
        logRepairDecision(envelope, 'OK', orderedActions.length);
        metrics.count('drift_repair_invoked', 1);
        metrics.count('drift_repair_actions_count', orderedActions.length);
        metrics.count(`drift_repair_strategy_used_${escalation_plan.strategy.toLowerCase()}`, 1);

        return response;

    } catch (error) {
        logStructured('connector_drift_repair_error', {
            execution_id: envelope?.execution_id,
            error: error.message
        });
        metrics.count('drift_repair_error', 1);
        return createErrorResponse(error.message);
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
        'execution_id', 'drift_report', 'rebuild_plan',
        'escalation_plan', 'connector_capabilities', 'policy'
    ];

    for (const field of required) {
        if (!envelope[field]) {
            return `Missing required field: ${field}`;
        }
    }

    // Validate drift_report
    if (!envelope.drift_report.drift_types || !Array.isArray(envelope.drift_report.drift_types)) {
        return 'drift_report.drift_types must be an array';
    }
    if (!Array.isArray(envelope.drift_report.connector_states)) {
        return 'drift_report.connector_states must be an array';
    }

    // Validate rebuild_plan
    const validRebuildTypes = ['NO_REBUILD', 'PARTIAL_REBUILD', 'FULL_REBUILD'];
    if (!validRebuildTypes.includes(envelope.rebuild_plan.rebuild_type)) {
        return 'Invalid rebuild_type';
    }

    // Validate escalation_plan
    if (!envelope.escalation_plan.strategy) {
        return 'escalation_plan.strategy is required';
    }

    // Validate policy
    if (typeof envelope.policy.forbid_repair !== 'boolean') {
        return 'policy.forbid_repair must be boolean';
    }

    // Enforce strict top-level envelope fields
    const unknownFields = Object.keys(envelope).filter(
        key => !ALLOWED_TOP_LEVEL_FIELDS.has(key)
    );

    if (unknownFields.length > 0) {
        return `Unknown fields in envelope: ${unknownFields.join(', ')}`;
    }

    return null;
}

/**
 * Translate Phase 53 strategy into concrete actions (REWRITTEN)
 */
function translateStrategy(escalation_plan, drift_report, capabilities, policy) {
    const { strategy, details } = escalation_plan;
    const actions = [];

    // Handle HARD_STOP
    if (strategy === 'HARD_STOP') {
        return { actions: [], error: null };
    }

    // Translate escalation strategy with pre-validation
    switch (strategy) {
        case 'NO_ESCALATION':
            // Only safe repairs (no escalation actions)
            break;

        case 'FALLBACK_CONNECTOR':
            // MUST use details.from and details.to
            if (!details || !details.from || !details.to) {
                return {
                    actions: [],
                    error: 'FALLBACK_CONNECTOR requires details.from and details.to',
                    code: 'INVALID_INPUT'
                };
            }

            // Validate both connectors exist
            if (!capabilities[details.from]) {
                return {
                    actions: [],
                    error: `Connector ${details.from} not found in capabilities`,
                    code: 'CAPABILITY_CONFLICT'
                };
            }
            if (!capabilities[details.to]) {
                return {
                    actions: [],
                    error: `Connector ${details.to} not found in capabilities`,
                    code: 'CAPABILITY_CONFLICT'
                };
            }

            actions.push({
                action_type: 'SWITCH_CONNECTOR',
                connector_key: details.from,
                params: { to: details.to }
            });
            break;

        case 'CREDENTIAL_ROTATION':
            // Pre-validate policy
            if (policy.forbid_credential_rotation) {
                return {
                    actions: [],
                    error: 'Policy forbids credential rotation',
                    code: 'POLICY_CONFLICT'
                };
            }

            // Check capability for each connector
            for (const state of drift_report.connector_states) {
                const cap = capabilities[state.connector_key];
                if (!cap) {
                    continue; // Skip if connector not in capabilities
                }

                if (!cap.can_rotate_credentials) {
                    return {
                        actions: [],
                        error: `Connector ${state.connector_key} cannot rotate credentials`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }

                actions.push({
                    action_type: 'ROTATE_CREDENTIALS',
                    connector_key: state.connector_key,
                    params: { mode: 'secondary' }
                });
            }
            break;

        case 'API_VERSION_UPGRADE':
            for (const state of drift_report.connector_states) {
                const cap = capabilities[state.connector_key];
                if (!cap) {
                    continue;
                }

                if (!cap.can_upgrade_version) {
                    return {
                        actions: [],
                        error: `Connector ${state.connector_key} cannot upgrade version`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }

                actions.push({
                    action_type: 'UPGRADE_API_VERSION',
                    connector_key: state.connector_key,
                    params: { target_version: 'latest' }
                });
            }
            break;

        case 'SANDBOX_RETRY':
            for (const state of drift_report.connector_states) {
                const cap = capabilities[state.connector_key];
                if (!cap) {
                    continue;
                }

                if (!cap.can_retry_sandbox) {
                    return {
                        actions: [],
                        error: `Connector ${state.connector_key} cannot retry in sandbox`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }

                actions.push({
                    action_type: 'SANDBOX_RETRY',
                    connector_key: state.connector_key,
                    params: { sandbox_mode: true }
                });
            }
            break;

        case 'COMPOSITE':
            // PRE-VALIDATE all sub-strategies before expanding
            if (!details || !details.strategies || !Array.isArray(details.strategies)) {
                return {
                    actions: [],
                    error: 'COMPOSITE requires details.strategies array',
                    code: 'INVALID_INPUT'
                };
            }

            // Validate each sub-strategy
            for (const subStrategy of details.strategies) {
                const subPlan = { strategy: subStrategy, details: null };
                const subResult = translateStrategy(subPlan, drift_report, capabilities, policy);

                if (subResult.error) {
                    // Composite fails if ANY sub-strategy fails
                    return {
                        actions: [],
                        error: `Composite rejected: ${subResult.error}`,
                        code: subResult.code
                    };
                }

                actions.push(...subResult.actions);
            }
            break;
    }

    // Deduplicate actions
    const deduplicated = deduplicateActions(actions);
    return { actions: deduplicated, error: null };
}

/**
 * Generate rebuild actions based on rebuild plan (REWRITTEN)
 */
function generateRebuildActions(rebuild_plan, drift_report, capabilities, policy) {
    const actions = [];
    const { rebuild_type, targets } = rebuild_plan;

    if (rebuild_type === 'FULL_REBUILD') {
        // Check policy first
        if (!policy.allow_full_rebuild) {
            return {
                actions: [],
                error: 'Policy denies full rebuild',
                code: 'POLICY_CONFLICT'
            };
        }

        // Rebuild all connectors - check EVERY connector has capability
        for (const state of drift_report.connector_states) {
            const cap = capabilities[state.connector_key];
            if (!cap || !cap.can_rebuild) {
                return {
                    actions: [],
                    error: `Connector ${state.connector_key} cannot rebuild`,
                    code: 'CAPABILITY_CONFLICT'
                };
            }

            actions.push({
                action_type: 'REBUILD_CONNECTOR',
                connector_key: state.connector_key,
                params: { rebuild_type: 'FULL' }
            });
        }
    } else if (rebuild_type === 'PARTIAL_REBUILD') {
        // Check policy first
        if (!policy.allow_partial_rebuild) {
            return {
                actions: [],
                error: 'Policy denies partial rebuild',
                code: 'POLICY_CONFLICT'
            };
        }

        if (!targets || targets.length === 0) {
            // No targets means no rebuild
            return { actions: [], error: null };
        }

        // Rebuild only listed targets - check EACH target has capability
        for (const target of targets) {
            const cap = capabilities[target];
            if (!cap || !cap.can_rebuild) {
                return {
                    actions: [],
                    error: `Connector ${target} cannot rebuild`,
                    code: 'CAPABILITY_CONFLICT'
                };
            }

            actions.push({
                action_type: 'REBUILD_CONNECTOR',
                connector_key: target,
                params: { rebuild_type: 'PARTIAL' }
            });
        }
    }

    return { actions, error: null };
}

/**
 * Validate actions before sorting (NEW)
 */
function validateActionsBeforeSort(actions, capabilities, policy) {
    for (const action of actions) {
        const cap = capabilities[action.connector_key];

        // Check capability exists
        if (!cap) {
            return {
                message: `Connector ${action.connector_key} not found in capabilities`,
                code: 'CAPABILITY_CONFLICT'
            };
        }

        // Validate based on action type
        switch (action.action_type) {
            case 'ROTATE_CREDENTIALS':
                if (policy.forbid_credential_rotation) {
                    return {
                        message: 'Policy forbids credential rotation',
                        code: 'POLICY_CONFLICT'
                    };
                }
                if (!cap.can_rotate_credentials) {
                    return {
                        message: `Connector ${action.connector_key} cannot rotate credentials`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }
                break;

            case 'UPGRADE_API_VERSION':
                if (!cap.can_upgrade_version) {
                    return {
                        message: `Connector ${action.connector_key} cannot upgrade version`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }
                break;

            case 'REBUILD_CONNECTOR':
                if (!cap.can_rebuild) {
                    return {
                        message: `Connector ${action.connector_key} cannot rebuild`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }
                break;

            case 'SANDBOX_RETRY':
                if (!cap.can_retry_sandbox) {
                    return {
                        message: `Connector ${action.connector_key} cannot retry in sandbox`,
                        code: 'CAPABILITY_CONFLICT'
                    };
                }
                break;
        }
    }

    return null;
}

/**
 * Deduplicate actions by connector_key and action_type and params
 */
function deduplicateActions(actions) {
    const seen = new Set();
    return actions.filter(action => {
        const key = `${action.action_type}:${action.connector_key}:${JSON.stringify(action.params || {})}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * Sort actions deterministically (CORRECTED)
 * Order: type priority → severity → alphabetical connector_key
 */
function sortActionsDeterministically(actions, drift_report) {
    // Create severity map for quick lookup
    const severityMap = {};
    for (const state of drift_report.connector_states) {
        severityMap[state.connector_key] = state.severity;
    }

    return actions.slice().sort((a, b) => {
        // 1. Sort by action_type priority
        const priorityA = ACTION_TYPE_PRIORITY[a.action_type] || 999;
        const priorityB = ACTION_TYPE_PRIORITY[b.action_type] || 999;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // 2. Within same type, sort by severity (HIGH before MEDIUM before LOW)
        const severityA = severityMap[a.connector_key] || 'LOW';
        const severityB = severityMap[b.connector_key] || 'LOW';
        const sevPriorityA = SEVERITY_PRIORITY[severityA] || 3;
        const sevPriorityB = SEVERITY_PRIORITY[severityB] || 3;
        if (sevPriorityA !== sevPriorityB) {
            return sevPriorityA - sevPriorityB;
        }

        // 3. Within same severity, sort alphabetically by connector_key
        return a.connector_key.localeCompare(b.connector_key);
    });
}

/**
 * Create deterministic snapshot (with deep clones)
 */
function createSnapshot(input) {
    const {
        rebuild_plan,
        escalation_plan,
        drift_report,
        policy,
        connector_capabilities,
        ordered_actions
    } = input;

    return {
        feature_enabled: true,
        rebuild_type: rebuild_plan.rebuild_type,
        escalation_strategy: escalation_plan.strategy,
        drift_types: JSON.parse(JSON.stringify(drift_report.drift_types)),
        drift_severities: drift_report.connector_states.map(state => ({
            connector_key: state.connector_key,
            severity: state.severity
        })),
        rebuild_targets: rebuild_plan.targets ? JSON.parse(JSON.stringify(rebuild_plan.targets)) : null,
        // CORRECTED: Full signatures instead of just types
        ordered_actions: ordered_actions.map(a =>
            `${a.action_type}:${a.connector_key}:${JSON.stringify(a.params || {})}`
        ),
        policy_flags: JSON.parse(JSON.stringify(policy)),
        connector_capabilities: JSON.parse(JSON.stringify(connector_capabilities))
    };
}

/**
 * Create response when feature flag is disabled
 */
function createFeatureDisabledResponse() {
    return {
        status: 'SUCCESS',
        status_code: 'FEATURE_DISABLED',
        repair_plan: {
            actions: null,
            snapshot: {
                feature_enabled: false
            }
        }
    };
}

/**
 * Create policy forbid response
 */
function createPolicyForbidResponse(envelope) {
    return {
        status: 'SUCCESS',
        status_code: 'POLICY_FORBID_REPAIR',
        repair_plan: {
            actions: [],
            snapshot: {
                feature_enabled: true,
                reason: 'POLICY_SUPREMACY',
                rebuild_type: envelope.rebuild_plan.rebuild_type,
                escalation_strategy: envelope.escalation_plan.strategy,
                drift_types: JSON.parse(JSON.stringify(envelope.drift_report.drift_types)),
                drift_severities: envelope.drift_report.connector_states.map(state => ({
                    connector_key: state.connector_key,
                    severity: state.severity
                })),
                rebuild_targets: envelope.rebuild_plan.targets
                    ? JSON.parse(JSON.stringify(envelope.rebuild_plan.targets))
                    : null,
                ordered_actions: [],
                policy_flags: JSON.parse(JSON.stringify(envelope.policy)),
                connector_capabilities: JSON.parse(JSON.stringify(envelope.connector_capabilities))
            }
        }
    };
}

/**
 * Create error response
 */
function createErrorResponse(errorMessage) {
    return {
        status: 'ERROR',
        status_code: 'INVALID_INPUT',
        repair_plan: null,
        error_message: errorMessage
    };
}

/**
 * Create conflict response
 */
function createConflictResponse(errorMessage, code) {
    return {
        status: 'ERROR',
        status_code: code || 'CAPABILITY_CONFLICT',
        repair_plan: null,
        error_message: errorMessage
    };
}

/**
 * Log repair decision
 */
function logRepairDecision(envelope, statusCode, actionCount) {
    logStructured('connector_drift_repair_decision', {
        execution_id: envelope.execution_id,
        workspace_id: envelope.workspace_id,
        brand_id: envelope.brand_id,
        tenant_id: envelope.tenant_id,
        strategy: envelope.escalation_plan?.strategy,
        status_code: statusCode,
        action_count: actionCount
    });
}

module.exports = { execute };
