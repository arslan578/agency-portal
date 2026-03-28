/**
 * Budget Optimizer v0.1 - Phase 9
 * 
 * Pure, deterministic budget allocation module.
 * No AI calls, no I/O, no network operations.
 * Allocates budget across venues based on explicit rules.
 */

/**
 * Generate ISO 8601 timestamp
 * @returns {string} ISO timestamp
 */
function nowIso() {
    return new Date().toISOString();
}

/**
 * Validate input for required fields
 * @param {Object} input - Request input
 * @returns {Object|null} Error object if invalid, null if valid
 */
function validateInput(input) {
    if (!input || !input.campaign_plan) {
        return {
            message: 'Missing required field: campaign_plan',
            code: 'INVALID_INPUT'
        };
    }

    const { budget, venues } = input.campaign_plan;

    if (!budget || typeof budget.total !== 'number' || budget.total <= 0) {
        return {
            message: 'Missing or invalid field: campaign_plan.budget.total',
            code: 'INVALID_INPUT'
        };
    }

    if (!Array.isArray(venues) || venues.length === 0) {
        return {
            message: 'No venues available for allocation',
            code: 'INVALID_INPUT'
        };
    }

    return null;
}

/**
 * Calculate allocations based on deterministic rules
 * @param {Object} campaign_plan - The campaign plan
 * @returns {Array} Array of allocation objects
 */
function buildAllocations(campaign_plan) {
    const totalBudget = campaign_plan.budget.total;

    // Sort venues by priority ascending (stable sort)
    // If priorities are equal, keep original order (assumed stable sort in JS)
    const sortedVenues = [...campaign_plan.venues].sort((a, b) => a.priority - b.priority);
    const count = sortedVenues.length;

    // Determine shares based on venue count
    let shares = [];
    if (count === 1) {
        shares = [1.0];
    } else if (count === 2) {
        shares = [0.6, 0.4];
    } else {
        // 3 or more
        const firstShare = 0.5;
        const secondShare = 0.3;
        const remainder = 0.2;
        const remainingCount = count - 2;
        const sharePerRemaining = remainder / remainingCount;

        shares = [firstShare, secondShare, ...Array(remainingCount).fill(sharePerRemaining)];
    }

    // Build allocation objects
    return sortedVenues.map((venue, index) => {
        const share = shares[index];
        const allocated = Math.round(totalBudget * share);
        const flags = [];

        if (share < 0.1) {
            flags.push('LOW_SHARE');
        }
        if (allocated < 100) {
            flags.push('MINIMUM_NOT_MET');
        }

        return {
            venue_key: venue.venue_key,
            role: venue.role,
            priority: venue.priority,
            share: Number(share.toFixed(4)), // normalize precision
            allocated: allocated,
            budget_hint: venue.budget_hint,
            flags: flags
        };
    });
}

/**
 * Build summary object
 * @param {number} totalBudget - Total budget
 * @param {Array} allocations - Calculated allocations
 * @returns {Object} Summary object
 */
function buildSummary(totalBudget, allocations) {
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated, 0);
    const unallocated = totalBudget - totalAllocated;
    const issues = [];

    if (unallocated > 0) {
        issues.push('UNALLOCATED_BUDGET');
    } else if (unallocated < 0) {
        issues.push('OVER_ALLOCATED_BUDGET');
    }

    if (allocations.length > 5) {
        issues.push('MANY_VENUES');
    }

    return {
        total_allocated: totalAllocated,
        unallocated: unallocated,
        venue_count: allocations.length,
        issues: issues
    };
}

/**
 * Build meta object
 * @param {Object} campaign_plan - Source campaign plan
 * @returns {Object} Meta object
 */
function buildMeta(campaign_plan) {
    return {
        version: 'phase-9.0',
        created_at: nowIso(),
        source_campaign_version: campaign_plan.meta?.version || '',
        source_campaign_created_at: campaign_plan.meta?.created_at || '',
        goal_type: campaign_plan.campaign_goal?.type || '',
        primary_kpi: campaign_plan.campaign_goal?.primary_kpi || ''
    };
}

/**
 * Optimize budget allocation
 * Pure, synchronous function
 * 
 * @param {Object} input - Request input containing campaign_plan
 * @returns {Object} Standard orchestrator envelope with BudgetPlan
 */
function optimize_budget(input) {
    // Validate input
    const validationError = validateInput(input);
    if (validationError) {
        return {
            ok: false,
            module: 'budget_engine',
            timestamp: nowIso(),
            payload: null,
            error: validationError
        };
    }

    const { campaign_plan } = input;
    const allocations = buildAllocations(campaign_plan);
    const summary = buildSummary(campaign_plan.budget.total, allocations);
    const meta = buildMeta(campaign_plan);

    const budget_plan = {
        brand_id: campaign_plan.brand_id,
        currency: campaign_plan.budget.currency || null,
        total_budget: campaign_plan.budget.total,
        flight_start: campaign_plan.budget.flight_start,
        flight_end: campaign_plan.budget.flight_end,
        allocations: allocations,
        summary: summary,
        meta: meta
    };

    return {
        ok: true,
        module: 'budget_engine',
        timestamp: nowIso(),
        payload: {
            budget_plan: budget_plan
        },
        error: null
    };
}

module.exports = {
    optimize_budget
};
