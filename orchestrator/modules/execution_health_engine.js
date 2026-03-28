/**
 * Phase 31: Execution Health Score Engine
 *
 * Deterministic engine that consumes Phase 30 outputs and produces a scalar health score,
 * health category, and tagged diagnostics.
 *
 * Governed by Forward Hardening Framework.
 */

const DEFAULT_CONFIG = {
    version: "DEFAULT_V1",
    dimension_weights: {
        stability: 0.3,
        policy: 0.2,
        budget: 0.2,
        connectors: 0.2,
        drift: 0.1
    },
    category_thresholds: {
        good_min: 80,
        warn_min: 50,
        critical_min: 0
    },
    penalties: {
        stability: { max_penalty: 100 },
        policy: { max_penalty: 80 },
        budget: { max_penalty: 80 },
        connectors: { max_penalty: 100 },
        drift: { max_penalty: 60 }
    }
};

/**
 * Main entry point for Phase 31.
 *
 * @param {object} envelope - Orchestrator envelope from Phase 30
 * @returns {object} - Orchestrator envelope with ExecutionHealthReportV1
 */
function computeHealthScore(envelope) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Input Validation
        if (!envelope || typeof envelope !== 'object') {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Input must be an object");
        }

        if (envelope.ok === false) {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Input envelope has ok: false");
        }

        if (!envelope.payload) {
            return createErrorEnvelope(timestamp, "INVALID_INPUT", "Input payload is null");
        }

        const report = envelope.payload;

        if (!report.incident_summary || typeof report.incident_summary.severity_score !== 'number') {
            return createErrorEnvelope(timestamp, "MALFORMED_INCIDENT_REPORT", "Missing incident_summary or severity_score");
        }

        if (Number.isNaN(report.incident_summary.severity_score)) {
            return createErrorEnvelope(timestamp, "MALFORMED_INCIDENT_REPORT", "severity_score must be a valid number");
        }

        // 2. Config Resolution
        let config = report.health_scoring_config;
        let configVersion = config ? config.version : "DEFAULT_V1";
        let isDefaultConfig = false;

        if (!config) {
            config = DEFAULT_CONFIG;
            isDefaultConfig = true;
        }

        // 3. Metric Extraction
        const metrics = extractMetrics(report);

        // 4. Dimension Scoring
        const dimensions = computeDimensionScores(metrics, config, report);

        // 5. Aggregation
        const health_score = computeAggregateScore(dimensions, config.dimension_weights);

        // 6. Categorization
        const health_category = assignCategory(health_score, config.category_thresholds);

        // 7. Tagging
        const health_tags = generateTags(report, dimensions, health_category, isDefaultConfig);

        // 8. Construct Output
        const outputPayload = {
            execution_id: report.execution_id,
            snapshot_id: report.snapshot_id || null,
            health_score,
            health_category,
            health_tags,
            dimensions,
            metrics,
            source: {
                incident_module: "execution_incident_engine",
                incident_contract_version: "ExecutionIncidentReportV1",
                health_contract_version: "ExecutionHealthReportV1",
                scoring_config_version: configVersion
            }
        };

        // 9. Observability (Hooks)
        emitObservability(outputPayload);

        return {
            ok: true,
            module: "execution_health_engine",
            timestamp,
            payload: outputPayload,
            error: null
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "HEALTH_ENGINE_INTERNAL_ERROR", err.message);
    }
}

function extractMetrics(report) {
    return {
        incident_severity_score: clamp01(report.incident_summary.severity_score),
        drift_score: clamp01(report.drift_report?.drift_score ?? 0),
        policy_burden_score: clamp01(report.policy_findings?.policy_burden_score ?? 0),
        connector_flake_score: clamp01(report.connector_findings?.connector_flake_score ?? 0),
        connector_failure_rate: clamp01(report.connector_findings?.failure_rate ?? 0),
        total_incidents: Math.max(0, report.incident_summary.counts.total_incidents),
        total_drifts: Math.max(0, report.drift_report?.counts.total_drifts ?? 0)
    };
}

