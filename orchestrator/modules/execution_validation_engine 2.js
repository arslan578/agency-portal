/**
 * Execution Validation Engine (Phase 15)
 *
 * Validates ExecutionIndexedPlan from Phase 14.
 * Pure logic, deterministic, no IO.
 */

const EPSILON = 0.01; // Budget comparison tolerance

/**
 * Validates an ExecutionIndexedPlan.
 *
 * @param {object} input - Input containing plan
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run(input) {
    // 1. Validate Input Structure
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Input must be an object");
    }

    const plan = input.plan || input;

    if (!plan || typeof plan !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Plan must be an object");
    }

    if (!Array.isArray(plan.groups)) {
        return createErrorEnvelope("INVALID_INPUT", "Plan.groups must be an array");
    }

    // 2. Run Validation
    const errors = [];
    const warnings = [];

    try {
        // Validate structure
        validateStructure(plan, errors, warnings);

        // Validate budgets
        validateBudgets(plan, errors);

        // Validate indexes
        validateIndexes(plan, errors);

        // Validate stats
        validateStats(plan, errors);

        const validation = {
            is_valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };

        return createSuccessEnvelope(plan, validation);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", error.message);
    }
}

/**
 * Validates plan structure.
 */
function validateStructure(plan, errors, warnings) {
    // Check for empty groups (valid but worth a note)
    if (plan.groups.length === 0) {
        // Empty plan is valid, no warning needed
        return;
    }

    // Check group_index continuity
    plan.groups.forEach((group, idx) => {
        if (group.group_index !== idx) {
            errors.push({
                code: "INDEX_GAP",
                message: `Group index mismatch: expected ${idx}, got ${group.group_index}`,
                path: `groups[${idx}].group_index`
            });
        }

        // Check for empty units (warning)
        if (!Array.isArray(group.units)) {
            errors.push({
                code: "MISSING_FIELD",
                message: `Group units must be an array`,
                path: `groups[${idx}].units`
            });
        } else if (group.units.length === 0) {
            warnings.push({
                code: "EMPTY_GROUP",
                message: `Group ${idx} has no units and will not execute`,
                path: `groups[${idx}].units`
            });
        }
    });
}

/**
 * Validates budget constraints.
 */
function validateBudgets(plan, errors) {
    let totalGroupBudget = 0;

    plan.groups.forEach((group, groupIdx) => {
        if (!Array.isArray(group.units)) return;

        let groupBudgetSum = 0;

        group.units.forEach((unit, unitIdx) => {
            const budget = unit.budget?.allocated;

            // Check budget exists and is numeric
            if (typeof budget !== 'number') {
                errors.push({
                    code: "INVALID_TYPE",
                    message: `Unit budget must be a number, got ${typeof budget}`,
                    path: `groups[${groupIdx}].units[${unitIdx}].budget.allocated`
                });
                return;
            }

            // Check budget is not negative
            if (budget < 0) {
                errors.push({
                    code: "NEGATIVE_BUDGET",
                    message: `Unit budget cannot be negative: ${budget}`,
                    path: `groups[${groupIdx}].units[${unitIdx}].budget.allocated`
                });
            }

            // Check budget is finite
            if (!isFinite(budget)) {
                errors.push({
                    code: "INVALID_TYPE",
                    message: `Unit budget must be finite`,
                    path: `groups[${groupIdx}].units[${unitIdx}].budget.allocated`
                });
            }

            groupBudgetSum += budget;
        });

        // Validate group budget sum (if we can determine expected value)
        // Phase 14 doesn't explicitly store group_budget, so we validate against stats
        totalGroupBudget += groupBudgetSum;
    });

    // Validate total budget if present
    if (plan.total_budget !== undefined && typeof plan.total_budget === 'number') {
        if (Math.abs(totalGroupBudget - plan.total_budget) > EPSILON) {
            errors.push({
                code: "BUDGET_MISMATCH",
                message: `Total budget mismatch: expected ${plan.total_budget}, got ${totalGroupBudget}`,
                path: "total_budget"
            });
        }
    }

    // Validate stats total_budget if present
    if (plan.stats?.total_budget !== undefined) {
        if (Math.abs(totalGroupBudget - plan.stats.total_budget) > EPSILON) {
            errors.push({
                code: "BUDGET_MISMATCH",
                message: `Stats total_budget mismatch: expected ${plan.stats.total_budget}, got ${totalGroupBudget}`,
                path: "stats.total_budget"
            });
        }
    }
}

/**
 * Validates index consistency.
 */
