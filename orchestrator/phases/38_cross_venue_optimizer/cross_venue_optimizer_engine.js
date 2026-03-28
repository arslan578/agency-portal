/**
 * Phase 38: Cross Venue Optimizer
 *
 * Final venue-level optimization with strict bounds, policy compliance,
 * and deterministic budget conservation.
 */

const PHASE_CODE_OK = "CROSS_VENUE_OPTIMIZER_OK";
const EPSILON = 1e-6;
const DEFAULT_MAX_DELTA_RATIO = 0.25;

// Decision vocabulary
const DECISION_KEEP = "KEEP";
const DECISION_INCREASE = "INCREASE";
const DECISION_DECREASE = "DECREASE";
const DECISION_CAP_AT_MIN = "CAP_AT_MIN";
const DECISION_CAP_AT_MAX = "CAP_AT_MAX";
const DECISION_ZEROED = "ZEROED";

// Rationale tag vocabulary
const TAG_HIGH_PERF = "HIGH_PERF";
const TAG_LOW_PERF = "LOW_PERF";
const TAG_CONSTRAINT_HIT = "CONSTRAINT_HIT";
const TAG_POLICY_BLOCK = "POLICY_BLOCK";
const TAG_DELTA_CLAMPED = "DELTA_CLAMPED";

function nowIso() {
    return new Date().toISOString();
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        timestamp: nowIso(),
        error: {
            code,
            message
        }
    };
}

function createSuccessEnvelope(result) {
    return {
        ok: true,
        timestamp: nowIso(),
        payload: {
            phase_38: {
                cross_venue_optimizer: result
            }
        }
    };
}

function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

/**
 * Main entry point for Phase 38
 */
function runCrossVenueOptimizer(envelope) {
    try {
        // Feature flag check
        const flags = envelope.flags || {};
        const featureEnabled = flags.FF_CROSS_VENUE_OPTIMIZER !== false;

        if (!featureEnabled) {
            return handleFeatureFlagDisabled(envelope);
        }

        // Input validation
        const validation = validateInputs(envelope);
        if (!validation.ok) {
            return createErrorEnvelope(validation.code, validation.message);
        }

        const { phase35, phase36, phase37, phase32, phase33, phase34 } = validation.data;

        // Currency validation (with Phase 37 venues for strict checking)
        const currencyCheck = validateCurrencies(phase34, phase37.venues);
        if (!currencyCheck.ok) {
            return createErrorEnvelope(currencyCheck.code, currencyCheck.message);
        }

        // Build venue index
        const venueIndex = buildVenueIndex(phase35, phase36, phase37, phase32, phase33, phase34);

        // Check for locked state
        if (venueIndex.every(v => v.policyBlocked)) {
            return createErrorEnvelope(
                "CROSS_VENUE_LOCKED",
                "All venues are policy-blocked, cannot optimize"
            );
        }

        // Compute cross-venue scores
        venueIndex.forEach(v => {
            v.crossVenueScore = computeCrossVenueScore(
                v.performanceScore,
                v.learningScore,
                v.constraintTightness
            );
        });

        // Compute ideal budgets
        const idealBudgets = computeIdealBudgets(venueIndex, phase37.total_budget);

        // Apply bounded movement
        const maxDeltaRatio = phase32.max_allowed_delta_ratio || DEFAULT_MAX_DELTA_RATIO;
        applyBoundedMovement(venueIndex, idealBudgets, maxDeltaRatio);

        // Apply min/max limits
        applyMinMaxLimits(venueIndex);

        // Conserve budget
        const conserved = conserveBudget(venueIndex, phase37.total_budget, maxDeltaRatio);
        if (!conserved) {
            return createErrorEnvelope(
                "BUDGET_MISBALANCE",
                "Cannot conserve total budget within constraints"
            );
        }

        // Generate decisions and rationale
        generateDecisionsAndRationale(venueIndex, maxDeltaRatio);

        // Compute exploration/exploitation weights
        computeExplorationExploitation(venueIndex);

        // Build output
        const result = buildOutput(venueIndex, phase37.total_budget, maxDeltaRatio);

        return createSuccessEnvelope(result);

    } catch (err) {
        return createErrorEnvelope(
            "UNEXPECTED_INTERNAL_ERROR",
            err.message || "Unexpected error in Phase 38"
        );
    }
}

