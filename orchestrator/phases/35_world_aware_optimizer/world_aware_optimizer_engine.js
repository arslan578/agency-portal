/**
 * Phase 35 Rev2: World Aware Optimization Engine
 * Corrected implementation with two-pass budget allocation and proper constraint handling
 */

// Constants
const SUITABILITY_WEIGHT = 0.4;
const RELIABILITY_WEIGHT = 0.3;
const LEARNING_WEIGHT = 0.2;
const COVERAGE_WEIGHT = 0.5;
const SUITABILITY_GLOBAL_WEIGHT = 0.4;
const TIGHTNESS_PENALTY = 0.1;
const DEFAULT_MAX_PRIMARY = 3;
const DEFAULT_MAX_SUPPORTING = 4;

// Helpers
function clamp01(val) {
    return Math.max(0, Math.min(1, val));
}

function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
}

function createErrorEnvelope(code, message, details) {
    return {
        ok: false,
        timestamp: new Date().toISOString(),
        error: {
            code,
            message,
            ...(details ? { details } : {})
        }
    };
}

// Main function
function optimizeWorldAwareVenues(envelope) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Input Validation
        if (!envelope || typeof envelope !== 'object') {
            return createErrorEnvelope("MALFORMED_OPTIMIZER_CONTRACT", "Envelope must be an object");
        }

        const { payload } = envelope;
        if (!payload) {
            return createErrorEnvelope("MALFORMED_OPTIMIZER_CONTRACT", "Missing payload");
        }

        // Validate total_budget
        if (typeof payload.total_budget !== 'number' || payload.total_budget <= 0) {
            return createErrorEnvelope("INVALID_BUDGET", "Budget must be positive number");
        }

        // Validate campaign_goal
        if (!payload.campaign_goal || !payload.campaign_goal.type || !payload.campaign_goal.primary_kpi) {
            return createErrorEnvelope("INVALID_CAMPAIGN_GOAL", "Missing campaign_goal.type or primary_kpi");
        }

        // Validate capabilities_resolver
        if (!payload.capabilities_resolver || !Array.isArray(payload.capabilities_resolver.venues)) {
            return createErrorEnvelope("MISSING_CAPABILITIES", "Missing capabilities_resolver.venues");
        }

        const { total_budget, campaign_goal, capabilities_resolver } = payload;
        const constraints = {
            forbidden_venues: payload.forbidden_venues || [],
            required_venues: payload.required_venues || [],
            min_budget_per_venue: payload.min_budget_per_venue || {},
            max_budget_per_venue: payload.max_budget_per_venue || {},
            max_primary_venues: payload.max_primary_venues ?? DEFAULT_MAX_PRIMARY,
            max_supporting_venues: payload.max_supporting_venues ?? DEFAULT_MAX_SUPPORTING
        };

        // 2. Enforce Global Constraints
        const { feasible, excluded } = enforceGlobalConstraints(
            capabilities_resolver.venues,
            constraints,
            campaign_goal
        );

        if (feasible.length === 0) {
            return createErrorEnvelope("NO_FEASIBLE_VENUES", "All venues excluded by constraints");
        }

        // 3. Score Venues
        const scored = scoreVenues(feasible, campaign_goal, constraints);

        // 4. Rank Venues
        let ranked = rankVenues(scored);

        // 5. Move Required Venues to Top
        ranked = moveRequiredToTop(ranked, constraints.required_venues);

        // 6. Assign Roles
        const { recommended, additional_excluded, limits_hit } = assignRoles(
            ranked,
            constraints,
            campaign_goal
        );

        excluded.push(...additional_excluded);

        // 7. Allocate Budgets (Two-Pass Algorithm)
        try {
            allocateBudgets(recommended, total_budget, constraints);
        } catch (err) {
            return createErrorEnvelope("BUDGET_INFEASIBLE_MIN_CONSTRAINTS", err.message);
        }

        // 8. Calculate Constraint Tightness
        const has_custom_limits =
            payload.max_primary_venues !== undefined ||
            payload.max_supporting_venues !== undefined;

        const constraint_tightness = limits_hit.primary || limits_hit.supporting ? 1.0 :
            has_custom_limits ? 0.5 : 0.0;

        // 9. Calculate Global Score
        const global_score = calculateGlobalScore(
            recommended,
            feasible.length,
            total_budget,
            constraint_tightness
        );

        // 10. Build Output
        const world_aware_optimization_v1 = {
            version: "WORLD_AWARE_V1",
            timestamp,
            recommended_venues: recommended.sort((a, b) => a.rank - b.rank).map(v => ({
                venue_key: v.venue_key,
                rank: v.rank,
                role: v.role,
                raw_score: v.raw_score,
                recommended_budget: v.allocated,
                budget_share: v.allocated / total_budget
            })),
            excluded_venues: excluded.sort((a, b) => a.venue_key.localeCompare(b.venue_key)),
            global_score,
            constraint_tightness,
            diagnostics: {
                total_feasible: feasible.length,
                total_excluded: excluded.length,
                primary_count: recommended.filter(v => v.role === "PRIMARY").length,
                supporting_count: recommended.filter(v => v.role === "SUPPORTING").length,
                remarketing_count: recommended.filter(v => v.role === "REMARKETING").length,
                limits_applied: {
                    max_primary_hit: limits_hit.primary,
                    max_supporting_hit: limits_hit.supporting
                }
            }
        };

        return {
            ok: true,
            timestamp,
            payload: {
                analysis: {
                    world_aware_optimization_v1: sortKeys(world_aware_optimization_v1)
                }
            }
        };

    } catch (err) {
        return createErrorEnvelope("OPTIMIZER_UNEXPECTED_ERROR", err.message || "Unexpected error");
    }
}

