/**
 * Phase 30: Execution Incident & Drift Engine (Strict Hardened)
 *
 * Consumes Phase 28 snapshots (and optional Phase 29 replay results) to produce:
 * - Incident summaries for humans
 * - Structured incident timelines
 * - Drift metrics across iterations
 * - Training views for Kaivo Intelligence
 *
 * Adheres to Kaivo Forward-Hardening Framework:
 * - Explicit versioned contracts
 * - Zero hardcoded knowledge (fully config-driven)
 * - Deterministic incident grammar
 * - Full observability
 * - Pure logic (no IO)
 */

const crypto = require('crypto');

// ---------- Zero Hardcoded Knowledge: Default Config ----------

const DEFAULT_CONFIG = {
    incident_rules_v1: {
        drift_thresholds: {
            max_budget_rel_delta: 0.15,      // 15% change triggers HIGH severity
            max_venue_share_rel_delta: 0.10, // 10% share change triggers drift
            max_readiness_level_delta: 1     // Any level change
        },
        severity_rules: {
            high_budget_drift_multiplier: 0.5, // > 50% of max threshold is MEDIUM
            low_budget_drift_floor: 0.01       // > 1% is LOW
        },
        cause_map: {
            "VALIDATION": "VALIDATION_ERROR",
            "POLICY": "POLICY_ERROR",
            "CONNECTOR": "CONNECTOR_FAILURE",
            "READINESS": "READINESS_BLOCK"
        },
        status_severity_map: {
            "FAILED": "HIGH",
            "PARTIAL": "MEDIUM",
            "DEFAULT": "MEDIUM" // Fallback for other incident types
        },
        max_timeline_events: 100
    },
    outcome_classifier_v1: {
        rules: [
            { outcome: "SUCCESS", condition: { has_incident: false, final_status: ["SUCCESS", "COMPLETED"] } },
            { outcome: "RECOVERED", condition: { has_incident: true, final_status: ["SUCCESS", "COMPLETED"] } },
            { outcome: "FAILED", condition: { has_incident: true, final_status: ["FAILED"] } },
            { outcome: "PARTIAL", condition: { final_status: ["PARTIAL"] } }
        ],
        default_outcome: "UNKNOWN"
    }
};

// ---------- Main Entry Point ----------

/**
 * Main entry point for Phase 30.
 *
 * @param {object} input - ExecutionIncidentRequestV1
 * @param {object} options - { timestampProvider?: () => string }
 * @returns {object} - Orchestrator envelope with ExecutionIncidentReportV1
 */
