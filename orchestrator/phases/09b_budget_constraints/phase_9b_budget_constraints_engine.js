/**
 * Phase 9B: Budget Constraints Engine
 * 
 * Evaluates and enforces policy-driven, cross-venue, and objective-driven
 * budget constraints before allocation. Acts as the budget correctness firewall.
 * 
 * Contract: budget_constraints_output_v1
 * Feature Flag: FF_BUDGET_CONSTRAINTS_ENGINE
 */

/**
 * Deep clone an object to prevent mutation (Framework Rule #1)
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Error codes for structured error handling
 */
const ERROR_CODES = {
    OK: 'OK',
    CONSTRAINTS_VIOLATION: 'CONSTRAINTS_VIOLATION',
    UNSUPPORTED_BUDGET: 'UNSUPPORTED_BUDGET',
    POLICY_BLOCK: 'POLICY_BLOCK',
    KNOWLEDGE_RESOLUTION_FAILURE: 'KNOWLEDGE_RESOLUTION_FAILURE',
    INVALID_INPUT: 'INVALID_INPUT'
};

/**
 * Platform minimum budgets (in cents)
 * These are fallback values; real values should come from knowledge graph
 */
const PLATFORM_MINIMUMS = {
    google: 2000,   // $20
    meta: 1000,     // $10
    tiktok: 5000,   // $50
    youtube: 2500,  // $25
    reddit: 1500    // $15
};

const PLATFORM_MAXIMUMS = {
    google: 100000000,  // $1M
    meta: 100000000,
    tiktok: 100000000,
    youtube: 100000000,
    reddit: 100000000
};

const MIN_GLOBAL = 10000;  // $100 minimum across all venues
const MAX_TENANT_DEFAULT = 100000000;  // $1M default tenant maximum

/**
 * Emit observability signals (Framework Rule #3)
 */
function emitObservability(execution_id, tenant_id, brand_id, total_budget, venues_count, status) {
    if (process.env.NODE_ENV !== 'test') {
        // Metric
        console.log(JSON.stringify({
            metric: 'phase_9b_budget_constraints_evaluated',
            execution_id,
            tenant_id,
            brand_id,
            total_budget_cents: total_budget,
            venues_count,
            status
        }));

        // Log event
        console.log(JSON.stringify({
            event: 'budget_constraints_evaluation',
            phase: '9B',
            execution_id,
            tenant_id,
            brand_id,
            total_budget,
            venues: venues_count,
            status
        }));

        // Trace span
        console.log(JSON.stringify({
            trace_span: 'budget_constraints_evaluation',
            execution_id,
            tenant_id,
            status
        }));
    }
}

/**
 * Format cents to dollar string
 */