// Enforce global constraints
function enforceGlobalConstraints(venues, constraints, campaign_goal) {
    const feasible = [];
    const excluded = [];

    venues.forEach(v => {
        const venue_key = v.venue_key;

        // Check forbidden
        if (constraints.forbidden_venues.includes(venue_key)) {
            excluded.push({ venue_key, reason: "FORBIDDEN_BY_WORLD" });
            return;
        }

        // Check objective support
        if (!v.objectives_supported || !v.objectives_supported.includes(campaign_goal.type)) {
            excluded.push({ venue_key, reason: "NO_SUPPORTED_OBJECTIVE" });
            return;
        }

        // Check if required but infeasible (disabled or no budget)
        if (constraints.required_venues.includes(venue_key)) {
            if (!v.enabled || v.status === "DISABLED") {
                excluded.push({ venue_key, reason: "REQUIRED_BUT_INFEASIBLE" });
                return;
            }
        }

        feasible.push(v);
    });

    return { feasible, excluded };
}

// Score venues deterministically
function scoreVenues(venues, campaign_goal, constraints) {
    return venues.map(v => {
        const suitability_map = {
            "AWARENESS": 0.8,
            "CONSIDERATION": 0.7,
            "CONVERSION": 0.9,
            "RETENTION": 0.6
        };

        const suitability = suitability_map[campaign_goal.type] || 0.5;
        const reliability = 0.5; // Default if not in venue data
        const learning = 0.5; // Default if not in venue data

        // Cost penalty (simplified)
        const cost_penalty = 0.05;

        const raw_score = clamp01(
            SUITABILITY_WEIGHT * suitability +
            RELIABILITY_WEIGHT * reliability +
            LEARNING_WEIGHT * learning -
            cost_penalty
        );

        return {
            ...v,
            raw_score,
            min_budget: constraints.min_budget_per_venue[v.venue_key] || 0,
            max_budget: constraints.max_budget_per_venue[v.venue_key] || null
        };
    });
}

// Rank venues deterministically
function rankVenues(scored) {
    return scored
        .slice()
        .sort((a, b) => {
            if (b.raw_score !== a.raw_score) {
                return b.raw_score - a.raw_score;
            }
            return a.venue_key.localeCompare(b.venue_key);
        })
        .map((v, idx) => ({ ...v, rank: idx + 1 }));
}

// Move required venues to top
function moveRequiredToTop(ranked, required_venues) {
    const required = ranked.filter(v => required_venues.includes(v.venue_key));
    const others = ranked.filter(v => !required_venues.includes(v.venue_key));

    // Re-rank after moving
    const combined = [...required, ...others];
    return combined.map((v, idx) => ({ ...v, rank: idx + 1 }));
}

