/**
 * Phase 41: Optimization Loop Profiling Engine
 *
 * Deterministic measurement layer that consumes optimization traces
 * and produces OptimizationProfileV1 telemetry.
 *
 * Input Contract: input_contract_v1
 * Output Contract: output_contract_v1
 */

/**
 * Generates an optimization profile from a trace.
 * @param {object} input - Input containing optimization_trace and metadata
 * @returns {object} OptimizationProfileV1 or error response
 */
function generateOptimizationProfile(input = {}) {
    // Feature flag check
    const FF_OPTIMIZATION_PROFILE_V1 = process.env.FF_OPTIMIZATION_PROFILE_V1 === 'true';

    if (!FF_OPTIMIZATION_PROFILE_V1) {
        return {
            ok: true,
            profile: {},
            diagnostics: { feature_disabled: 'FF_OPTIMIZATION_PROFILE_V1' }
        };
    }

    // Input validation
    const {
        optimization_trace,
        initial_budgets,
        final_budgets,
        diagnostics: inputDiagnostics,
        config
    } = input;

    // Validate optimization_trace
    if (!optimization_trace || !Array.isArray(optimization_trace)) {
        return {
            ok: false,
            code: 'INVALID_INPUT',
            message: 'optimization_trace must be a non-empty array',
            diagnostics: { input_validation: 'missing_or_invalid_trace' }
        };
    }

    if (optimization_trace.length === 0) {
        return {
            ok: false,
            code: 'INVALID_INPUT',
            message: 'optimization_trace cannot be empty',
            diagnostics: { input_validation: 'empty_trace' }
        };
    }

    // Validate trace structure
    for (let i = 0; i < optimization_trace.length; i++) {
        const round = optimization_trace[i];
        if (!round || typeof round !== 'object') {
            return {
                ok: false,
                code: 'MALFORMED_TRACE',
                message: `Round ${i} is not an object`,
                diagnostics: { round_index: i }
            };
        }
        if (typeof round.round_index !== 'number') {
            return {
                ok: false,
                code: 'MALFORMED_TRACE',
                message: `Round ${i} missing round_index`,
                diagnostics: { round_index: i }
            };
        }
    }

    try {
        const profile = buildProfile(optimization_trace, initial_budgets, final_budgets, inputDiagnostics);

        return {
            ok: true,
            profile,
            diagnostics: { rounds_profiled: optimization_trace.length }
        };
    } catch (err) {
        return {
            ok: false,
            code: 'PROFILING_ERROR',
            message: err.message || 'Unexpected error during profiling',
            diagnostics: { error: String(err) }
        };
    }
}

/**
 * Builds the complete optimization profile.
 */
function buildProfile(trace, initialBudgets, finalBudgets, inputDiagnostics) {
    const perRound = buildPerRoundMetrics(trace);
    const convergenceScore = calculateConvergenceScore(perRound);
    const driftSensitivity = calculateDriftSensitivity(perRound);
    const oscillationFlag = detectOscillation(trace, perRound);
    const brakeEvents = extractBrakeEvents(trace);
    const stabilityTag = classifyStability(oscillationFlag, convergenceScore);
    const terminationReason = extractTerminationReason(inputDiagnostics);

    return {
        per_round: perRound,
        convergence_score: convergenceScore,
        drift_sensitivity: driftSensitivity,
        oscillation_flag: oscillationFlag,
        brake_events: brakeEvents,
        stability_tag: stabilityTag,
        termination_reason: terminationReason
    };
}

/**
 * 5.1 Per-Round Delta Vector
 */
function buildPerRoundMetrics(trace) {
    const perRound = [];
    let prevDeltaByVenue = {};

    for (const round of trace) {
        const deltaByVenue = round.delta_by_venue || {};

        // Calculate absolute delta (sum of absolute values)
        let absoluteDelta = 0;
        for (const venue in deltaByVenue) {
            const delta = deltaByVenue[venue];
            if (typeof delta === 'number' && !isNaN(delta)) {
                absoluteDelta += Math.abs(delta);
            }
        }

        // Detect oscillation (sign flip from previous round)
        let oscillationDetected = false;
        if (Object.keys(prevDeltaByVenue).length > 0) {
            for (const venue in deltaByVenue) {
                const currentDelta = deltaByVenue[venue];
                const prevDelta = prevDeltaByVenue[venue];

                if (prevDelta !== undefined &&
                    typeof currentDelta === 'number' &&
                    typeof prevDelta === 'number' &&
                    !isNaN(currentDelta) && !isNaN(prevDelta)) {
                    // Sign flip: (prev > 0 and current < 0) or (prev < 0 and current > 0)
                    if ((prevDelta > 0 && currentDelta < 0) || (prevDelta < 0 && currentDelta > 0)) {
                        oscillationDetected = true;
                        break;
                    }
                }
            }
        }

        perRound.push({
            round_index: round.round_index,
            absolute_delta: absoluteDelta,
            per_venue_delta: { ...deltaByVenue },
            global_delta: round.global_delta || 0,
            brake_events: Array.isArray(round.brakes) ? [...round.brakes] : [],
            oscillation_detected: oscillationDetected
        });

        prevDeltaByVenue = { ...deltaByVenue };
    }

    return perRound;
}

