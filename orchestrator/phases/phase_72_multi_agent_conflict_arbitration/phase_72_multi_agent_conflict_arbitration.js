/**
 * Phase 72: Multi-Agent Conflict Arbitration Layer
 * Contract: phase_72_multi_agent_conflict_arbitration_v1
 *
 * Deterministically resolves conflicts between agents for:
 * - Connectors
 * - Budgets
 * - Timelines
 *
 * Forward-Hardening compliant:
 * - Pure logic (no IO)
 * - Deterministic ordering
 * - Stable output shapes
 * - Explicit validation failures
 */

const { logStructured } = require('../../shared/logging');
const { count, gauge } = require('../../shared/metrics');
const { startSpan } = require('../../shared/tracing');

const PHASE_ID = '72';
const FEATURE_FLAG = 'FF_MULTI_AGENT_CONFLICT_ARBITRATION';

function execute(input) {
    // --- 1. Basic Validation (no span yet) ---
    if (!input || typeof input !== 'object') {
        return validationError(input, 'INVALID_INPUT', 'Input must be a non-null object');
    }

    const executionId = input.execution_id;

    if (typeof executionId !== 'string' || executionId.length === 0) {
        return validationError(input, 'INVALID_EXECUTION_ID', 'execution_id must be a non-empty string');
    }

    if (input.phase !== PHASE_ID) {
        return validationError(input, 'INVALID_PHASE', `phase must be "${PHASE_ID}"`);
    }

    if (!input.feature_flags || input.feature_flags[FEATURE_FLAG] !== true) {
        return {
            execution_id: executionId,
            phase: PHASE_ID,
            status: 'FEATURE_DISABLED',
            arbitration_result: {
                connector_assignments: {},
                budget_assignments: {},
                timeline_assignments: {},
                arbitration_log: []
            }
        };
    }

    if (!input.agent_claims || typeof input.agent_claims !== 'object') {
        return validationError(input, 'INVALID_AGENT_CLAIMS', 'agent_claims must be an object map');
    }

    if (!input.policy_rules || typeof input.policy_rules !== 'object') {
        return validationError(input, 'INVALID_POLICY_RULES', 'policy_rules must be a non-null object');
    }

    if (!input.knowledge_caps || typeof input.knowledge_caps !== 'object') {
        return validationError(input, 'INVALID_KNOWLEDGE_CAPS', 'knowledge_caps must be a non-null object');
    }

    // From here on, we open a span
    const span = startSpan(`phase_${PHASE_ID}_multi_agent_conflict_arbitration`);

    try {
        // --- 2. Deterministic Agent Ordering ---

        // Build a list of agents with deterministic ordering:
        // Priority DESC, then agent_id ASC.
        const agents = Object.keys(input.agent_claims).map((agentId) => {
            const claim = input.agent_claims[agentId] || {};
            const priority = typeof claim.priority_score === 'number' ? claim.priority_score : 0;

            return {
                id: agentId,
                priority_score: priority,
                connectors_requested: Array.isArray(claim.connectors_requested)
                    ? claim.connectors_requested.slice()
                    : [],
                budget_requested: claim.budget_requested || null,
                timeline_requested: claim.timeline_requested || null
            };
        });

        agents.sort((a, b) => {
            if (b.priority_score !== a.priority_score) {
                return b.priority_score - a.priority_score; // DESC
            }
            return a.id.localeCompare(b.id); // ASC
        });

        // --- 3. Initialize Arbitration Structure ---

        const arbitrationResult = {
            connector_assignments: {},   // connector_id -> [agent_id]
            budget_assignments: {},      // agent_id -> { approved_amount, currency, denied_reasons[] }
            timeline_assignments: {},    // agent_id -> { start_block, end_block, denied_reasons[] }
            arbitration_log: []          // [{ agent_id, decisions[] }]
        };

        const connectorUsage = Object.create(null); // connector_id -> count
        const timelineSlots = []; // [{ start, end, agent_id }]

        const budgetPolicy = input.policy_rules.budget_allocation || {};
        const timelinePolicy = input.policy_rules.timeline_allocation || {};
        const allowOverlap = timelinePolicy.allow_overlap === true;

        // --- 4. Main Arbitration Loop ---

        for (const agent of agents) {
            const logEntry = {
                agent_id: agent.id,
                decisions: []
            };

            // 4.1 Connector Arbitration
            if (agent.connectors_requested.length > 0) {
                for (const connId of agent.connectors_requested) {
                    const connCaps = input.knowledge_caps[connId];

                    const maxConcurrent =
                        connCaps && typeof connCaps.max_concurrent_agents === 'number'
                            ? connCaps.max_concurrent_agents
                            : Infinity;

                    const currentCount = connectorUsage[connId] || 0;

                    if (maxConcurrent > 0 && currentCount < maxConcurrent) {
                        if (!arbitrationResult.connector_assignments[connId]) {
                            arbitrationResult.connector_assignments[connId] = [];
                        }
                        arbitrationResult.connector_assignments[connId].push(agent.id);
                        connectorUsage[connId] = currentCount + 1;

                        logEntry.decisions.push(`Connector ${connId}: APPROVED`);
                    } else {
                        // Denied by capacity or zero-capacity
                        logEntry.decisions.push(
                            `Connector ${connId}: DENIED (CONNECTOR_CAPACITY_EXCEEDED)`
                        );
                    }
                }
            }

            // 4.2 Budget Arbitration
            if (agent.budget_requested && typeof agent.budget_requested.amount === 'number') {
                const requestedAmount = agent.budget_requested.amount;
                const requestedCurrency = agent.budget_requested.currency || 'USD';

                const agentPolicy = budgetPolicy[agent.id];
                const hasMax =
                    agentPolicy && typeof agentPolicy.max_amount === 'number';
                const maxAmount = hasMax ? agentPolicy.max_amount : Infinity;

                const assignment = {
                    approved_amount: requestedAmount,
                    currency: requestedCurrency,
                    denied_reasons: []
                };

                if (requestedAmount > maxAmount) {
                    assignment.approved_amount = maxAmount;
                    assignment.denied_reasons.push('BUDGET_LIMIT_EXCEEDED');
                    logEntry.decisions.push(
                        `Budget: CAPPED at ${maxAmount} (requested ${requestedAmount})`
                    );
                } else {
                    logEntry.decisions.push(
                        `Budget: APPROVED ${requestedAmount}`
                    );
                }

                arbitrationResult.budget_assignments[agent.id] = assignment;
            }

            // 4.3 Timeline Arbitration
            if (
                agent.timeline_requested &&
                typeof agent.timeline_requested.start_block === 'number' &&
                typeof agent.timeline_requested.end_block === 'number'
            ) {
                const start = agent.timeline_requested.start_block;
                const end = agent.timeline_requested.end_block;

                let conflict = false;

                if (!allowOverlap) {
                    for (const slot of timelineSlots) {
                        // Inclusive overlap:
                        // (start <= slot.end) && (slot.start <= end)
                        if (start <= slot.end && slot.start <= end) {
                            conflict = true;
                            break;
                        }
                    }
                }

                const assignment = {
                    start_block: start,
                    end_block: end,
                    denied_reasons: []
                };

                if (conflict) {
                    assignment.denied_reasons.push('TIMELINE_CONFLICT');
                    logEntry.decisions.push('Timeline: DENIED (TIMELINE_CONFLICT)');
                    // Do not add to timelineSlots
                } else {
                    timelineSlots.push({ start, end, agent_id: agent.id });
                    logEntry.decisions.push(
                        `Timeline: APPROVED [${start}, ${end}]`
                    );
                }

                arbitrationResult.timeline_assignments[agent.id] = assignment;
            }

            arbitrationResult.arbitration_log.push(logEntry);
        }

        // --- 5. Deterministic Shape Normalization ---

        const normalizedConnectorAssignments = {};
        const connectorIds = Object.keys(arbitrationResult.connector_assignments).sort();

        for (const connId of connectorIds) {
            const agentList = arbitrationResult.connector_assignments[connId] || [];
            // Ensure deterministic agent ordering per connector
            normalizedConnectorAssignments[connId] = agentList.slice().sort();
        }

        const normalizedBudgetAssignments = {};
        const budgetAgentIds = Object.keys(arbitrationResult.budget_assignments).sort();
        for (const agentId of budgetAgentIds) {
            normalizedBudgetAssignments[agentId] = arbitrationResult.budget_assignments[agentId];
        }

        const normalizedTimelineAssignments = {};
        const timelineAgentIds = Object.keys(arbitrationResult.timeline_assignments).sort();
        for (const agentId of timelineAgentIds) {
            normalizedTimelineAssignments[agentId] = arbitrationResult.timeline_assignments[agentId];
        }

        arbitrationResult.connector_assignments = normalizedConnectorAssignments;
        arbitrationResult.budget_assignments = normalizedBudgetAssignments;
        arbitrationResult.timeline_assignments = normalizedTimelineAssignments;
        // arbitration_log order is already deterministic via agent sorting

        // --- 6. Metrics & Logs ---

        count(`phase_${PHASE_ID}.total_agents`, agents.length);

        const conflicts = arbitrationResult.arbitration_log.reduce((acc, entry) => {
            const hasConflict = entry.decisions.some((d) =>
                d.includes('DENIED') || d.includes('CAPPED')
            );
            return acc + (hasConflict ? 1 : 0);
        }, 0);

        count(`phase_${PHASE_ID}.conflicts_detected`, conflicts);
        count(`phase_${PHASE_ID}.conflicts_resolved`, conflicts);

        gauge(`phase_${PHASE_ID}.connectors_used`, connectorIds.length);
        gauge(`phase_${PHASE_ID}.timeline_slots`, timelineSlots.length);

        logStructured(`Phase ${PHASE_ID} arbitration complete`, {
            execution_id: executionId,
            connector_assignments: arbitrationResult.connector_assignments,
            budget_assignments: arbitrationResult.budget_assignments,
            timeline_assignments: arbitrationResult.timeline_assignments
        });

        // --- 7. Success Envelope ---

        return {
            execution_id: executionId,
            phase: PHASE_ID,
            status: 'SUCCESS',
            arbitration_result: arbitrationResult
        };
    } finally {
        // Ensure span is always closed
        if (span && typeof span.end === 'function') {
            span.end();
        }
    }
}

function validationError(input, code, message) {
    const executionId =
        input && typeof input === 'object' && typeof input.execution_id === 'string'
            ? input.execution_id
            : 'unknown';

    return {
        execution_id: executionId,
        phase: PHASE_ID,
        status: 'VALIDATION_FAILED',
        error: {
            code,
            message
        },
        arbitration_result: {
            connector_assignments: {},
            budget_assignments: {},
            timeline_assignments: {},
            arbitration_log: []
        }
    };
}

module.exports = { execute };
