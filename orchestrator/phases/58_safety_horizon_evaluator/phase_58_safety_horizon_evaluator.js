const { logStructured } = require('../../shared/logging');
const { metrics } = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

const FEATURE_FLAG = 'FF_SAFETY_HORIZON_EVALUATOR';
const UPPER_SAFETY_BOUND = 5.0;

// --- Helper Functions ---

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const cloned = {};
    for (const key of Object.keys(obj)) {
        cloned[key] = deepClone(obj[key]);
    }
    return cloned;
}

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

function calculateRisk(connectorData) {
    // 1. Base Risk
    let risk = connectorData.capabilities?.integrity_score || 0.0;

    // 2. Retry Exhaustion (Override)
    if (connectorData.retry_history?.exhausted) {
        return 10.0; // High risk
    }

    // 3. Drift Multiplier
    const driftMarkers = connectorData.drift_markers || [];
    let driftMultiplier = 1.0;
    // Simplified drift logic based on markers presence/severity
    // Assuming markers have a 'severity' field or we count them.
    // Prompt says: 1.0, 1.2, 1.5 based on severity.
    // Let's assume if any marker is MAJOR -> 1.5, else if any -> 1.2, else 1.0
    const hasMajor = driftMarkers.some(m => m.severity === 'MAJOR');
    const hasMinor = driftMarkers.length > 0;

    if (hasMajor) driftMultiplier = 1.5;
    else if (hasMinor) driftMultiplier = 1.2;

    risk *= driftMultiplier;

    // 4. Failure Pattern Multiplier
    const failureCount = (connectorData.failure_patterns || []).length;
    const failureMultiplier = 1.0 + (0.1 * failureCount);

    risk *= failureMultiplier;

    return parseFloat(risk.toFixed(2));
}

function determineSafetyZone(risk, state, driftMarkers, retryHistory) {
    // EMERGENCY_ONLY: Retry exhausted and Error state
    if (retryHistory?.exhausted === true && state === 'ERROR') {
        return 'EMERGENCY_ONLY';
    }

    // UNSAFE: Risk >= 5.0, Error state, or major drift
    const hasMajorDrift = (driftMarkers || []).some(m => m.severity === 'MAJOR');
    if (risk >= UPPER_SAFETY_BOUND || state === 'ERROR' || hasMajorDrift) {
        return 'UNSAFE';
    }
    // DEGRADED: Risk < 5.0, Degraded state or minor drift
    const hasMinorDrift = (driftMarkers || []).length > 0;
    if (state === 'DEGRADED' || hasMinorDrift) {
        return 'DEGRADED';
    }
    // STABLE: Risk < 2.0, Healthy
    if (state === 'HEALTHY') {
        return 'STABLE';
    }
    // Fallback
    return 'DEGRADED';
}

function isActionForbidden(connectorId, connectorData, risk) {
    // Risk > Bound
    if (risk > UPPER_SAFETY_BOUND) return true;

    // Capability allows_execution = false
    if (connectorData.capabilities?.allows_execution === false) return true;

    // Retry exhausted
    if (connectorData.retry_history?.exhausted) return true;

    // Unrecoverable drift
    const driftMarkers = connectorData.drift_markers || [];
    if (driftMarkers.some(m => m.classification === 'UNRECOVERABLE')) return true;

    // Offline or Error
    if (connectorData.state === 'OFFLINE' || connectorData.state === 'ERROR') return true;

    return false;
}

function calculateHorizon(zones) {
    let horizon = 10;
    const degradedCount = Object.values(zones).filter(z => z === 'DEGRADED').length;
    const unsafeCount = Object.values(zones).filter(z => z === 'UNSAFE').length;

    horizon -= degradedCount * 1;
    horizon -= unsafeCount * 5;

    return Math.max(0, horizon);
}

const ALLOWED_TOP_LEVEL_FIELDS = [
    'execution_id',
    'phase',
    'status',
    'feature_flag_enabled',
    'safety_zone',
    'safe_execution_horizon',
    'redundancy_profile',
    'forbidden_actions',
    'risk_ledger',
    'snapshot'
];

function enforceTopLevelWhitelist(obj) {
    const cleaned = {};
    for (const key of ALLOWED_TOP_LEVEL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cleaned[key] = obj[key];
        }
    }
    return cleaned;
}

const ALLOWED_INPUT_FIELDS = [
    'execution_id',
    'phase',
    'feature_flags',
    'merged_connector_state'
];

// --- Main Execute Function ---