/**
 * Handle feature flag disabled
 */
function handleFeatureFlagDisabled(envelope) {
    const payload = envelope.payload || {};
    const phase37 = payload.phase_37 || payload.phase37 || {};
    const budgetRebalancer = phase37.budget_rebalancer || phase37.rebalance_plan_v1 || {};

    if (!budgetRebalancer.venues || !Array.isArray(budgetRebalancer.venues)) {
        return createErrorEnvelope(
            "MALFORMED_PHASE_37_CONTRACT",
            "Phase 37 required when feature flag disabled"
        );
    }

    const totalBudget = budgetRebalancer.total_budget || 0;

    const venuePlans = budgetRebalancer.venues.map(v => ({
        venue_key: v.venue_key,
        currency_code: "USD", // Default
        budget_before: v.new_spend || 0,
        budget_after: v.new_spend || 0,
        delta: 0,
        delta_ratio: 0,
        cross_venue_score: 0.5,
        decision: DECISION_KEEP,
        rationale_tags: [],
        constraint_tightness: 0,
        exploration_weight: 0,
        exploitation_weight: 0
    }));

    const result = {
        total_budget_before: totalBudget,
        total_budget_after: totalBudget,
        venue_plans: venuePlans,
        diagnostics: {
            total_delta: 0,
            max_single_venue_delta_ratio: 0,
            venues_increased: 0,
            venues_decreased: 0,
            venues_unchanged: venuePlans.length,
            exploration_budget_share: 0,
            exploitation_budget_share: 0,
            policy_blocked_venues: [],
            warnings: ["Feature flag FF_CROSS_VENUE_OPTIMIZER is disabled"]
        },
        stability: {
            max_allowed_delta_ratio: DEFAULT_MAX_DELTA_RATIO,
            applied_soft_cap: false
        },
        status: {
            ok: true,
            code: null,
            message: "Passthrough mode (feature flag disabled)"
        }
    };

    return createSuccessEnvelope(result);
}

/**
 * Validate all required phase inputs
 */
function validateInputs(envelope) {
    if (!envelope || typeof envelope !== "object") {
        return { ok: false, code: "MALFORMED_INPUT", message: "Envelope must be an object" };
    }

    const payload = envelope.payload;
    if (!payload || typeof payload !== "object") {
        return { ok: false, code: "MALFORMED_INPUT", message: "Payload must be an object" };
    }

    // Phase 35
    const phase35 = payload.phase_35 || payload.phase35;
    if (!phase35) {
        return {
            ok: false,
            code: "MALFORMED_PHASE_35_CONTRACT",
            message: "Phase 35 data is missing"
        };
    }
    const worldAware = phase35.world_aware_optimization || phase35.world_aware_optimization_v1 || {};
    if (!Array.isArray(worldAware.recommended_venues)) {
        return {
            ok: false,
            code: "MALFORMED_PHASE_35_CONTRACT",
            message: "Phase 35 recommended_venues must be an array"
        };
    }

    // Phase 36
    const phase36 = payload.phase_36 || payload.phase36;
    if (!phase36) {
        return {
            ok: false,
            code: "MALFORMED_PHASE_36_CONTRACT",
            message: "Phase 36 data is missing"
        };
    }
    const learningAgg = phase36.learning_signal_aggregate || phase36.learning_signals_v1 || {};
    const signals = learningAgg.recommended_signals || learningAgg.venues || [];
    if (!Array.isArray(signals)) {
        return {
            ok: false,
            code: "MALFORMED_PHASE_36_CONTRACT",
            message: "Phase 36 signals must be an array"
        };
    }

    // Phase 37
    const phase37 = payload.phase_37 || payload.phase37 || {};
    const budgetRebalancer = phase37.budget_rebalancer || phase37.rebalance_plan_v1 || {};
    if (!Array.isArray(budgetRebalancer.venues)) {
        return {
            ok: false,
            code: "MALFORMED_PHASE_37_CONTRACT",
            message: "Phase 37 venues must be an array"
        };
    }
    if (typeof budgetRebalancer.total_budget !== "number") {
        return {
            ok: false,
            code: "MALFORMED_PHASE_37_CONTRACT",
            message: "Phase 37 total_budget must be a number"
        };
    }

    // Phase 32
    const phase32 = payload.phase_32 || payload.phase32 || {};
    const policyMirror = phase32.policy_mirror || phase32.policy_mirror_v1 || {};

    // Phase 33
    const phase33 = payload.phase_33 || payload.phase33 || {};
    const policyReasoner = phase33.policy_reasoner || phase33.policy_report_v1 || {};
    const venueAssessments = policyReasoner.venue_assessments || policyReasoner.venues || [];

    // Phase 34
    const phase34 = payload.phase_34 || payload.phase34 || {};
    const capabilitiesResolver = phase34.capabilities_resolver || phase34.capabilities_index_v1 || {};
    const capVenues = capabilitiesResolver.venues || [];

    return {
        ok: true,
        data: {
            phase35: worldAware,
            phase36: { signals },
            phase37: budgetRebalancer,
            phase32: policyMirror,
            phase33: { venueAssessments },
            phase34: { venues: capVenues }
        }
    };
}

