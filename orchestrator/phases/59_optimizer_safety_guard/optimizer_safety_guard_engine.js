/**
 * Phase 59: Optimizer Safety Guard Engine
 * 
 * Pure logic planning phase that applies safety limits from Phase 58
 * to optimization plans from Phases 39/41.
 * 
 * Forward-Hardening Framework compliant:
 * - Deterministic: Identical input → identical output
 * - Idempotent: Pure function, no side effects
 * - No IO: No HTTP, DB, filesystem, or connector calls
 * - Explicit observability: Metrics, logs, tracing
 */

const { logStructured } = require('../../shared/logging');
const { metrics } = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

// --- Helper Functions ---

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const cloned = {};
    for (const key of Object.keys(obj)) {
        cloned[key] = deepClone(obj[key]);
    }
    return cloned;
}

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}
// --- Constants ---

const FEATURE_FLAG = 'FF_OPTIMIZER_SAFETY_GUARD';

const STATUS = {
    OK: 'OK',
    FEATURE_DISABLED: 'FEATURE_DISABLED',
    INVALID_INPUT: 'INVALID_INPUT',
    SAFETY_VIOLATION: 'SAFETY_VIOLATION',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
};

const STOP_REASON = {
    NONE: null,
    FEATURE_DISABLED: 'FEATURE_DISABLED',
    CONTRACT_VIOLATION: 'CONTRACT_VIOLATION',
    SAFETY_LIMIT_EXCEEDED: 'SAFETY_LIMIT_EXCEEDED',
    UNEXPECTED_EXCEPTION: 'UNEXPECTED_EXCEPTION'
};

const DECISION = {
    SAFE: 'SAFE',
    CLAMPED: 'CLAMPED',
    BLOCKED: 'BLOCKED'
};

const ALLOWED_TOP_LEVEL_FIELDS = [
    'execution_id',
    'phase',
    'feature_flags',
    'context',
    'optimizer_plan',
    'budget_adjustments',
    'connector_state',
    'safety_horizon'
];

const ALLOWED_OUTPUT_FIELDS = [
    'execution_id',
    'phase',
    'status',
    'feature_flag_enabled',
    'stop_reason',
    'input_contract_version',
    'output_contract_version',
    'optimizer_plan_original',
    'optimizer_plan_sanitized',
    'budget_adjustments_sanitized',
    'violations',
    'summary',
    'snapshot_overlay',
    'error'
];

// --- Helper Functions ---

function isActionForbidden(step, forbiddenActions) {
    if (!forbiddenActions || !Array.isArray(forbiddenActions)) return false;

    return forbiddenActions.some(fa => {
        return fa.connector_id === step.connector_id &&
            fa.blocked_action_types &&
            fa.blocked_action_types.includes(step.action_type);
    });
}

function isConnectorHighRisk(connectorId, riskLedger, allowedRiskBands) {
    if (!riskLedger || !Array.isArray(riskLedger)) return false;
    if (!allowedRiskBands || !Array.isArray(allowedRiskBands)) return false;

    const entry = riskLedger.find(r => r.connector_id === connectorId);
    if (!entry) return false;

    return !allowedRiskBands.includes(entry.risk_level);
}

// PATCH 4: Redundancy semantics
function hasRedundancy(connectorId, redundancyProfile) {
    if (!redundancyProfile) return false;
    const withRedundancy = redundancyProfile.connectors_with_redundancy || [];
    return withRedundancy.includes(connectorId);
}

function clampBudgetDelta(step, perConnectorLimit, remainingGlobalBudget, connectorBudgetUsed) {
    let clamped = false;
    let clampedValue = step.budget_delta || 0;

    // Check global limit first (takes precedence)
    if (clampedValue > remainingGlobalBudget) {
        clampedValue = remainingGlobalBudget;
        clamped = true;
    }

    // Check per-connector limit
    const currentUsage = connectorBudgetUsed[step.connector_id] || 0;
    const maxAllowedForConnector = perConnectorLimit - currentUsage;

    if (clampedValue > maxAllowedForConnector) {
        clampedValue = maxAllowedForConnector;
        clamped = true;
    }

    // Ensure non-negative
    clampedValue = Math.max(0, Number(clampedValue));

    return { clamped, clampedValue };
}

