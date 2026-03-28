/**
 * Execution Split Engine (Phase 13)
 *
 * Expands Phase 12 GROUP-level execution units into UNIT-level splits.
 * Pure logic, deterministic, no IO.
 */

// Maximum number of units per group (cardinality limit)
const MAX_UNITS_PER_GROUP = 12;

/**
 * Executes the split process.
 *
 * @param {object} payload - Phase 12 ExecutionAssemblyPlan payload
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function execute(payload) {
    // 1. Validate Input
    if (!payload || typeof payload !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Payload must be an object");
    }

    if (!payload.venues || !Array.isArray(payload.venues)) {
        return createErrorEnvelope("INVALID_INPUT", "Payload must have venues array");
    }

    try {
        const splitPlan = {
            brand_id: payload.brand_id,
            campaign_goal: payload.campaign_goal ? { ...payload.campaign_goal } : null,
            unit_kind: "UNIT",
            source_group_kind: "GROUP",
            summary: {
                total_groups: 0,
                total_units: 0,
                max_units_per_group: MAX_UNITS_PER_GROUP
            },
            groups: [],
            tracking: payload.tracking || {}
        };

        // 2. Process each venue
        payload.venues.forEach(venue => {
            if (!venue.execution_units || !Array.isArray(venue.execution_units)) {
                return; // Skip venues without execution_units
            }

            // Process each GROUP-level unit from Phase 12
            venue.execution_units.forEach(group => {
                const splitGroup = processSplitGroup(group, venue, payload);
                splitPlan.groups.push(splitGroup);
                splitPlan.summary.total_groups++;
                splitPlan.summary.total_units += splitGroup.units.length;
            });
        });

        return createSuccessEnvelope(splitPlan);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", error.message);
    }
}

/**
 * Processes a single GROUP into a SplitGroup with Units.
 */
function processSplitGroup(group, venue, payload) {
    const groupBudget = group.budget?.amount || 0;
    const currency = payload.currency || null;

    // Extract audiences and creatives
    const audiences = group.audience_ref ? [group.audience_ref] : [];
    const creatives = Array.isArray(group.creative_refs) ? group.creative_refs.filter(c => c) : [];

    // Generate combinations with cardinality limit
    const combinations = generateCombinations(audiences, creatives);

    // Determine split strategy
    let splitStrategy;
    if (groupBudget === 0) {
        splitStrategy = "NO_BUDGET";
    } else if (combinations.length === 1) {
        splitStrategy = "SINGLE_UNIT";
    } else {
        splitStrategy = "EVEN_CROSS_PRODUCT";
    }

    // Allocate budget across units
    const unitBudgets = allocateBudget(groupBudget, combinations.length);

    // Create units
    const units = combinations.map((combo, index) => {
        return {
            unit_id: generateUnitId(group.unit_id, combo.audience, combo.creative, index),
            parent_group_id: group.unit_id,
            venue_key: venue.venue_key,
            audience_ref: combo.audience,
            creative_ref: combo.creative,
            name: generateUnitName(group.name || group.unit_id, combo.audience, combo.creative, index),
            schedule: group.schedule ? { ...group.schedule } : { start_date: null, end_date: null },
            budget: {
                allocated: unitBudgets[index],
                share: groupBudget > 0 ? unitBudgets[index] / groupBudget : 0,
                currency: currency
            },
            sequence: index,
            meta: {
                source_phase: "PHASE_13",
                split_strategy: splitStrategy,
                cardinality_index: {
                    audience_index: combo.audienceIndex,
                    creative_index: combo.creativeIndex
                }
            }
        };
    });

    return {
        group_id: group.unit_id,
        group_name: group.name || null,
        venue_key: venue.venue_key,
        schedule: group.schedule || { start_date: null, end_date: null },
        original_budget: {
            allocated: groupBudget,
            currency: currency
        },
        split_strategy: splitStrategy,
        units: units
    };
}

/**
 * Generates audience x creative combinations with cardinality limit.
 */
function generateCombinations(audiences, creatives) {
    // Handle edge cases
    if (audiences.length === 0 && creatives.length === 0) {
        // Fallback: single unit with null refs
        return [{ audience: null, creative: null, audienceIndex: null, creativeIndex: null }];
    }

    if (audiences.length === 0) {
        // Only creatives
        return creatives.map((creative, idx) => ({
            audience: null,
            creative: creative,
            audienceIndex: null,
            creativeIndex: idx
        }));
    }

    if (creatives.length === 0) {
        // Only audiences
        return audiences.map((audience, idx) => ({
            audience: audience,
            creative: null,
            audienceIndex: idx,
            creativeIndex: null
        }));
    }

    // Full cross-product
    let sortedAudiences = [...audiences].sort();
    let sortedCreatives = [...creatives].sort();

    // Apply cardinality limit
    const rawCombos = sortedAudiences.length * sortedCreatives.length;
    if (rawCombos > MAX_UNITS_PER_GROUP) {
        // Truncate the larger dimension
        if (sortedAudiences.length >= sortedCreatives.length) {
            const maxAudiences = Math.floor(MAX_UNITS_PER_GROUP / sortedCreatives.length);
            sortedAudiences = sortedAudiences.slice(0, maxAudiences);
        } else {
            const maxCreatives = Math.floor(MAX_UNITS_PER_GROUP / sortedAudiences.length);
            sortedCreatives = sortedCreatives.slice(0, maxCreatives);
        }
    }

    // Generate combinations
    const combinations = [];
    for (let a = 0; a < sortedAudiences.length; a++) {
        for (let c = 0; c < sortedCreatives.length; c++) {
            combinations.push({
                audience: sortedAudiences[a],
                creative: sortedCreatives[c],
                audienceIndex: a,
                creativeIndex: c
            });
        }
    }

    return combinations;
}

/**
 * Allocates budget evenly across units with deterministic rounding.
 */
function allocateBudget(totalBudget, unitCount) {
    if (totalBudget === 0 || unitCount === 0) {
        return new Array(unitCount).fill(0);
    }

    const base = Math.floor((totalBudget / unitCount) * 100) / 100;
    const remainder = totalBudget - (base * unitCount);
    const remainderCents = Math.round(remainder * 100);

    const budgets = new Array(unitCount).fill(base);

    // Distribute remainder pennies to first units
    for (let i = 0; i < remainderCents && i < unitCount; i++) {
        budgets[i] += 0.01;
    }

    return budgets;
}

/**
 * Generates a deterministic unit ID.
 */
function generateUnitId(groupId, audienceRef, creativeRef, sequence) {
    const aud = audienceRef || "NA";
    const cre = creativeRef || "NA";
    return `${groupId}::${aud}::${cre}::${sequence}`;
}

/**
 * Generates a deterministic unit name.
 */
function generateUnitName(groupName, audienceRef, creativeRef, sequence) {
    const aud = audienceRef || "NA";
    const cre = creativeRef || "NA";
    return `${groupName} | a=${aud} | c=${cre} | #${sequence}`;
}

function createSuccessEnvelope(payload) {
    return {
        ok: true,
        module: "execution_split_engine",
        timestamp: new Date().toISOString(),
        payload: payload,
        meta: {
            source_phase: "PHASE_13",
            version: "v0.1"
        }
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_split_engine",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { execute };
