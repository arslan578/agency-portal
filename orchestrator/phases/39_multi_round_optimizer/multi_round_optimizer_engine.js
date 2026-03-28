/**
 * Phase 39: Multi Round Optimization Loop Engine
 *
 * Deterministic multi-round optimization loop wrapping Phase 35→36→37→38 chain
 * with drift/incident brakes, oscillation detection, and convergence logic.
 */

const EPSILON = 1e-6;

// Brake thresholds
const DRIFT_BRAKE_START = 0.20;
const DRIFT_BRAKE_SPAN = 0.60;  // Full at 0.80
const INCIDENT_BRAKE_START = 0.10;
const INCIDENT_BRAKE_SPAN = 0.50;  // Full at 0.60

// Default configuration
const DEFAULT_MAX_ROUNDS = 10;
const DEFAULT_CONVERGENCE_THRESHOLD = 0.01;  // 1%
const DEFAULT_BASE_DAMPING = 0.2;
const DEFAULT_BASE_MAX_STEP = 0.15;  // 15% of total budget
const DEFAULT_PER_VENUE_MIN_STEP_FRACTION = 0.001;  // 0.1%

const DEFAULT_DRIFT_SENSITIVITY = 1.0;
const DEFAULT_INCIDENT_SENSITIVITY = 1.0;
const DEFAULT_EXPLORATION_WEIGHT = 0.3;
const DEFAULT_EXPLOITATION_WEIGHT = 0.7;

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
            phase_39: {
                multi_round_optimizer: result
            }
        }
    };
}

function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * Scaled brake function
 */
function scaledBrake(x, start, span) {
    if (x <= start) return 0;
    if (x >= start + span) return 1;
    return (x - start) / span;
}

/**
 * Main entry point for Phase 39
 * @param {object} envelope - Input envelope with configuration and state
 * @param {function} roundFn - Dependency-injected round function (35→36→37→38)
 */
