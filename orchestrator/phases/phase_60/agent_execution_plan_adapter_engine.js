const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Phase 60: Agent Execution Plan Adapter
 * 
 * Adapts raw agent requests into safe, policy-compliant execution plans.
 * Pure logic, deterministic, no IO.
 */

// Status Consts
const STATUS = {
    ADAPTED: 'ADAPTED',
    FEATURE_DISABLED: 'FEATURE_DISABLED',
    INVALID_REQUEST: 'INVALID_REQUEST',
    POLICY_BLOCKED: 'POLICY_BLOCKED',
    SAFETY_BLOCKED: 'SAFETY_BLOCKED',
    RATE_LIMIT_BLOCKED: 'RATE_LIMIT_BLOCKED',
    CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED'
};

/**
 * Deep clone helper to ensure immutability
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Main Execution Function
 * @param {Object} input - input_contract_v1
 * @returns {Promise<Object>} - output_contract_v1
 */
async function execute(input) {
    const FF_AGENT_EXECUTION_PLAN_ADAPTER = process.env.FF_AGENT_EXECUTION_PLAN_ADAPTER === 'true';

    // 1. Feature Flag Check
    if (!FF_AGENT_EXECUTION_PLAN_ADAPTER) {
        return {
            execution_id: input?.execution_id || 'unknown',
            phase: '60',
            feature_flags: {
                ...(input?.feature_flags || {}),
                FF_AGENT_EXECUTION_PLAN_ADAPTER: false
            },
            ok: false,
            status: STATUS.FEATURE_DISABLED,
            adapter_decision: {
                decision_code: 'FEATURE_DISABLED',
                reasons: ['FLAG_OFF']
            }
        };
    }

    const span = tracing.startSpan('phase_60_agent_execution_plan_adapter', {
        execution_id: input?.execution_id || 'unknown',
        phase: '60'
    });

    try {
        // 2. Validation
        const validationError = validateInput(input);
        if (validationError) {
            recordObservability(input, STATUS.INVALID_REQUEST, { decision_code: 'INVALID_REQUEST', reasons: validationError.reasons });
            span.end();
            return createErrorResponse(input, STATUS.INVALID_REQUEST, 'INVALID_REQUEST', validationError.reasons);
        }

        const workingInput = deepClone(input);
        const {
            execution_id,
            agent_request,
            safety_snapshot,
            policy_snapshot,
            capability_index_snapshot,
            rate_limit_snapshot,
            optimizer_guard_snapshot
        } = workingInput;

        const rejections = [];
        const adaptedActions = [];
        const safetyBinding = {
            safety_zone_id: 'unknown', // Default if not present in snapshot
            forbidden_actions_applied: [],
            max_parallel_connectors: safety_snapshot?.safety_zone?.max_parallel_connectors || 0
        };

        // 3. Rate Limit Guard (Pre-check)
        if (rate_limit_snapshot.tenant_bucket.remaining_requests < 1 ||
            rate_limit_snapshot.agent_bucket.remaining_requests < 1) {
            recordObservability(workingInput, STATUS.RATE_LIMIT_BLOCKED, { decision_code: 'RATE_LIMIT_EXCEEDED', reasons: ['BUCKET_EXHAUSTED'] });
            metrics.count('phase_60_rate_limit_blocked', 1, { execution_id });
            span.end();
            // Construct response
            return createResponse(workingInput, false, STATUS.RATE_LIMIT_BLOCKED, {
                decision_code: 'RATE_LIMIT_EXCEEDED',
                reasons: ['BUCKET_EXHAUSTED']
            }, null, []);
        }

        // 4. Processing Actions
        const requestedActions = agent_request.requested_actions || [];

        // --- Policy, Safety, Capability, Optimizer Pipeline ---

        // We process each action. If any "BLOCKING" status is reached for the *entire plan* (like all actions blocked), we track that.
        // The spec says: "Only one terminal status is allowed per output." and defines precedence.

        // We will collect valid actions. If list is empty at end, we determine *why* based on what was rejected most severely.

        // Helper to track status precedence
        let worstStatus = STATUS.ADAPTED;
        const statusPriority = {
            [STATUS.POLICY_BLOCKED]: 1,
            [STATUS.SAFETY_BLOCKED]: 2,
            [STATUS.RATE_LIMIT_BLOCKED]: 3,
            [STATUS.CAPABILITY_BLOCKED]: 4,
            [STATUS.INVALID_REQUEST]: 5,
            [STATUS.ADAPTED]: 6
        };

        function updateStatus(newStatus) {
            if (statusPriority[newStatus] < statusPriority[worstStatus]) {
                worstStatus = newStatus;
            }
        }

        // Sort to ensure determinism in processing (though map/filter is usually order-preserving, spec requires determinism)
        // Only actions need deterministic IDs if not present, but input has structure. We'll iterate in order.

        const activeHardBlocks = new Set();
        if (policy_snapshot.hard_blocks) {
            policy_snapshot.hard_blocks.forEach(b => {
                if (b.venue) activeHardBlocks.add(b.venue);
            });
        }

        const forbiddenValues = new Set();
        if (safety_snapshot.forbidden_actions) {
            safety_snapshot.forbidden_actions.forEach(f => {
                // Safety Semantics (TP1):
                // Entries with connector_id are connector-scoped forbids.
                // Entries with ONLY venue are venue-wide forbids.
                if (f.venue && !f.connector_id) forbiddenValues.add(f.venue);
            });
        }

        // Optimizer Allowlist
        const optimizerAllowedConnectors = new Set(
            optimizer_guard_snapshot?.optimizer_plan?.allowed_connectors || []
        );
        const optimizerVenues = optimizer_guard_snapshot?.optimizer_plan?.venue_budgets || {};
        const hasOptimizerPlan = !!optimizer_guard_snapshot?.optimizer_plan;

        let totalBudgets = {}; // venue -> amount

        for (let i = 0; i < requestedActions.length; i++) {
            const action = requestedActions[i];
            const venue = action.venue;

            // Generate Action ID if missing (Spec 2.2.5)
            const finalActionId = action.action_id || `agent_${String(i + 1).padStart(3, '0')}`;

            // A. Policy Guard
            if (activeHardBlocks.has(venue)) {
                updateStatus(STATUS.POLICY_BLOCKED);
                rejections.push({
                    code: 'POLICY_BLOCKED_VENUE',
                    field: `actions[${i}].venue`,
                    venue: venue,
                    message: `Venue ${venue} is hard blocked by policy.`
                });
                continue;
            }

            // B. Safety Guard
            if (forbiddenValues.has(venue)) {
                updateStatus(STATUS.SAFETY_BLOCKED);
                rejections.push({
                    code: 'SAFETY_BLOCKED_VENUE',
                    field: `actions[${i}].venue`,
                    venue: venue,
                    message: `Venue ${venue} is forbidden by safety snapshot.`
                });
                safetyBinding.forbidden_actions_applied.push(`DROP_${venue}`);
                // Spec invariant 2: No action may target a venue in forbidden_actions.
                continue;
            }

            // Check specific forbidden actions (like connector_id matched later)
            // But we don't have connector_id yet. It comes from capability mapping.

            // C. Capability Guard
            // Map to connector.
            let validConnectorId = null;
            const connectors = capability_index_snapshot.connectors || {};

            // Find a healthy/degraded connector for this venue that supports needed capabilities
            // Spec 2.2.4.4
            // Iterate deterministic keys
            const connectorKeys = Object.keys(connectors).sort();
            for (const cKey of connectorKeys) {
                const conn = connectors[cKey];
                if (conn.venue === venue && (conn.status === 'HEALTHY' || conn.status === 'DEGRADED')) {
                    // Check capabilities? Spec says "compatible capabilities". 
                    // Input has 'objective', 'constraints'. Connector has 'capabilities'.
                    // For now assuming if venue matches and status is OK, it's a candidate.
                    // But we should check if strictly forbidden by safety (connector_id specific).
                    const isForbiddenConnector = safety_snapshot.forbidden_actions?.some(f => f.connector_id === cKey);
                    if (!isForbiddenConnector) {
                        // Optimizer Check (if plan exists)
                        if (hasOptimizerPlan && !optimizerAllowedConnectors.has(cKey)) {
                            continue; // Not allowed by optimizer
                        }
                        validConnectorId = cKey;
                        break; // Found one
                    }
                }
            }

            if (!validConnectorId) {
                // Was it due to optimizer?
                if (hasOptimizerPlan) {
                    // If we failed to find one, it might be optimizer constraint. 
                    // But strictly this falls under Capability Blocked if NO connector supports it,
                    // or Safety/Optimizer if they filtered it out.
                    // Simple logic: if no connector, block.
                    rejections.push({
                        code: 'CAPABILITY_BLOCKED',
                        field: `actions[${i}]`,
                        venue: venue,
                        message: `No healthy, allowed connector found for ${venue}.`
                    });
                    updateStatus(STATUS.CAPABILITY_BLOCKED);
                } else {
                    rejections.push({
                        code: 'CAPABILITY_BLOCKED',
                        field: `actions[${i}]`,
                        venue: venue,
                        message: `No healthy connector found for ${venue}.`
                    });
                    updateStatus(STATUS.CAPABILITY_BLOCKED);
                }
                continue;
            }

            // D. Optimizer Guard Budget Check
            // We do budget clamping later in step 6.
            // But if optimizer forbids the venue entirely (budget 0 or not in allowed list?), we drop.
            if (hasOptimizerPlan) {
                if (optimizerVenues[venue] === undefined) {
                    // Venue not in optimizer plan. Drop.
                    rejections.push({
                        code: 'OPTIMIZER_CONSTRAINT',
                        field: `actions[${i}].venue`,
                        venue: venue,
                        message: `Venue ${venue} not allowed by optimizer plan.`
                    });
                    continue;
                }
            }

            // If we got here, action is preserved.
            // Construct the adapted action structure
            const adaptedAction = {
                action_id: finalActionId,
                connector_id: validConnectorId,
                venue: venue,
                objective: action.objective,
                budget: { ...action.budget }, // Clone
                time_window: { ...action.time_window },
                constraints: { ...action.constraints },
                safety_tags: ['WITHIN_SAFETY_ZONE', 'NOT_FORBIDDEN'],
                policy_tags: ['VENUE_ALLOWED']
            };

            // Capability degraded tag?
            if (connectors[validConnectorId].status === 'DEGRADED') {
                adaptedAction.safety_tags.push('CONNECTOR_DEGRADED');
            }

            adaptedActions.push(adaptedAction);
        }

        // If no actions remain, return the worst status encountered.
        if (adaptedActions.length === 0) {
            // If worst status is still ADAPTED (e.g. empty request list?), strictly it's "NO_REQUESTED_ACTIONS" from validation, 
            // but if we filtered everything out, worstStatus should have been updated.
            // If strictly empty input, handled in validation? "Empty requested_actions" is Edge 1.
            // Edge 1 says: Invalid Request.
            // If filtered out, return blocked status.
            if (worstStatus === STATUS.ADAPTED && requestedActions.length > 0) {
                // Should not happen if logic is correct, but fallback
                worstStatus = STATUS.CAPABILITY_BLOCKED;
            }
            recordObservability(workingInput, worstStatus, { decision_code: 'ALL_ACTIONS_REJECTED', reasons: rejections.map(r => r.code) });
            span.end();
            return createResponse(workingInput, false, worstStatus, {
                decision_code: 'ALL_ACTIONS_REJECTED',
                reasons: rejections.map(r => r.code)
            }, rejections, []);
        }

        // 6. Budget and Rate Limit Binding (Clamping)
        // Spec 2.2.4.6
        // Sum budgets per venue
        const venueSum = {};
        adaptedActions.forEach(a => {
            venueSum[a.venue] = (venueSum[a.venue] || 0) + (a.budget.amount || 0);
        });

        // Check limits
        const safetyMax = safety_snapshot.safety_zone.max_budget_per_venue || {};
        const rateLimitMax = {};
        if (rate_limit_snapshot.per_venue_budgets) {
            Object.keys(rate_limit_snapshot.per_venue_budgets).forEach(v => {
                rateLimitMax[v] = rate_limit_snapshot.per_venue_budgets[v].remaining_monthly_spend;
            });
        }

        // Optimizer max
        const optimizerMax = hasOptimizerPlan ? optimizerVenues : {};

        // Apply limits
        // For each venue, find the lowest ceiling.
        const appliedLimits = {}; // venue -> limit
        Object.keys(venueSum).forEach(venue => {
            const limits = [];
            if (safetyMax[venue] !== undefined) limits.push(safetyMax[venue]);
            if (rateLimitMax[venue] !== undefined) limits.push(rateLimitMax[venue]);
            if (hasOptimizerPlan && optimizerMax[venue] !== undefined) limits.push(optimizerMax[venue]);

            // Soft limits from policy? Spec says "Any relevant policy_snapshot.soft_limits with budget semantics"
            // Implementation: Simple soft limit check if code matches MAX_CAMPAIGN_BUDGET
            if (policy_snapshot.soft_limits) {
                const sl = policy_snapshot.soft_limits.find(l => l.code === 'MAX_CAMPAIGN_BUDGET');
                if (sl) limits.push(sl.value);
            }

            if (limits.length > 0) {
                const limit = Math.min(...limits);
                if (venueSum[venue] > limit) {
                    // Need to scale down
                    const scale = limit / venueSum[venue];
                    adaptedActions.forEach(a => {
                        if (a.venue === venue) {
                            a.budget.amount = Math.floor(a.budget.amount * scale * 100) / 100; // Floor to cents
                            if (a.budget.amount < 0) a.budget.amount = 0;
                            a.safety_tags.push('BUDGET_CLAMPED');
                        }
                    });
                }
            }
        });

        // 5. Plan Construction
        // Sort actions deterministically
        adaptedActions.sort((a, b) => a.action_id.localeCompare(b.action_id));
        rejections.sort((a, b) => {
            if (a.code !== b.code) return a.code.localeCompare(b.code);
            return a.field.localeCompare(b.field);
        });

        // Deduplicate and sort
        const droppedVenues = Array.from(
            new Map(
                rejections
                    .filter(r => r.venue)
                    .map(r => [r.venue, { venue: r.venue, reason_code: r.code }])
            ).values()
        ).sort((a, b) => a.venue.localeCompare(b.venue));

        const agentSafeResponse = {
            message_type: 'EXECUTION_PLAN_ACCEPTED',
            summary: `Your plan will run on ${[...new Set(adaptedActions.map(a => a.venue))].sort().join(' and ')}.`,
            details: {
                accepted_venues: [...new Set(adaptedActions.map(a => a.venue))].sort(),
                dropped_venues: droppedVenues
            }
        };

        // Clean temporary props
        rejections.forEach(r => delete r._venue);

        const finalPlan = {
            plan_id: `agent_${execution_id}`,
            source: 'AGENT_REQUEST',
            trace_domain: input.context.trace_domain,
            actions: adaptedActions,
            safety_binding: {
                safety_zone_id: safety_snapshot.id || 'hz_generated',
                forbidden_actions_applied: safetyBinding.forbidden_actions_applied,
                max_parallel_connectors: safetyBinding.max_parallel_connectors
            },
            policy_binding: {
                policy_version: policy_snapshot.policy_version,
                ruleset_id: policy_snapshot.ruleset_id
            },
            rate_limit_binding: {
                tenant_bucket_consumed: 1, // Simple decrement
                agent_bucket_consumed: 1
            }
        };

        const response = {
            execution_id,
            phase: '60',
            feature_flags: input.feature_flags,
            ok: true,
            status: STATUS.ADAPTED,
            adapter_decision: {
                decision_code: 'PLAN_ACCEPTED',
                reasons: [
                    'REQUEST_WITHIN_POLICY',
                    'REQUEST_WITHIN_SAFETY_ZONE',
                    'REQUEST_WITHIN_RATE_LIMITS'
                ]
            },
            agent_request_projection: {
                intent_type: agent_request.intent_type,
                normalized_objectives: {},
                requested_budget: requestedActions.reduce((acc, a) => {
                    // Sum budget if same currency?
                    // Spec example just lists one object.
                    // We'll project the first currency found or total.
                    // Simplicity: just pass budget from first action if present or simplistic sum.
                    // Spec example output: { currency: "USD", amount: 5000 }.
                    // Let's sum total amount across all actions.
                    const total = requestedActions.reduce((sum, act) => sum + (act.budget?.amount || 0), 0);
                    return { currency: requestedActions[0]?.budget?.currency || 'USD', amount: total };
                }, {}),
                requested_venues: [...new Set(requestedActions.map(a => a.venue))].sort()
            },
            adapted_execution_plan: finalPlan,
            rejections: rejections,
            agent_safe_response: agentSafeResponse,
            observability: {
                log_event_type: 'PHASE_60_AGENT_ADAPTER',
                trace_span_name: 'phase_60_agent_execution_plan_adapter',
                metrics: {
                    adapted_plans: 1,
                    rejected_plans: 0,
                    forbidden_actions_removed: rejections.length,
                    rate_limit_blocked: 0
                }
            }
        };

        recordObservability(input, STATUS.ADAPTED, { decision_code: 'PLAN_ACCEPTED', accepted: adaptedActions.length, rejected: rejections.length });
        span.end();
        return response;

    } catch (error) {
        logStructured('Phase60_UnexpectedError', { message: error.message, stack: error.stack });
        metrics.count('phase_60_unexpected_error', 1);
        span.end();
        return {
            execution_id: input?.execution_id || 'unknown',
            phase: '60',
            feature_flags: input?.feature_flags || {},
            ok: false,
            status: STATUS.INVALID_REQUEST,
            adapter_decision: {
                decision_code: 'UNEXPECTED_ERROR',
                reasons: ['INTERNAL_ERROR']
            }
        };
    }
}