// Assign roles deterministically
function assignRoles(ranked, constraints, campaign_goal) {
    const recommended = [];
    const excluded = [];
    const limits_hit = { primary: false, supporting: false };

    let primary_count = 0;
    let supporting_count = 0;

    ranked.forEach(v => {
        // Required venues get priority
        if (constraints.required_venues.includes(v.venue_key)) {
            if (primary_count < constraints.max_primary_venues) {
                v.role = "PRIMARY";
                primary_count++;
                recommended.push(v);
            } else if (supporting_count < constraints.max_supporting_venues) {
                v.role = "SUPPORTING";
                supporting_count++;
                recommended.push(v);
            } else {
                excluded.push({ venue_key: v.venue_key, reason: "LOW_PRIORITY_CAPABILITY" });
            }
            return;
        }

        // Assign PRIMARY
        if (primary_count < constraints.max_primary_venues) {
            v.role = "PRIMARY";
            primary_count++;
            recommended.push(v);
        }
        // Assign SUPPORTING
        else if (supporting_count < constraints.max_supporting_venues) {
            v.role = "SUPPORTING";
            supporting_count++;
            recommended.push(v);
        }
        // Assign REMARKETING or exclude
        else {
            const supports_remarketing = v.objectives_supported &&
                v.objectives_supported.includes("REMARKETING");
            if (supports_remarketing) {
                v.role = "REMARKETING";
                recommended.push(v);
            } else {
                excluded.push({ venue_key: v.venue_key, reason: "LOW_PRIORITY_CAPABILITY" });
            }
        }
    });

    // Check if limits were hit
    if (primary_count === constraints.max_primary_venues) {
        limits_hit.primary = true;
    }
    if (supporting_count === constraints.max_supporting_venues) {
        limits_hit.supporting = true;
    }

    return { recommended, additional_excluded: excluded, limits_hit };
}

// Two-Pass Budget Allocation (CORRECTED)
function allocateBudgets(venues, total_budget, constraints) {
    // Pass A: Satisfy all min_budgets first
    const min_sum = venues.reduce((sum, v) => sum + (v.min_budget || 0), 0);

    if (min_sum > total_budget) {
        throw new Error(`Sum of min budgets (${min_sum}) exceeds total budget (${total_budget})`);
    }

    // Initialize with min budgets
    venues.forEach(v => {
        v.allocated = v.min_budget || 0;
    });

    let remaining = total_budget - min_sum;

    // Pass B: Distribute remaining budget proportionally with max enforcement
    const frozen = new Set();
    let iteration = 0;
    const MAX_ITERATIONS = 100;

    while (remaining > 0.01 && frozen.size < venues.length && iteration < MAX_ITERATIONS) {
        iteration++;

        const active = venues.filter((_, i) => !frozen.has(i));
        if (active.length === 0) break;

        const active_score = active.reduce((sum, v) => sum + (v.raw_score || 0.5), 0);
        if (active_score === 0) break;

        let redistributed = 0;

        active.forEach((v, _) => {
            const venue_idx = venues.indexOf(v);
            const share = ((v.raw_score || 0.5) / active_score) * remaining;
            const proposed = v.allocated + share;

            if (v.max_budget && proposed > v.max_budget) {
                const excess = proposed - v.max_budget;
                v.allocated = v.max_budget;
                redistributed += excess;
                frozen.add(venue_idx);
            } else {
                v.allocated = proposed;
            }
        });

        remaining = redistributed;
    }

    // Final validation
    venues.forEach(v => {
        if (v.min_budget && v.allocated < v.min_budget - 0.01) {
            throw new Error(`Venue ${v.venue_key} allocated ${v.allocated} < min ${v.min_budget}`);
        }
        if (v.max_budget && v.allocated > v.max_budget + 0.01) {
            throw new Error(`Venue ${v.venue_key} allocated ${v.allocated} > max ${v.max_budget}`);
        }
    });
}

// Calculate global score
function calculateGlobalScore(recommended, total_feasible, total_budget, tightness) {
    const coverage_score = recommended.length / total_feasible;

    const weighted_suitability = recommended.reduce((sum, v) => {
        const budget_share = v.allocated / total_budget;
        return sum + (v.raw_score * budget_share);
    }, 0);

    return clamp01(
        COVERAGE_WEIGHT * coverage_score +
        SUITABILITY_GLOBAL_WEIGHT * weighted_suitability -
        TIGHTNESS_PENALTY * tightness
    );
}

module.exports = {
    optimizeWorldAwareVenues
};