function execute(input) {
    const clonedInput = deepClone(input);
    const span = tracing.startSpan('phase_58_horizon_evaluator');
    const executionId = clonedInput?.execution_id || 'unknown';

    try {
        // 1. Input Whitelist Enforcement
        for (const key of Object.keys(clonedInput)) {
            if (!ALLOWED_INPUT_FIELDS.includes(key)) {
                return enforceTopLevelWhitelist({
                    execution_id: executionId,
                    phase: '58',
                    status: 'INVALID_INPUT',
                    feature_flag_enabled: false, // Defaulting to false for invalid input structure
                    safety_zone: {},
                    safe_execution_horizon: 0,
                    redundancy_profile: {},
                    forbidden_actions: [],
                    risk_ledger: {},
                    snapshot: {}
                });
            }
        }

        // 2. Feature Flag Check (Env Var + Envelope)
        const ffEnabled = process.env[FEATURE_FLAG] === 'true' && !!clonedInput?.feature_flags?.[FEATURE_FLAG];

        if (!ffEnabled) {
            return enforceTopLevelWhitelist({
                execution_id: executionId,
                phase: '58',
                status: 'FEATURE_DISABLED',
                feature_flag_enabled: false,
                safety_zone: {},
                safe_execution_horizon: 0,
                redundancy_profile: {},
                forbidden_actions: [],
                risk_ledger: {},
                snapshot: {}
            });
        }

        // 3. Input Validation (Required Fields)
        if (!clonedInput.merged_connector_state) {
            return enforceTopLevelWhitelist({
                execution_id: executionId,
                phase: '58',
                status: 'INVALID_INPUT',
                feature_flag_enabled: true,
                safety_zone: {},
                safe_execution_horizon: 0,
                redundancy_profile: {},
                forbidden_actions: [],
                risk_ledger: {},
                snapshot: {}
            });
        }

        const safetyZone = {};
        const riskLedger = {};
        const redundancyProfile = {};
        const forbiddenActions = [];
        let maxRisk = 0.0;

        const connectorState = clonedInput.merged_connector_state;
        const sortedConnectorIds = Object.keys(connectorState).sort();

        // 4. Redundancy Grouping (Pass 1)
        const groupToConnectors = {};
        for (const id of sortedConnectorIds) {
            const group = connectorState[id]?.capabilities?.shared_group || null;
            if (!group) continue;
            if (!groupToConnectors[group]) groupToConnectors[group] = [];
            groupToConnectors[group].push(id);
        }

        // 5. Processing Loop
        for (const connectorId of sortedConnectorIds) {
            const data = connectorState[connectorId];

            // Capabilities presence check (strict)
            if (!data.capabilities || typeof data.capabilities !== 'object') {
                return enforceTopLevelWhitelist({
                    execution_id: executionId,
                    phase: '58',
                    status: 'INVALID_INPUT',
                    feature_flag_enabled: true,
                    safety_zone: {},
                    safe_execution_horizon: 0,
                    redundancy_profile: {},
                    forbidden_actions: [],
                    risk_ledger: {},
                    snapshot: {}
                });
            }

            // Risk
            const risk = calculateRisk(data);
            riskLedger[connectorId] = risk;
            if (risk > maxRisk) maxRisk = risk;

            // Safety Zone
            const zone = determineSafetyZone(risk, data.state, data.drift_markers, data.retry_history);
            safetyZone[connectorId] = zone;

            // Forbidden Actions
            if (isActionForbidden(connectorId, data, risk)) {
                forbiddenActions.push(connectorId);
            }

            // Redundancy (Pass 2)
            const group = data.capabilities?.shared_group || null;
            if (!group || !groupToConnectors[group] || groupToConnectors[group].length <= 1) {
                redundancyProfile[connectorId] = {
                    redundancy_level: 'none',
                    substitutes: []
                };
            } else {
                const substitutes = groupToConnectors[group].filter(id => id !== connectorId).sort();
                const size = groupToConnectors[group].length;
                let level = 'none';
                if (size === 2) level = 'low';
                else if (size === 3 || size === 4) level = 'moderate';
                else if (size >= 5) level = 'high';

                redundancyProfile[connectorId] = {
                    redundancy_level: level,
                    substitutes: substitutes
                };
            }
        }

        // 6. Horizon
        const horizon = calculateHorizon(safetyZone);

        // 7. Observability
        metrics.count('phase_58.invoked', 1);
        metrics.gauge('phase_58.risk_max', maxRisk);
        logStructured('phase_58_safety_horizon_evaluator', {
            execution_id: executionId,
            phase: '58',
            safety_zone: safetyZone,
            max_risk: maxRisk,
            safe_execution_horizon: horizon,
            forbidden_count: forbiddenActions.length
        });

        // 8. Snapshot
        const snapshot = {
            safety_zone: safetyZone,
            risk_ledger: riskLedger,
            forbidden_actions: forbiddenActions.sort(),
            redundancy_profile: redundancyProfile,
            safe_execution_horizon: horizon
        };

        // 9. Output Construction
        return enforceTopLevelWhitelist({
            execution_id: executionId,
            phase: '58',
            status: 'OK',
            feature_flag_enabled: true,
            safety_zone: safetyZone,
            safe_execution_horizon: horizon,
            redundancy_profile: redundancyProfile,
            forbidden_actions: forbiddenActions.sort(),
            risk_ledger: riskLedger,
            snapshot: sortObjectKeys(snapshot)
        });

    } catch (e) {
        return enforceTopLevelWhitelist({
            execution_id: executionId,
            phase: '58',
            status: 'INVALID_INPUT', // Or internal error, but prompt says INVALID_INPUT for malformed
            feature_flag_enabled: true,
            safety_zone: {},
            safe_execution_horizon: 0,
            redundancy_profile: {},
            forbidden_actions: [],
            risk_ledger: {},
            snapshot: {}
        });
    } finally {
        span.end();
    }
}

module.exports = { execute };
