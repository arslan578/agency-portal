/**
 * Phase 55: Autonomous Drift Repair Executor
 * 
 * Executes deterministic repair plan from Phase 54. First IO-performing phase.
 * 
 * Input Contract: connector_drift_repair_execute_input_v1
 * Output Contract: connector_drift_repair_execute_output_v1
 * Feature Flag: FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR
 *
 * // Phase 55 enforces that all executed actions align with Phase 27B connector_backplane_v1 capabilities and error definitions.
 */

const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

/**
 * Action handlers (mock implementations for now - will be wired to real connectors)
 */
const ACTION_HANDLERS = {
    ROTATE_CREDENTIALS: async (action, context) => {
        // Mock implementation - replace with real connector call
        return { rotated: true, connector_key: action.connector_key };
    },
    UPGRADE_API_VERSION: async (action, context) => {
        // Mock implementation
        return { upgraded: true, version: 'latest' };
    },
    REBUILD_CONNECTOR: async (action, context) => {
        // Mock implementation
        return { rebuilt: true };
    },
    SANDBOX_RETRY: async (action, context) => {
        // Mock implementation
        return { sandbox_tested: true };
    },
    RETRY_CONNECTOR: async (action, context) => {
        // Mock implementation - replay last request
        return { retried: true };
    },
    SWITCH_CONNECTOR: async (action, context) => {
        // Mock implementation - update routing
        return { switched_to: action.payload?.to || 'fallback' };
    }
};

/**
 * Execute Phase 55: Autonomous Drift Repair
 */
async function execute(envelope) {
    // 1. Feature Flag Check
    const featureFlagEnabled = process.env.FF_CONNECTOR_DRIFT_REPAIR_EXECUTOR === 'true';

    if (!featureFlagEnabled) {
        return createFeatureDisabledResponse();
    }

    // 2. Input Validation
    const validationError = validateInput(envelope);
    if (validationError) {
        return createErrorResponse(validationError);
    }

    // 3. Deep clone for mutation check
    const originalEnvelope = JSON.parse(JSON.stringify(envelope));

    // 4. Start Span
    const span = startSpan('phase_55_repair_executor', {
        execution_id: envelope.execution_id,
        tenant_id: envelope.tenant_id,
        workspace_id: envelope.workspace_id,
        brand_id: envelope.brand_id
    });

    const startTime = Date.now();

    try {
        const {
            execution_id,
            tenant_id,
            workspace_id,
            brand_id,
            repair_plan,
            connector_capabilities,
            policy,
            execution_context
        } = envelope;

        const results = [];
        const failures = [];

        // 5. Execute actions in strict order
        for (const action of repair_plan.actions) {
            const actionStart = Date.now();

            // Check policy
            const policyCheck = checkPolicy(action, policy);
            if (!policyCheck.allowed) {
                failures.push({
                    action_id: action.action_id,
                    error_code: policyCheck.code,
                    error_message: `Policy forbids ${action.action_type} for ${action.connector_key}`
                });

                results.push({
                    action_id: action.action_id,
                    action_type: action.action_type,
                    connector_key: action.connector_key,
                    status: 'ERROR',
                    response: null,
                    latency_ms: Date.now() - actionStart
                });

                continue;
            }

            // Check capability
            const capabilityCheck = checkCapability(action, connector_capabilities);
            if (!capabilityCheck.allowed) {
                failures.push({
                    action_id: action.action_id,
                    error_code: capabilityCheck.code,
                    error_message: `Connector ${action.connector_key} lacks capability for ${action.action_type}`
                });

                results.push({
                    action_id: action.action_id,
                    action_type: action.action_type,
                    connector_key: action.connector_key,
                    status: 'ERROR',
                    response: null,
                    latency_ms: Date.now() - actionStart
                });

                continue;
            }

            // Execute action via IO wrapper
            const result = await executeAction(action, execution_context, { execution_id, tenant_id, workspace_id, brand_id });

            if (result.status === 'ERROR') {
                failures.push({
                    action_id: action.action_id,
                    error_code: result.error_code,
                    error_message: result.error_message || 'Unknown error'
                });
            }

            results.push({
                action_id: action.action_id,
                action_type: action.action_type,
                connector_key: action.connector_key,
                status: result.status,
                response: result.response || null,
                latency_ms: result.latency_ms
            });
        }

        // 6. Derive status
        const { status, status_code } = deriveStatus(results, failures);

        // 7. Generate snapshot
        const execution_snapshot = createExecutionSnapshot(
            repair_plan.actions,
            results,
            policy,
            connector_capabilities,
            failures
        );

        // 8. Calculate timing
        const total_ms = Date.now() - startTime;
        const timing = {
            total_ms,
            per_action: results.reduce((acc, r) => {
                acc[r.action_id] = r.latency_ms;
                return acc;
            }, {})
        };

        // 9. Observability
        logStructured('repair_executor_complete', {
            execution_id,
            tenant_id,
            workspace_id,
            brand_id,
            status,
            status_code,
            total_actions: results.length,
            failure_count: failures.length,
            total_ms
        });

        metrics.count('repair_executor.invoked', 1);
        metrics.count('repair_executor.total_time', total_ms);

        // 10. Verify no mutation
        if (JSON.stringify(originalEnvelope) !== JSON.stringify(envelope)) {
            throw new Error('INTERNAL_EXECUTOR_FAILURE: Input envelope was mutated');
        }

        return {
            status,
            status_code,
            results,
            failures,
            execution_snapshot,
            timing
        };

    } catch (error) {
        logStructured('repair_executor_error', {
            execution_id: envelope?.execution_id,
            error: error.message
        });
        metrics.count('repair_executor.error', 1);

        return {
            status: 'ERROR',
            status_code: 'INTERNAL_EXECUTOR_FAILURE',
            results: [],
            failures: [{
                action_id: 'unknown',
                error_code: 'INTERNAL_EXECUTOR_FAILURE',
                error_message: error.message
            }],
            execution_snapshot: createExecutionSnapshot([], [], envelope.policy || {}, envelope.connector_capabilities || {}, [{ action_id: 'unknown', error_code: 'INTERNAL_EXECUTOR_FAILURE' }]),
            timing: {
                total_ms: Date.now() - startTime,
                per_action: {}
            }
        };
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
        'execution_id', 'tenant_id', 'workspace_id', 'brand_id',
        'repair_plan', 'connector_capabilities', 'policy',
        'requested_at', 'execution_context'
    ];

    for (const field of required) {
        if (!envelope[field]) {
            return `Missing required field: ${field}`;
        }
    }

    // Check forbidden fields from Phase 54
    const forbidden = ['drift_report', 'escalation_plan', 'rebuild_plan'];
    for (const field of forbidden) {
        if (envelope[field]) {
            return `Forbidden field: ${field} (belongs to Phase 54)`;
        }
    }

    // Validate repair_plan
    if (!envelope.repair_plan.actions || !Array.isArray(envelope.repair_plan.actions)) {
        return 'repair_plan.actions must be an array';
    }

    return null;
}

