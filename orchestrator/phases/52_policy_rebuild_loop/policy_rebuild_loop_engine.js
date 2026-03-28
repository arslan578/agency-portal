/**
 * Phase 52: Policy-Aware Rebuild Loop Engine
 * 
 * Generates deterministic rebuild plans based on Phase 51 outcomes and policy rules.
 * Does not execute rebuilds - only produces plans.
 * 
 * Contract: policy_rebuild_input_v1 → policy_rebuild_output_v1
 * Feature Flag: FF_POLICY_AWARE_REBUILD_LOOP
 */

const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

/**
 * Default deterministic policy resolver
 * Can be replaced via _internal.setPolicyResolver for testing
 */
function createDefaultPolicyResolver() {
    return {
        resolve(input) {
            const {
                phase_51_status,
                phase_51_stop_reason,
                phase_51_status_code
            } = input;

            // Default policy rules (deterministic, in-memory)

            // Rule 1: Clean SUCCESS → NO_REBUILD
            if (phase_51_stop_reason === 'SUCCESS') {
                return {
                    decision: 'NO_REBUILD',
                    reason: 'CLEAN_SUCCESS',
                    details: {},
                    policy_version: 'default_v1'
                };
            }

            // Rule 2: PARTIAL_SUCCESS → PARTIAL_REBUILD for partial successes
            if (phase_51_stop_reason === 'PARTIAL_SUCCESS') {
                return {
                    decision: 'PARTIAL_REBUILD',
                    reason: 'PARTIAL_SUCCESS_RECOVERABLE',
                    details: {
                        fields: ['failed_operations']  // Rebuild only failed parts
                    },
                    policy_version: 'default_v1'
                };
            }

            // Rule 3: HARD_FAIL with auth errors → NO_REBUILD (policy forbids)
            if (phase_51_status === 'HARD_FAIL' &&
                (phase_51_status_code === 'AUTH_ERROR' || phase_51_stop_reason === 'HARD_ERROR')) {
                const isAuthRelated = phase_51_status_code === 'AUTH_ERROR' ||
                    phase_51_status_code === 'AUTH_TOKEN_INVALID';
                if (isAuthRelated) {
                    return {
                        decision: 'NO_REBUILD',
                        reason: 'POLICY_FORBIDS_REBUILD',
                        details: { auth_required: true },
                        policy_version: 'default_v1'
                    };
                }
            }

            // Rule 4: RETRY_EXHAUSTED → FULL_REBUILD (assume transient, worth rebuilding)
            if (phase_51_status === 'RETRY_EXHAUSTED') {
                return {
                    decision: 'FULL_REBUILD',
                    reason: 'TRANSIENT_FAILURE',
                    details: {},
                    policy_version: 'default_v1'
                };
            }

            // Rule 5: HARD_FAIL (non-auth) → FULL_REBUILD
            if (phase_51_status === 'HARD_FAIL') {
                return {
                    decision: 'FULL_REBUILD',
                    reason: 'HARD_FAILURE_RECOVERABLE',
                    details: {},
                    policy_version: 'default_v1'
                };
            }

            // Rule 6: Any other case → FULL_REBUILD (conservative)
            return {
                decision: 'FULL_REBUILD',
                reason: 'DEFAULT_REBUILD',
                details: {},
                policy_version: 'default_v1'
            };
        }
    };
}

// Singleton policy resolver (can be swapped for testing)
let policyResolver = createDefaultPolicyResolver();

/**
 * Execute Phase 52: Policy-Aware Rebuild Loop
 */
