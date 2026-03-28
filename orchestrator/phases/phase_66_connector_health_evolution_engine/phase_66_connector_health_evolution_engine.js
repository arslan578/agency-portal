/**
 * Phase 66: Connector Health Evolution Engine
 * 
 * Role: State Evolution Layer - "The Physiologist"
 * Purpose: Deterministic health evolution of a single connector between executions.
 * Contract: connector_health_evolution_engine_v1
 * Mode: Pure Logic (No IO, No Randomness, No Timestamps)
 */

module.exports = { execute };

// --- Constants & Enums ---

const HEALTH_TIERS = {
    HEALTHY: 'HEALTHY',
    WARNING: 'WARNING',
    DEGRADED: 'DEGRADED',
    CRITICAL: 'CRITICAL',
    DISABLED: 'DISABLED'
};

const EVOLUTION_VECTORS = {
    RECOVERING: 'RECOVERING',
    DECAYING: 'DECAYING',
    STABLE: 'STABLE',
    PENALIZED: 'PENALIZED'
};

const EXECUTION_RESULTS = {
    SUCCESS: 'SUCCESS',
    HARD_ERROR: 'HARD_ERROR',
    TIMEOUT: 'TIMEOUT',
    SOFT_ERROR: 'SOFT_ERROR'
};

const POLICY_PENALTY_CODES = [
    'POLICY_VIOLATION_BLOCK',
    'CONNECTOR_BANNED',
    'BUDGET_EXHAUSTED_HARD',
    'BUDGET_WARN',
    'TEMPORARY_RATE_LIMIT'
];

// Penalty Priorities: Worst (0) -> Best
const PENALTY_TO_FORCED_TIER = {
    'POLICY_VIOLATION_BLOCK': 'DISABLED',
    'CONNECTOR_BANNED': 'DISABLED',
    'BUDGET_EXHAUSTED_HARD': 'CRITICAL',
    'BUDGET_WARN': 'DEGRADED',
    'TEMPORARY_RATE_LIMIT': 'DEGRADED'
};

// Priority map for comparing tiers (lower number = worse health)
// CANONICAL ORDER: DISABLED < CRITICAL < DEGRADED < WARNING < HEALTHY
const TIER_SEVERITY_RANK = {
    'DISABLED': 0,
    'CRITICAL': 1,
    'DEGRADED': 2,
    'WARNING': 3,
    'HEALTHY': 4
};

const DRIFT_MULTIPLIER = 5.00;

// --- Helper Functions ---

/**
 * Rounds a number to exactly 2 decimal places.
 */
function round2(num) {
    return Math.round(num * 100) / 100;
}

/**
 * Clamps a number between min and max inclusive.
 */
function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
}

/**
 * Maps a continuous score (0.00-100.00) to a discrete health tier.
 * 90-100 -> HEALTHY
 * 75-89.99 -> WARNING
 * 50-74.99 -> DEGRADED
 * 10-49.99 -> CRITICAL
 * 0-9.99 -> DISABLED
 */
function mapScoreToTier(score) {
    if (score >= 90.00) return HEALTH_TIERS.HEALTHY;
    if (score >= 75.00) return HEALTH_TIERS.WARNING;
    if (score >= 50.00) return HEALTH_TIERS.DEGRADED;
    if (score >= 10.00) return HEALTH_TIERS.CRITICAL;
    return HEALTH_TIERS.DISABLED;
}

/**
 * Recursive validation for invalid types.
 */
function isSafeType(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (value instanceof Date) return false;
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return false;
    if (Array.isArray(value)) return value.every(isSafeType);
    if (typeof value === 'object') return Object.values(value).every(isSafeType);
    return false;
}

/**
 * Validates the input strict contract.
 */