function validateIndexes(plan, errors) {
    const globalIndexes = new Set();
    let expectedGlobalIndex = 0;

    plan.groups.forEach((group, groupIdx) => {
        if (!Array.isArray(group.units)) return;

        group.units.forEach((unit, unitIdx) => {
            const globalIndex = unit.index?.global;
            const groupIndex = unit.index?.group;

            // Check global index
            if (typeof globalIndex !== 'number') {
                errors.push({
                    code: "MISSING_FIELD",
                    message: `Unit missing global index`,
                    path: `groups[${groupIdx}].units[${unitIdx}].index.global`
                });
            } else {
                // Check for duplicates
                if (globalIndexes.has(globalIndex)) {
                    errors.push({
                        code: "INDEX_DUPLICATE",
                        message: `Duplicate global index: ${globalIndex}`,
                        path: `groups[${groupIdx}].units[${unitIdx}].index.global`
                    });
                }
                globalIndexes.add(globalIndex);
            }

            // Check group index
            if (typeof groupIndex !== 'number') {
                errors.push({
                    code: "MISSING_FIELD",
                    message: `Unit missing group index`,
                    path: `groups[${groupIdx}].units[${unitIdx}].index.group`
                });
            } else if (groupIndex !== unitIdx) {
                errors.push({
                    code: "INDEX_GAP",
                    message: `Group index mismatch: expected ${unitIdx}, got ${groupIndex}`,
                    path: `groups[${groupIdx}].units[${unitIdx}].index.group`
                });
            }
        });

        expectedGlobalIndex += group.units.length;
    });

    // Check for continuous range
    const totalUnits = expectedGlobalIndex;
    if (totalUnits > 0) {
        for (let i = 0; i < totalUnits; i++) {
            if (!globalIndexes.has(i)) {
                errors.push({
                    code: "INDEX_GAP",
                    message: `Missing global index: ${i}`,
                    path: `global_indexes`
                });
            }
        }
    }
}

/**
 * Validates stats consistency with actual data.
 */
function validateStats(plan, errors) {
    if (!plan.stats) return;

    const { stats } = plan;

    // Validate group_count
    if (stats.group_count !== plan.groups.length) {
        errors.push({
            code: "STATS_MISMATCH",
            message: `Stats group_count mismatch: expected ${plan.groups.length}, got ${stats.group_count}`,
            path: "stats.group_count"
        });
    }

    // Validate unit_count
    let actualUnitCount = 0;
    plan.groups.forEach(group => {
        if (Array.isArray(group.units)) {
            actualUnitCount += group.units.length;
        }
    });

    if (stats.unit_count !== actualUnitCount) {
        errors.push({
            code: "STATS_MISMATCH",
            message: `Stats unit_count mismatch: expected ${actualUnitCount}, got ${stats.unit_count}`,
            path: "stats.unit_count"
        });
    }

    // Validate by_venue stats
    if (stats.by_venue) {
        const actualVenueStats = {};

        plan.groups.forEach(group => {
            if (!Array.isArray(group.units)) return;

            group.units.forEach(unit => {
                const venueKey = unit.venue_key;
                if (!actualVenueStats[venueKey]) {
                    actualVenueStats[venueKey] = { units: 0, budget: 0 };
                }
                actualVenueStats[venueKey].units++;
                actualVenueStats[venueKey].budget += unit.budget?.allocated || 0;
            });
        });

        // Compare with stats.by_venue
        for (const [venueKey, venueStat] of Object.entries(stats.by_venue)) {
            const actual = actualVenueStats[venueKey];
            if (!actual) {
                errors.push({
                    code: "STATS_MISMATCH",
                    message: `Venue ${venueKey} in stats but has no units`,
                    path: `stats.by_venue.${venueKey}`
                });
                continue;
            }

            if (venueStat.units !== actual.units) {
                errors.push({
                    code: "STATS_MISMATCH",
                    message: `Venue ${venueKey} unit count mismatch: expected ${actual.units}, got ${venueStat.units}`,
                    path: `stats.by_venue.${venueKey}.units`
                });
            }

            if (Math.abs(venueStat.budget - actual.budget) > EPSILON) {
                errors.push({
                    code: "STATS_MISMATCH",
                    message: `Venue ${venueKey} budget mismatch: expected ${actual.budget}, got ${venueStat.budget}`,
                    path: `stats.by_venue.${venueKey}.budget`
                });
            }
        }
    }
}

function createSuccessEnvelope(plan, validation) {
    return {
        ok: true,
        module: "execution_validation_engine",
        timestamp: new Date().toISOString(),
        payload: {
            plan: plan,
            validation: validation
        }
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_validation_engine",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { run };