/**
 * Validate all venues have same currency
 * Refinement 2: Require every Phase 37 venue to exist in Phase 34
 */
function validateCurrencies(phase34, phase37Venues) {
    const venues = phase34.venues || [];
    if (venues.length === 0) {
        return { ok: true };
    }

    // Refinement 2: Strict alignment - every Phase 37 venue must have Phase 34 entry
    for (const v37Venue of phase37Venues) {
        const match = venues.find(v => v.venue_key === v37Venue.venue_key);
        if (!match || !match.currency_code) {
            return {
                ok: false,
                code: "UNSUPPORTED_CURRENCY_COMBINATION",
                message: `Missing currency_code for venue ${v37Venue.venue_key}`
            };
        }
    }

    const currencies = new Set();
    for (const v of venues) {
        if (v.currency_code) {
            currencies.add(v.currency_code);
        }
    }

    if (currencies.size > 1) {
        return {
            ok: false,
            code: "UNSUPPORTED_CURRENCY_COMBINATION",
            message: `Multiple currencies detected: ${Array.from(currencies).join(", ")}`
        };
    }

    return { ok: true, currency: currencies.size === 1 ? Array.from(currencies)[0] : "USD" };
}

/**
 * Build unified venue index
 */
function buildVenueIndex(phase35, phase36, phase37, phase32, phase33, phase34) {
    const index = [];

    // Start with Phase 37 budgets (source of truth for current state)
    for (const v37 of phase37.venues) {
        const venueKey = v37.venue_key;

        // Find in other phases
        const v35 = phase35.recommended_venues.find(v => v.venue_key === venueKey);
        const v36 = phase36.signals.find(v => v.venue_key === venueKey);
        const v33 = phase33.venueAssessments.find(v => v.venue_key === venueKey);
        const v34 = phase34.venues.find(v => v.venue_key === venueKey);

        // Get limits
        const limits = phase32.venue_budget_limits?.[venueKey] || {};
        const minBudget = typeof limits.min_budget === "number" ? limits.min_budget : 0;
        const maxBudget = typeof limits.max_budget === "number" ? limits.max_budget : Infinity;

        // Check policy blocks
        const isLegal = v33 ? (v33.is_legal !== false) : true;
        const policyBlocks = v33?.policy_blocks || [];
        const policyBlocked = !isLegal || policyBlocks.length > 0;

        const venue = {
            venueKey,
            currencyCode: v34?.currency_code || "USD",
            budgetBefore: v37.new_spend || 0,
            budgetAfter: v37.new_spend || 0,
            proposedBudget: v37.new_spend || 0,
            minBudget,
            maxBudget,
            performanceScore: v35?.raw_score !== undefined ? v35.raw_score : 0.5,
            learningScore: v36?.normalized_score !== undefined ? v36.normalized_score : 0.5,
            constraintTightness: v36?.constraint_tightness !== undefined ? v36.constraint_tightness : 0,
            crossVenueScore: 0,
            policyBlocked,
            policyBlocks: policyBlocks,
            decision: DECISION_KEEP,
            rationaleTags: [],
            explorationWeight: 0,
            exploitationWeight: 0
        };

        index.push(venue);
    }

    // Sort by venue_key for determinism
    index.sort((a, b) => a.venueKey.localeCompare(b.venueKey));

    return index;
}

