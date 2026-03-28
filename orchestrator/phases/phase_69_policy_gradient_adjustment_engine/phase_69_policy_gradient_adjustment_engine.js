/**
 * Phase 69: Policy Gradient Adjustment Engine
 * 
 * Role: Policy Adaptation Layer
 * Purpose: Deterministically adjusts policy coefficients based on safety signals (Risk, Drift, Violations).
 * Contract: phase_69_policy_gradient_adjustment_engine_v1
 * Mode: Pure Logic (No IO, No Randomness, No Timestamps)
 * Status: Tightened (No Hardcoded Knowledge, Explicit Signal Resolution)
 */

const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

module.exports = { execute };

// --- Constants ---

const PHASE_ID = '69';
const FEATURE_FLAG = 'FF_POLICY_GRADIENT_ADJUSTMENT';
const MAX_STEP_SIZE = 0.2; // Hard clamp for gradient steps
const MIN_STEP_SIZE = -0.2;

const REQUIRED_INPUT_KEYS = new Set([
    'execution_id', 'phase', 'feature_flags',
    'safety_horizon', 'policy_coefficients',
    'violation_history', 'drift_indicators'
]);

const OPTIONAL_INPUT_KEYS = new Set([
    'policy_gradient_profile'
]);

const ALL_VALID_KEYS = new Set([...REQUIRED_INPUT_KEYS, ...OPTIONAL_INPUT_KEYS]);

// --- Helper Functions ---

function isSafeType(value) {
    if (value === null) return true;
    if (value === undefined) return false; // Strict
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (Array.isArray(value)) return value.every(isSafeType);
    if (typeof value === 'object') return Object.values(value).every(isSafeType);
    return false; // Functions, Symbols, etc.
}

function hasForbiddenKeys(obj, path = '') {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
        if (key.startsWith('_debug')) return true;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (hasForbiddenKeys(obj[key], `${path}.${key}`)) return true;
        }
    }
    return false;
}

function resolveGradientFactors(profile) {
    const safeNumber = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
    if (!profile || typeof profile !== 'object') {
        return {
            risk_to_weight: 0,
            drift_to_weight: 0,
            violation_to_weight: 0
        };
    }
    return {
        risk_to_weight: safeNumber(profile.risk_to_weight),
        drift_to_weight: safeNumber(profile.drift_to_weight),
        violation_to_weight: safeNumber(profile.violation_to_weight)
    };
}

