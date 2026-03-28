/**
 * Venue Execution Planner v0.1 - Phase 10
 * 
 * Pure, deterministic execution planning module.
 * Combines CampaignPlan and BudgetPlan to create detailed execution directives.
 * No AI calls, no I/O, no network operations.
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

    if (!input.budget_plan) {
        return {
            message: 'Missing required field: budget_plan',
            code: 'INVALID_INPUT'
        };
    }

    return null;
}

/**
 * Map campaign goal type to venue objective
 * @param {string} goalType - Campaign goal type
 * @returns {string} Venue objective
 */
function mapObjective(goalType) {
    const type = (goalType || '').toUpperCase();
    switch (type) {
        case 'LEADS':
            return 'LEAD_GEN';
        case 'SALES':
            return 'CONVERSION';
        case 'AWARENESS':
        default:
            return 'AWARENESS';
    }
}

/**
 * Determine creative requirements based on venue key
 * @param {string} venueKey - Venue key
 * @returns {Object} Creative requirements
 */
function getCreativeRequirements(venueKey) {
    const key = (venueKey || '').toUpperCase();

    const verticalVideoVenues = ['TIKTOK', 'INSTAGRAM', 'META', 'SNAPCHAT'];
    const shortFormVenues = ['TIKTOK', 'INSTAGRAM', 'META', 'YOUTUBE'];
    const staticVenues = ['META', 'GOOGLE_DISPLAY', 'REDDIT'];

    return {
        needs_vertical_video: verticalVideoVenues.includes(key),
        needs_short_form: shortFormVenues.includes(key),
        needs_static: staticVenues.includes(key)
    };
}

/**
 * Generate audience notes based on heuristics
 * @param {Object} audience - Audience object from campaign plan
 * @returns {string[]} Array of audience notes
 */
function getAudienceNotes(audience) {
    const notes = [];
    if (!audience) return notes;

    if (audience.audience_type === 'INFERRED') {
        notes.push('Inferred audience');
    }

    const segments = Array.isArray(audience.segments) ? audience.segments : [];

    // Check for younger skew
    // Assuming segment structure might have age info in description or name if not structured
    // This is a heuristic based on string matching for now as per prompt "heuristic-only"
    // The prompt says "if any segment age < 30". 
    // Since we don't have a strict segment schema with age field guaranteed, 
    // we'll look for explicit age ranges or keywords if possible, 
    // but strictly following prompt: "if any segment age < 30".
    // If segments are just strings or objects without age, we can't strictly check.
    // However, Phase 7 audience might have structured segments.
    // Let's assume segments might have an 'age_range' or similar, or we skip if not present.
    // For safety and simplicity as per "Null-safe, no assumptions about schema depth":
    // We will check if we can find age indicators.

    // Actually, let's look at the prompt again: "if any segment age < 30".
    // This implies segments might be objects with an age property.
    // We'll implement a safe check.

    const hasYoungerSkew = segments.some(s => {
        if (typeof s === 'object' && s !== null) {
            // Check explicit age field if it exists (Phase 7 output might have it)
            if (s.age_min !== undefined && s.age_min < 30) return true;
            if (s.age_max !== undefined && s.age_max < 30) return true;
            // Check description for keywords
            const desc = (s.description || s.name || '').toLowerCase();
            if (desc.includes('18-24') || desc.includes('gen z') || desc.includes('student')) return true;
        }
        return false;
    });

    if (hasYoungerSkew) {
        notes.push('Younger skew');
    }

    const isB2B = segments.some(s => {
        if (typeof s === 'object' && s !== null) {
            const desc = (s.description || s.name || '').toLowerCase();
            return desc.includes('b2b') || desc.includes('business') || desc.includes('professional');
        }
        return false;
    });

    if (isB2B) {
        notes.push('B2B leaning');
    }

    return notes;
}

/**
 * Plan execution for a single venue
 * @param {Object} allocation - Budget allocation for the venue
 * @param {Object} campaignVenue - Matching venue from campaign plan (optional)
 * @param {Object} context - Campaign context (goal, audience, etc.)
 * @returns {Object} Venue execution plan item
 */