/**
 * Compute cross-venue score
 */
function computeCrossVenueScore(performanceScore, learningScore, constraintTightness) {
    const perf = clamp01(performanceScore);
    const learn = clamp01(learningScore);
    const tightness = clamp01(constraintTightness);

    const score = 0.6 * perf + 0.3 * learn + 0.1 * (1 - tightness);
    return clamp01(score);
}

/**
 * Compute ideal budgets based on cross-venue scores
 */
function computeIdealBudgets(venueIndex, totalBudget) {
    const idealBudgets = new Map();

    // Separate blocked and non-blocked venues
    const nonBlocked = venueIndex.filter(v => !v.policyBlocked);
    const blocked = venueIndex.filter(v => v.policyBlocked);

    if (nonBlocked.length === 0) {
        // All blocked - no changes
        venueIndex.forEach(v => idealBudgets.set(v.venueKey, v.budgetBefore));
        return idealBudgets;
    }

    // Calculate total movable budget
    const blockedBudget = blocked.reduce((sum, v) => sum + v.budgetBefore, 0);
    const movableBudget = totalBudget - blockedBudget;

    // Calculate score sum
    const scoreSum = nonBlocked.reduce((sum, v) => sum + v.crossVenueScore, 0);

    if (scoreSum <= 0) {
        // Equal distribution
        const equalShare = movableBudget / nonBlocked.length;
        nonBlocked.forEach(v => idealBudgets.set(v.venueKey, equalShare));
    } else {
        // Proportional to scores
        nonBlocked.forEach(v => {
            const share = (v.crossVenueScore / scoreSum) * movableBudget;
            idealBudgets.set(v.venueKey, share);
        });
    }

    // Blocked venues stay same
    blocked.forEach(v => idealBudgets.set(v.venueKey, v.budgetBefore));

    return idealBudgets;
}

/**
 * Apply bounded movement with hard delta ratio limit
 */
function applyBoundedMovement(venueIndex, idealBudgets, maxDeltaRatio) {
    for (const v of venueIndex) {
        if (v.policyBlocked) {
            v.proposedBudget = v.budgetBefore;
            continue;
        }

        const ideal = idealBudgets.get(v.venueKey) || v.budgetBefore;
        const delta = ideal - v.budgetBefore;

        // Calculate max allowed delta
        const maxDelta = v.budgetBefore * maxDeltaRatio;

        // Clamp delta
        const boundedDelta = clamp(delta, -maxDelta, maxDelta);
        v.proposedBudget = v.budgetBefore + boundedDelta;
    }
}

/**
 * Apply min/max budget limits
 * Refinement 4: Add policy block violation guard
 */
function applyMinMaxLimits(venueIndex) {
    for (const v of venueIndex) {
        // Refinement 4: Safety fence - detect illegal movement of blocked venues
        if (v.policyBlocked && Math.abs(v.proposedBudget - v.budgetBefore) > EPSILON) {
            throw new Error(`Illegal budget movement attempted for blocked venue ${v.venueKey}`);
        }

        v.proposedBudget = clamp(v.proposedBudget, v.minBudget, v.maxBudget);
        v.budgetAfter = v.proposedBudget;
    }
}