function validateInput(input) {
    if (!input || typeof input !== 'object') {
        return { ok: false, status: 'INVALID_INPUT', execution_id: null, phase: '66', feature_flags: {} };
    }

    const {
        phase,
        feature_flags,
        execution_id,
        connector_id,
        previous_profile,
        execution_delta,
        policy_context
    } = input;

    const errorBase = {
        ok: false,
        status: 'INVALID_INPUT',
        execution_id: execution_id || null,
        phase: '66',
        feature_flags: feature_flags || {}
    };

    if (!isSafeType(input)) return errorBase;

    // Phase & Feature Flags
    if (phase !== '66') return errorBase;
    if (!feature_flags || feature_flags.FF_CONNECTOR_HEALTH_EVOLUTION_ENGINE !== true) {
        return { ...errorBase, status: 'FEATURE_DISABLED' };
    }

    // Basic fields
    if (typeof execution_id !== 'string' || execution_id === '') return errorBase;
    if (typeof connector_id !== 'string' || connector_id === '') return errorBase;

    // Previous Profile
    if (!previous_profile || typeof previous_profile !== 'object') return errorBase;
    if (typeof previous_profile.health_score !== 'number' || previous_profile.health_score < 0 || previous_profile.health_score > 100) return errorBase;
    if (!Object.values(HEALTH_TIERS).includes(previous_profile.health_tier)) return errorBase;
    if (previous_profile.consecutive_perfect_runs !== undefined && (typeof previous_profile.consecutive_perfect_runs !== 'number' || previous_profile.consecutive_perfect_runs < 0)) return errorBase;
    if (previous_profile.high_integrity !== undefined && typeof previous_profile.high_integrity !== 'boolean') return errorBase;

    // Execution Delta
    if (!execution_delta || typeof execution_delta !== 'object') return errorBase;
    if (!Object.values(EXECUTION_RESULTS).includes(execution_delta.execution_result)) return errorBase;
    if (execution_delta.latency_ms !== undefined && (typeof execution_delta.latency_ms !== 'number' || execution_delta.latency_ms < 0)) return errorBase;
    if (execution_delta.budget_ms !== undefined && (typeof execution_delta.budget_ms !== 'number' || execution_delta.budget_ms < 0)) return errorBase;
    if (execution_delta.retries_used !== undefined && (typeof execution_delta.retries_used !== 'number' || execution_delta.retries_used < 0)) return errorBase;

    if (execution_delta.drift_markers) {
        if (!Array.isArray(execution_delta.drift_markers)) return errorBase;
        for (const m of execution_delta.drift_markers) {
            if (!m || typeof m !== 'object') return errorBase;
            if (typeof m.code !== 'string' || m.code === '') return errorBase;
            if (typeof m.severity !== 'number' || m.severity < 0) return errorBase;
        }
    }

    // Policy Context
    if (!policy_context || typeof policy_context !== 'object') return errorBase;
    if (!Array.isArray(policy_context.penalties)) return errorBase;
    for (const p of policy_context.penalties) {
        if (!POLICY_PENALTY_CODES.includes(p)) return errorBase;
    }

    return null;
}

// --- Main Logic ---