function runMultiRoundOptimizer(envelope, roundFn) {
    try {
        // Input validation
        const validation = validateInputs(envelope);
        if (!validation.ok) {
            return createErrorEnvelope(validation.code, validation.message);
        }

        const { config, venues, totalBudget, zeroBudget } = validation.data;

        // Refinement 1: Zero-Budget Handling
        if (zeroBudget) {
            const roundZeroBudgets = {};
            venues.forEach(v => { roundZeroBudgets[v.venue_key] = v.budget; });

            const finalVenuePlan = buildFinalPlan(
                venues.map(v => ({
                    venue_key: v.venue_key,
                    currency: v.currency,
                    round_budget: v.budget,
                    min_budget: v.min_budget,
                    max_budget: v.max_budget,
                    hard_delta_bound: v.hard_delta_bound,
                    constraint_tightness: v.constraint_tightness,
                    cross_venue_score: v.cross_venue_score
                })),
                roundZeroBudgets,
                []
            );

            const optimizationSummary = {
                total_rounds: 0,
                termination_reason: "CONVERGED",
                final_global_delta: 0,
                total_budget: 0,
                convergence_achieved: true
            };

            const optimizationState = {
                round_zero_budgets: roundZeroBudgets,
                final_budgets: {},
                brake_config: {
                    drift_sensitivity: DEFAULT_DRIFT_SENSITIVITY,
                    incident_sensitivity: DEFAULT_INCIDENT_SENSITIVITY,
                    effective_damping: DEFAULT_BASE_DAMPING,
                    effective_max_step: DEFAULT_BASE_MAX_STEP
                }
            };

            return createSuccessEnvelope({
                final_venue_plan_v1: finalVenuePlan,
                round_history_v1: [],
                optimization_summary_v1: optimizationSummary,
                optimization_state_v1: optimizationState
            });
        }

        // Currency validation
        const currencies = new Set(venues.map(v => v.currency));
        if (currencies.size > 1) {
            return createErrorEnvelope(
                "MULTIPLE_CURRENCIES",
                `Multiple currencies detected: ${Array.from(currencies).join(", ")}`
            );
        }

        // Capture round zero budgets (immutable)
        const roundZeroBudgets = {};
        venues.forEach(v => {
            roundZeroBudgets[v.venue_key] = v.budget;
        });

        // Initialize current plan
        let currentPlan = {
            venues: venues.map(v => ({
                venue_key: v.venue_key,
                currency: v.currency,
                round_budget: v.budget,
                min_budget: v.min_budget,
                max_budget: v.max_budget,
                hard_delta_bound: v.hard_delta_bound || Infinity,
                constraint_tightness: v.constraint_tightness || 0,
                cross_venue_score: v.cross_venue_score || 0.5
            }))
        };

        // Sort venues for determinism
        currentPlan.venues.sort((a, b) => a.venue_key.localeCompare(b.venue_key));

        // Compute brakes
        const driftScore = envelope.global_drift_score || 0;
        const incidentSeverity = envelope.severity_score || 0;

        const driftSensitivity = config.drift_sensitivity_v1 ?? DEFAULT_DRIFT_SENSITIVITY;
        const incidentSensitivity = config.incident_sensitivity_v1 ?? DEFAULT_INCIDENT_SENSITIVITY;

        const effectiveDriftSpan = DRIFT_BRAKE_SPAN / driftSensitivity;
        const effectiveIncidentSpan = INCIDENT_BRAKE_SPAN / incidentSensitivity;

        const driftBrakeLevel = scaledBrake(driftScore, DRIFT_BRAKE_START, effectiveDriftSpan);
        const incidentBrakeLevel = scaledBrake(incidentSeverity, INCIDENT_BRAKE_START, effectiveIncidentSpan);

        const globalBrake = Math.max(driftBrakeLevel, incidentBrakeLevel);

        // Compute effective configuration
        const baseDamping = config.base_damping || DEFAULT_BASE_DAMPING;
        const baseMaxStep = config.base_max_step || DEFAULT_BASE_MAX_STEP;
        const explorationWeight = config.exploration_weight || DEFAULT_EXPLORATION_WEIGHT;
        const exploitationWeight = config.exploitation_weight || DEFAULT_EXPLOITATION_WEIGHT;

        const effectiveDamping = clamp(baseDamping + 0.3 * globalBrake, 0, 1);
        const effectiveMaxStep = baseMaxStep * (1 - 0.5 * globalBrake);
        const effectiveExploration = explorationWeight * (1 - globalBrake);
        const effectiveExploitation = exploitationWeight + explorationWeight * globalBrake;

        // Multi-round loop
        const roundHistory = [];
        const maxRounds = config.max_rounds || DEFAULT_MAX_ROUNDS;
        const convergenceThreshold = config.convergence_threshold || DEFAULT_CONVERGENCE_THRESHOLD;

        let terminationReason = "MAX_ROUNDS";
        let convergenceAchieved = false;

        for (let round = 1; round <= maxRounds; round++) {
            // Check policy guard
            if (checkAllVenuesBlocked(currentPlan.venues, envelope.policy_view_ref_v1)) {
                terminationReason = "ALL_VENUES_BLOCKED";
                break;
            }

            // Build round context
            const roundContext = {
                round_number: round,
                venues: currentPlan.venues.map(v => ({
                    venue_key: v.venue_key,
                    budget: v.round_budget,
                    min_budget: v.min_budget,
                    max_budget: v.max_budget,
                    currency: v.currency,
                    constraint_tightness: v.constraint_tightness,
                    cross_venue_score: v.cross_venue_score
                })),
                config: {
                    damping: effectiveDamping,
                    max_step_fraction: effectiveMaxStep,
                    exploration_weight: effectiveExploration,
                    exploitation_weight: effectiveExploitation
                },
                policy_view_ref_v1: envelope.policy_view_ref_v1,
                drift_score: driftScore,
                incident_severity: incidentSeverity
            };

            // Run roundFn (dependency-injected 35→36→37→38 chain)
            const roundResult = roundFn(roundContext);

            // Refinement 2: Harden RoundFn Contract Enforcement
            if (!roundResult || typeof roundResult !== "object") {
                return createErrorEnvelope("ROUND_FN_ERROR", "Round function returned invalid result");
            }

            if (!roundResult.ok) {
                return createErrorEnvelope("ROUND_FN_ERROR", roundResult.error?.message || "Round function returned error");
            }

            if (!Array.isArray(roundResult.venues)) {
                return createErrorEnvelope("ROUND_FN_ERROR", "Round function must return venues array");
            }

            if (roundResult.venues.length !== currentPlan.venues.length) {
                return createErrorEnvelope(
                    "ROUND_FN_ERROR",
                    "Round function must return the same number of venues as the input plan"
                );
            }

            // Compute deltas
            const venueDeltas = [];
            let globalDeltaSum = 0;
            let oscillatingCount = 0;

            const minStepFraction = config.per_venue_min_step_fraction || DEFAULT_PER_VENUE_MIN_STEP_FRACTION;
            const minStep = minStepFraction * totalBudget;
            const maxStep = effectiveMaxStep * totalBudget;

            for (let i = 0; i < currentPlan.venues.length; i++) {
                const prevVenue = currentPlan.venues[i];
                const newVenue = roundResult.venues.find(v => v.venue_key === prevVenue.venue_key);

                if (!newVenue) {
                    return createErrorEnvelope(
                        "ROUND_FN_ERROR",
                        `Round function did not return venue ${prevVenue.venue_key}`
                    );
                }

                let delta = newVenue.new_budget - prevVenue.round_budget;

                // Detect oscillation
                let isOscillating = false;
                if (round > 1) {
                    const prevRoundDelta = roundHistory[round - 2].venue_deltas
                        .find(vd => vd.venue_key === prevVenue.venue_key)?.delta || 0;

                    const signFlip = (prevRoundDelta > 0 && delta < 0) ||
                        (prevRoundDelta < 0 && delta > 0);
                    const bothSmall = Math.abs(prevRoundDelta) < 0.01 * totalBudget &&
                        Math.abs(delta) < 0.01 * totalBudget;

                    if (signFlip && bothSmall) {
                        isOscillating = true;
                        oscillatingCount++;
                        delta *= 0.5;  // Additional oscillation damping
                    }
                }

                // Apply step limits
                if (Math.abs(delta) > maxStep) {
                    delta = delta > 0 ? maxStep : -maxStep;
                }

                if (Math.abs(delta) < minStep) {
                    // Check if delta resolves a constraint
                    const resolvesConstraint =
                        (prevVenue.round_budget < prevVenue.min_budget && delta > 0) ||
                        (prevVenue.round_budget > prevVenue.max_budget && delta < 0);

                    if (!resolvesConstraint) {
                        delta = 0;
                    }
                }

                // Apply damping
                const appliedDamping = effectiveDamping;
                delta *= (1 - appliedDamping);

                // Apply hard delta bound
                const hardBound = prevVenue.hard_delta_bound;
                if (Math.abs(delta) > hardBound) {
                    delta = delta > 0 ? hardBound : -hardBound;
                }

                // Compute new budget
                let budgetAfter = prevVenue.round_budget + delta;

                // Apply min/max limits
                budgetAfter = clamp(budgetAfter, prevVenue.min_budget, prevVenue.max_budget);

                // Final delta after constraints
                const finalDelta = budgetAfter - prevVenue.round_budget;

                venueDeltas.push({
                    venue_key: prevVenue.venue_key,
                    budget_before: prevVenue.round_budget,
                    budget_after: budgetAfter,
                    delta: finalDelta,
                    is_oscillating: isOscillating,
                    applied_damping: appliedDamping
                });

                globalDeltaSum += Math.abs(finalDelta);

                // Update current plan for next round (preliminary)
                prevVenue.round_budget = budgetAfter;
                prevVenue.cross_venue_score = newVenue.cross_venue_score !== undefined
                    ? newVenue.cross_venue_score
                    : prevVenue.cross_venue_score;
                prevVenue.constraint_tightness = newVenue.constraint_tightness !== undefined
                    ? newVenue.constraint_tightness
                    : prevVenue.constraint_tightness;
            }

            // Enforce budget conservation invariant
            // Independent clamping/damping can break conservation, so we must redistribute the residual
            const currentTotalBudget = currentPlan.venues.reduce((sum, v) => sum + v.round_budget, 0);
            const residual = currentTotalBudget - totalBudget;

            if (Math.abs(residual) > EPSILON) {
                // Distribute residual proportional to absolute delta to minimize distortion
                // If residual > 0, we are over budget, need to decrease budgets
                const sumAbsDeltas = venueDeltas.reduce((sum, vd) => sum + Math.abs(vd.delta), 0);

                if (sumAbsDeltas > EPSILON) {
                    for (let i = 0; i < currentPlan.venues.length; i++) {
                        const venue = currentPlan.venues[i];
                        const vd = venueDeltas.find(d => d.venue_key === venue.venue_key);

                        if (vd) {
                            const share = Math.abs(vd.delta) / sumAbsDeltas;
                            const correction = residual * share;

                            const before = venue.round_budget;
                            let after = before - correction;

                            // Refinement 4: Reapply min/max constraints
                            after = clamp(after, venue.min_budget, venue.max_budget);

                            // Enforce hard delta bound relative to "before"
                            const rawCorrectionDelta = after - before;
                            const hardBound = venue.hard_delta_bound;
                            if (Math.abs(rawCorrectionDelta) > hardBound) {
                                after = before + (rawCorrectionDelta > 0 ? hardBound : -hardBound);
                            }

                            // Commit
                            venue.round_budget = after;

                            // Update delta record
                            vd.budget_after = venue.round_budget;
                            vd.delta = venue.round_budget - vd.budget_before;
                        }
                    }
                } else {
                    // Fallback: distribute evenly if no movement
                    const correction = residual / currentPlan.venues.length;
                    for (let i = 0; i < currentPlan.venues.length; i++) {
                        const venue = currentPlan.venues[i];

                        const before = venue.round_budget;
                        let after = before - correction;

                        // Refinement 5: Prevent Constraint Violations in Even Redistribution Fallback
                        after = clamp(after, venue.min_budget, venue.max_budget);

                        const rawCorrectionDelta = after - before;
                        const hardBound = venue.hard_delta_bound;
                        if (Math.abs(rawCorrectionDelta) > hardBound) {
                            after = before + (rawCorrectionDelta > 0 ? hardBound : -hardBound);
                        }

                        venue.round_budget = after;

                        // Update delta record
                        const vd = venueDeltas.find(d => d.venue_key === venue.venue_key);
                        if (vd) {
                            vd.budget_after = venue.round_budget;
                            vd.delta = venue.round_budget - vd.budget_before;
                        }
                    }
                }

                // Recalculate globalDeltaSum after correction
                globalDeltaSum = venueDeltas.reduce((sum, vd) => sum + Math.abs(vd.delta), 0);
            }

            const globalDelta = globalDeltaSum / totalBudget;

            // Refinement 7: Add Deterministic Sort After Every Round Update
            currentPlan.venues.sort((a, b) => a.venue_key.localeCompare(b.venue_key));

            // Save round snapshot
            roundHistory.push({
                round_number: round,
                round_index: round - 1,
                global_delta: globalDelta,
                global_brake: globalBrake,
                drift_brake_level: driftBrakeLevel,
                incident_brake_level: incidentBrakeLevel,
                oscillating_venue_count: oscillatingCount,
                venue_deltas: venueDeltas
            });

            // Check convergence
            if (globalDelta <= convergenceThreshold) {
                terminationReason = "CONVERGED";
                convergenceAchieved = true;
                break;
            }

            // Check global oscillation
            const oscillatingRatio = oscillatingCount / currentPlan.venues.length;
            if (oscillatingRatio >= 0.5 && globalDelta <= 0.05) {
                terminationReason = "CONVERGED";
                convergenceAchieved = true;
                break;
            }
        }

        // Finalization
        const finalVenuePlan = buildFinalPlan(currentPlan.venues, roundZeroBudgets, roundHistory);

        // Verify budget conservation
        const finalSum = finalVenuePlan.reduce((sum, v) => sum + v.final_budget, 0);
        const startSum = Object.values(roundZeroBudgets).reduce((sum, b) => sum + b, 0);

        // Refinement 6: Harden Final Budget Conservation Check
        // 1. Budget conserved within tolerance
        if (Math.abs(finalSum - startSum) > EPSILON) {
            return createErrorEnvelope(
                "BUDGET_CONSERVATION_FAILED",
                `Budget not conserved: started with ${startSum}, ended with ${finalSum}`
            );
        }

        // 2. Min/max respected
        for (const v of finalVenuePlan) {
            const originalVenue = venues.find(ov => ov.venue_key === v.venue_key);
            if (originalVenue) {
                if (v.final_budget < originalVenue.min_budget - EPSILON ||
                    v.final_budget > originalVenue.max_budget + EPSILON) {
                    return createErrorEnvelope(
                        "BUDGET_CONSERVATION_FAILED",
                        `Final budget violates min/max for ${v.venue_key}`
                    );
                }
            }
        }

        const optimizationSummary = {
            total_rounds: roundHistory.length,
            termination_reason: terminationReason,
            final_global_delta: roundHistory.length > 0
                ? roundHistory[roundHistory.length - 1].global_delta
                : 0,
            total_budget: totalBudget,
            convergence_achieved: convergenceAchieved
        };

        const optimizationState = {
            round_zero_budgets: roundZeroBudgets,
            final_budgets: finalVenuePlan.reduce((acc, v) => {
                acc[v.venue_key] = v.final_budget;
                return acc;
            }, {}),
            brake_config: {
                drift_sensitivity: driftSensitivity,
                incident_sensitivity: incidentSensitivity,
                effective_damping: effectiveDamping,
                effective_max_step: effectiveMaxStep
            }
        };

        const result = {
            final_venue_plan_v1: finalVenuePlan,
            round_history_v1: roundHistory,
            optimization_summary_v1: optimizationSummary,
            optimization_state_v1: optimizationState
        };

        return createSuccessEnvelope(result);

    } catch (err) {
        return createErrorEnvelope(
            "UNEXPECTED_ERROR",
            err.message || "Unexpected error in Phase 39"
        );
    }
}