/**
 * Conserve total budget through redistribution
 */
function conserveBudget(venueIndex, targetTotal, maxDeltaRatio) {
    const MAX_ITERATIONS = 100;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
        iteration++;

        const currentTotal = venueIndex.reduce((sum, v) => sum + v.budgetAfter, 0);
        const diff = targetTotal - currentTotal;

        if (Math.abs(diff) <= 1e-4) {
            return true; // Conserved
        }

        // Find venues with headroom
        const adjustable = venueIndex.filter(v => {
            if (v.policyBlocked) return false;

            const currentDeltaRatio = Math.abs(v.budgetAfter - v.budgetBefore) / Math.max(v.budgetBefore, EPSILON);
            if (currentDeltaRatio >= maxDeltaRatio - EPSILON) return false;

            if (diff > 0) {
                // Need to increase
                return v.budgetAfter < v.maxBudget - EPSILON;
            } else {
                // Need to decrease
                return v.budgetAfter > v.minBudget + EPSILON;
            }
        });

        if (adjustable.length === 0) {
            return false; // Cannot conserve
        }

        // Distribute diff proportionally by cross-venue score
        const scoreSum = adjustable.reduce((sum, v) => sum + v.crossVenueScore, 0);

        for (const v of adjustable) {
            const share = scoreSum > 0 ? (v.crossVenueScore / scoreSum) : (1 / adjustable.length);
            const allocation = diff * share;

            // Apply with delta bounds
            const newBudget = v.budgetAfter + allocation;
            const maxDelta = v.budgetBefore * maxDeltaRatio;
            const boundedBudget = clamp(
                newBudget,
                Math.max(v.minBudget, v.budgetBefore - maxDelta),
                Math.min(v.maxBudget, v.budgetBefore + maxDelta)
            );

            v.budgetAfter = boundedBudget;
        }

        // Refinement 1: Simplified progress check
        const newTotal = venueIndex.reduce((sum, v) => sum + v.budgetAfter, 0);
        if (Math.abs(newTotal - currentTotal) < EPSILON) {
            // No progress, cannot conserve
            return false;
        }
    }

    return false; // Max iterations exceeded
}

/**
 * Generate decisions and rationale
 */
function generateDecisionsAndRationale(venueIndex, maxDeltaRatio) {
    for (const v of venueIndex) {
        const delta = v.budgetAfter - v.budgetBefore;
        const deltaMagnitude = Math.abs(delta);
        v.deltaRatio = deltaMagnitude / Math.max(v.budgetBefore, EPSILON);

        // Determine decision
        if (Math.abs(delta) < EPSILON) {
            v.decision = DECISION_KEEP;
        } else if (delta > 0) {
            v.decision = DECISION_INCREASE;
        } else {
            v.decision = DECISION_DECREASE;
        }

        // Check for capping
        if (v.budgetAfter <= v.minBudget + EPSILON && v.proposedBudget < v.minBudget) {
            v.decision = DECISION_CAP_AT_MIN;
        }
        if (v.budgetAfter >= v.maxBudget - EPSILON && v.proposedBudget > v.maxBudget) {
            v.decision = DECISION_CAP_AT_MAX;
        }
        if (v.budgetAfter < EPSILON) {
            v.decision = DECISION_ZEROED;
        }

        // Generate rationale tags
        const tags = [];

        if (v.crossVenueScore >= 0.7) {
            tags.push(TAG_HIGH_PERF);
        }
        if (v.crossVenueScore < 0.4) {
            tags.push(TAG_LOW_PERF);
        }
        if (v.decision === DECISION_CAP_AT_MIN || v.decision === DECISION_CAP_AT_MAX) {
            tags.push(TAG_CONSTRAINT_HIT);
        }
        if (v.policyBlocked) {
            tags.push(TAG_POLICY_BLOCK);
        }
        if (v.deltaRatio >= maxDeltaRatio - EPSILON) {
            tags.push(TAG_DELTA_CLAMPED);
        }

        v.rationaleTags = tags;
    }
}