function analyzeIncident(input, options = {}) {
    const timestampProvider = options.timestampProvider || (() => new Date().toISOString());
    const timestamp = timestampProvider();

    try {
        // 1. Deep Clone Input (Immutability Guarantee)
        const safeInput = JSON.parse(JSON.stringify(input || {}));

        // 2. Input Validation (Contract V1)
        const validationError = validateInputContractV1(safeInput);
        if (validationError) {
            return createErrorEnvelope(timestamp, validationError.code, validationError.message, validationError.details);
        }

        const { execution_id, snapshots, config = {} } = safeInput;

        // Merge config with defaults (Deep merge strategy for specific sections)
        const incidentRules = { ...DEFAULT_CONFIG.incident_rules_v1, ...(config.incident_rules_v1 || {}) };
        const outcomeClassifier = { ...DEFAULT_CONFIG.outcome_classifier_v1, ...(config.outcome_classifier_v1 || {}) };

        // Support legacy config structure (from previous hardening pass) if present
        if (config.drift_thresholds) incidentRules.drift_thresholds = config.drift_thresholds;
        if (config.max_timeline_events) incidentRules.max_timeline_events = config.max_timeline_events;

        // 3. Normalize and sort snapshots (Deterministic)
        const normalized = normalizeSnapshots(snapshots, execution_id);

        if (normalized.error) {
            return createErrorEnvelope(timestamp, normalized.error.code, normalized.error.message, normalized.error.details);
        }

        const sorted_snapshots = normalized.snapshots;

        // 4. Extract per-iteration summaries
        const iteration_summaries = sorted_snapshots.map(snapshot => extractIterationSummary(snapshot));

        // 5. Detect incident events (Deterministic Grammar)
        const raw_timeline = detectIncidentEvents(sorted_snapshots, iteration_summaries, execution_id);

        // 6. Compute drift vectors (Hardened Drift Engine)
        const drift_report = computeDriftReport(iteration_summaries, incidentRules.drift_thresholds, incidentRules.severity_rules);

        // 7. Generate incident summary
        const incident_summary = generateIncidentSummary(
            execution_id,
            raw_timeline,
            iteration_summaries,
            sorted_snapshots.length,
            incidentRules
        );

        // 8. Generate training view
        const training_view = generateTrainingView(
            incident_summary,
            raw_timeline,
            iteration_summaries,
            outcomeClassifier
        );

        // 9. Apply timeline capping (Refined)
        const capped_timeline = applyTimelineCap(raw_timeline, incidentRules.max_timeline_events);

        // 10. Build report (Output Contract V1)
        const report = {
            execution_id,
            incident_summary,
            timeline: capped_timeline,
            drift_report,
            training_view
        };

        // 11. Emit observability
        emitObservability(report, timestamp);

        // 12. Return envelope
        return {
            ok: true,
            module: "execution_incident_engine",
            timestamp,
            payload: report
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- 1. Contract Hardening: Input Validation ----------

function validateInputContractV1(input) {
    if (!input || typeof input !== "object") {
        return { code: "INVALID_INPUT", message: "Input must be an object" };
    }

    // Required: execution_id
    if (typeof input.execution_id !== "string" || input.execution_id.trim() === "") {
        return { code: "INVALID_INPUT", message: "Missing or invalid 'execution_id'" };
    }

    // Required: snapshots array
    if (!Array.isArray(input.snapshots)) {
        return { code: "INVALID_INPUT", message: "'snapshots' must be an array" };
    }

    if (input.snapshots.length === 0) {
        return { code: "INSUFFICIENT_SNAPSHOTS", message: "snapshots array is empty" };
    }

    // Optional: replay_results (if present, must be array)
    if (input.replay_results !== undefined && !Array.isArray(input.replay_results)) {
        return { code: "INVALID_INPUT", message: "'replay_results' must be an array if provided" };
    }

    // Optional: config (if present, must be object)
    if (input.config !== undefined && typeof input.config !== "object") {
        return { code: "INVALID_INPUT", message: "'config' must be an object if provided" };
    }

    return null; // Valid
}

// ---------- 3. Deterministic Incident Grammar: Normalization ----------

function normalizeSnapshots(snapshots, execution_id) {
    // Filter out null or malformed entries
    const valid = snapshots.filter(s => {
        if (!s) return false;
        // Backward compatibility: support both envelope and direct payload
        if (!s.meta && !s.payload?.meta) return false;
        return true;
    });

    if (valid.length === 0) {
        return {
            error: {
                code: "INSUFFICIENT_SNAPSHOTS",
                message: "No valid snapshots after filtering"
            }
        };
    }

    // Normalize snapshot structure
    const normalized = valid.map(s => {
        if (s.payload && s.payload.meta) {
            return s.payload; // Unwrap envelope
        }
        return s;
    });

    // Check execution_id consistency
    for (const snapshot of normalized) {
        const snap_exec_id = snapshot.meta?.execution_id || snapshot.execution_id;
        if (snap_exec_id && snap_exec_id !== execution_id) {
            return {
                error: {
                    code: "EXECUTION_ID_MISMATCH",
                    message: `Snapshot has mismatched execution_id: ${snap_exec_id} vs ${execution_id}`,
                    details: { expected: execution_id, found: snap_exec_id }
                }
            };
        }
    }

    // Sort by iteration_index, then created_at (Stable Sort)
    normalized.sort((a, b) => {
        const a_idx = a.meta?.iteration_index ?? a.loop?.iteration_index ?? 0;
        const b_idx = b.meta?.iteration_index ?? b.loop?.iteration_index ?? 0;

        if (a_idx !== b_idx) {
            return a_idx - b_idx;
        }

        const a_time = a.meta?.created_at ?? a.created_at ?? "";
        const b_time = b.meta?.created_at ?? b.created_at ?? "";
        return a_time.localeCompare(b_time);
    });

    // Deduplicate by iteration_index (keep first occurrence)
    const deduped = [];
    let last_idx = -1;

    for (const snapshot of normalized) {
        const curr_idx = snapshot.meta?.iteration_index ?? snapshot.loop?.iteration_index ?? 0;
        if (curr_idx !== last_idx) {
            deduped.push(snapshot);
            last_idx = curr_idx;
        }
    }

    return { snapshots: deduped };
}

// ---------- 4. Iteration Summary Extraction (Backward Compatible) ----------

function extractIterationSummary(snapshot) {
    const meta = snapshot.meta || {};
    const loop = snapshot.loop_state || snapshot.loop || {};
    const artifacts = snapshot.artifacts || {};

    const iteration_index = meta.iteration_index ?? loop.iteration_index ?? 0;
    const timestamp = meta.created_at ?? snapshot.created_at ?? "";
    const run_status = meta.run_status ?? loop.run_status ?? "UNKNOWN";

    // Extract stats with null-safety
    const stats = loop.stats || {};
    const total_budget = typeof stats.total_budget === 'number' ? stats.total_budget : null;
    const venues = Array.isArray(stats.venues) ? stats.venues : [];

    // Compute venue summaries with budget shares
    const venue_count = venues.length;
    const venue_summaries = venues.map(v => ({
        venue_key: v.venue_key || "UNKNOWN",
        budget: typeof v.budget === 'number' ? v.budget : 0,
        budget_share: (total_budget && total_budget > 0) ? (v.budget || 0) / total_budget : 0,
        unit_count: typeof v.unit_count === 'number' ? v.unit_count : 0
    }));

    // Readiness
    const readiness = loop.readiness || artifacts.readiness_envelope || {};
    const readiness_summary = readiness.summary || {};
    const can_launch = typeof readiness_summary.can_launch === 'boolean' ? readiness_summary.can_launch : null;
    const readiness_status = readiness_summary.global_status || "UNKNOWN";

    // Validation
    const validation = loop.validation || {};
    const validation_errors = Array.isArray(validation.errors) ? validation.errors : [];
    const validation_error_count = validation_errors.length;

    // Policy
    const policy = loop.policy || {};
    const policy_issues = Array.isArray(policy.issues) ? policy.issues : [];
    const policy_error_count = policy_issues.filter(i => i.level === "ERROR").length;

    // Connector
    const connector = loop.connector || {};
    const connector_response_present = !!(connector.responses || artifacts.connector_responses_envelope);

    // Corrective actions
    const corrective_actions = loop.corrective_actions || artifacts.corrective_plan_envelope || {};
    const applied_actions = Array.isArray(corrective_actions.applied) ? corrective_actions.applied : [];
    const corrective_action_count = applied_actions.length;

    // Backward compatibility check
    const is_incomplete = !meta.iteration_index && !loop.iteration_index;

    return {
        iteration_index,
        timestamp,
        run_status,
        total_budget,
        venue_count,
        venues: venue_summaries,
        readiness_status,
        can_launch,
        validation_error_count,
        policy_error_count,
        connector_response_present,
        corrective_action_count,
        is_incomplete
    };
}

// ---------- 5. Deterministic Incident Grammar: Event Detection ----------

function detectIncidentEvents(snapshots, summaries, execution_id) {
    const events = [];

    for (let i = 0; i < summaries.length; i++) {
        const current = summaries[i];
        const previous = i > 0 ? summaries[i - 1] : null;

        // 1. INCOMPLETE_SNAPSHOT (Backward Compatibility)
        if (current.is_incomplete) {
            events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                "SYSTEM", "INCOMPLETE_SNAPSHOT", "INFO", { message: "Snapshot missing standard fields" }));
        }

        // 2. VALIDATION: Error count increases or transitions to invalid
        if (current.validation_error_count > 0) {
            if (!previous || previous.validation_error_count === 0) {
                events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                    "VALIDATION", "VALIDATION_FAILED", "ERROR", { error_count: current.validation_error_count }));
            }
        }

        // 3. POLICY: Error count increases
        if (current.policy_error_count > 0) {
            if (!previous || current.policy_error_count > previous.policy_error_count) {
                events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                    "POLICY", "POLICY_ERROR", "ERROR", { error_count: current.policy_error_count }));
            }
        }

        // 4. READINESS: Status change
        if (previous && current.readiness_status !== previous.readiness_status) {
            const severity = current.can_launch === false ? "WARNING" : "INFO";
            events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                "READINESS", "READINESS_CHANGED", severity, { from: previous.readiness_status, to: current.readiness_status }));
        }

        // 5. CONNECTOR: Responses disappear
        if (previous && previous.connector_response_present && !current.connector_response_present) {
            events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                "CONNECTOR", "CONNECTOR_RESPONSE_MISSING", "ERROR"));
        }

        // 6. CORRECTIVE_ACTION: New actions applied
        if (current.corrective_action_count > 0) {
            if (!previous || current.corrective_action_count > previous.corrective_action_count) {
                events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                    "CORRECTIVE_ACTION", "CORRECTIVE_ACTION_APPLIED", "INFO", { action_count: current.corrective_action_count }));
            }
        }

        // 7. STATUS_TRANSITION: Run status changes
        if (previous && current.run_status !== previous.run_status) {
            const severity = current.run_status === "FAILED" ? "ERROR" : "INFO";
            events.push(createEvent(execution_id, current.iteration_index, current.timestamp,
                "STATUS_TRANSITION", "STATUS_CHANGED", severity, { from: previous.run_status, to: current.run_status }));
        }
    }

    return events;
}