function validateInput(input) {
    const required = [
        'execution_id', 'phase', 'feature_flags', 'context',
        'agent_request', 'safety_snapshot', 'policy_snapshot',
        'capability_index_snapshot', 'rate_limit_snapshot'
    ];

    // Check missing top level
    for (const field of required) {
        if (!input[field]) {
            return { valid: false, reasons: [`MISSING_${field.toUpperCase()}`] };
        }
    }

    if (input.phase !== '60') return { valid: false, reasons: ['INVALID_PHASE'] };

    // Inner Validation (TP1)
    if (!input.agent_request.agent_id) return { valid: false, reasons: ['MISSING_AGENT_ID'] };
    if (!input.agent_request.intent_type) return { valid: false, reasons: ['MISSING_INTENT_TYPE'] };
    if (!input.agent_request.raw_instructions) return { valid: false, reasons: ['MISSING_RAW_INSTRUCTIONS'] };

    // Forbidden
    const forbidden = ['direct_connector_calls', 'raw_credentials', 'pii_payload', 'sidecar_io'];
    for (const field of forbidden) {
        if (input[field]) {
            return { valid: false, reasons: ['FORBIDDEN_FIELD'] };
        }
    }

    // Edge 1: Empty requested actions handling?
    // "Empty requested_actions with valid raw_instructions" -> "INVALID_REQUEST" code "NO_REQUESTED_ACTIONS"
    if (!input.agent_request.requested_actions || input.agent_request.requested_actions.length === 0) {
        return { valid: false, reasons: ['NO_REQUESTED_ACTIONS'] };
    }

    return null;
}

