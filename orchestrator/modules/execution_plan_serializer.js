/**
 * Execution Plan Serializer (Phase 18)
 *
 * Serializes execution plan + reports into platform-neutral submission bundle.
 * Pure logic, deterministic, no IO.
 */

/**
 * Handles serialization of execution plan.
 *
 * @param {object} input - Input containing plan, validation, policy, readiness
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function handle(input) {
    // 1. Validate Input Shape
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope("INVALID_INPUT_SHAPE", "Input must be an object");
    }

    const { plan, validation, policy, readiness } = input;

    if (!plan || typeof plan !== 'object') {
        return createErrorEnvelope("MISSING_PLAN", "Plan must be an object");
    }

    if (!readiness || typeof readiness !== 'object') {
        return createErrorEnvelope("MISSING_READINESS_REPORT", "Readiness report must be an object");
    }

    if (!Array.isArray(plan.groups)) {
        return createErrorEnvelope("INVALID_INPUT_SHAPE", "Plan.groups must be an array");
    }

    try {
        // 2. Compute Global Launch Decision
        const validation_is_valid = validation?.is_valid === true;

        // Prefer policy.summary.is_policy_clean, fall back to policy.is_policy_clean if ever introduced
        const policy_is_clean =
            policy?.summary?.is_policy_clean === true ||
            policy?.is_policy_clean === true;

        // Prefer new readiness.summary.can_launch, fall back to legacy is_launchable
        let readiness_can_launch;
        if (readiness?.summary && typeof readiness.summary.can_launch === "boolean") {
            readiness_can_launch = readiness.summary.can_launch;
        } else {
            readiness_can_launch = readiness?.is_launchable === true;
        }

        const can_submit = validation_is_valid && policy_is_clean && readiness_can_launch;

        // Prefer new readiness.summary.global_status, fall back to worst_level mapping
        let global_status;
        if (readiness?.summary && typeof readiness.summary.global_status === "string") {
            global_status = readiness.summary.global_status;
        } else if (readiness?.worst_level === "ERROR") {
            global_status = "BLOCKED";
        } else if (readiness?.worst_level === "WARNING") {
            global_status = "RISKY";
        } else {
            global_status = "READY";
        }

        // 3. Compute Summary Counts
        const validation_error_count = Array.isArray(validation?.errors) ? validation.errors.length : 0;
        const policy_error_count = Array.isArray(policy?.issues) ?
            policy.issues.filter(i => i.level === "ERROR").length : 0;
        const readiness_block_count = Array.isArray(readiness?.blocks) ? readiness.blocks.length : 0;
        const readiness_warning_count = Array.isArray(readiness?.warnings) ? readiness.warnings.length : 0;

        // 4. Build per-venue bundles
        const venues = await serializeVenues(plan, readiness, can_submit, global_status);

        // 5. Build final bundle
        const bundle = {
            brand_id: plan.brand_id,
            campaign_id: plan.campaign_id || null,
            campaign_name: plan.campaign_name || `Campaign_${plan.brand_id}`,
            currency: plan.currency || null,

            can_submit,
            global_status,

            reasons: {
                validation_is_valid,
                policy_is_clean,
                readiness_can_launch
            },

            summary: {
                validation_error_count,
                policy_error_count,
                readiness_block_count,
                readiness_warning_count
            },

            venues
        };

        return createSuccessEnvelope(bundle);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_SERIALIZATION_ERROR", error.message);
    }
}

/**
 * Serializes venues deterministically.
 */