function createEvent(execution_id, iteration_index, timestamp, event_kind, event_code, severity, details = {}) {
    const event_id = generateEventId(execution_id, iteration_index, event_kind, event_code);

    return {
        event_id,
        execution_id,
        iteration_index,
        timestamp,
        event_kind,
        event_code,
        severity,
        details
    };
}

function generateEventId(execution_id, iteration_index, event_kind, event_code) {
    // Deterministic hash-like string
    return `${execution_id}#${iteration_index}#${event_kind}#${event_code}`;
}

// ---------- 6. Hardened Drift Engine ----------

function computeDriftReport(summaries, drift_thresholds, severity_rules) {
    if (summaries.length === 0) {
        return {
            baseline_iteration: 0,
            iterations: [],
            drift_vectors: []
        };
    }

    const baseline = summaries[0];
    const drift_vectors = [];

    for (let i = 1; i < summaries.length; i++) {
        const current = summaries[i];
        const previous = summaries[i - 1];

        // Compute drift from baseline
        const baseline_vector = computeDriftVector(baseline, current, drift_thresholds, severity_rules);
        baseline_vector.from_iteration = baseline.iteration_index;
        baseline_vector.to_iteration = current.iteration_index;

        // Compute drift from previous
        const incremental_vector = computeDriftVector(previous, current, drift_thresholds, severity_rules);
        incremental_vector.from_iteration = previous.iteration_index;
        incremental_vector.to_iteration = current.iteration_index;

        drift_vectors.push(baseline_vector);

        if (i > 1) {
            drift_vectors.push(incremental_vector);
        }
    }

    return {
        baseline_iteration: baseline.iteration_index,
        iterations: summaries,
        drift_vectors
    };
}