/**
 * Check policy allows action
 */
function checkPolicy(action, policy) {
    // Generic policy interpreter
    if (action.action_type === 'ROTATE_CREDENTIALS') {
        if (!policy.allow_credential_rotation) {
            return { allowed: false, code: 'POLICY_FORBIDDEN' };
        }
    }

    if (action.action_type === 'REBUILD_CONNECTOR') {
        if (!policy.allow_rebuild) {
            return { allowed: false, code: 'POLICY_FORBIDDEN' };
        }
    }

    if (action.action_type === 'UPGRADE_API_VERSION') {
        if (!policy.allow_api_upgrade) {
            return { allowed: false, code: 'POLICY_FORBIDDEN' };
        }
    }

    return { allowed: true };
}

/**
 * Check capability supports action
 */
function checkCapability(action, capabilities) {
    const connectorCaps = capabilities[action.connector_key];

    if (!connectorCaps) {
        return { allowed: false, code: 'CAPABILITY_MISSING' };
    }

    if (!connectorCaps[action.action_type]) {
        return { allowed: false, code: 'CAPABILITY_MISSING' };
    }

    return { allowed: true };
}

/**
 * Execute action via IO wrapper
 */
async function executeAction(action, context, metadata) {
    const actionStart = Date.now();

    try {
        // Get handler
        const handler = ACTION_HANDLERS[action.action_type];
        if (!handler) {
            return {
                status: 'ERROR',
                error_code: 'INVALID_ACTION_TYPE',
                error_message: `Unknown action type: ${action.action_type}`,
                latency_ms: Date.now() - actionStart
            };
        }

        // Execute via handler
        const response = await handler(action, context);
        const latency_ms = Date.now() - actionStart;

        // Log success
        logStructured('repair_executor_action', {
            execution_id: metadata.execution_id,
            tenant_id: metadata.tenant_id,
            workspace_id: metadata.workspace_id,
            brand_id: metadata.brand_id,
            action_id: action.action_id,
            action_type: action.action_type,
            connector_key: action.connector_key,
            status: 'SUCCESS',
            latency_ms
        });

        metrics.count('repair_executor.action_latency', latency_ms);

        return {
            status: 'SUCCESS',
            response: sanitizeResponse(response),
            latency_ms
        };

    } catch (error) {
        const latency_ms = Date.now() - actionStart;
        const error_code = classifyError(error);

        // Log error
        logStructured('repair_executor_action_error', {
            execution_id: metadata.execution_id,
            tenant_id: metadata.tenant_id,
            workspace_id: metadata.workspace_id,
            brand_id: metadata.brand_id,
            action_id: action.action_id,
            action_type: action.action_type,
            connector_key: action.connector_key,
            error_code,
            latency_ms
        });

        metrics.count('repair_executor.error_code', 1);

        return {
            status: 'ERROR',
            error_code,
            error_message: error.message,
            latency_ms
        };
    }
}

