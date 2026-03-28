/**
 * Phase 37: Budget Rebalancer v1
 *
 * Deterministic, bounded budget reallocation engine.
 * Consumes learning_signals_v1 and budget_plan_v1.
 * Produces rebalance_plan_v1.
 */

const PHASE_CODE_OK = "BUDGET_REBALANCER_V1_OK";

function nowIso() {
    return new Date().toISOString();
}

function createErrorEnvelope(code, message, executionId) {
    return {
        ok: false,
        code,
        message,
        timestamp: nowIso(),
        ...(executionId ? { execution_id: executionId } : {}),
        payload: {}
    };
}

function createSuccessEnvelope(executionId, rebalancePlan) {
    return {
        ok: true,
        code: PHASE_CODE_OK,
        message: "Budget rebalancer completed",
        timestamp: nowIso(),
        execution_id: executionId || null,
        payload: {
            rebalance_plan_v1: rebalancePlan
        }
    };
}

function clamp01(value) {
    if (!Number.isFinite(value)) {
        return NaN;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function sortByVenueKey(list) {
    return list.slice().sort((a, b) => {
        const ak = a.venue_key || "";
        const bk = b.venue_key || "";
        if (ak < bk) return -1;
        if (ak > bk) return 1;
        return 0;
    });
}

function getAdjustmentRate(policyMirror) {
    if (!policyMirror || typeof policyMirror !== "object") {
        return 0.10;
    }
    const raw = policyMirror.optimizer_adjustment_rate;
    if (!Number.isFinite(raw)) {
        return 0.10;
    }
    if (raw <= 0 || raw > 1) {
        return 0.10;
    }
    return raw;
}

function getVenueLimits(policyMirror, venueKey) {
    const defaults = { min_budget: 0, max_budget: null };
    if (!policyMirror || typeof policyMirror !== "object") {
        return defaults;
    }
    const limits = policyMirror.venue_budget_limits;
    if (!limits || typeof limits !== "object") {
        return defaults;
    }
    const venueLimits = limits[venueKey];
    if (!venueLimits || typeof venueLimits !== "object") {
        return defaults;
    }
    const minBudget = Number.isFinite(venueLimits.min_budget)
        ? Math.max(0, venueLimits.min_budget)
        : 0;
    const maxBudget = Number.isFinite(venueLimits.max_budget)
        ? Math.max(minBudget, venueLimits.max_budget)
        : null;
    return {
        min_budget: minBudget,
        max_budget: maxBudget
    };
}

function computePressures(joinedVenues) {
    const pressures = [];
    for (const v of joinedVenues) {
        const gRaw = v.global_score;
        const cRaw = v.constraint_tightness;
        const pRaw = v.coverage_penalty;

        const g = clamp01(gRaw);
        const c = clamp01(cRaw);
        const p = clamp01(pRaw);

        if (!Number.isFinite(g) || !Number.isFinite(c) || !Number.isFinite(p)) {
            return { ok: false, error: "INVALID_SCORE_VALUE" };
        }

        const pressure = g - p + c * 0.25;
        pressures.push(pressure > 0 ? pressure : 0);
    }
    return { ok: true, pressures };
}

function blendBudgets(previous, ideal, rate) {
    const blended = [];
    let totalPrev = 0;
    let totalIdeal = 0;
    let totalBlended = 0;

    for (let i = 0; i < previous.length; i += 1) {
        const prev = previous[i];
        const idealVal = ideal[i];
        const value = prev + rate * (idealVal - prev);
        blended.push(value);
        totalPrev += prev;
        totalIdeal += idealVal;
        totalBlended += value;
    }

    return {
        values: blended,
        totalPrev,
        totalIdeal,
        totalBlended
    };
}

function clampBudgets(values, joinedVenues, policyMirror) {
    const clamped = [];
    const limitsList = [];
    let total = 0;

    for (let i = 0; i < joinedVenues.length; i += 1) {
        const v = joinedVenues[i];
        const raw = values[i];
        const { min_budget, max_budget } = getVenueLimits(
            policyMirror,
            v.venue_key
        );

        let val = raw;
        if (val < min_budget) {
            val = min_budget;
        }
        if (Number.isFinite(max_budget) && val > max_budget) {
            val = max_budget;
        }

        clamped.push(val);
        limitsList.push({ min_budget, max_budget });
        total += val;
    }

    return { clamped, limitsList, total };
}

function adjustForDiff(
    clamped,
    limitsList,
    joinedVenues,
    totalBudget,
    pressures
) {
    const epsilon = 1e-6;
    let currentTotal = clamped.reduce((acc, v) => acc + v, 0);
    let diff = totalBudget - currentTotal;

    if (Math.abs(diff) <= epsilon) {
        return { ok: true, values: clamped };
    }

    const n = clamped.length;
    const indices = [];
    const weights = [];

    for (let i = 0; i < n; i += 1) {
        const minB = limitsList[i].min_budget;
        const maxB = limitsList[i].max_budget;
        const val = clamped[i];

        const canIncrease =
            diff > 0 &&
            (!Number.isFinite(maxB) || val < maxB - epsilon);
        const canDecrease =
            diff < 0 &&
            val > minB + epsilon;

        if (canIncrease || canDecrease) {
            indices.push(i);
            const w = pressures[i] > 0 ? pressures[i] : 1;
            weights.push(w);
        }
    }

    if (indices.length === 0) {
        return { ok: false, error: "INFEASIBLE_REALLOCATION" };
    }

    let weightSum = weights.reduce((acc, w) => acc + w, 0);
    if (weightSum <= 0) {
        weightSum = indices.length;
        for (let i = 0; i < weights.length; i += 1) {
            weights[i] = 1;
        }
    }

    const adjusted = clamped.slice();

    for (let i = 0; i < indices.length; i += 1) {
        const idx = indices[i];
        const share = weights[i] / weightSum;
        const allocation = diff * share;
        let candidate = adjusted[idx] + allocation;

        const minB = limitsList[idx].min_budget;
        const maxB = limitsList[idx].max_budget;

        if (candidate < minB) {
            candidate = minB;
        }
        if (Number.isFinite(maxB) && candidate > maxB) {
            candidate = maxB;
        }

        adjusted[idx] = candidate;
    }

    currentTotal = adjusted.reduce((acc, v) => acc + v, 0);
    const finalDiff = totalBudget - currentTotal;

    if (Math.abs(finalDiff) > 1e-4) {
        return { ok: false, error: "INFEASIBLE_REALLOCATION" };
    }

    return { ok: true, values: adjusted };
}

/**
 * Main entry point for Phase 37.
 *
 * @param {object} envelope - Orchestrator envelope
 * @returns {object} - Envelope with rebalance_plan_v1 or error envelope
 */
function runBudgetRebalancer(envelope) {
    const executionId =
        envelope && typeof envelope === "object" ? envelope.execution_id : null;

    if (!envelope || typeof envelope !== "object") {
        return createErrorEnvelope(
            "MALFORMED_INPUT",
            "Input envelope must be an object",
            executionId
        );
    }

    const payload = envelope.payload;
    if (!payload || typeof payload !== "object") {
        return createErrorEnvelope(
            "MALFORMED_INPUT",
            "Envelope payload must be an object",
            executionId
        );
    }

    const flags = payload.flags || envelope.flags || {};
    if (
        Object.prototype.hasOwnProperty.call(flags, "FF_BUDGET_REBALANCER_V1") &&
        flags.FF_BUDGET_REBALANCER_V1 === false
    ) {
        const budgetPlan = payload.budget_plan_v1;
        if (!budgetPlan || !Array.isArray(budgetPlan.venues)) {
            return createErrorEnvelope(
                "MALFORMED_BUDGET_PLAN",
                "Budget plan required when feature flag is disabled",
                executionId
            );
        }

        const venues = sortByVenueKey(budgetPlan.venues).map((bv) => ({
            venue_key: bv.venue_key,
            previous_spend: bv.allocated,
            new_spend: bv.allocated,
            delta: 0,
            reason: {
                global_signal: 0,
                constraint_tightness: 0,
                coverage_penalty: 0
            }
        }));

        const totalBudget = venues.reduce(
            (acc, v) => acc + (Number.isFinite(v.previous_spend) ? v.previous_spend : 0),
            0
        );

        return createSuccessEnvelope(executionId, {
            version: "V1",
            total_budget: totalBudget,
            venues
        });
    }

    const learning = payload.learning_signals_v1;
    const budgetPlan = payload.budget_plan_v1;
    const policyMirror = payload.policy_mirror_v1;

    if (!learning || typeof learning !== "object" || !Array.isArray(learning.venues)) {
        return createErrorEnvelope(
            "MALFORMED_LEARNING_SIGNALS",
            "learning_signals_v1.venues must be an array",
            executionId
        );
    }

    if (!budgetPlan || typeof budgetPlan !== "object" || !Array.isArray(budgetPlan.venues)) {
        return createErrorEnvelope(
            "MALFORMED_BUDGET_PLAN",
            "budget_plan_v1.venues must be an array",
            executionId
        );
    }

    const sortedBudgetVenues = sortByVenueKey(budgetPlan.venues);
    const learningByVenue = new Map();

    for (const lv of learning.venues) {
        if (!lv || typeof lv !== "object") {
            return createErrorEnvelope(
                "MALFORMED_LEARNING_SIGNALS",
                "learning_signals_v1.venues entry must be an object",
                executionId
            );
        }
        if (typeof lv.venue_key !== "string" || lv.venue_key.length === 0) {
            return createErrorEnvelope(
                "MALFORMED_LEARNING_SIGNALS",
                "Each learning venue must have a non empty venue_key",
                executionId
            );
        }
        learningByVenue.set(lv.venue_key, lv);
    }

    const joinedVenues = [];
    const previousBudgets = [];
    let totalBudget = 0;

    for (const bv of sortedBudgetVenues) {
        if (!bv || typeof bv !== "object") {
            return createErrorEnvelope(
                "MALFORMED_BUDGET_PLAN",
                "budget_plan_v1.venues entry must be an object",
                executionId
            );
        }
        if (typeof bv.venue_key !== "string" || bv.venue_key.length === 0) {
            return createErrorEnvelope(
                "MALFORMED_BUDGET_PLAN",
                "Each budget venue must have a non empty venue_key",
                executionId
            );
        }
        if (!Number.isFinite(bv.allocated) || bv.allocated < 0) {
            return createErrorEnvelope(
                "INVALID_BUDGET_VALUE",
                "Allocated budget must be a non negative number",
                executionId
            );
        }

        const learningVenue = learningByVenue.get(bv.venue_key) || {
            venue_key: bv.venue_key,
            global_score: 0,
            constraint_tightness: 0,
            coverage_penalty: 0
        };

        joinedVenues.push({
            venue_key: bv.venue_key,
            allocated: bv.allocated,
            global_score: learningVenue.global_score,
            constraint_tightness: learningVenue.constraint_tightness,
            coverage_penalty: learningVenue.coverage_penalty
        });

        previousBudgets.push(bv.allocated);
        totalBudget += bv.allocated;
    }

    const { ok: pressureOk, pressures, error: pressureError } = computePressures(
        joinedVenues
    );
    if (!pressureOk) {
        return createErrorEnvelope(
            pressureError,
            "Invalid score values in learning signals",
            executionId
        );
    }

    let weightSum = 0;
    const weights = [];
    for (let i = 0; i < pressures.length; i += 1) {
        const w = pressures[i] > 0 ? pressures[i] : 0;
        weights.push(w);
        weightSum += w;
    }

    if (weightSum <= 0) {
        const venues = joinedVenues.map((v) => ({
            venue_key: v.venue_key,
            previous_spend: v.allocated,
            new_spend: v.allocated,
            delta: 0,
            reason: {
                global_signal: 0,
                constraint_tightness: 0,
                coverage_penalty: 0
            }
        }));

        return createSuccessEnvelope(executionId, {
            version: "V1",
            total_budget: totalBudget,
            venues
        });
    }

    const idealBudgets = [];
    for (let i = 0; i < joinedVenues.length; i += 1) {
        const share = weights[i] / weightSum;
        idealBudgets.push(totalBudget * share);
    }

    const rate = getAdjustmentRate(policyMirror);
    const blended = blendBudgets(previousBudgets, idealBudgets, rate);

    const { clamped, limitsList, total: clampedTotal } = clampBudgets(
        blended.values,
        joinedVenues,
        policyMirror
    );

    const diff = totalBudget - clampedTotal;
    let finalBudgets = clamped;

    if (Math.abs(diff) > 1e-6) {
        const adjustResult = adjustForDiff(
            clamped,
            limitsList,
            joinedVenues,
            totalBudget,
            pressures
        );
        if (!adjustResult.ok) {
            return createErrorEnvelope(
                adjustResult.error,
                "Unable to satisfy budget constraints during reallocation",
                executionId
            );
        }
        finalBudgets = adjustResult.values;
    }

    const venues = [];
    for (let i = 0; i < joinedVenues.length; i += 1) {
        const v = joinedVenues[i];
        const prev = v.allocated;
        const next = finalBudgets[i];
        const learningVenue = learningByVenue.get(v.venue_key) || {
            global_score: 0,
            constraint_tightness: 0,
            coverage_penalty: 0
        };

        venues.push({
            venue_key: v.venue_key,
            previous_spend: prev,
            new_spend: next,
            delta: next - prev,
            reason: {
                global_signal: Number.isFinite(learningVenue.global_score)
                    ? learningVenue.global_score
                    : 0,
                constraint_tightness: Number.isFinite(learningVenue.constraint_tightness)
                    ? learningVenue.constraint_tightness
                    : 0,
                coverage_penalty: Number.isFinite(learningVenue.coverage_penalty)
                    ? learningVenue.coverage_penalty
                    : 0
            }
        });
    }

    const finalTotal = venues.reduce(
        (acc, v) => acc + (Number.isFinite(v.new_spend) ? v.new_spend : 0),
        0
    );

    if (Math.abs(finalTotal - totalBudget) > 1e-4) {
        return createErrorEnvelope(
            "INFEASIBLE_REALLOCATION",
            "Final budgets do not match total budget after adjustment",
            executionId
        );
    }

    const rebalancePlan = {
        version: "V1",
        total_budget: totalBudget,
        venues
    };

    return createSuccessEnvelope(executionId, rebalancePlan);
}

module.exports = {
    runBudgetRebalancer,
    // export helpers for unit tests
    _internal: {
        clamp01,
        computePressures,
        blendBudgets,
        clampBudgets,
        adjustForDiff,
        getAdjustmentRate,
        getVenueLimits,
        sortByVenueKey
    }
};
