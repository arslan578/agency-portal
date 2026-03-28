/**
 * Execution Index Engine (Phase 14)
 *
 * Adds deterministic indexes and aggregate stats to Phase 13 ExecutionSplitPlan.
 * Pure logic, deterministic, no IO.
 */

/**
 * Builds the ExecutionIndexedPlan from ExecutionSplitPlan.
 *
 * @param {object} input - The Phase 13 ExecutionSplitPlan payload
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function buildExecutionIndexedPlan(input) {
    // 1. Validate Input
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Invalid input payload for ExecutionIndexedPlan");
    }

    if (!input.groups || !Array.isArray(input.groups)) {
        return createErrorEnvelope("INVALID_INPUT", "ExecutionSplitPlan.groups must be an array");
    }

    try {
        // 2. Initialize tracking structures
        let globalUnitIndex = 0;
        const venueUnitCounters = {};
        const venueGroups = {}; // venue_key -> Set<group_index>

        // Stats accumulator
        const byVenue = {};
        let totalBudget = 0;
        let totalUnits = 0;

        // 3. Process groups and add indexes
        const indexedGroups = input.groups.map((group, groupIndex) => {
            // Validate units array
            if (!Array.isArray(group.units)) {
                throw new Error(`ExecutionSplitPlan.groups[${groupIndex}].units must be an array`);
            }

            // Track venue groups
            const venueKey = group.venue_key;
            if (venueKey) {
                if (!venueGroups[venueKey]) {
                    venueGroups[venueKey] = new Set();
                }
                venueGroups[venueKey].add(groupIndex);
            }

            // Process units within this group
            let groupUnitIndex = 0;
            const indexedUnits = group.units.map(unit => {
                const unitVenueKey = unit.venue_key;

                // Initialize venue counter if needed
                if (!venueUnitCounters[unitVenueKey]) {
                    venueUnitCounters[unitVenueKey] = 0;
                }

                // Initialize venue stats if needed
                if (!byVenue[unitVenueKey]) {
                    byVenue[unitVenueKey] = { groups: 0, units: 0, budget: 0 };
                }

                const venueIndex = venueUnitCounters[unitVenueKey];

                // Create indexed unit
                const indexedUnit = {
                    ...unit,
                    index: {
                        global: globalUnitIndex,
                        group: groupUnitIndex,
                        venue: venueIndex
                    },
                    group_index: groupIndex,
                    venue_index: venueIndex
                };

                // Update counters
                globalUnitIndex++;
                groupUnitIndex++;
                venueUnitCounters[unitVenueKey]++;

                // Update stats
                byVenue[unitVenueKey].units++;
                const budget = unit.budget?.allocated || 0;
                byVenue[unitVenueKey].budget += budget;
                totalBudget += budget;
                totalUnits++;

                return indexedUnit;
            });

            // Create indexed group
            return {
                ...group,
                group_index: groupIndex,
                units: indexedUnits
            };
        });

        // 4. Compute groups per venue
        for (const [venueKey, groupSet] of Object.entries(venueGroups)) {
            if (byVenue[venueKey]) {
                byVenue[venueKey].groups = groupSet.size;
            }
        }

        // 5. Build final payload
        const indexedPlan = {
            brand_id: input.brand_id,
            campaign_goal: input.campaign_goal,
            currency: input.currency,
            total_budget: input.total_budget,
            groups: indexedGroups,
            stats: {
                group_count: input.groups.length,
                unit_count: totalUnits,
                total_budget: totalBudget,
                by_venue: byVenue
            }
        };

        return createSuccessEnvelope(indexedPlan);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", error.message);
    }
}

function createSuccessEnvelope(payload) {
    return {
        ok: true,
        module: "execution_index_engine",
        timestamp: new Date().toISOString(),
        payload: payload
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_index_engine",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { buildExecutionIndexedPlan };
