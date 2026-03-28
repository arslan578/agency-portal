/**
 * Phase 68: Safety Horizon Recalibration Engine
 * 
 * Role: State Evolution Layer
 * Purpose: Deterministically updates global safety thresholds based on observed drift, violations, and usage.
 * Contract: safety_horizon_recalibration_engine_v1
 * Mode: Pure Logic (No IO, No Randomness, No Timestamps)
 * Refined: Strict Validation, Observability, Logic Constants, Final Hardening
 */

const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

module.exports = { execute };

// --- Constants ---

const PHASE_ID = '68';
const FEATURE_FLAG = 'FF_SAFETY_HORIZON_RECALIBRATION';

// Recalibration Coefficients (Externalizable Policy)
const COEFF_HEALTH_RISK_FACTOR = 0.05; // 5% impact per health point lost
const COEFF_DRIFT_THRESHOLD_FACTOR = 0.1; // 10% threshold reduction per drift severity point
const COEFF_USAGE_FREQ_RISK_BUMP = 0.5; // Risk bump for high frequency usage
const THRESHOLD_USAGE_HIGH_FREQ = 1000; // Calls per window

// Hardening: Explicit Drift Targets
const DRIFT_AFFECTED_THRESHOLDS = new Set(['max_concurrency']);

const REQUIRED_INPUT_KEYS = new Set([
    'execution_id', 'phase', 'feature_flags',
    'prior_safety_horizon'
]);

const OPTIONAL_INPUT_KEYS = new Set([
    'health_evolution', 'capability_drift',
    'violation_history', 'usage_patterns',
    'policy_constraints'
]);

const ALL_VALID_KEYS = new Set([...REQUIRED_INPUT_KEYS, ...OPTIONAL_INPUT_KEYS]);

// --- Helper Functions ---

function isSafeType(value) {
    if (value === null) return true;
    if (value === undefined) return false; // Strict: undefined forbidden in input
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (Array.isArray(value)) return value.every(isSafeType);
    if (typeof value === 'object') return Object.values(value).every(isSafeType);
    return false;
}

function hasForbiddenKeys(obj, path = '') {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
        if (key.startsWith('_debug')) return true; // Forward-Hardening violation
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (hasForbiddenKeys(obj[key], `${path}.${key}`)) return true;
        }
    }
    return false;
}

