/**
 * Execution Policy Engine (Phase 16)
 *
 * Evaluates policy rules against ExecutionIndexedPlan from Phase 14.
 * Pure logic, deterministic, no IO.
 */

const DEFAULT_POLICY_CONFIG = {
    max_campaign_budget: null,
    min_budget_per_venue: null,
    max_units_per_venue: null,
    forbidden_venues: []
};

/**
 * Runs policy guard evaluation on an ExecutionIndexedPlan.
 *
 * @param {object} input - Input containing plan and optional policy_config
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run_execution_policy_guard(input) {
    // 1. Validate Input
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Input must be an object");
    }

    const { plan, policy_config } = input;

    if (!plan || typeof plan !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Plan must be an object");
    }

    if (!plan.stats || typeof plan.stats !== 'object') {
        return createErrorEnvelope("STATS_MISSING", "Plan must have stats object");
    }

    // 2. Normalize policy configuration
    const config = {
        ...DEFAULT_POLICY_CONFIG,
        ...(policy_config || {})
    };

    // 3. Collect issues
    const issues = [];

    try {
        // Apply policy rules
        applyRule_P01_CampaignBudgetCap(plan, config, issues);
        applyRule_P02_MinBudgetPerVenue(plan, config, issues);
        applyRule_P03_MaxUnitsPerVenue(plan, config, issues);
        applyRule_P04_ForbiddenVenues(plan, config, issues);

        // 4. Sort issues deterministically
        sortIssues(issues);

        // 5. Compute summary
        const summary = {
            is_policy_clean: issues.filter(i => i.level === "ERROR").length === 0,
            error_count: issues.filter(i => i.level === "ERROR").length,
            warning_count: issues.filter(i => i.level === "WARNING").length,
            info_count: issues.filter(i => i.level === "INFO").length
        };

        const policyReport = {
            summary,
            issues
        };

        return createSuccessEnvelope(plan, policyReport);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", error.message);
    }
}

/**
 * Rule P01: Campaign budget cap
 */
function applyRule_P01_CampaignBudgetCap(plan, config, issues) {
    if (config.max_campaign_budget === null || config.max_campaign_budget === undefined) {
        return;
    }

    const totalBudget = plan.stats.total_budget || 0;

    if (totalBudget > config.max_campaign_budget) {
        issues.push({
            level: "ERROR",
            code: "CAMPAIGN_BUDGET_EXCEEDS_MAX",
            message: `Campaign budget ${totalBudget} exceeds maximum allowed ${config.max_campaign_budget}`,
            path: "/",
            venue_key: null,
            group_id: null,
            unit_id: null,
            details: {
                total_budget: totalBudget,
                max_campaign_budget: config.max_campaign_budget
            },
            fix: {
                kind: "MANUAL_REQUIRED",
                description: "Reduce campaign budget or adjust policy configuration"
            }
        });
    }
}

/**
 * Rule P02: Minimum budget per venue
 */
function applyRule_P02_MinBudgetPerVenue(plan, config, issues) {
    if (config.min_budget_per_venue === null || config.min_budget_per_venue === undefined) {
        return;
    }

    const byVenue = plan.stats.by_venue || {};

    for (const [venueKey, venueStat] of Object.entries(byVenue)) {
        const venueBudget = venueStat.budget || 0;

        if (venueBudget < config.min_budget_per_venue) {
            issues.push({
                level: "WARNING",
                code: "VENUE_BUDGET_BELOW_MIN",
                message: `Venue ${venueKey} budget ${venueBudget} is below minimum ${config.min_budget_per_venue}`,
                path: `/stats/by_venue/${venueKey}`,
                venue_key: venueKey,
                group_id: null,
                unit_id: null,
                details: {
                    venue_key: venueKey,
                    budget_total: venueBudget,
                    min_budget_per_venue: config.min_budget_per_venue
                },
                fix: {
                    kind: "MANUAL_REQUIRED",
                    description: "Increase budget allocation for this venue"
                }
            });
        }
    }
}

/**
 * Rule P03: Maximum units per venue
 */