async function serializeVenues(plan, readiness, global_can_submit, global_status) {
    const venues = [];

    // Group plan groups by venue_key
    const venueGroups = {};
    for (const group of plan.groups) {
        if (!group || typeof group !== "object") {
            continue;
        }

        const venueKey = group.venue_key;
        if (!venueKey) {
            throw new Error("Group is missing venue_key");
        }

        if (!venueGroups[venueKey]) {
            venueGroups[venueKey] = [];
        }
        venueGroups[venueKey].push(group);
    }

    // Sort venue keys for deterministic output
    const venueKeys = Object.keys(venueGroups).sort();

    for (const venueKey of venueKeys) {
        const groups = venueGroups[venueKey];

        // Start each venue from the global decision and status
        let venue_can_submit = global_can_submit;
        let venue_status = global_status || "READY";
        const issues = { blocks: [], warnings: [] };

        // Extract venue-specific issues from readiness
        if (readiness?.blocks) {
            const venueBlocks = readiness.blocks.filter(b =>
                b.venue_key === venueKey || b.source === "VALIDATION"
            );
            issues.blocks = venueBlocks.map(b => ({
                code: b.code,
                message: b.message,
                fix: b.fix
            }));
            if (issues.blocks.length > 0) {
                venue_can_submit = false;
                venue_status = "BLOCKED";
            }
        }

        if (readiness?.warnings) {
            const venueWarnings = readiness.warnings.filter(w => w.venue_key === venueKey);
            issues.warnings = venueWarnings.map(w => ({
                code: w.code,
                message: w.message,
                fix: w.fix
            }));
            if (issues.warnings.length > 0 && venue_status === "READY") {
                venue_status = "RISKY";
            }
        }

        // Compute venue budget
        let venue_budget = 0;
        for (const group of groups) {
            if (Array.isArray(group.units)) {
                for (const unit of group.units) {
                    venue_budget += unit.budget?.allocated || 0;
                }
            }
        }

        // Build meta from groups
        const role = extractFirstNonNull(groups, 'role') || "UNKNOWN";
        const objective = extractFirstNonNull(groups, 'objective');
        const priority = extractMinNonNull(groups, 'priority');

        // Serialize groups for this venue
        const serializedGroups = groups
            .sort((a, b) => a.group_index - b.group_index)
            .map(group => serializeGroup(group, plan.currency));

        venues.push({
            venue_key: venueKey,
            can_submit: venue_can_submit,
            status: venue_status,
            issues,
            payload: {
                meta: {
                    role,
                    objective,
                    priority
                },
                budget: {
                    venue_budget,
                    currency: plan.currency || null
                },
                groups: serializedGroups
            }
        });
    }

    return venues;
}

/**
 * Serializes a single group.
 */
function serializeGroup(group, currency) {
    const units = Array.isArray(group.units)
        ? group.units
            .slice()
            .sort((a, b) => {
                const ai = (a.unit_index != null ? a.unit_index : (a.index?.group ?? 0));
                const bi = (b.unit_index != null ? b.unit_index : (b.index?.group ?? 0));
                return ai - bi;
            })
            .map(unit => serializeUnit(unit, currency))
        :
        [];

    return {
        group_index: group.group_index,
        group_id: group.group_id,
        role: group.role || null,
        objective: group.objective || null,
        priority: group.priority || null,
        units
    };
}

/**
 * Serializes a single unit.
 */
function serializeUnit(unit, currency) {
    const unitIndex = unit.unit_index != null
        ? unit.unit_index
        : (unit.index?.group ?? 0);

    return {
        unit_index: unitIndex,
        unit_id: unit.unit_id,
        audience_ref: unit.audience_ref || null,
        creative_ref: unit.creative_ref || null,
        budget: {
            amount: unit.budget?.allocated || 0,
            currency: currency || null
        },
        schedule: {
            start_date: unit.schedule?.start_date || null,
            end_date: unit.schedule?.end_date || null
        },
        tracking: {
            utm_source: unit.tracking?.utm_source || null,
            utm_medium: unit.tracking?.utm_medium || null,
            utm_campaign: unit.tracking?.utm_campaign || null
        }
    };
}

/**
 * Extracts first non-null value from groups for a given field.
 */
function extractFirstNonNull(groups, field) {
    for (const group of groups) {
        if (group[field] != null) {
            return group[field];
        }
    }
    return null;
}

/**
 * Extracts minimum non-null value from groups for a given field.
 */
function extractMinNonNull(groups, field) {
    let min = null;
    for (const group of groups) {
        if (group[field] != null) {
            if (min === null || group[field] < min) {
                min = group[field];
            }
        }
    }
    return min;
}

function createSuccessEnvelope(payload) {
    return {
        ok: true,
        module: "execution_plan_serializer",
        timestamp: new Date().toISOString(),
        payload
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_plan_serializer",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { handle };