/**
 * 5.2 Convergence Score
 * convergence_score = 1 - (mean_absolute_delta_final / mean_absolute_delta_initial)
 * Clamped to [-1, 1]
 */
function calculateConvergenceScore(perRound) {
    if (perRound.length === 0) return 0;
    if (perRound.length === 1) return 0;

    const firstRound = perRound[0];
    const lastRound = perRound[perRound.length - 1];

    const initialDelta = firstRound.absolute_delta;
    const finalDelta = lastRound.absolute_delta;

    if (initialDelta === 0) {
        return finalDelta === 0 ? 1 : -1;
    }

    const score = 1 - (finalDelta / initialDelta);
    return Math.max(-1, Math.min(1, score));
}

/**
 * 5.3 Drift Sensitivity Index
 * drift_sensitivity = (variance of absolute_delta) / (mean of absolute_delta + epsilon)
 */
function calculateDriftSensitivity(perRound) {
    if (perRound.length === 0) return 0;

    const deltas = perRound.map(r => r.absolute_delta);
    const mean = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

    const variance = deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length;

    const epsilon = 1e-10;
    return variance / (mean + epsilon);
}

/**
 * 5.4 Oscillation Flag
 * Set to true if:
 * - ≥ 2 rounds show oscillation_detected = true
 * OR
 * - global_delta exhibits two or more sign-oscillations
 */
function detectOscillation(trace, perRound) {
    // Check per-round oscillation detection
    const oscillatingRounds = perRound.filter(r => r.oscillation_detected).length;
    if (oscillatingRounds >= 2) return true;

    // Check global_delta sign oscillations
    let signFlips = 0;
    for (let i = 1; i < trace.length; i++) {
        const prevGlobalDelta = trace[i - 1].global_delta || 0;
        const currGlobalDelta = trace[i].global_delta || 0;

        if ((prevGlobalDelta > 0 && currGlobalDelta < 0) ||
            (prevGlobalDelta < 0 && currGlobalDelta > 0)) {
            signFlips++;
        }
    }

    return signFlips >= 2;
}

/**
 * 5.5 Brake Event Log
 * Flatten all brakes from all rounds, sorted deterministically
 */
function extractBrakeEvents(trace) {
    const events = [];

    for (const round of trace) {
        if (Array.isArray(round.brakes)) {
            for (const brake of round.brakes) {
                events.push({
                    round_index: round.round_index,
                    brake: String(brake)
                });
            }
        }
    }

    // Sort deterministically by round_index, then by brake name
    events.sort((a, b) => {
        if (a.round_index !== b.round_index) {
            return a.round_index - b.round_index;
        }
        return a.brake.localeCompare(b.brake);
    });

    return events;
}

/**
 * 5.6 Stability Tag
 */
function classifyStability(oscillationFlag, convergenceScore) {
    if (oscillationFlag && convergenceScore < 0) {
        return 'UNSTABLE';
    } else if (oscillationFlag && convergenceScore >= 0) {
        return 'OSCILLATORY';
    } else if (!oscillationFlag && convergenceScore < 0.5) {
        return 'DAMPED';
    } else {
        return 'STABLE';
    }
}

/**
 * 5.7 Termination Reason
 * Normalize to permitted values only
 */
function extractTerminationReason(diagnostics) {
    const permitted = [
        'CONVERGED',
        'MAX_ROUNDS',
        'BRAKE_TRIGGERED',
        'OSCILLATION_DAMP',
        'PLATEAU',
        'INFEASIBLE',
        'UNKNOWN'
    ];

    if (!diagnostics || typeof diagnostics !== 'object') {
        return 'UNKNOWN';
    }

    const reason = diagnostics.termination_reason || diagnostics.exit_reason || 'UNKNOWN';
    const normalized = String(reason).toUpperCase().replace(/[^A-Z_]/g, '_');

    return permitted.includes(normalized) ? normalized : 'UNKNOWN';
}

module.exports = {
    generateOptimizationProfile
};