/**
 * Compute exploration/exploitation weights
 */
function computeExplorationExploitation(venueIndex) {
    for (const v of venueIndex) {
        v.explorationWeight = (1 - v.constraintTightness) * 0.5 + v.learningScore * 0.5;
        v.exploitationWeight = v.performanceScore;
    }
}

/**
 * Build final output
 * Refinement 3: Compute actual applied_soft_cap status
 */
function buildOutput(venueIndex, totalBudget, maxDeltaRatio) {
    const totalBefore = venueIndex.reduce((sum, v) => sum + v.budgetBefore, 0);
    const totalAfter = venueIndex.reduce((sum, v) => sum + v.budgetAfter, 0);

    const venuePlans = venueIndex.map(v => ({
        venue_key: v.venueKey,
        currency_code: v.currencyCode,
        budget_before: v.budgetBefore,
        budget_after: v.budgetAfter,
        delta: v.budgetAfter - v.budgetBefore,
        delta_ratio: v.deltaRatio || 0,
        cross_venue_score: v.crossVenueScore,
        decision: v.decision,
        rationale_tags: v.rationaleTags,
        constraint_tightness: v.constraintTightness,
        exploration_weight: v.explorationWeight,
        exploitation_weight: v.exploitationWeight
    }));

    // Calculate diagnostics
    const totalDelta = venuePlans.reduce((sum, v) => sum + Math.abs(v.delta), 0);
    const maxSingleDeltaRatio = Math.max(...venuePlans.map(v => Math.abs(v.delta_ratio)));
    const venuesIncreased = venuePlans.filter(v => v.delta > EPSILON).length;
    const venuesDecreased = venuePlans.filter(v => v.delta < -EPSILON).length;
    const venuesUnchanged = venuePlans.filter(v => Math.abs(v.delta) <= EPSILON).length;

    const explorationBudgetShare = totalDelta > 0
        ? venuePlans.reduce((sum, v) => sum + Math.abs(v.delta) * v.exploration_weight, 0) / totalDelta
        : 0;
    const exploitationBudgetShare = totalDelta > 0
        ? venuePlans.reduce((sum, v) => sum + Math.abs(v.delta) * v.exploitation_weight, 0) / totalDelta
        : 0;

    const policyBlockedVenues = venueIndex
        .filter(v => v.policyBlocked)
        .map(v => v.venueKey);

    const warnings = [];
    if (Math.abs(totalAfter - totalBudget) > 1e-4) {
        warnings.push("Budget conservation tolerance exceeded");
    }

    const diagnostics = {
        total_delta: totalDelta,
        max_single_venue_delta_ratio: maxSingleDeltaRatio,
        venues_increased: venuesIncreased,
        venues_decreased: venuesDecreased,
        venues_unchanged: venuesUnchanged,
        exploration_budget_share: explorationBudgetShare,
        exploitation_budget_share: exploitationBudgetShare,
        policy_blocked_venues: policyBlockedVenues,
        warnings
    };

    // Refinement 3: Detect if any venue hit delta ratio cap
    const anySoftCap = venueIndex.some(v =>
        !v.policyBlocked &&
        v.deltaRatio >= maxDeltaRatio - EPSILON
    );

    const stability = {
        max_allowed_delta_ratio: maxDeltaRatio,
        applied_soft_cap: anySoftCap
    };

    const status = {
        ok: true,
        code: null,
        message: null
    };

    return {
        total_budget_before: totalBefore,
        total_budget_after: totalAfter,
        venue_plans: venuePlans,
        diagnostics,
        stability,
        status
    };
}

module.exports = {
    runCrossVenueOptimizer,
    // Export internals for testing
    _internal: {
        computeCrossVenueScore,
        clamp01,
        EPSILON,
        DEFAULT_MAX_DELTA_RATIO
    }
};
