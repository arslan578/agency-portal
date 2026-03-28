/**
 * Phase 73: Long-Horizon Rate Limit Forecaster
 *
 * Purpose:
 * Project long-term rate-limit consumption based on historical ledgers, arbitration output,
 * and knowledge maps. It produces adjusted envelope ceilings and risk classification
 * without side effects.
 */

const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

/**
 * Main Entry Point
 * @param {object} input - Phase 73 Input Contract
 * @returns {object} Phase 73 Output Contract
 */
function output_contract(input) {
    const span = tracing.startSpan('phase_73_long_horizon_rate_limit_forecaster');
    try {
        // 1. Validation & Hygiene
        validateInput(input);

        // 2. Feature Flag Check
        if (!input.feature_flags.FF_LONG_HORIZON_RATE_LIMIT_FORECASTER) {
            const passthrough = createPassthrough(input);
            emitObservability(input, passthrough, { featureFlagDisabled: true });
            return hardenOutput(passthrough);
        }

        // 3. Core Logic
        const forecast = generateForecast(input);

        // 4. Construct Output
        const output = {
            execution_id: input.execution_id,
            phase: "73",
            feature_flags: input.feature_flags,
            rate_limit_forecast: forecast,
            passthrough: {
                arbitration_output: input.arbitration_output
            }
        };

        // 5. Final Harden
        emitObservability(input, output, { featureFlagDisabled: false });
        return hardenOutput(output);
    } finally {
        if (span && typeof span.end === 'function') span.end();
    }
}

// ------------------------------------------------------------------
// Core Logic
// ------------------------------------------------------------------

function generateForecast(input) {
    const knowledge = input.knowledge_maps.rate_limits;
    const horizon = knowledge.forecast_horizon;
    const futureDecayBase = knowledge.future_window_decay_base;
    const confDecayBase = knowledge.confidence_decay_base;
    const defaultAgentCeiling = knowledge.agent_default_ceiling;

    // 1. Forecast Consumption per Connector
    const connectorForecasts = forecastConnectors(
        input.rate_limit_ledger,
        knowledge.decay_curves,
        input.connector_profiles
    );

    // 2. Adjust for Arbitration
    const arbitrationOffsets = extractArbitrationOffsets(input.arbitration_output);

    // 3. Calculate Projected Ceilings
    const projected_connector_ceiling = {};
    const projected_agent_ceiling = {};
    const projected_tenant_ceiling = {};

    // Connectors
    const connectorids = Object.keys(input.connector_profiles || {}).sort();
    for (const cid of connectorids) {
        const base = input.connector_profiles[cid].max_rate_per_window || 0;
        const projected = connectorForecasts[cid] || 0;
        const offset = arbitrationOffsets.connectors[cid] || 0;

        // new_ceiling = max(0, base_ceiling - projected_consumption + arbitration_offset)
        let ceiling = base - projected + offset;
        if (ceiling < 0) ceiling = 0;

        projected_connector_ceiling[cid] = round2(ceiling);
    }

    // Tenants
    const tenantIds = Object.keys(input.tenant_context || {}).sort();
    const tenantConnectorMap = input.tenant_connector_map || {};

    for (const tid of tenantIds) {
        const hardCap = input.tenant_context[tid].hard_cap_usage || 0;
        let projectedUsage = 0;

        if (tenantConnectorMap[tid] && Array.isArray(tenantConnectorMap[tid])) {
            const mappedConnectors = tenantConnectorMap[tid];
            for (const cid of mappedConnectors) {
                projectedUsage += (connectorForecasts[cid] || 0);
            }
        }
        // Else fallback: projectedUsage remains 0 (matches spec: "missing connectors treated as 0" implied or just raw hard cap if map missing)
        // Spec says: if map missing, projected_tenant_ceiling[tid] = hard_cap_usage || 0. 
        // If map present, projected_tenant_ceiling[tid] = hardCap - projectedUsage.

        let tenantCeiling;
        if (input.tenant_connector_map) {
            tenantCeiling = hardCap - projectedUsage;
        } else {
            tenantCeiling = hardCap;
        }

        if (tenantCeiling < 0) tenantCeiling = 0;
        projected_tenant_ceiling[tid] = round2(tenantCeiling);
    }

    // Agents
    const agentIds = Object.keys(input.agent_context || {}).sort();
    for (const aid of agentIds) {
        projected_agent_ceiling[aid] = defaultAgentCeiling;
    }

    // 4. Future Windows Forecast
    const future_windows = [];
    for (let i = 1; i <= horizon; i++) {
        let totalPred = 0;
        for (const cid of connectorids) {
            totalPred += (connectorForecasts[cid] || 0);
        }

        const decay = Math.pow(futureDecayBase, i);
        const pred = round2(totalPred * decay);

        future_windows.push({
            window_index: i,
            predicted_units: pred,
            confidence_score: parseFloat(Math.pow(confDecayBase, i).toFixed(4))
        });
    }

    // 5. Risk Classification
    const risk = classifyRisk(connectorForecasts, input.connector_profiles, knowledge.risk_thresholds);

    return {
        projected_connector_ceiling,
        projected_agent_ceiling,
        projected_tenant_ceiling,
        future_windows,
        risk_classification: risk
    };
}