/**
 * Validate inputs
 */
function validateInputs(envelope) {
    if (!envelope || typeof envelope !== "object") {
        return { ok: false, code: "MALFORMED_INPUT", message: "Envelope must be an object" };
    }

    if (!envelope.round_zero_venues || !Array.isArray(envelope.round_zero_venues)) {
        return { ok: false, code: "MALFORMED_INPUT", message: "round_zero_venues must be an array" };
    }

    if (envelope.round_zero_venues.length === 0) {
        return { ok: false, code: "MALFORMED_INPUT", message: "round_zero_venues cannot be empty" };
    }

    const config = envelope.config || {};
    const venues = envelope.round_zero_venues.map(v => ({
        venue_key: v.venue_key,
        budget: v.budget || 0,
        min_budget: v.min_budget !== undefined ? v.min_budget : 0,
        max_budget: v.max_budget !== undefined ? v.max_budget : Infinity,
        currency: v.currency || "USD",
        hard_delta_bound: v.hard_delta_bound !== undefined ? v.hard_delta_bound : Infinity,
        constraint_tightness: v.constraint_tightness || 0,
        cross_venue_score: v.cross_venue_score || 0.5
    }));

    const totalBudget = venues.reduce((sum, v) => sum + v.budget, 0);

    // Refinement 1: Zero-Budget Handling
    if (totalBudget <= EPSILON) {
        return {
            ok: true,
            data: {
                config,
                venues,
                totalBudget,
                zeroBudget: true
            }
        };
    }

    // Validate config values
    if (config.base_damping !== undefined) {
        if (typeof config.base_damping !== "number" || isNaN(config.base_damping)) {
            return { ok: false, code: "INVALID_CONFIG", message: "base_damping must be a valid number" };
        }
    }

    // Refinement 3: Strengthen Config Validation
    if (config.max_rounds !== undefined) {
        if (!Number.isInteger(config.max_rounds) || config.max_rounds < 1) {
            return { ok: false, code: "INVALID_CONFIG", message: "max_rounds must be an integer >= 1" };
        }
    }

    if (config.convergence_threshold !== undefined) {
        if (typeof config.convergence_threshold !== "number" ||
            isNaN(config.convergence_threshold) ||
            config.convergence_threshold <= 0) {
            return { ok: false, code: "INVALID_CONFIG", message: "convergence_threshold must be > 0" };
        }
    }

    if (config.base_max_step !== undefined) {
        if (typeof config.base_max_step !== "number" ||
            isNaN(config.base_max_step) ||
            config.base_max_step < 0 ||
            config.base_max_step > 1) {
            return { ok: false, code: "INVALID_CONFIG", message: "base_max_step must be in [0, 1]" };
        }
    }

    if (config.per_venue_min_step_fraction !== undefined) {
        if (typeof config.per_venue_min_step_fraction !== "number" ||
            isNaN(config.per_venue_min_step_fraction) ||
            config.per_venue_min_step_fraction < 0 ||
            config.per_venue_min_step_fraction > 1) {
            return { ok: false, code: "INVALID_CONFIG", message: "per_venue_min_step_fraction must be in [0, 1]" };
        }
    }

    if (config.drift_sensitivity_v1 !== undefined) {
        if (typeof config.drift_sensitivity_v1 !== "number" ||
            isNaN(config.drift_sensitivity_v1) ||
            config.drift_sensitivity_v1 <= 0) {
            return { ok: false, code: "INVALID_CONFIG", message: "drift_sensitivity_v1 must be > 0" };
        }
    }

    if (config.incident_sensitivity_v1 !== undefined) {
        if (typeof config.incident_sensitivity_v1 !== "number" ||
            isNaN(config.incident_sensitivity_v1) ||
            config.incident_sensitivity_v1 <= 0) {
            return { ok: false, code: "INVALID_CONFIG", message: "incident_sensitivity_v1 must be > 0" };
        }
    }

    if (config.exploration_weight !== undefined) {
        if (typeof config.exploration_weight !== "number" || isNaN(config.exploration_weight)) {
            return { ok: false, code: "INVALID_CONFIG", message: "exploration_weight must be a valid number" };
        }
    }

    if (config.exploitation_weight !== undefined) {
        if (typeof config.exploitation_weight !== "number" || isNaN(config.exploitation_weight)) {
            return { ok: false, code: "INVALID_CONFIG", message: "exploitation_weight must be a valid number" };
        }
    }

    return {
        ok: true,
        data: { config, venues, totalBudget, zeroBudget: false }
    };
}