function formatDollars(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Compute venue-specific constraints
 */
function computeVenueConstraints(venues, creative_compliance, knowledge_context = {}) {
    const per_venue_minimums = {};
    const per_venue_maximums = {};
    const blocked_venues = [];

    for (const venue of venues) {
        // Check creative compliance - if creative blocked for this venue, block it
        if (creative_compliance && creative_compliance.platform_findings) {
            const finding = creative_compliance.platform_findings[venue];
            if (finding && finding.status === 'FAIL') {
                blocked_venues.push(venue);
                continue;
            }
        }

        // Get minimums from knowledge graph or fallback
        const platform_capabilities = knowledge_context.platform_capabilities || {};
        const venue_caps = platform_capabilities[venue] || {};

        per_venue_minimums[venue] = venue_caps.minimum || PLATFORM_MINIMUMS[venue] || 1000;
        per_venue_maximums[venue] = venue_caps.maximum || PLATFORM_MAXIMUMS[venue] || 100000000;
    }

    return { per_venue_minimums, per_venue_maximums, blocked_venues };
}

/**
 * Compute objective-driven constraints
 */
function computeObjectiveConstraints(objective_normalization, venues_count) {
    let min_objective = 0;
    const objectives = objective_normalization.normalized_objectives || {};
    const reasons = [];

    // High reach requires multi-venue minimums
    if (objectives.reach > 0.7) {
        if (venues_count < 2) {
            reasons.push('High reach objective requires minimum 2 venues');
        }
        min_objective = Math.max(min_objective, 20000);  // $200 minimum for high reach
    }

    // High conversions requires CPA floor
    if (objectives.conversions > 0.7) {
        min_objective = Math.max(min_objective, 15000);  // $150 minimum for conversions
    }

    // High value requires frequency floor
    if (objectives.value > 0.6) {
        min_objective = Math.max(min_objective, 18000);  // $180 minimum for value
    }

    // High frequency boost
    if (objectives.frequency > 0.5) {
        min_objective = Math.max(min_objective, 12000);  // $120 minimum for frequency
    }

    return { min_objective, reasons };
}

/**
 * Compute global constraints
 */
function computeGlobalConstraints(venues, per_venue_minimums, per_venue_maximums, min_objective, policy_rules = {}) {
    // Sum venue minimums
    const sum_venue_mins = Object.values(per_venue_minimums).reduce((sum, min) => sum + min, 0);
    const sum_venue_maxs = Object.values(per_venue_maximums).reduce((sum, max) => sum + max, 0);

    // Global minimum is the max of:
    // - Policy minimum (optional)
    // - Objective-driven minimum
    // - Sum of venue minimums
    const policy_min = policy_rules.min_global_budget || 0;
    const global_minimum = Math.max(policy_min, min_objective, sum_venue_mins);

    // Global maximum is the min of:
    // - Tenant maximum (from policy or default)
    // - Sum of venue maximums
    const tenant_max = policy_rules.max_budget || MAX_TENANT_DEFAULT;
    const global_maximum = Math.min(tenant_max, sum_venue_maxs);

    return { global_minimum, global_maximum };
}

/**
 * Evaluate budget against constraints
 */
function evaluateConstraints(
    total_budget,
    global_minimum,
    global_maximum,
    per_venue_minimums,
    blocked_venues,
    objective_reasons
) {
    const constraint_reasons = [];

    // Check global constraints
    const isBelowGlobalMin = total_budget < global_minimum;
    const isAboveGlobalMax = total_budget > global_maximum;

    if (isBelowGlobalMin) {
        constraint_reasons.push(
            `Budget ${formatDollars(total_budget)} below global minimum ${formatDollars(global_minimum)}`
        );
    }

    if (isAboveGlobalMax) {
        constraint_reasons.push(
            `Budget ${formatDollars(total_budget)} exceeds global maximum ${formatDollars(global_maximum)}`
        );
    }

    // Check venue minimums
    let hasVenueViolation = false;
    for (const [venue, min] of Object.entries(per_venue_minimums)) {
        if (total_budget < min) {
            hasVenueViolation = true;
            constraint_reasons.push(
                `${venue.charAt(0).toUpperCase() + venue.slice(1)} minimum ${formatDollars(min)} not met`
            );
        }
    }

    // Check blocked venues
    const hasPolicyBlock = blocked_venues.length > 0;
    if (hasPolicyBlock) {
        for (const venue of blocked_venues) {
            constraint_reasons.push(
                `${venue.charAt(0).toUpperCase() + venue.slice(1)} blocked by creative compliance`
            );
        }
    }

    // Add objective reasons
    constraint_reasons.push(...objective_reasons);

    // Determine status with strict precedence
    let status = ERROR_CODES.OK;

    if (hasPolicyBlock) {
        status = ERROR_CODES.POLICY_BLOCK;
    } else if (isBelowGlobalMin || isAboveGlobalMax) {
        status = ERROR_CODES.UNSUPPORTED_BUDGET;
    } else if (hasVenueViolation) {
        status = ERROR_CODES.CONSTRAINTS_VIOLATION;
    }

    return { status, constraint_reasons: constraint_reasons.sort() };
}

/**
 * Compute recommended plan
 */
function computeRecommendedPlan(status, global_minimum, global_maximum) {
    if (status !== ERROR_CODES.OK) {
        return null;
    }

    const safe_zone_min = Math.round(global_minimum * 1.1);  // 10% buffer
    const safe_zone_max = Math.round(global_maximum * 0.9);  // 10% safety margin
    const recommended_start = Math.round((safe_zone_min + safe_zone_max) / 2);

    return {
        safe_zone_min,
        safe_zone_max,
        recommended_start
    };
}

/**
 * Main evaluation function
 * 
 * @param {object} input - budget_constraints_input_v1
 * @param {object} context - optional knowledge context
 * @returns {object} - budget_constraints_output_v1
 */
async function evaluateBudgetConstraints(input, context = {}) {
    const timestamp = new Date().toISOString();

    // Feature flag check
    const FF_BUDGET_CONSTRAINTS_ENGINE = process.env.FF_BUDGET_CONSTRAINTS_ENGINE === 'true';

    if (!FF_BUDGET_CONSTRAINTS_ENGINE) {
        // Return pass-through with placeholder feasibility
        return {
            ok: true,
            module: 'budget_constraints_engine',
            timestamp,
            payload: {
                execution_id: input?.execution_id || 'unknown',
                status: ERROR_CODES.OK,
                feasibility: {
                    global_minimum: 0,
                    global_maximum: 999999999,
                    per_venue_minimums: {},
                    per_venue_maximums: {}
                },
                constraint_reasons: ['Feature flag disabled, constraints not evaluated'],
                recommended_plan: {
                    safe_zone_min: 0,
                    safe_zone_max: 999999999,
                    recommended_start: input?.total_budget || 0
                }
            }
        };
    }

    // Input validation
    if (!input || typeof input !== 'object') {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Input must be an object'
            }
        };
    }

    if (!input.execution_id || typeof input.execution_id !== 'string') {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid execution_id'
            }
        };
    }

    if (!input.tenant_id || typeof input.tenant_id !== 'string') {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid tenant_id'
            }
        };
    }

    if (!input.brand_id || typeof input.brand_id !== 'string') {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid brand_id'
            }
        };
    }

    if (typeof input.total_budget !== 'number' || input.total_budget < 0) {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid total_budget (must be number >= 0)'
            }
        };
    }

    if (!Array.isArray(input.venues) || input.venues.length === 0) {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid venues (must be non-empty array)'
            }
        };
    }

    if (!input.objective_normalization || typeof input.objective_normalization !== 'object') {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid objective_normalization'
            }
        };
    }

    if (!input.creative_compliance || typeof input.creative_compliance !== 'object') {
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid creative_compliance'
            }
        };
    }

    // Deep clone to prevent mutation
    const venues = [...input.venues];
    const objective_normalization = deepClone(input.objective_normalization);
    const creative_compliance = input.creative_compliance;
    const policy_rules = context.policy_rules || {};
    const knowledge_context = context.knowledge_context || {};

    try {
        // Step 1: Compute venue constraints
        const { per_venue_minimums, per_venue_maximums, blocked_venues } = computeVenueConstraints(
            venues,
            creative_compliance,
            knowledge_context
        );

        // Step 2: Compute objective constraints
        const { min_objective, reasons: objective_reasons } = computeObjectiveConstraints(
            objective_normalization,
            venues.length
        );

        // Step 3: Compute global constraints
        const { global_minimum, global_maximum } = computeGlobalConstraints(
            venues,
            per_venue_minimums,
            per_venue_maximums,
            min_objective,
            policy_rules
        );

        // Step 4: Evaluate budget against constraints
        const { status, constraint_reasons } = evaluateConstraints(
            input.total_budget,
            global_minimum,
            global_maximum,
            per_venue_minimums,
            blocked_venues,
            objective_reasons
        );

        // Step 5: Compute recommended plan
        const recommended_plan = computeRecommendedPlan(status, global_minimum, global_maximum);

        const result = {
            execution_id: input.execution_id,
            status,
            feasibility: {
                global_minimum,
                global_maximum,
                per_venue_minimums,
                per_venue_maximums
            },
            constraint_reasons,
            recommended_plan
        };

        // Emit observability
        emitObservability(
            input.execution_id,
            input.tenant_id,
            input.brand_id,
            input.total_budget,
            venues.length,
            status
        );

        return {
            ok: true,
            module: 'budget_constraints_engine',
            timestamp,
            payload: result
        };

    } catch (err) {
        // Fallback on unexpected errors
        return {
            ok: false,
            module: 'budget_constraints_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.KNOWLEDGE_RESOLUTION_FAILURE,
                message: `Constraint evaluation failed: ${err.message}`
            }
        };
    }
}

module.exports = {
    evaluateBudgetConstraints,
    ERROR_CODES,
    _internal: {
        computeVenueConstraints,
        computeObjectiveConstraints,
        computeGlobalConstraints,
        evaluateConstraints,
        computeRecommendedPlan,
        formatDollars
    }
};