function forecastConnectors(ledger, decayCurves, profiles) {
    const forecasts = {};
    const connectorIds = Object.keys(profiles || {});

    for (const cid of connectorIds) {
        const history = ledger[cid] || [];
        const sorted = [...history].sort((a, b) => a.window_start - b.window_start);
        const recent = sorted.slice(-3);

        let prediction = 0;
        if (recent.length === 0) {
            prediction = 0;
        } else if (recent.length === 1) {
            prediction = recent[0].usage;
        } else if (recent.length === 2) {
            prediction = (recent[1].usage * 0.6) + (recent[0].usage * 0.4);
        } else {
            prediction = (recent[2].usage * 0.5) + (recent[1].usage * 0.3) + (recent[0].usage * 0.2);
        }

        const scale = decayCurves['default'] || 1.0;
        prediction = prediction * scale;
        forecasts[cid] = round2(prediction);
    }
    return forecasts;
}

function classifyRisk(forecasts, profiles, thresholds) {
    let maxRatio = 0;
    const connectorIds = Object.keys(profiles || {});
    for (const cid of connectorIds) {
        const limit = profiles[cid].max_rate_per_window || 1;
        const usage = forecasts[cid] || 0;
        const ratio = usage / limit;
        if (ratio > maxRatio) maxRatio = ratio;
    }

    if (maxRatio >= thresholds.critical) return "CRITICAL";
    if (maxRatio >= thresholds.high) return "HIGH";
    if (maxRatio >= thresholds.medium) return "MEDIUM";
    return "LOW";
}

function extractArbitrationOffsets(arbitrationOutput) {
    if (!arbitrationOutput || typeof arbitrationOutput !== 'object') {
        return { connectors: {}, tenants: {}, agents: {} };
    }
    const offsets = arbitrationOutput.rate_limit_offsets;
    if (!offsets) {
        return { connectors: {}, tenants: {}, agents: {} };
    }
    return {
        connectors: { ...(offsets.connector || {}) },
        tenants: { ...(offsets.tenant || {}) },
        agents: { ...(offsets.agent || {}) }
    };
}

function createPassthrough(input) {
    return {
        execution_id: input.execution_id,
        phase: "73",
        feature_flags: input.feature_flags,
        rate_limit_forecast: {
            projected_connector_ceiling: {},
            projected_agent_ceiling: {},
            projected_tenant_ceiling: {},
            future_windows: [],
            risk_classification: "LOW"
        },
        passthrough: {
            arbitration_output: input.arbitration_output
        }
    };
}

function round2(num) {
    return Math.round(num * 100) / 100;
}

// ------------------------------------------------------------------
// Hygiene & Validation
// ------------------------------------------------------------------