/**
 * Classify error into standard error codes
 */
function classifyError(error) {
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        return 'CONNECTOR_TIMEOUT';
    }
    if (error.message.includes('invalid') || error.message.includes('malformed')) {
        return 'INVALID_PAYLOAD';
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return 'CONNECTOR_IO_ERROR';
    }
    return 'CONNECTOR_IO_ERROR';
}

/**
 * Sanitize response for snapshot safety
 */
function sanitizeResponse(response) {
    if (!response || typeof response !== 'object') {
        return response;
    }

    // Deep clone and remove non-deterministic fields
    const sanitized = JSON.parse(JSON.stringify(response));
    delete sanitized.timestamp;
    delete sanitized.request_id;
    return sanitized;
}

/**
 * Derive status and status_code from results
 */
function deriveStatus(results, failures) {
    if (failures.length === 0) {
        return {
            status: 'SUCCESS',
            status_code: 'ALL_ACTIONS_SUCCEEDED'
        };
    }

    const hasSuccess = results.some(r => r.status === 'SUCCESS');
    if (hasSuccess) {
        return {
            status: 'PARTIAL',
            status_code: 'SOME_ACTIONS_FAILED'
        };
    }

    return {
        status: 'ERROR',
        status_code: 'ALL_ACTIONS_FAILED'
    };
}

/**
 * Create execution snapshot
 */
function createExecutionSnapshot(actions, results, policy, capabilities, failures) {
    const total_latency_ms = results.reduce((sum, r) => sum + (r.latency_ms || 0), 0);

    // Build error map from failures
    const errorByActionId = (failures || []).reduce((acc, f) => {
        acc[f.action_id] = f.error_code || null;
        return acc;
    }, {});

    return {
        ordered_actions: actions.map(a => a.action_id),
        per_action: results.reduce((acc, r) => {
            acc[r.action_id] = {
                status: r.status,
                error_code: errorByActionId[r.action_id] || null
            };
            return acc;
        }, {}),
        total_latency_ms,
        policy_flags: JSON.parse(JSON.stringify(policy)),
        capability_matrix: JSON.parse(JSON.stringify(capabilities))
    };
}

/**
 * Create feature disabled response
 */
function createFeatureDisabledResponse() {
    return {
        status: 'SUCCESS',
        status_code: 'FEATURE_DISABLED',
        results: [],
        failures: [],
        execution_snapshot: {
            ordered_actions: [],
            per_action: {},
            total_latency_ms: 0,
            policy_flags: {},
            capability_matrix: {}
        },
        timing: {
            total_ms: 0,
            per_action: {}
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
        results: [],
        failures: [{
            action_id: 'validation',
            error_code: 'INVALID_INPUT',
            error_message: errorMessage
        }],
        execution_snapshot: {
            ordered_actions: [],
            per_action: {},
            total_latency_ms: 0,
            policy_flags: {},
            capability_matrix: {}
        },
        timing: {
            total_ms: 0,
            per_action: {}
        }
    };
}

module.exports = { execute, ACTION_HANDLERS };