function planVenue(allocation, campaignVenue, context) {
    const venueKey = allocation.venue_key;
    const flags = [...(allocation.flags || [])];

    // Role mapping
    let role;
    if (campaignVenue && campaignVenue.role) {
        role = campaignVenue.role;
    } else {
        // Fallback logic if not in campaign plan or no role
        // Prompt says: "If a venue in BudgetPlan has no match in CampaignPlan: use role: 'SUPPORTING', priority: 999"
        if (!campaignVenue) {
            role = 'SUPPORTING';
            flags.push('VENUE_NOT_IN_CAMPAIGN_PLAN');
        } else {
            // Should have been handled by campaign plan, but as fallback:
            role = allocation.priority === 1 ? 'PRIMARY' : 'SUPPORTING';
        }
    }

    // Priority mapping
    const priority = campaignVenue ? campaignVenue.priority : 999;

    // Objective mapping
    const objective = mapObjective(context.campaign_goal.type);

    // Creative requirements
    const creativeReqs = getCreativeRequirements(venueKey);

    // Audience notes
    const audienceNotes = getAudienceNotes(context.audience);

    // Additional flags
    if (allocation.share < 0.1) {
        if (!flags.includes('LOW_SHARE')) flags.push('LOW_SHARE');
    }
    if (allocation.allocated < 100) {
        if (!flags.includes('LOW_SPEND')) flags.push('LOW_SPEND');
    }

    return {
        venue_key: venueKey,
        role: role,
        priority: priority,
        objective: objective,
        primary_kpi: context.campaign_goal.primary_kpi,
        spend: {
            allocated: allocation.allocated,
            share: allocation.share
        },
        creative_requirements: creativeReqs,
        audience_notes: audienceNotes,
        flags: flags
    };
}

/**
 * Plan execution for all venues
 * @param {Object} input - Request input
 * @returns {Object} Standard orchestrator envelope
 */
function plan_execution(input) {
    // Validate input
    const validationError = validateInput(input);
    if (validationError) {
        return {
            ok: false,
            module: 'venue_planner',
            timestamp: nowIso(),
            payload: null,
            error: validationError
        };
    }

    const { campaign_plan, budget_plan } = input;

    // Index campaign venues for lookup
    const campaignVenuesMap = {};
    if (Array.isArray(campaign_plan.venues)) {
        campaign_plan.venues.forEach(v => {
            campaignVenuesMap[v.venue_key] = v;
        });
    }

    // Process venues based on BudgetPlan allocations (Source of Truth)
    const venues = [];
    const allocations = Array.isArray(budget_plan.allocations) ? budget_plan.allocations : [];

    allocations.forEach(allocation => {
        const campaignVenue = campaignVenuesMap[allocation.venue_key];
        const venuePlan = planVenue(allocation, campaignVenue, {
            campaign_goal: campaign_plan.campaign_goal,
            audience: campaign_plan.audience
        });
        venues.push(venuePlan);
    });

    // Build summary
    const summaryIssues = [...(budget_plan.summary?.issues || [])];

    // Check for missing venues flag
    const hasMissingVenues = venues.some(v => v.flags.includes('VENUE_NOT_IN_CAMPAIGN_PLAN'));
    if (hasMissingVenues) {
        summaryIssues.push('VENUES_MISSING_FROM_CAMPAIGN_PLAN');
    }

    const summary = {
        venue_count: venues.length,
        primary_venues: venues.filter(v => v.role === 'PRIMARY').length,
        supporting_venues: venues.filter(v => v.role === 'SUPPORTING').length,
        remarketing_venues: venues.filter(v => v.role === 'REMARKETING').length,
        issues: summaryIssues
    };

    // Build meta
    const meta = {
        version: 'phase-10.0',
        created_at: nowIso(),
        source_campaign_version: campaign_plan.meta?.version || '',
        source_budget_version: budget_plan.meta?.version || '',
        goal_type: campaign_plan.campaign_goal?.type || '',
        primary_kpi: campaign_plan.campaign_goal?.primary_kpi || ''
    };

    return {
        ok: true,
        module: 'venue_planner',
        timestamp: nowIso(),
        payload: {
            venue_execution_plan: {
                brand_id: campaign_plan.brand_id,
                campaign_goal: campaign_plan.campaign_goal,
                currency: budget_plan.currency,
                total_budget: budget_plan.total_budget,
                venues: venues,
                summary: summary,
                meta: meta
            }
        }
    };
}

module.exports = {
    plan_execution
};