function validateInput(input) {
    if (input === undefined || input === null) throw new Error("Phase 73: Input is null or undefined");
    if (!input.execution_id) throw new Error("Phase 73: Missing execution_id");
    if (input.phase !== "73") throw new Error(`Phase 73: Incorrect phase ${input.phase}`);
    if (!input.feature_flags) throw new Error("Phase 73: Missing feature_flags");
    if (!input.knowledge_maps) throw new Error("Phase 73: Missing knowledge_maps");

    const limits = input.knowledge_maps.rate_limits;
    if (!limits) throw new Error("Phase 73: Missing knowledge_maps.rate_limits");

    if (!limits.risk_thresholds) throw new Error("Phase 73: Missing knowledge_maps.rate_limits.risk_thresholds");
    if (!limits.decay_curves) throw new Error("Phase 73: Missing knowledge_maps.rate_limits.decay_curves");

    if (!limits.forecast_horizon) throw new Error("Phase 73: Missing knowledge_maps.rate_limits.forecast_horizon");
    if (!limits.future_window_decay_base) throw new Error("Phase 73: Missing knowledge_maps.rate_limits.future_window_decay_base");
    if (!limits.confidence_decay_base) throw new Error("Phase 73: Missing knowledge_maps.rate_limits.confidence_decay_base");
    if (!limits.agent_default_ceiling) throw new Error("Phase 73: Missing knowledge_maps.rate_limits.agent_default_ceiling");

    validateNoForbiddenTypes(input, "root");
}

function validateNoForbiddenTypes(value, path) {
    if (value === undefined || value === null) return;

    const type = typeof value;
    if (type === 'function') throw new Error(`Phase 73: Forbidden type "function" at path "${path}"`);
    if (type === 'symbol') throw new Error(`Phase 73: Forbidden type "symbol" at path "${path}"`);
    if (type === 'bigint') throw new Error(`Phase 73: Forbidden type "bigint" at path "${path}"`);

    if (Array.isArray(value)) {
        value.forEach((item, index) => validateNoForbiddenTypes(item, `${path}[${index}]`));
    } else if (type === 'object') {
        if (value instanceof Date) {
            // Dates are forbidden; typeof Date is "object", so we emit "object" as the forbidden type.
            throw new Error(`Phase 73: Forbidden type "object" at path "${path}"`);
        }

        // _debug check
        if (value._debug !== undefined) throw new Error(`Phase 73: Forbidden _debug field at path "${path}._debug"`);

        // Recurse (keys sorted not strictly required for validation but good practice)
        Object.keys(value).forEach(key => {
            if (key !== '_debug') { // checked above
                validateNoForbiddenTypes(value[key], `${path}.${key}`);
            }
        });
    }
}

function hardenOutput(output) {
    return sortKeys(output);
}

function sortKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(sortKeys);
    } else if (obj !== null && typeof obj === 'object') {
        const sorted = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = sortKeys(obj[key]);
        });
        return sorted;
    }
    return obj;
}

// ------------------------------------------------------------------
// Observability
// ------------------------------------------------------------------

function emitObservability(input, output, meta) {
    const execId = input.execution_id || 'unknown';
    const forecast = output.rate_limit_forecast || {};
    const risk = forecast.risk_classification || 'UNKNOWN';
    const windowCount = Array.isArray(forecast.future_windows)
        ? forecast.future_windows.length
        : 0;

    const maxRatio = computeMaxRatio(input);

    metrics.count('phase_73_invocations', 1);
    metrics.gauge('phase_73_max_ratio', maxRatio);
    metrics.gauge('phase_73_forecast_window_count', windowCount);

    logStructured('phase_73_long_horizon_rate_limit_forecaster', {
        execution_id: execId,
        phase: '73',
        risk_classification: risk,
        feature_flag_disabled: meta.featureFlagDisabled === true
    });
}

function computeMaxRatio(input) {
    if (
        !input ||
        !input.connector_profiles ||
        !input.rate_limit_ledger ||
        !input.knowledge_maps ||
        !input.knowledge_maps.rate_limits
    ) {
        return 0;
    }

    const rateLimits = input.knowledge_maps.rate_limits;
    const forecasts = forecastConnectors(
        input.rate_limit_ledger,
        rateLimits.decay_curves,
        input.connector_profiles
    );

    let maxRatio = 0;
    const connectorIds = Object.keys(input.connector_profiles);
    for (const cid of connectorIds) {
        const limit = input.connector_profiles[cid].max_rate_per_window || 1;
        const usage = forecasts[cid] || 0;
        const ratio = usage / limit;
        if (ratio > maxRatio) {
            maxRatio = ratio;
        }
    }

    return round2(maxRatio);
}


module.exports = { output_contract };