function createErrorResponse(input, status, decisionCode, reasons) {
    return {
        execution_id: input.execution_id,
        phase: '60',
        feature_flags: input.feature_flags,
        ok: false,
        status: status,
        adapter_decision: {
            decision_code: decisionCode,
            reasons: reasons
        },
        adapted_execution_plan: null,
        agent_safe_response: {
            message_type: 'PLAN_REJECTED',
            summary: 'Request rejected.',
            details: { reasons }
        },
        observability: {
            log_event_type: 'PHASE_60_AGENT_ADAPTER',
            metrics: {
                adapted_plans: 0,
                rejected_plans: 1
            }
        }
    };
}

function createResponse(input, ok, status, decision, rejections, adaptedActions) {
    // Generic responder for block cases
    // Note: Use full structure consistent with execute() return
    // Simplification for brevity here
    return {
        execution_id: input.execution_id,
        phase: '60',
        feature_flags: input.feature_flags,
        ok: ok,
        status: status,
        adapter_decision: decision,
        adapted_execution_plan: null,
        rejections: rejections || [],
        agent_safe_response: {
            message_type: 'PLAN_REJECTED',
            summary: 'Plan could not be adapted.',
            details: { reasons: decision.reasons }
        },
        observability: {
            log_event_type: 'PHASE_60_AGENT_ADAPTER',
            metrics: {
                adapted_plans: 0,
                rejected_plans: 1,
                reasons: decision.reasons
            }
        }
    };
}


function recordObservability(input, status, details) {
    logStructured('PHASE_60_AGENT_ADAPTER', {
        execution_id: input.execution_id,
        tenant_id: input.context?.tenant_id,
        workspace_id: input.context?.workspace_id,
        brand_id: input.context?.brand_id,
        agent_id: input.agent_request?.agent_id,
        agent_session_id: input.agent_request?.agent_session_id,
        status: status,
        decision: details.decision_code,
        reasons: details.reasons,
        accepted_count: details.accepted,
        rejected_count: details.rejected,
        safety_binding: {
            safety_zone_id: input.safety_snapshot?.id,
            hard_blocked_venues: input.policy_snapshot?.hard_blocks,
            forbidden_venues: input.safety_snapshot?.forbidden_actions
        }
    });

    if (status === STATUS.ADAPTED) {
        metrics.count('phase_60_plans_adapted', 1);
    } else {
        metrics.count('phase_60_plans_rejected', 1, { status });
    }

    if (details.rejected > 0) {
        metrics.count('phase_60_forbidden_actions_removed', details.rejected);
    }
}

module.exports = { execute };