function applyRule_P03_MaxUnitsPerVenue(plan, config, issues) {
    if (config.max_units_per_venue === null || config.max_units_per_venue === undefined) {
        return;
    }

    const byVenue = plan.stats.by_venue || {};

    for (const [venueKey, venueStat] of Object.entries(byVenue)) {
        const unitCount = venueStat.units || 0;

        if (unitCount > config.max_units_per_venue) {
            // Find first offending unit for this venue
            let firstUnitPath = `/stats/by_venue/${venueKey}`;
            if (plan.groups && Array.isArray(plan.groups)) {
                outerLoop: for (let gIdx = 0; gIdx < plan.groups.length; gIdx++) {
                    const group = plan.groups[gIdx];
                    if (Array.isArray(group.units)) {
                        for (let uIdx = 0; uIdx < group.units.length; uIdx++) {
                            const unit = group.units[uIdx];
                            if (unit.venue_key === venueKey) {
                                firstUnitPath = `/groups/${gIdx}/units/${uIdx}`;
                                break outerLoop;
                            }
                        }
                    }
                }
            }

            issues.push({
                level: "ERROR",
                code: "VENUE_UNITS_EXCEED_MAX",
                message: `Venue ${venueKey} has ${unitCount} units, exceeding maximum ${config.max_units_per_venue}`,
                path: firstUnitPath,
                venue_key: venueKey,
                group_id: null,
                unit_id: null,
                details: {
                    venue_key: venueKey,
                    unit_count: unitCount,
                    max_units_per_venue: config.max_units_per_venue
                },
                fix: {
                    kind: "MANUAL_REQUIRED",
                    description: "Reduce number of units for this venue or adjust policy"
                }
            });
        }
    }
}

/**
 * Rule P04: Forbidden venues
 */
function applyRule_P04_ForbiddenVenues(plan, config, issues) {
    if (!Array.isArray(config.forbidden_venues) || config.forbidden_venues.length === 0) {
        return;
    }

    const byVenue = plan.stats.by_venue || {};

    for (const venueKey of Object.keys(byVenue)) {
        if (config.forbidden_venues.includes(venueKey)) {
            issues.push({
                level: "ERROR",
                code: "VENUE_FORBIDDEN",
                message: `Venue ${venueKey} is forbidden by policy`,
                path: `/stats/by_venue/${venueKey}`,
                venue_key: venueKey,
                group_id: null,
                unit_id: null,
                details: {
                    venue_key: venueKey
                },
                fix: {
                    kind: "MANUAL_REQUIRED",
                    description: "Remove units for this venue or update policy configuration"
                }
            });
        }
    }
}

/**
 * Sorts issues deterministically.
 * Order: severity (ERROR, WARNING, INFO), venue_key, group_id, unit_id, code
 */
function sortIssues(issues) {
    const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };

    issues.sort((a, b) => {
        // 1. Severity
        const severityDiff = severityOrder[a.level] - severityOrder[b.level];
        if (severityDiff !== 0) return severityDiff;

        // 2. venue_key (null last)
        const aVenue = a.venue_key || "\uffff";
        const bVenue = b.venue_key || "\uffff";
        const venueDiff = aVenue.localeCompare(bVenue);
        if (venueDiff !== 0) return venueDiff;

        // 3. group_id (null last)
        const aGroup = a.group_id || "\uffff";
        const bGroup = b.group_id || "\uffff";
        const groupDiff = aGroup.localeCompare(bGroup);
        if (groupDiff !== 0) return groupDiff;

        // 4. unit_id (null last)
        const aUnit = a.unit_id || "\uffff";
        const bUnit = b.unit_id || "\uffff";
        const unitDiff = aUnit.localeCompare(bUnit);
        if (unitDiff !== 0) return unitDiff;

        // 5. code
        return a.code.localeCompare(b.code);
    });
}

function createSuccessEnvelope(plan, policy) {
    return {
        ok: true,
        module: "execution_policy_engine",
        timestamp: new Date().toISOString(),
        payload: {
            plan: plan,
            policy: policy
        }
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_policy_engine",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { run_execution_policy_guard };