async function execute(envelope, context = {}) {
    const start = Date.now();
    const requestedAt = envelope?.requested_at || null;

    // 1. Feature Flag Check
    const featureFlagEnabled = process.env.FF_POLICY_AWARE_REBUILD_LOOP === 'true';

    if (!featureFlagEnabled) {
        return createDisabledResponse(envelope, requestedAt);
    }

    // 2. Input Validation
    const validationError = validateInput(envelope);
    if (validationError) {
        return createErrorResponse(envelope, requestedAt, validationError);
    }

    // 3. Start Span
    const span = startSpan('phase_52_policy_rebuild_loop', {
        execution_id: envelope.execution_id,
        workspace_id: envelope.workspace_id,
        brand_id: envelope.brand_id,
        policy_ruleset_id: envelope.policy_ruleset_id
    });

    try {
        const { phase_51, policy_ruleset_id, execution_id, tenant, workspace_id, brand_id, snapshot_id } = envelope;

        // 4. Decision Logic
        let status = 'NO_REBUILD';
        let reason = 'NO_REBUILD_REQUIRED';
        let actions = [];
        let policyDecision = null;

        // Check Phase 51 status - only clean success (both status and stop_reason) gets NO_REBUILD
        if (phase_51.stop_reason === 'SUCCESS') {
            // Clean success → no rebuild
            status = 'NO_REBUILD';
            reason = 'NO_REBUILD_REQUIRED';
            actions = [];
        } else {
            // Consult policy resolver for any non-clean-success case (including PARTIAL_SUCCESS)
            policyDecision = policyResolver.resolve({
                execution_id,
                policy_ruleset_id,
                phase_51_status: phase_51.status,
                phase_51_stop_reason: phase_51.stop_reason,
                phase_51_status_code: phase_51.status_code,
                connector_response_shape: phase_51.connector_output,
                tenant,
                workspace_id,
                brand_id
            });

            status = policyDecision.decision;
            reason = policyDecision.reason;

            // Generate actions based on decision
            actions = generateActions(policyDecision, phase_51);
        }

        // 5. Create Snapshot (deterministic)
        const snapshot = createSnapshot({
            execution_id,
            policy_ruleset_id,
            snapshot_id,
            phase_51_status: phase_51.status,
            phase_51_stop_reason: phase_51.stop_reason,
            decision: status,
            reason,
            policy_version: policyDecision?.policy_version || 'default_v1'
        });

        // 6. Assemble Response
        const response = {
            ok: true,
            code: 'OK',
            message: null,
            execution_id,
            requested_at: requestedAt,
            phase_52: {
                status,
                reason,
                actions,
                meta: {
                    feature_flag_enabled: true,
                    stop_reason: reason,
                    rebuild_policy_version: policyDecision?.policy_version || 'default_v1'
                },
                snapshot
            }
        };

        // 7. Observability
        logStructured('phase_52_rebuild_decision', {
            execution_id,
            phase_51_status: phase_51.status,
            phase_52_status: status,
            reason,
            policy_ruleset_id
        });

        metrics.count('phase_52_rebuild_invoked', 1);
        metrics.count(`phase_52_rebuild_${status.toLowerCase()}`, 1);
        metrics.histogram('phase_52_latency_ms', Date.now() - start);

        return response;

    } catch (error) {
        // Handle unexpected errors
        logStructured('phase_52_error', {
            execution_id: envelope?.execution_id,
            error: error.message
        });

        metrics.count('phase_52_rebuild_error', 1);

        return createErrorResponse(envelope, requestedAt, error.message);
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

    const required = ['execution_id', 'tenant', 'workspace_id', 'brand_id', 'phase_51', 'policy_ruleset_id', 'snapshot_id'];
    for (const field of required) {
        if (!envelope[field]) {
            return `Missing required field: ${field}`;
        }
    }

    if (!envelope.phase_51.status || !envelope.phase_51.stop_reason) {
        return 'Missing required phase_51 fields';
    }

    if (!Array.isArray(envelope.phase_51.attempts)) {
        return 'phase_51.attempts must be an array';
    }

    return null;
}

/**
 * Generate rebuild actions based on policy decision
 */
function generateActions(policyDecision, phase_51) {
    const { decision, details } = policyDecision;

    if (decision === 'NO_REBUILD') {
        return [];
    }

    if (decision === 'FULL_REBUILD') {
        return [{
            action_type: 'REBUILD_REQUEST',
            target: 'CONNECTOR_REQUEST',
            parameters: details || {},
            invariants: {
                preserve_execution_id: true,
                preserve_connector_contract: true
            }
        }];
    }

    if (decision === 'PARTIAL_REBUILD') {
        return [{
            action_type: 'REBUILD_FIELDS',
            target: 'FIELDS',
            parameters: {
                fields: details.fields || [],
                constraints: details.constraints || {}
            },
            invariants: {
                preserve_execution_id: true,
                preserve_connector_contract: true
            }
        }];
    }

    return [];
}

/**
 * Create deterministic snapshot
 */
function createSnapshot(input) {
    return {
        decision_inputs: {
            execution_id: input.execution_id,
            policy_ruleset_id: input.policy_ruleset_id,
            snapshot_id: input.snapshot_id,
            phase_51_status: input.phase_51_status,
            phase_51_stop_reason: input.phase_51_stop_reason
        },
        policy_rule_id: input.policy_version,
        final_status: input.decision,
        actions_summary: `${input.decision}: ${input.reason}`
    };
}

/**
 * Create response when feature flag is disabled
 */
function createDisabledResponse(envelope, requestedAt) {
    return {
        ok: true,
        code: 'OK',
        message: null,
        execution_id: envelope?.execution_id,
        requested_at: requestedAt,
        phase_52: {
            status: 'NO_REBUILD',
            reason: 'FEATURE_DISABLED',
            actions: [],
            meta: {
                feature_flag_enabled: false,
                stop_reason: 'FEATURE_DISABLED',
                rebuild_policy_version: 'none'
            },
            snapshot: {
                decision_inputs: {},
                policy_rule_id: null,
                final_status: 'NO_REBUILD',
                actions_summary: 'Feature disabled'
            }
        }
    };
}

/**
 * Create error response
 */
function createErrorResponse(envelope, requestedAt, errorMessage) {
    return {
        ok: false,
        code: 'INVALID_INPUT',
        message: errorMessage,
        execution_id: envelope?.execution_id,
        requested_at: requestedAt,
        phase_52: {
            status: 'NO_REBUILD',
            reason: 'VALIDATION_ERROR',
            actions: [],
            meta: {
                feature_flag_enabled: process.env.FF_POLICY_AWARE_REBUILD_LOOP === 'true',
                stop_reason: 'VALIDATION_ERROR',
                rebuild_policy_version: 'none'
            },
            snapshot: {
                decision_inputs: {},
                policy_rule_id: null,
                final_status: 'NO_REBUILD',
                actions_summary: 'Validation failed'
            }
        }
    };
}

// Internal API for testing
const _internal = {
    setPolicyResolver(resolver) {
        policyResolver = resolver;
    },
    getPolicyResolver() {
        return policyResolver;
    },
    resetPolicyResolver() {
        policyResolver = createDefaultPolicyResolver();
    }
};

module.exports = { execute, _internal };