function computeDriftVector(from_summary, to_summary, thresholds, severity_rules) {
    const vector = {
        from_iteration: from_summary.iteration_index,
        to_iteration: to_summary.iteration_index
    };

    // Budget drift (Null-safe)
    if (from_summary.total_budget != null && to_summary.total_budget != null) {
        const base = Math.max(from_summary.total_budget, 1); // Avoid division by zero
        vector.budget_rel_delta = (to_summary.total_budget - from_summary.total_budget) / base;
    }

    // Venue share drift (Stable ordering)
    if (from_summary.venues.length > 0 && to_summary.venues.length > 0) {
        vector.venue_share_rel_delta = {};

        const from_venues = new Map(from_summary.venues.map(v => [v.venue_key, v.budget_share]));
        const to_venues = new Map(to_summary.venues.map(v => [v.venue_key, v.budget_share]));

        // Sort keys for deterministic output
        const all_keys = Array.from(new Set([...from_venues.keys(), ...to_venues.keys()])).sort();

        for (const key of all_keys) {
            const from_share = from_venues.get(key) || 0;
            const to_share = to_venues.get(key) || 0;
            vector.venue_share_rel_delta[key] = to_share - from_share;
        }
    }

    // Readiness changed
    vector.readiness_changed = from_summary.readiness_status !== to_summary.readiness_status;

    // Error deltas
    vector.policy_error_delta = to_summary.policy_error_count - from_summary.policy_error_count;
    vector.validation_error_delta = to_summary.validation_error_count - from_summary.validation_error_count;

    // Connector flip
    if (from_summary.connector_response_present && !to_summary.connector_response_present) {
        vector.connector_response_flip = "REMOVED";
    } else if (!from_summary.connector_response_present && to_summary.connector_response_present) {
        vector.connector_response_flip = "ADDED";
    } else {
        vector.connector_response_flip = "NONE";
    }

    // Drift severity (Config-driven)
    if (thresholds) {
        vector.drift_severity = computeDriftSeverity(vector, thresholds, severity_rules);
    } else {
        vector.drift_severity = "UNKNOWN";
    }

    return vector;
}