function execute(input) {
    // 1. Validation
    const valError = validateInput(input);
    if (valError) return valError;

    const {
        previous_profile,
        execution_delta,
        policy_context
    } = input;

    const trace = [];

    // --- Step 1: Base Evolution ---

    const initialScore = previous_profile.health_score;
    let score = initialScore;
    let baseReason = null;

    if (execution_delta.execution_result === EXECUTION_RESULTS.SUCCESS) {

        // Strict Precedence Logic
        const retriesUsed = execution_delta.retries_used || 0;
        // Latency violation only determinable when both latency_ms and budget_ms are defined.
        const latencyViolation = (
            execution_delta.latency_ms !== undefined &&
            execution_delta.budget_ms !== undefined &&
            execution_delta.latency_ms > execution_delta.budget_ms
        );
        const hasPenalties = policy_context.penalties.length > 0;
        const hasDrift = execution_delta.drift_markers && execution_delta.drift_markers.length > 0;

        // 1. If retries_used > 0
        if (retriesUsed > 0) {
            score -= 2.00;
            baseReason = 'RETRY_USED';
        }
        // 2. Else if latency violation
        else if (latencyViolation) {
            score -= 1.00;
            baseReason = 'LATENCY_VIOLATION';
        }
        // 3. Else if clean success (no penalties, no drift)
        else if (!hasPenalties && !hasDrift) {
            score += 1.00;
            baseReason = 'SUCCESS_RECOVERY';
        }
        // 4. Else (SUCCESS but no score change due to penalties/drift or otherwise)
        // baseReason remains null.

    } else if (execution_delta.execution_result === EXECUTION_RESULTS.HARD_ERROR) {
        score -= 15.00;
        baseReason = 'HARD_ERROR';
    } else if (execution_delta.execution_result === EXECUTION_RESULTS.TIMEOUT) {
        score -= 10.00;
        baseReason = 'TIMEOUT';
    } else if (execution_delta.execution_result === EXECUTION_RESULTS.SOFT_ERROR) {
        score -= 2.00;
        baseReason = 'SOFT_ERROR';
    }

    score = clamp(round2(score), 0.00, 100.00);

    if (score !== initialScore) {
        if (!baseReason) {
            throw new Error('INVARIANT: BASE_EVOLUTION emitted without canonical reason');
        }
        trace.push({
            step: 'BASE_EVOLUTION',
            from: round2(initialScore),
            to: round2(score),
            delta: round2(score - initialScore),
            reason: baseReason
        });
    }

    // --- Step 2: Drift Adjustment ---

    const scoreBeforeDrift = score;
    let driftPenalty = 0;
    let totalDriftSeverity = 0;

    if (execution_delta.drift_markers && execution_delta.drift_markers.length > 0) {
        for (const m of execution_delta.drift_markers) {
            driftPenalty += m.severity * DRIFT_MULTIPLIER;
            totalDriftSeverity += m.severity;
        }
    }

    if (driftPenalty > 0) {
        score -= driftPenalty;
        score = clamp(round2(score), 0.00, 100.00);

        trace.push({
            step: 'DRIFT_ADJUSTMENT',
            from: round2(scoreBeforeDrift),
            to: round2(score),
            delta: round2(score - scoreBeforeDrift),
            reason: `DRIFT_SEVERITY_SUM:${totalDriftSeverity}`
        });
    }

    // --- Step 3: Penalty Enforcement (Hard Override) ---

    const calculatedTier = mapScoreToTier(score);
    let forcedTier = null;
    let penaltyCsv = '';

    if (policy_context.penalties.length > 0) {
        let worstRank = 999;
        let worstTier = null;

        const sortedPenalties = [...policy_context.penalties].sort();
        penaltyCsv = sortedPenalties.join(',');

        for (const p of sortedPenalties) {
            const mappedTier = PENALTY_TO_FORCED_TIER[p];
            if (mappedTier) {
                const rank = TIER_SEVERITY_RANK[mappedTier];
                if (rank < worstRank) {
                    worstRank = rank;
                    worstTier = mappedTier;
                }
            }
        }
        forcedTier = worstTier;
    }

    if (forcedTier && forcedTier !== calculatedTier) {
        trace.push({
            step: 'PENALTY_OVERRIDE',
            from: round2(score),
            to: round2(score),
            delta: 0,
            reason: `FORCED_TIER:${forcedTier};PENALTIES:${penaltyCsv}`
        });
    }

    // --- Step 4: Tier Mapping ---

    const finalTier = (forcedTier !== null) ? forcedTier : calculatedTier;

    if (finalTier !== previous_profile.health_tier) {
        trace.push({
            step: 'TIER_MAPPING',
            from: previous_profile.health_tier,
            to: finalTier,
            delta: 0,
            reason: `TIER:${previous_profile.health_tier}->${finalTier}`
        });
    }

    // --- Step 5: Evolution Vector ---

    let evolutionVector;
    if (policy_context.penalties.length > 0) {
        evolutionVector = EVOLUTION_VECTORS.PENALIZED;
    } else if (score > previous_profile.health_score) {
        evolutionVector = EVOLUTION_VECTORS.RECOVERING;
    } else if (score < previous_profile.health_score) {
        evolutionVector = EVOLUTION_VECTORS.DECAYING;
    } else {
        evolutionVector = EVOLUTION_VECTORS.STABLE;
    }

    // --- Step 6: Integrity Streak ---

    const prevStreak = previous_profile.consecutive_perfect_runs || 0;
    let streak = prevStreak;

    const isPerfectRun =
        (score === 100.00) &&
        (execution_delta.execution_result === EXECUTION_RESULTS.SUCCESS) &&
        (policy_context.penalties.length === 0) &&
        (!execution_delta.drift_markers || execution_delta.drift_markers.length === 0);

    if (isPerfectRun) {
        streak = prevStreak + 1;
    } else {
        streak = 0;
    }

    const wasHighIntegrity = previous_profile.high_integrity || false;
    const isHighIntegrity = streak >= 10;

    if (streak !== prevStreak || isHighIntegrity !== wasHighIntegrity) {
        trace.push({
            step: 'INTEGRITY_CHECK',
            from: prevStreak,
            to: streak,
            delta: streak - prevStreak,
            reason: isHighIntegrity ? 'PROMOTED_HIGH_INTEGRITY' : 'NO_HIGH_INTEGRITY'
        });
    }

    return {
        ok: true,
        status: 'OK',
        execution_id: input.execution_id,
        phase: '66',
        feature_flags: input.feature_flags,
        connector_id: input.connector_id,
        health_update: {
            health_score: score,
            health_tier: finalTier,
            evolution_vector: evolutionVector,
            consecutive_perfect_runs: streak,
            high_integrity: isHighIntegrity
        },
        reasoning_trace: trace
    };
}