/**
 * Check if all venues are policy-blocked
 */
function checkAllVenuesBlocked(venues, policyViewRef) {
    if (!policyViewRef || !policyViewRef.venues) {
        return false;
    }

    const blocked = new Set(
        policyViewRef.venues
            .filter(v => v.blocked_reason)
            .map(v => v.venue_key)
    );

    if (blocked.size === 0) {
        return false;
    }

    return venues.every(v => blocked.has(v.venue_key));
}

/**
 * Build final plan
 */
function buildFinalPlan(venues, roundZeroBudgets, roundHistory) {
    return venues
        .map(v => ({
            venue_key: v.venue_key,
            currency_code: v.currency,
            final_budget: v.round_budget,
            round_zero_budget: roundZeroBudgets[v.venue_key],
            total_delta: v.round_budget - roundZeroBudgets[v.venue_key],
            rounds_active: roundHistory.length,
            final_cross_venue_score: v.cross_venue_score,
            final_constraint_tightness: v.constraint_tightness
        }))
        .sort((a, b) => a.venue_key.localeCompare(b.venue_key));
}

module.exports = {
    runMultiRoundOptimizer,
    // Export internals for testing
    _internal: {
        scaledBrake,
        clamp,
        EPSILON,
        DRIFT_BRAKE_START,
        DRIFT_BRAKE_SPAN,
        INCIDENT_BRAKE_START,
        INCIDENT_BRAKE_SPAN
    }
};