function enforceOutputWhitelist(obj) {
    const cleaned = {};
    for (const key of ALLOWED_OUTPUT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cleaned[key] = obj[key];
        }
    }
    return cleaned;
}

// --- Main Execute Function ---

function execute(input) {
    const clonedInput = deepClone(input);
    const span = tracing.startSpan('phase_59_optimizer_safety_guard');
    const executionId = clonedInput?.execution_id || 'unknown';

    try {
        // 1. Input Whitelist Enforcement
        for (const key of Object.keys(clonedInput || {})) {
            if (!ALLOWED_TOP_LEVEL_FIELDS.includes(key)) {
                return enforceOutputWhitelist({
                    execution_id: executionId,
                    phase: '59',
                    status: STATUS.INVALID_INPUT,
                    feature_flag_enabled: false,
                    stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                    input_contract_version: 'optimizer_safety_guard_input_v1',
                    output_contract_version: 'optimizer_safety_guard_output_v1',
                    optimizer_plan_original: {},
                    optimizer_plan_sanitized: {},
                    budget_adjustments_sanitized: {},
                    violations: [],
                    summary: {},
                    snapshot_overlay: {},
                    error: `Unknown top-level field: ${key}`
                });
            }
        }

        // 2. Feature Flag Check (Env Var + Envelope)
        const ffEnabled = process.env[FEATURE_FLAG] === 'true' && !!clonedInput?.feature_flags?.[FEATURE_FLAG];

        if (!ffEnabled) {
            const planOriginal = clonedInput.optimizer_plan || {};
            const context = clonedInput.context || {};

            // CONFORMANCE: Annotate plan as unguarded
            const planSanitized = deepClone(planOriginal) || {};
            planSanitized.metadata = planSanitized.metadata || {};
            planSanitized.metadata.safety_guard_annotation = {
                guard_applied: false,
                reason: 'FEATURE_DISABLED',
                total_steps_input: planOriginal.steps?.length || 0,
                total_steps_sanitized: planOriginal.steps?.length || 0,
                total_steps_blocked: 0
            };

            // PATCH 5: Feature-disabled observability
            metrics.count('optimizer_safety.feature_disabled', 1, {
                tenant_id: context.tenant_id,
                workspace_id: context.workspace_id,
                brand_id: context.brand_id,
                policy_version: context.policy_version,
                status: STATUS.FEATURE_DISABLED
            });

            logStructured('optimizer_safety_guard_evaluated', {
                execution_id: executionId,
                plan_id: planOriginal.plan_id || '',
                status: STATUS.FEATURE_DISABLED,
                counts: { safe: 0, clamped: 0, blocked: 0 }
            });

            return enforceOutputWhitelist({
                execution_id: executionId,
                phase: '59',
                status: STATUS.FEATURE_DISABLED,
                feature_flag_enabled: false,
                stop_reason: STOP_REASON.FEATURE_DISABLED,
                input_contract_version: 'optimizer_safety_guard_input_v1',
                output_contract_version: 'optimizer_safety_guard_output_v1',
                optimizer_plan_original: deepClone(planOriginal),
                optimizer_plan_sanitized: planSanitized,
                budget_adjustments_sanitized: deepClone(clonedInput.budget_adjustments || {}),
                violations: [],
                summary: {
                    status: STATUS.FEATURE_DISABLED,
                    total_steps_input: planOriginal.steps?.length || 0,
                    total_steps_sanitized: planOriginal.steps?.length || 0,
                    total_steps_blocked: 0,
                    total_budget_delta_input: 0,
                    total_budget_delta_after_guard: 0,
                    has_safety_violations: false
                },
                snapshot_overlay: {
                    contract_version: 'optimizer_safety_snapshot_v1',
                    plan_id: planOriginal.plan_id || '',
                    per_step_decisions: {}
                },
                error: null
            });
        }

        // 3. Input Validation (Required Fields)
        const requiredFields = [
            'execution_id',
            'phase',
            'feature_flags',
            'context',
            'optimizer_plan',
            'connector_state',
            'safety_horizon'
        ];

        for (const field of requiredFields) {
            if (!clonedInput[field]) {
                return enforceOutputWhitelist({
                    execution_id: executionId,
                    phase: '59',
                    status: STATUS.INVALID_INPUT,
                    feature_flag_enabled: true,
                    stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                    input_contract_version: 'optimizer_safety_guard_input_v1',
                    output_contract_version: 'optimizer_safety_guard_output_v1',
                    optimizer_plan_original: {},
                    optimizer_plan_sanitized: {},
                    budget_adjustments_sanitized: {},
                    violations: [],
                    summary: {},
                    snapshot_overlay: {},
                    error: `Missing required field: ${field}`
                });
            }
        }

        // PATCH 7: Structural validation
        if (!Array.isArray(clonedInput.optimizer_plan.steps)) {
            return enforceOutputWhitelist({
                execution_id: executionId,
                phase: '59',
                status: STATUS.INVALID_INPUT,
                feature_flag_enabled: true,
                stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                input_contract_version: 'optimizer_safety_guard_input_v1',
                output_contract_version: 'optimizer_safety_guard_output_v1',
                optimizer_plan_original: {},
                optimizer_plan_sanitized: {},
                budget_adjustments_sanitized: {},
                violations: [],
                summary: {},
                snapshot_overlay: {},
                error: 'optimizer_plan.steps must be an array'
            });
        }

        if (typeof clonedInput.safety_horizon.safe_execution_horizon !== 'object' ||
            clonedInput.safety_horizon.safe_execution_horizon === null) {
            return enforceOutputWhitelist({
                execution_id: executionId,
                phase: '59',
                status: STATUS.INVALID_INPUT,
                feature_flag_enabled: true,
                stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                input_contract_version: 'optimizer_safety_guard_input_v1',
                output_contract_version: 'optimizer_safety_guard_output_v1',
                optimizer_plan_original: {},
                optimizer_plan_sanitized: {},
                budget_adjustments_sanitized: {},
                violations: [],
                summary: {},
                snapshot_overlay: {},
                error: 'safety_horizon.safe_execution_horizon must be an object'
            });
        }

        if (!Array.isArray(clonedInput.safety_horizon.forbidden_actions)) {
            clonedInput.safety_horizon.forbidden_actions = [];
        }

        if (typeof clonedInput.connector_state.connectors !== 'object' ||
            clonedInput.connector_state.connectors === null) {
            return enforceOutputWhitelist({
                execution_id: executionId,
                phase: '59',
                status: STATUS.INVALID_INPUT,
                feature_flag_enabled: true,
                stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                input_contract_version: 'optimizer_safety_guard_input_v1',
                output_contract_version: 'optimizer_safety_guard_output_v1',
                optimizer_plan_original: {},
                optimizer_plan_sanitized: {},
                budget_adjustments_sanitized: {},
                violations: [],
                summary: {},
                snapshot_overlay: {},
                error: 'connector_state.connectors must be an object'
            });
        }

        if (clonedInput.budget_adjustments && clonedInput.budget_adjustments.entries &&
            !Array.isArray(clonedInput.budget_adjustments.entries)) {
            return enforceOutputWhitelist({
                execution_id: executionId,
                phase: '59',
                status: STATUS.INVALID_INPUT,
                feature_flag_enabled: true,
                stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                input_contract_version: 'optimizer_safety_guard_input_v1',
                output_contract_version: 'optimizer_safety_guard_output_v1',
                optimizer_plan_original: {},
                optimizer_plan_sanitized: {},
                budget_adjustments_sanitized: {},
                violations: [],
                summary: {},
                snapshot_overlay: {},
                error: 'budget_adjustments.entries must be an array'
            });
        }

        // 4. Extract Input Structures
        const optimizerPlan = clonedInput.optimizer_plan;
        const optimizerPlanOriginal = deepClone(optimizerPlan);
        const safetyHorizon = clonedInput.safety_horizon;
        const connectorState = clonedInput.connector_state;
        const budgetAdjustments = clonedInput.budget_adjustments || {};
        const context = clonedInput.context || {};

        const steps = optimizerPlan.steps || [];
        const safeExecutionHorizon = safetyHorizon.safe_execution_horizon || {};
        const forbiddenActions = safetyHorizon.forbidden_actions || [];
        const riskLedger = safetyHorizon.risk_ledger || [];
        const safetyZone = safetyHorizon.safety_zone || {};
        const redundancyProfile = safetyHorizon.redundancy_profile || {};

        const maxBudgetDeltaTotal = safeExecutionHorizon.max_budget_delta_total ?? Infinity;
        const maxBudgetDeltaPerConnector = safeExecutionHorizon.max_budget_delta_per_connector ?? Infinity;
        const maxParallelConnectors = safeExecutionHorizon.max_parallel_connectors ?? Infinity;
        const maxStepsPerPlan = safeExecutionHorizon.max_steps_per_plan ?? Infinity;
        const allowedRiskBands = safetyZone.allowed_risk_bands || [];

        // 5. Decision Processing
        const sanitizedSteps = [];
        const violations = [];
        const perStepDecisions = {};
        const connectorBudgetUsed = {};
        const connectorsUsed = new Set();

        let totalBudgetDeltaInput = 0;
        let totalBudgetDeltaAfterGuard = 0;
        let globalBudgetRemaining = maxBudgetDeltaTotal;

        for (const step of steps) {
            const stepId = step.step_id || 'unknown_step';
            const connectorId = step.connector_id || 'unknown_connector';
            const budgetDelta = step.budget_delta || 0;

            // PATCH 2: Strict numeric validation
            if (!Number.isFinite(Number(step.budget_delta))) {
                return enforceOutputWhitelist({
                    execution_id: executionId,
                    phase: '59',
                    status: STATUS.INVALID_INPUT,
                    feature_flag_enabled: true,
                    stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                    input_contract_version: 'optimizer_safety_guard_input_v1',
                    output_contract_version: 'optimizer_safety_guard_output_v1',
                    optimizer_plan_original: {},
                    optimizer_plan_sanitized: {},
                    budget_adjustments_sanitized: {},
                    violations: [],
                    summary: {},
                    snapshot_overlay: {},
                    error: `Invalid budget_delta: ${step.budget_delta}`
                });
            }

            totalBudgetDeltaInput += budgetDelta;

            // 5.0 CONFORMANCE: Check global zero horizon
            if (globalBudgetRemaining <= 0 && budgetDelta > 0) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: stepId,
                    connector_id: connectorId,
                    violation_type: 'GLOBAL_BUDGET_EXCEEDED',
                    risk_level: 'MEDIUM',
                    reason: 'MAX_GLOBAL_BUDGET_DELTA_EXCEEDED',
                    safety_rule_ref: {
                        source_phase: '58'
                    },
                    original_action: deepClone(step),
                    resolved_action: null
                });

                perStepDecisions[stepId] = {
                    decision: DECISION.BLOCKED,
                    reason_codes: ['GLOBAL_BUDGET_EXCEEDED']
                };
                continue;
            }

            //5.1 Check forbidden actions
            if (isActionForbidden(step, forbiddenActions)) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: stepId,
                    connector_id: connectorId,
                    violation_type: 'FORBIDDEN_ACTION',
                    risk_level: 'HIGH',
                    reason: 'FORBIDDEN_ACTION_BY_SAFETY_HORIZON',
                    safety_rule_ref: {
                        source_phase: '58',
                        forbidden_action_index: forbiddenActions.findIndex(fa =>
                            fa.connector_id === connectorId &&
                            fa.blocked_action_types?.includes(step.action_type)
                        )
                    },
                    original_action: deepClone(step),
                    resolved_action: null
                });

                perStepDecisions[stepId] = {
                    decision: DECISION.BLOCKED,
                    reason_codes: ['FORBIDDEN_ACTION']
                };
                continue;
            }

            // 5.2 Check risk ledger with redundancy semantics (PATCH 4)
            const highRisk = isConnectorHighRisk(connectorId, riskLedger, allowedRiskBands);
            if (highRisk) {
                const hasRedund = hasRedundancy(connectorId, redundancyProfile);

                if (!hasRedund) {
                    // No redundancy + high risk = BLOCKED
                    violations.push({
                        violation_id: `vio_${violations.length + 1}`,
                        step_id: stepId,
                        connector_id: connectorId,
                        violation_type: 'HIGH_RISK',
                        risk_level: 'HIGH',
                        reason: 'CONNECTOR_RISK_LEVEL_EXCEEDS_ALLOWED_BANDS',
                        safety_rule_ref: {
                            source_phase: '58',
                            risk_ledger_index: riskLedger.findIndex(r => r.connector_id === connectorId)
                        },
                        original_action: deepClone(step),
                        resolved_action: null
                    });

                    perStepDecisions[stepId] = {
                        decision: DECISION.BLOCKED,
                        reason_codes: ['HIGH_RISK_LEDGER_ENTRY', 'NO_REDUNDANCY_HIGH_RISK']
                    };
                    continue;
                }
                // Has redundancy + high risk = CLAMPED to 0 (handled below)
            }

            // 5.3 Check max steps
            if (sanitizedSteps.length >= maxStepsPerPlan) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: stepId,
                    connector_id: connectorId,
                    violation_type: 'MAX_STEPS_EXCEEDED',
                    risk_level: 'MEDIUM',
                    reason: 'MAX_STEPS_PER_PLAN_EXCEEDED',
                    safety_rule_ref: {
                        source_phase: '58'
                    },
                    original_action: deepClone(step),
                    resolved_action: null
                });

                perStepDecisions[stepId] = {
                    decision: DECISION.BLOCKED,
                    reason_codes: ['MAX_STEPS_EXCEEDED']
                };
                continue;
            }

            // 5.4 Check max parallel connectors
            connectorsUsed.add(connectorId);
            if (connectorsUsed.size > maxParallelConnectors) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: stepId,
                    connector_id: connectorId,
                    violation_type: 'MAX_PARALLEL_CONNECTORS_EXCEEDED',
                    risk_level: 'MEDIUM',
                    reason: 'MAX_PARALLEL_CONNECTORS_EXCEEDED',
                    safety_rule_ref: {
                        source_phase: '58'
                    },
                    original_action: deepClone(step),
                    resolved_action: null
                });

                perStepDecisions[stepId] = {
                    decision: DECISION.BLOCKED,
                    reason_codes: ['MAX_PARALLEL_CONNECTORS_EXCEEDED']
                };
                connectorsUsed.delete(connectorId); // Rollback
                continue;
            }

            // 5.5 Clamp budget if needed (or to 0 if high risk + redundancy)
            let { clamped, clampedValue } = clampBudgetDelta(
                step,
                maxBudgetDeltaPerConnector,
                globalBudgetRemaining,
                connectorBudgetUsed
            );

            // PATCH 4: Redundancy semantics - clamp to 0 if high risk + redundancy
            if (highRisk && hasRedundancy(connectorId, redundancyProfile)) {
                clampedValue = 0;
                clamped = true;
            }

            const sanitizedStep = deepClone(step);
            sanitizedStep.budget_delta = clampedValue;

            if (clamped) {
                sanitizedStep.tags = sanitizedStep.tags || [];
                if (!sanitizedStep.tags.includes('clamped_by_safety_guard')) {
                    sanitizedStep.tags.push('clamped_by_safety_guard');
                }
                sanitizedStep.metadata = sanitizedStep.metadata || {};
                sanitizedStep.metadata.safety_guard_decision = DECISION.CLAMPED;

                const reasonCodes = ['BUDGET_CLAMPED'];
                if (highRisk && hasRedundancy(connectorId, redundancyProfile)) {
                    reasonCodes.push('REDUNDANCY_SOFTENED_HIGH_RISK');
                }

                perStepDecisions[stepId] = {
                    decision: DECISION.CLAMPED,
                    reason_codes: reasonCodes
                };
            } else {
                perStepDecisions[stepId] = {
                    decision: DECISION.SAFE,
                    reason_codes: []
                };
            }

            // Update tracking
            connectorBudgetUsed[connectorId] = (connectorBudgetUsed[connectorId] || 0) + clampedValue;
            globalBudgetRemaining -= clampedValue;
            totalBudgetDeltaAfterGuard += clampedValue;

            sanitizedSteps.push(sanitizedStep);
        }

        // 6. Budget Adjustments Processing (PATCH 3)
        const sanitizedBudgetEntries = [];
        const budgetAdjustmentEntries = budgetAdjustments.entries || [];

        for (const entry of budgetAdjustmentEntries) {
            const entryId = entry.entry_id || 'unknown_entry';
            const connectorId = entry.connector_id || 'unknown_connector';
            const budgetDelta = entry.budget_delta || 0;

            // Numeric validation
            if (!Number.isFinite(Number(entry.budget_delta))) {
                return enforceOutputWhitelist({
                    execution_id: executionId,
                    phase: '59',
                    status: STATUS.INVALID_INPUT,
                    feature_flag_enabled: true,
                    stop_reason: STOP_REASON.CONTRACT_VIOLATION,
                    input_contract_version: 'optimizer_safety_guard_input_v1',
                    output_contract_version: 'optimizer_safety_guard_output_v1',
                    optimizer_plan_original: {},
                    optimizer_plan_sanitized: {},
                    budget_adjustments_sanitized: {},
                    violations: [],
                    summary: {},
                    snapshot_overlay: {},
                    error: `Invalid budget_delta in budget_adjustments: ${entry.budget_delta}`
                });
            }

            totalBudgetDeltaInput += budgetDelta;

            // CONFORMANCE: Check global zero horizon for budget adjustments
            if (globalBudgetRemaining <= 0 && budgetDelta > 0) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: entryId,
                    connector_id: connectorId,
                    violation_type: 'GLOBAL_BUDGET_EXCEEDED',
                    risk_level: 'MEDIUM',
                    reason: 'MAX_GLOBAL_BUDGET_DELTA_EXCEEDED',
                    safety_rule_ref: {
                        source_phase: '58'
                    },
                    original_action: deepClone(entry),
                    resolved_action: null
                });
                continue;
            }

            // Check forbidden actions
            if (isActionForbidden({ connector_id: connectorId, action_type: 'BUDGET_REALLOCATE' }, forbiddenActions)) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: entryId,
                    connector_id: connectorId,
                    violation_type: 'FORBIDDEN_ACTION',
                    risk_level: 'HIGH',
                    reason: 'FORBIDDEN_ACTION_BY_SAFETY_HORIZON',
                    safety_rule_ref: {
                        source_phase: '58'
                    },
                    original_action: deepClone(entry),
                    resolved_action: null
                });
                continue;
            }

            // Check risk ledger
            const highRisk = isConnectorHighRisk(connectorId, riskLedger, allowedRiskBands);
            if (highRisk && !hasRedundancy(connectorId, redundancyProfile)) {
                violations.push({
                    violation_id: `vio_${violations.length + 1}`,
                    step_id: entryId,
                    connector_id: connectorId,
                    violation_type: 'HIGH_RISK',
                    risk_level: 'HIGH',
                    reason: 'CONNECTOR_RISK_LEVEL_EXCEEDS_ALLOWED_BANDS',
                    safety_rule_ref: {
                        source_phase: '58'
                    },
                    original_action: deepClone(entry),
                    resolved_action: null
                });
                continue;
            }

            // Clamp budget
            let { clamped, clampedValue } = clampBudgetDelta(
                { connector_id: connectorId, budget_delta: budgetDelta },
                maxBudgetDeltaPerConnector,
                globalBudgetRemaining,
                connectorBudgetUsed
            );

            if (highRisk && hasRedundancy(connectorId, redundancyProfile)) {
                clampedValue = 0;
                clamped = true;
            }

            const sanitizedEntry = deepClone(entry);
            sanitizedEntry.budget_delta = clampedValue;

            if (clamped) {
                sanitizedEntry.metadata = sanitizedEntry.metadata || {};
                sanitizedEntry.metadata.safety_guard_decision = DECISION.CLAMPED;
            }

            connectorBudgetUsed[connectorId] = (connectorBudgetUsed[connectorId] || 0) + clampedValue;
            globalBudgetRemaining -= clampedValue;
            totalBudgetDeltaAfterGuard += clampedValue;

            sanitizedBudgetEntries.push(sanitizedEntry);
        }

        // 7. Construct Sanitized Plan
        const optimizerPlanSanitized = {
            plan_id: optimizerPlan.plan_id || '',
            steps: sanitizedSteps,
            metadata: {
                ...optimizerPlan.metadata,
                safety_guard_annotation: {
                    total_steps_input: steps.length,
                    total_steps_sanitized: sanitizedSteps.length,
                    total_steps_blocked: steps.length - sanitizedSteps.length
                }
            }
        };

        // 8. Budget Adjustments
        const budgetAdjustmentsSanitized = {
            entries: sanitizedBudgetEntries,
            summary: {
                total_budget_delta_input: totalBudgetDeltaInput,
                total_budget_delta_after_guard: totalBudgetDeltaAfterGuard
            }
        };

        // 9. Determine final status (PATCH 1)
        let finalStatus = STATUS.OK;
        let finalStopReason = STOP_REASON.NONE;
        if (violations.length > 0) {
            finalStatus = STATUS.SAFETY_VIOLATION;
            finalStopReason = STOP_REASON.SAFETY_LIMIT_EXCEEDED;
        }

        // 10. Summary
        const summary = {
            status: finalStatus,
            total_steps_input: steps.length,
            total_steps_sanitized: sanitizedSteps.length,
            total_steps_blocked: steps.length - sanitizedSteps.length,
            total_budget_delta_input: totalBudgetDeltaInput,
            total_budget_delta_after_guard: totalBudgetDeltaAfterGuard,
            has_safety_violations: violations.length > 0
        };

        // 11. Snapshot Overlay
        const snapshotOverlay = {
            contract_version: 'optimizer_safety_snapshot_v1',
            plan_id: optimizerPlan.plan_id || '',
            per_step_decisions: sortObjectKeys(perStepDecisions)
        };

        // 12. Observability
        metrics.count('optimizer_safety.steps_total', steps.length, {
            tenant_id: context.tenant_id,
            workspace_id: context.workspace_id,
            brand_id: context.brand_id,
            policy_version: context.policy_version,
            status: finalStatus
        });
        metrics.count('optimizer_safety.steps_blocked', summary.total_steps_blocked, {
            tenant_id: context.tenant_id,
            workspace_id: context.workspace_id,
            brand_id: context.brand_id,
            policy_version: context.policy_version,
            status: finalStatus
        });
        metrics.count('optimizer_safety.steps_clamped',
            Object.values(perStepDecisions).filter(d => d.decision === DECISION.CLAMPED).length, {
            tenant_id: context.tenant_id,
            workspace_id: context.workspace_id,
            brand_id: context.brand_id,
            policy_version: context.policy_version,
            status: finalStatus
        });
        metrics.count('optimizer_safety.violations_total', violations.length, {
            tenant_id: context.tenant_id,
            workspace_id: context.workspace_id,
            brand_id: context.brand_id,
            policy_version: context.policy_version,
            status: finalStatus
        });

        logStructured('optimizer_safety_guard_evaluated', {
            execution_id: executionId,
            plan_id: optimizerPlan.plan_id,
            status: finalStatus,
            counts: {
                safe: Object.values(perStepDecisions).filter(d => d.decision === DECISION.SAFE).length,
                clamped: Object.values(perStepDecisions).filter(d => d.decision === DECISION.CLAMPED).length,
                blocked: Object.values(perStepDecisions).filter(d => d.decision === DECISION.BLOCKED).length
            },
            violations_summary: violations.map(v => ({
                violation_id: v.violation_id,
                step_id: v.step_id,
                connector_id: v.connector_id,
                violation_type: v.violation_type
            }))
        });

        // 13. Output Construction
        return enforceOutputWhitelist({
            execution_id: executionId,
            phase: '59',
            status: finalStatus,
            feature_flag_enabled: true,
            stop_reason: finalStopReason,
            input_contract_version: 'optimizer_safety_guard_input_v1',
            output_contract_version: 'optimizer_safety_guard_output_v1',
            optimizer_plan_original: optimizerPlanOriginal,
            optimizer_plan_sanitized: optimizerPlanSanitized,
            budget_adjustments_sanitized: budgetAdjustmentsSanitized,
            violations: violations,
            summary: summary,
            snapshot_overlay: snapshotOverlay,
            error: null
        });

    } catch (e) {
        logStructured('optimizer_safety_guard_error', {
            execution_id: executionId,
            error: e.message,
            stack: e.stack
        });

        metrics.count('optimizer_safety.internal_error', 1, {
            status: STATUS.INTERNAL_ERROR
        });

        return enforceOutputWhitelist({
            execution_id: executionId,
            phase: '59',
            status: STATUS.INTERNAL_ERROR,
            feature_flag_enabled: true,
            stop_reason: STOP_REASON.UNEXPECTED_EXCEPTION,
            input_contract_version: 'optimizer_safety_guard_input_v1',
            output_contract_version: 'optimizer_safety_guard_output_v1',
            optimizer_plan_original: {},
            optimizer_plan_sanitized: {},
            budget_adjustments_sanitized: {},
            violations: [],
            summary: {},
            snapshot_overlay: {},
            error: e.message
        });
    } finally {
        span.end();
    }
}

module.exports = { execute };