function computeDimensionScores(metrics, config, report) {
    const penalties = config.penalties;
    const overrides = config.tag_dimension_overrides || {};

    // Base Metrics
    const stabilityMetric = metrics.incident_severity_score;
    const policyMetric = metrics.policy_burden_score;
    const budgetMetric = metrics.drift_score; // As per spec
    const connectorMetric = Math.max(metrics.connector_flake_score, metrics.connector_failure_rate);
    const driftMetric = metrics.drift_score;

    // Helper to calculate score
    const calcScore = (metric, maxPenalty) => {
        const score = 100 - (metric * maxPenalty);
        return clamp(0, 100, Math.round(score));
    };

    // Initial Scores
    const dims = {
        stability: { score: calcScore(stabilityMetric, penalties.stability.max_penalty), weight: config.dimension_weights.stability, tags: [] },
        policy: { score: calcScore(policyMetric, penalties.policy.max_penalty), weight: config.dimension_weights.policy, tags: [] },
        budget: { score: calcScore(budgetMetric, penalties.budget.max_penalty), weight: config.dimension_weights.budget, tags: [] },
        connectors: { score: calcScore(connectorMetric, penalties.connectors.max_penalty), weight: config.dimension_weights.connectors, tags: [] },
        drift: { score: calcScore(driftMetric, penalties.drift.max_penalty), weight: config.dimension_weights.drift, tags: [] }
    };

    // Apply Overrides
    const allTags = [
        ...(report.incident_summary.incident_tags || []),
        ...(report.drift_report?.drift_tags || []),
        ...(report.policy_findings?.policy_tags || []),
        ...(report.connector_findings?.connector_tags || [])
    ];

    for (const tag of allTags) {
        if (overrides[tag]) {
            const { dimension, severity } = overrides[tag];
            if (dims[dimension]) {
                const currentMetric = (100 - dims[dimension].score) / penalties[dimension].max_penalty;
                if (severity > currentMetric) {
                    dims[dimension].score = calcScore(severity, penalties[dimension].max_penalty);
                }
            }
        }
    }

    return dims;
}

function computeAggregateScore(dimensions, weights) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const key in dimensions) {
        weightedSum += dimensions[key].score * weights[key];
        totalWeight += weights[key];
    }

    // Normalize if weights don't sum to 1 (within epsilon)
    if (Math.abs(totalWeight - 1.0) > 0.001 && totalWeight > 0) {
        weightedSum = weightedSum / totalWeight;
    }

    return clamp(0, 100, Math.round(weightedSum));
}

function assignCategory(score, thresholds) {
    if (score >= thresholds.good_min) return "GOOD";
    if (score >= thresholds.warn_min) return "WARN";
    return "CRITICAL";
}

function generateTags(report, dimensions, category, isDefaultConfig) {
    const tags = new Set();

    // Pass-through tags
    (report.incident_summary.incident_tags || []).forEach(t => tags.add(t));
    (report.drift_report?.drift_tags || []).forEach(t => tags.add(t));
    (report.policy_findings?.policy_tags || []).forEach(t => tags.add(t));
    (report.connector_findings?.connector_tags || []).forEach(t => tags.add(t));

    // Phase 31 Tags
    if (isDefaultConfig) tags.add("HEALTH_CONFIG_MISSING");
    tags.add(`HEALTH_SCORE_${category}`);

    // Dimension Weakness Tags (Threshold 70)
    if (dimensions.stability.score < 70) tags.add("DIM_STABILITY_WEAK");
    if (dimensions.policy.score < 70) tags.add("DIM_POLICY_HEAVY");
    if (dimensions.budget.score < 70) tags.add("DIM_BUDGET_UNSTABLE");
    if (dimensions.connectors.score < 70) tags.add("DIM_CONNECTORS_FLAKY");
    if (dimensions.drift.score < 70) tags.add("DIM_DRIFT_HIGH");

    return Array.from(tags).sort();
}

// Utilities

function clamp01(val) {
    if (typeof val !== 'number' || isNaN(val)) return 0;
    return Math.max(0, Math.min(1, val));
}

function clamp(min, max, val) {
    return Math.max(min, Math.min(max, val));
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_health_engine",
        timestamp,
        payload: null,
        error: { code, message }
    };
}

// Observability Hooks (Mocked for pure logic, but structure ready)
function emitObservability(payload) {
    // In a real system, this would emit to a telemetry agent.
    // Here we just ensure the data is ready.
    // console.log("METRIC: execution_health_score", payload.health_score);
}

module.exports = {
    computeHealthScore
};