function validateInput(input) {
    if (!input || typeof input !== 'object') {
        return { ok: false, error: 'Invalid input structure' };
    }

    // 1. Strict Key Check
    for (const key of Object.keys(input)) {
        if (!ALL_VALID_KEYS.has(key)) {
            return { ok: false, error: `Unknown top-level field: ${key}` };
        }
    }

    // 2. Required Fields
    for (const field of REQUIRED_INPUT_KEYS) {
        if (input[field] === undefined) {
            return { ok: false, error: `Missing required field: ${field}` };
        }
    }

    // 3. Type Safety
    if (!isSafeType(input)) {
        return { ok: false, error: 'Input contains forbidden types (Undefined, Infinity, Function)' };
    }

    // 4. Forbidden Prefixes
    if (hasForbiddenKeys(input)) {
        return { ok: false, error: 'Input contains forbidden keys starting with _debug' };
    }

    // 5. Phase & Flag
    if (input.phase !== PHASE_ID) {
        return { ok: false, error: `Invalid phase: expected ${PHASE_ID}, got ${input.phase}` };
    }

    if (input.feature_flags[FEATURE_FLAG] !== true) {
        return { ok: false, status: 'FEATURE_DISABLED' }; // Not an error, just disabled
    }

    return null; // Valid
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

function round4(num) {
    return Math.round(num * 10000) / 10000;
}

// --- Core Logic ---

function execute(input) {
    const span = tracing.startSpan('phase_69_policy_gradient_adjustment', { execution_id: input?.execution_id });

    try {
        // 1. Validation
        const valResult = validateInput(input);
        if (valResult) {
            span.end();
            if (valResult.error) {
                return {
                    execution_id: input?.execution_id || null,
                    phase: PHASE_ID,
                    ok: false,
                    error: valResult.error
                };
            }
            // Feature Disabled
            return {
                execution_id: input.execution_id,
                phase: PHASE_ID,
                ok: false,
                status: 'FEATURE_DISABLED'
            };
        }

        // 2. Observability Init

        // 3. Immutability
        const ctx = deepClone(input);

        const horizon = ctx.safety_horizon;
        const violations = ctx.violation_history;
        const drift = ctx.drift_indicators;
        const coeffs = ctx.policy_coefficients;

        // Resolve Profile
        const { risk_to_weight, drift_to_weight, violation_to_weight } = resolveGradientFactors(ctx.policy_gradient_profile);

        // 4. Calculate Raw Gradients
        const proposedDeltas = {};

        // A. Violation Signal -> violation_penalty_weight
        // Logic: Sum of array lengths
        let violationSignal = 0;

        if (Array.isArray(violations)) {
            violationSignal += violations.length;
        } else if (violations && typeof violations === 'object') {
            // Handle nested structure if present, OR if violation_history IS the object (standard)
            // Spec says: "violation_history as an array... OR violation_history.recent_violations as an array"
            // But deepClone(input) -> ctx. 
            // ctx.violation_history IS the input field.
            // If input.violation_history is array: handled.
            // If input.violation_history is object: Check recent_violations.
            if (Array.isArray(violations.recent_violations)) {
                violationSignal += violations.recent_violations.length;
            }
        }

        if (violationSignal > 0) {
            proposedDeltas['violation_penalty_weight'] = (proposedDeltas['violation_penalty_weight'] || 0) + (violationSignal * violation_to_weight);
        }

        // B. Risk Signal -> risk_penalty_weight
        const riskSignal = horizon.risk_score || 0;
        if (riskSignal !== 0) {
            proposedDeltas['risk_penalty_weight'] = (proposedDeltas['risk_penalty_weight'] || 0) + (riskSignal * risk_to_weight);
        }

        // C. Drift Signal -> connector_drift_weight
        // Logic: Sum of numeric total_drift + severity_score
        let driftSignal = 0;
        if (typeof drift.total_drift === 'number' && Number.isFinite(drift.total_drift)) {
            driftSignal += drift.total_drift;
        }
        if (typeof drift.severity_score === 'number' && Number.isFinite(drift.severity_score)) {
            driftSignal += drift.severity_score;
        }

        if (driftSignal !== 0) {
            proposedDeltas['connector_drift_weight'] = (proposedDeltas['connector_drift_weight'] || 0) + (driftSignal * drift_to_weight);
        }

        // 5. Apply Clamping & Update
        const updatedCoeffs = { ...coeffs };
        const gradientApplied = {};
        const clampEvents = [];
        let totalGradientMagnitude = 0;

        // Iterate over proposed deltas
        for (const [key, rawDelta] of Object.entries(proposedDeltas)) {
            const clampedDelta = clamp(rawDelta, MIN_STEP_SIZE, MAX_STEP_SIZE);

            if (clampedDelta !== rawDelta) {
                clampEvents.push(key);
                metrics.increment('phase_69_clamp_event');
            }

            if (clampedDelta !== 0) {
                updatedCoeffs[key] = round4((updatedCoeffs[key] || 0) + clampedDelta);
                gradientApplied[key] = round4(clampedDelta);
                totalGradientMagnitude += Math.abs(clampedDelta);
            }
        }

        // 6. Sort Output Keys (Determinism)
        const sortedUpdatedCoeffs = {};
        Object.keys(updatedCoeffs).sort().forEach(key => {
            sortedUpdatedCoeffs[key] = updatedCoeffs[key];
        });

        const sortedGradientApplied = {};
        Object.keys(gradientApplied).sort().forEach(key => {
            sortedGradientApplied[key] = gradientApplied[key];
        });

        // 7. Observability Finalization
        if (totalGradientMagnitude > 0) {
            metrics.increment('phase_69_gradient_applied');
        } else {
            metrics.increment('phase_69_noop');
        }

        logStructured('PHASE_69_COMPLETE', {
            execution_id: input.execution_id,
            gradient_magnitude: round4(totalGradientMagnitude),
            clamp_count: clampEvents.length
        });

        span.end();

        return {
            execution_id: input.execution_id,
            phase: PHASE_ID,
            ok: true,
            policy_coefficients_updated: sortedUpdatedCoeffs,
            gradient_applied: sortedGradientApplied,
            clamp_events: clampEvents.sort()
        };

    } catch (e) {
        span.end();
        return {
            execution_id: input?.execution_id || null,
            phase: PHASE_ID,
            ok: false,
            error: `Internal Exception: ${e.message}`
        };
    }
}