function computeDriftSeverity(vector, thresholds, severity_rules) {
    // If budget threshold is set but we couldn't compute delta (missing stats), return UNKNOWN
    if (thresholds.max_budget_rel_delta !== undefined && vector.budget_rel_delta === undefined) {
        return "UNKNOWN";
    }

    const budget_drift = Math.abs(vector.budget_rel_delta || 0);
    const max_budget_threshold = thresholds.max_budget_rel_delta || 0.15;

    // Config-driven rules
    const medium_threshold = max_budget_threshold * (severity_rules.high_budget_drift_multiplier || 0.5);
    const low_threshold = severity_rules.low_budget_drift_floor || 0.01;

    if (budget_drift > max_budget_threshold) {
        return "HIGH";
    } else if (budget_drift > medium_threshold) {
        return "MEDIUM";
    } else if (budget_drift > low_threshold || vector.readiness_changed || vector.connector_response_flip !== "NONE") {
        return "LOW";
    }

    return "NONE";
}

// ---------- 7. Incident Summary Generation ----------

function generateIncidentSummary(execution_id, timeline, summaries, iteration_count, rules) {
    const error_events = timeline.filter(e => e.severity === "ERROR");
    const warning_events = timeline.filter(e => e.severity === "WARNING");

    const has_incident = error_events.length > 0 || warning_events.length > 0;

    // Primary cause codes (Config-driven mapping)
    const cause_map = rules.cause_map || {};
    const primary_causes = new Set();

    for (const event of error_events) {
        if (cause_map[event.event_kind]) {
            primary_causes.add(cause_map[event.event_kind]);
        }
    }

    // First failure iteration
    let first_failure_iteration = null;
    for (const event of error_events) {
        if (first_failure_iteration === null || event.iteration_index < first_failure_iteration) {
            first_failure_iteration = event.iteration_index;
        }
    }

    // Check run_status failures
    for (const summary of summaries) {
        if (summary.run_status === "FAILED" || summary.run_status === "PARTIAL") {
            if (first_failure_iteration === null || summary.iteration_index < first_failure_iteration) {
                first_failure_iteration = summary.iteration_index;
            }
        }
    }

    // Last recovery iteration
    let last_recovery_iteration = null;
    if (first_failure_iteration !== null) {
        for (let i = summaries.length - 1; i >= 0; i--) {
            const summary = summaries[i];
            if (summary.iteration_index > first_failure_iteration) {
                const is_healthy = summary.run_status === "SUCCESS" || summary.run_status === "COMPLETED";
                const has_no_new_errors = !error_events.some(e => e.iteration_index === summary.iteration_index);

                if (is_healthy && has_no_new_errors) {
                    last_recovery_iteration = summary.iteration_index;
                    break;
                }
            }
        }
    }

    // Severity (Config-driven Rules)
    let severity = "NONE";
    if (has_incident) {
        if (error_events.length === 0) {
            severity = "LOW";
        } else {
            const final_status = summaries[summaries.length - 1]?.run_status;
            severity = rules.status_severity_map[final_status] || rules.status_severity_map["DEFAULT"] || "MEDIUM";
        }
    }

    return {
        has_incident,
        severity,
        primary_cause_codes: Array.from(primary_causes).sort(), // Stable sort
        first_failure_iteration,
        last_recovery_iteration,
        iteration_count
    };
}

// ---------- 8. Training View Generation ----------

function generateTrainingView(incident_summary, timeline, summaries, classifierConfig) {
    const features = {
        iteration_count: summaries.length,
        incident_event_count: timeline.length,
        max_policy_errors_per_iteration: Math.max(0, ...summaries.map(s => s.policy_error_count)),
        max_validation_errors_per_iteration: Math.max(0, ...summaries.map(s => s.validation_error_count)),
        max_corrective_actions_per_iteration: Math.max(0, ...summaries.map(s => s.corrective_action_count)),
        had_connector_responses: summaries.some(s => s.connector_response_present),
        had_corrective_actions: summaries.some(s => s.corrective_action_count > 0),
        had_readiness_block: summaries.some(s => s.can_launch === false),
        had_policy_block: summaries.some(s => s.policy_error_count > 0),
        initial_run_status: summaries[0]?.run_status,
        final_run_status: summaries[summaries.length - 1]?.run_status
    };

    const label = {
        outcome: classifyOutcome(incident_summary, features, classifierConfig),
        incident_severity: incident_summary.severity
    };

    return {
        features,
        label
    };
}

