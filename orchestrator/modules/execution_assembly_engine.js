/**
 * Execution Assembly Engine (Phase 12)
 *
 * Consumes VenueExecutionPlan and produces ExecutionAssemblyPlan.
 * Pure logic, deterministic, no IO.
 */

/**
 * Runs the execution assembly process.
 *
 * @param {object} context - The input context containing venue_execution_plan, etc.
 * @returns {Promise<object>} - The orchestrator envelope.
 */
async function run_execution_assembly(context) {
    // 1. Validate Inputs
    if (!context || typeof context !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Input context must be an object");
    }

    const { venue_execution_plan, creative_plan, audience_plan } = context;

    if (!venue_execution_plan) {
        return createErrorEnvelope("INVALID_INPUT", "Missing or invalid venue_execution_plan");
    }

    if (!venue_execution_plan.venues || !Array.isArray(venue_execution_plan.venues)) {
        return createErrorEnvelope("INVALID_INPUT", "VenueExecutionPlan must have venues array");
    }

    // Note: creative_plan and audience_plan are optional but recommended.
    // We will proceed even if they are missing, but unit assembly might be sparse.

    try {
        const executionAssemblyPlan = {
            brand_id: venue_execution_plan.brand_id,
            campaign_goal: { ...venue_execution_plan.campaign_goal },
            currency: venue_execution_plan.currency,
            total_budget: venue_execution_plan.total_budget,
            venues: [],
            meta: {
                created_by_phase: "PHASE_12_EXECUTION_ASSEMBLY_V1",
                version: "1.0.0",
                notes: []
            }
        };

        // 2. Derive Execution Units Per Venue
        venue_execution_plan.venues.forEach((venue, venueIndex) => {
            const executionVenue = {
                venue_key: venue.venue_key,
                role: venue.role,
                priority: venue.priority,
                objective: venue.objective,
                primary_kpi: venue.primary_kpi,
                spend: {
                    allocated: venue.spend.allocated,
                    share: venue.spend.share
                },
                schedule: {
                    start_date: venue.schedule?.start_date || null,
                    end_date: venue.schedule?.end_date || null
                },
                execution_units: []
            };

            // Deterministic Rule: Create 1 unit per venue for now (Phase 12 baseline).
            // Future phases might split by audience segments or creative variations.
            const unitCount = 1;
            const budgetPerUnit = venue.spend.allocated / unitCount; // Simple split

            for (let i = 0; i < unitCount; i++) {
                const unitIndex = i;
                const unitId = generateDeterministicId(venue_execution_plan.brand_id, venue.venue_key, unitIndex);
                const unitName = generateDeterministicName(venue.venue_key, venue.objective, venue.role, unitIndex);

                const unit = {
                    unit_id: unitId,
                    name: unitName,
                    unit_kind: "GROUP", // Neutral unit type per Phase 12 spec ("LINE_ITEM" | "GROUP" | "AD")
                    venue_key: venue.venue_key,
                    audience_ref: null, // Placeholder, would link to audience_plan
                    creative_refs: [],  // Placeholder, would link to creative_plan
                    budget: {
                        type: "LIFETIME", // Default deterministic choice
                        amount: budgetPerUnit
                    },
                    schedule: {
                        start_date: executionVenue.schedule.start_date,
                        end_date: executionVenue.schedule.end_date
                    },
                    tracking: {}
                };

                // Audience linkage: only use real IDs, never fabricate placeholders
                if (audience_plan && audience_plan.audiences && audience_plan.audiences.length > 0) {
                    // Deterministically pick first audience if it has a valid ID
                    unit.audience_ref = audience_plan.audiences[0].id ?? null;
                }

                if (creative_plan && creative_plan.creatives && creative_plan.creatives.length > 0) {
                    // Deterministically pick first creative if it has a valid ID
                    const cid = creative_plan.creatives[0].id;
                    if (cid) {
                        unit.creative_refs.push(cid);
                    }
                }

                executionVenue.execution_units.push(unit);
            }

            executionAssemblyPlan.venues.push(executionVenue);
        });

        return createSuccessEnvelope(executionAssemblyPlan);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", error.message);
    }
}

/**
 * Generates a deterministic ID for an execution unit.
 * Pattern: ${brand_id}__${venue_key}__unit_${index}
 */
function generateDeterministicId(brandId, venueKey, index) {
    return `${brandId}__${venueKey}__unit_${index}`;
}

/**
 * Generates a deterministic name for an execution unit.
 * Pattern: ${VENUE_KEY}_${OBJECTIVE}_${ROLE}_UNIT_${index}
 */
function generateDeterministicName(venueKey, objective, role, index) {
    return `${venueKey.toUpperCase()}_${objective}_${role}_UNIT_${index}`;
}

function createSuccessEnvelope(payload) {
    return {
        ok: true,
        module: "execution_assembly",
        timestamp: new Date().toISOString(),
        payload: payload
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_assembly",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { run_execution_assembly };