function validateInput(input) {
    if (!input || typeof input !== 'object') {
        return { ok: false, status: 'ERROR', execution_id: null, recalibrated_safety_horizon: null, reasons: ['Invalid input structure'] };
    }

    // 1. Strict Key Check (Unknown Fields)
    for (const key of Object.keys(input)) {
        if (!ALL_VALID_KEYS.has(key)) {
            return { ok: false, status: 'ERROR', execution_id: input.execution_id || null, recalibrated_safety_horizon: null, reasons: [`Unknown top-level field: ${key}`] };
        }
    }

    // 2. Required Fields
    for (const field of REQUIRED_INPUT_KEYS) {
        if (input[field] === undefined) {
            return { ok: false, status: 'ERROR', execution_id: input.execution_id || null, recalibrated_safety_horizon: null, reasons: [`Missing required field: ${field}`] };
        }
    }

    // 3. Type Safety & Forbidden Values
    if (!isSafeType(input)) {
        return { ok: false, status: 'ERROR', execution_id: input.execution_id, recalibrated_safety_horizon: null, reasons: ['Input contains forbidden types (Undefined, Infinity, etc)'] };
    }

    // 4. Forbidden Prefixes
    if (hasForbiddenKeys(input)) {
        return { ok: false, status: 'ERROR', execution_id: input.execution_id, recalibrated_safety_horizon: null, reasons: ['Input contains forbidden keys starting with _debug'] };
    }

    // 5. Phase & Flag
    if (input.phase !== PHASE_ID) {
        return { ok: false, status: 'ERROR', execution_id: input.execution_id, recalibrated_safety_horizon: null, reasons: [`Invalid phase: expected ${PHASE_ID}, got ${input.phase}`] };
    }

    if (input.feature_flags[FEATURE_FLAG] !== true) {
        return { ok: false, status: 'FEATURE_DISABLED', execution_id: input.execution_id, recalibrated_safety_horizon: null, reasons: [] };
    }

    return null; // Valid
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function round2(num) {
    return Math.round(num * 100) / 100;
}

// --- Core Recalibration Logic ---

function execute(input) {
    const span = tracing.startSpan('PHASE_68_RECALIBRATION', { execution_id: input?.execution_id });

    try {
        // 1. Validation
        const valError = validateInput(input);
        if (valError) {
            span.end();
            return valError;
        }

        // 2. Observability Init
        metrics.increment('phase_68_recalibration_attempt');

        // 3. Immutability
        const ctx = deepClone(input);
        const reasons = [];

        const currentHorizon = ctx.prior_safety_horizon;
        // Defaulting optional inputs to safe empty structures
        const health = ctx.health_evolution || {};
        const drift = ctx.capability_drift || {};
        const violations = ctx.violation_history || {};
        const usage = ctx.usage_patterns || {};
        const policy = ctx.policy_constraints || {};

        // 4. Init Output (Clone)
        const newHorizon = {
            thresholds: { ...currentHorizon.thresholds },
            forbidden_actions: [...(currentHorizon.forbidden_actions || [])],
            risk_score: currentHorizon.risk_score || 0,
            horizon_version: currentHorizon.horizon_version
        };

        let changed = false;

        // 5. Logic: Health Impact on Risk (Health Score -> Risk Score)
        if (health.health_update && typeof health.health_update.health_score === 'number') {
            const healthDelta = 100 - health.health_update.health_score;
            if (healthDelta > 0) {
                // Risk increases by 0.05 per health point lost
                const newScore = round2(currentHorizon.risk_score + (healthDelta * COEFF_HEALTH_RISK_FACTOR));
                if (newScore !== currentHorizon.risk_score) {
                    newHorizon.risk_score = newScore;
                    reasons.push(`Risk score increased due to health drop (-${healthDelta})`);
                    changed = true;
                }
            } else if (health.health_update.health_score === 100 && round2(currentHorizon.risk_score) > 0) {
                // Recovery: linear decrement
                const proposed = Math.max(0, currentHorizon.risk_score - 1.00);
                newHorizon.risk_score = round2(proposed);

                if (newHorizon.risk_score !== currentHorizon.risk_score) {
                    reasons.push('Risk score decreased due to perfect health');
                    changed = true;
                }
            }
        }

        // 6. Logic: Usage Patterns (High Frequency -> Risk Bump)
        if (typeof usage.call_frequency === 'number') {
            if (usage.call_frequency > THRESHOLD_USAGE_HIGH_FREQ) {
                const newScore = round2(newHorizon.risk_score + COEFF_USAGE_FREQ_RISK_BUMP);
                if (newScore !== newHorizon.risk_score) {
                    newHorizon.risk_score = newScore;
                    reasons.push(`Risk score bumped (+${COEFF_USAGE_FREQ_RISK_BUMP}) due to high usage frequency`);
                    changed = true;
                }
            }
        }

        // 7. Logic: Drift -> Threshold Reduction (Targeted)
        if (drift.severity_score && drift.severity_score > 0) {
            for (const key of Object.keys(newHorizon.thresholds)) {
                if (DRIFT_AFFECTED_THRESHOLDS.has(key)) {
                    const original = currentHorizon.thresholds[key];
                    if (typeof original === 'number') {
                        const reduction = Math.floor(original * (drift.severity_score * COEFF_DRIFT_THRESHOLD_FACTOR));
                        if (reduction > 0) {
                            newHorizon.thresholds[key] -= reduction;
                            reasons.push(`Threshold '${key}' reduced from ${original} to ${newHorizon.thresholds[key]} due to drift severity ${drift.severity_score}`);
                            changed = true;
                        }
                    }
                }
            }
        }

        // 8. Logic: Violations -> Forbidden Actions
        if (violations.recent_violations && Array.isArray(violations.recent_violations)) {
            for (const v of violations.recent_violations) {
                if (v.action_type && !newHorizon.forbidden_actions.includes(v.action_type)) {
                    newHorizon.forbidden_actions.push(v.action_type);
                    reasons.push(`Action '${v.action_type}' forbidden due to recent violation`);
                    changed = true;
                }
            }
        }

        // 9. Policy Supremacy
        if (policy.max_risk_score !== undefined && newHorizon.risk_score > policy.max_risk_score) {
            const originalCalculated = newHorizon.risk_score;
            newHorizon.risk_score = policy.max_risk_score;

            if (newHorizon.risk_score !== currentHorizon.risk_score) {
                reasons.push(`Risk score capped at ${policy.max_risk_score} by policy`);
                changed = true;
            }
        }

        if (policy.absolute_forbidden_actions && Array.isArray(policy.absolute_forbidden_actions)) {
            for (const action of policy.absolute_forbidden_actions) {
                if (!newHorizon.forbidden_actions.includes(action)) {
                    newHorizon.forbidden_actions.push(action);
                    reasons.push(`Action '${action}' forbidden by policy mandate`);
                    changed = true;
                }
            }
        }

        // 10. Sorting & Versioning
        // Sort both for consistent state comparison
        newHorizon.forbidden_actions.sort();
        const priorSortedActions = [...(currentHorizon.forbidden_actions || [])].sort();

        // Final Diff Check: Ensure 'changed' reflects actual net state change
        const isActuallyChanged = (
            newHorizon.risk_score !== currentHorizon.risk_score ||
            JSON.stringify(newHorizon.thresholds) !== JSON.stringify(currentHorizon.thresholds) ||
            JSON.stringify(newHorizon.forbidden_actions) !== JSON.stringify(priorSortedActions)
        );

        // Only increment version if actually changed
        if (isActuallyChanged) {
            // Versioning: vX -> v(X+1)
            const verMatch = newHorizon.horizon_version.match(/^v(\d+)$/);
            if (verMatch) {
                const num = parseInt(verMatch[1], 10) + 1;
                newHorizon.horizon_version = `v${num}`;
            } else {
                newHorizon.horizon_version = `${newHorizon.horizon_version}.1`;
            }
        }

        const status = isActuallyChanged ? 'RECALIBRATED' : 'NO_CHANGE';

        logStructured('PHASE_68_COMPLETE', {
            execution_id: input.execution_id,
            status: status,
            risk_score: newHorizon.risk_score,
            blocked_action_count: newHorizon.forbidden_actions.length
        });

        metrics.gauge('phase_68_risk_score', newHorizon.risk_score);

        span.end();

        return {
            ok: true,
            status: status,
            execution_id: input.execution_id,
            recalibrated_safety_horizon: newHorizon,
            reasons: reasons
        };

    } catch (e) {
        span.end();
        return {
            ok: false,
            status: 'ERROR',
            execution_id: input?.execution_id || null,
            recalibrated_safety_horizon: null,
            reasons: [`Internal Exception: ${e.message}`]
        };
    }
}