// ---------- 9. Hardened Outcome Classifier (Config-Driven) ----------

function classifyOutcome(incident_summary, features, config) {
    const final_status = features.final_run_status;
    const has_incident = incident_summary.has_incident;
    const rules = config.rules || [];

    for (const rule of rules) {
        const cond = rule.condition;

        // Match has_incident (if specified)
        if (cond.has_incident !== undefined && cond.has_incident !== has_incident) {
            continue;
        }

        // Match final_status (if specified)
        if (cond.final_status !== undefined && !cond.final_status.includes(final_status)) {
            continue;
        }

        return rule.outcome;
    }

    return config.default_outcome || "UNKNOWN";
}

// ---------- 10. Refined Timeline Capping ----------

function applyTimelineCap(timeline, max_events) {
    if (!max_events || timeline.length <= max_events) {
        return timeline;
    }

    // Keep earliest and latest events
    const keep_count = max_events - 1; // Reserve 1 for truncation event
    const half = Math.floor(keep_count / 2);

    const earliest = timeline.slice(0, half);
    const latest = timeline.slice(timeline.length - (keep_count - half));

    const capped = [...earliest, ...latest];

    // Add synthetic truncation event
    const truncation_event = {
        event_id: `${timeline[0].execution_id}#TRUNCATED`,
        execution_id: timeline[0].execution_id,
        iteration_index: -1,
        timestamp: new Date().toISOString(),
        event_kind: "STATUS_TRANSITION",
        event_code: "TIMELINE_TRUNCATED",
        severity: "INFO",
        details: {
            original_count: timeline.length,
            kept_count: capped.length,
            truncated_count: timeline.length - capped.length
        }
    };

    capped.push(truncation_event);

    return capped;
}

// ---------- 11. Full Observability Layer ----------

function emitObservability(report, timestamp) {
    // Metrics
    emitMetric("kaivo.execution_incident.iteration_count", report.incident_summary.iteration_count, {
        execution_id: report.execution_id
    });

    emitMetric("kaivo.execution_incident.incident_event_count", report.timeline.length, {
        execution_id: report.execution_id
    });

    emitMetric("kaivo.execution_incident.has_incident", report.incident_summary.has_incident ? 1 : 0, {
        execution_id: report.execution_id
    });

    emitMetric("kaivo.execution_incident.severity", 1, {
        execution_id: report.execution_id,
        severity: report.incident_summary.severity
    });

    // Structured Log
    logEvent({
        event: "execution_incident_analyzed",
        execution_id: report.execution_id,
        severity: report.incident_summary.severity,
        iteration_count: report.incident_summary.iteration_count,
        has_incident: report.incident_summary.has_incident,
        primary_causes: report.incident_summary.primary_cause_codes,
        outcome: report.training_view.label.outcome
    });

    // Trace Span
    emitTraceSpan({
        span_name: "EXECUTION_INCIDENT_V1",
        attributes: {
            "kaivo.execution_id": report.execution_id,
            "kaivo.iteration_count": report.incident_summary.iteration_count,
            "kaivo.has_incident": report.incident_summary.has_incident,
            "kaivo.incident_severity": report.incident_summary.severity,
            "kaivo.outcome": report.training_view.label.outcome
        }
    });
}

function emitMetric(name, value, tags) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[METRIC] ${name} = ${value}`, tags);
    }
}

function logEvent(event) {
    if (process.env.NODE_ENV !== 'test') {
        console.log('[EVENT]', JSON.stringify(event));
    }
}

function emitTraceSpan(span) {
    if (process.env.NODE_ENV !== 'test') {
        console.log('[TRACE]', JSON.stringify(span));
    }
}

// ---------- Error Envelope ----------

function createErrorEnvelope(timestamp, code, message, details) {
    return {
        ok: false,
        module: "execution_incident_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message,
            details
        }
    };
}

module.exports = {
    analyzeIncident
};
