/**
 * Phase 34: Capabilities Resolver Engine
 * Deterministic capability index builder from snapshots and policy mirrors
 */

// Helper: Sort object keys recursively
function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
}

// Helper: Create error envelope
function createErrorEnvelope(execution_id, code, message, details) {
    return {
        ok: false,
        execution_id: execution_id || null,
        intent: "RESOLVE_CAPABILITIES_V1",
        timestamp: new Date().toISOString(),
        error: {
            code,
            message,
            ...(details ? { details } : {})
        }
    };
}

// Main function
function resolveCapabilities(envelope) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Envelope Validation
        if (!envelope || typeof envelope !== 'object') {
            return createErrorEnvelope(null, "MALFORMED_CAPABILITIES_RESOLVER_CONTRACT", "Envelope must be an object");
        }

        if (envelope.intent !== "RESOLVE_CAPABILITIES_V1") {
            return createErrorEnvelope(envelope.execution_id, "MALFORMED_CAPABILITIES_RESOLVER_CONTRACT", "Invalid intent");
        }

        if (!envelope.execution_id || typeof envelope.execution_id !== 'string') {
            return createErrorEnvelope(null, "MALFORMED_CAPABILITIES_RESOLVER_CONTRACT", "Missing execution_id");
        }

        if (!envelope.payload || typeof envelope.payload !== 'object') {
            return createErrorEnvelope(envelope.execution_id, "MALFORMED_CAPABILITIES_RESOLVER_CONTRACT", "Missing payload");
        }

        const { execution_id, payload } = envelope;

        // Validate snapshot
        if (!payload.snapshot || !payload.snapshot.execution_snapshot_v1) {
            return createErrorEnvelope(execution_id, "INVALID_EXECUTION_SNAPSHOT", "Missing execution_snapshot_v1");
        }

        // Validate mirror
        if (!payload.policy_mirror || !payload.policy_mirror.policy_mirror_v1) {
            return createErrorEnvelope(execution_id, "INVALID_POLICY_MIRROR_PAYLOAD", "Missing policy_mirror_v1");
        }

        const snapshot = payload.snapshot.execution_snapshot_v1;
        const mirror = payload.policy_mirror.policy_mirror_v1;
        const flags = payload.flags || {};

        // 2. Extract World State
        const missing_policy_entries = [];
        const evaluation_warnings = [];

        const budget_rules = mirror.rules?.budget;
        const venue_rules = mirror.rules?.venues || {};
        const compatibility_matrix = mirror.rules?.compatibility_matrix || {};
        const connector_rules = mirror.rules?.connector_rules || {};

        if (!budget_rules) missing_policy_entries.push("budget_rules");
        if (!mirror.rules?.venues) missing_policy_entries.push("venue_rules");
        if (!mirror.rules?.compatibility_matrix) missing_policy_entries.push("compatibility_matrix");
        if (!mirror.rules?.connector_rules) missing_policy_entries.push("connector_rules");

        // 3. Venue Set Construction
        const venueSet = new Set();

        // From snapshot plan
        if (snapshot.plan && Array.isArray(snapshot.plan.venues)) {
            snapshot.plan.venues.forEach(v => {
                if (v.venue_key) venueSet.add(v.venue_key);
            });
        }

        // From venue_rules
        Object.keys(venue_rules).forEach(k => venueSet.add(k));

        // From compatibility_matrix
        const objective_to_venue = compatibility_matrix.objective_to_venue || {};
        Object.values(objective_to_venue).forEach(venues => {
            if (Array.isArray(venues)) {
                venues.forEach(v => venueSet.add(v));
            }
        });

        const venue_keys = Array.from(venueSet).sort();

        // Invert compatibility matrix for per-venue lookup
        const venue_to_objectives = {};
        Object.entries(objective_to_venue).forEach(([obj, venues]) => {
            if (Array.isArray(venues)) {
                venues.forEach(v => {
                    if (!venue_to_objectives[v]) venue_to_objectives[v] = [];
                    venue_to_objectives[v].push(obj);
                });
            }
        });

        const all_objectives = Object.keys(objective_to_venue).sort();

        // 4. Per-Venue Capability Resolution
        const venues = [];
        const global_objectives = new Set();
        const global_creatives = new Set();
        const global_audiences = new Set();
        const global_roles = new Set();
        const enabled_venue_keys = [];

        venue_keys.forEach(venue_key => {
            const venue = venue_rules[venue_key] || {};
            const enabled = venue.enabled !== false; // Default true if not specified

            // Objectives
            const objectives_supported = (venue_to_objectives[venue_key] || []).sort();
            const objectives_blocked = all_objectives.filter(o => !objectives_supported.includes(o)).sort();

            // Creative and audience types
            const creative_types_supported = Array.isArray(venue.required_creative_types)
                ? [...venue.required_creative_types].sort()
                : [];
            const audience_types_supported = Array.isArray(venue.required_audience_types)
                ? [...venue.required_audience_types].sort()
                : [];

            // Sequencing roles
            const sequencing_roles_supported = Array.isArray(venue.sequencing?.allowed_roles)
                ? [...venue.sequencing.allowed_roles].sort()
                : [];

            // Budget constraints
            const budget_constraints = {
                has_constraints: false,
                min_total: null,
                max_total: null
            };
            if (budget_rules) {
                if (typeof budget_rules.min_total === 'number') {
                    budget_constraints.has_constraints = true;
                    budget_constraints.min_total = budget_rules.min_total;
                }
                if (typeof budget_rules.max_total === 'number') {
                    budget_constraints.has_constraints = true;
                    budget_constraints.max_total = budget_rules.max_total;
                }
            }

            // Connector capabilities
            const connector = connector_rules[venue_key];
            const has_connector_rules = !!connector;
            const required_fields = Array.isArray(connector?.min_payload_fields)
                ? [...connector.min_payload_fields].sort()
                : [];

            let readiness_level = "UNKNOWN";
            if (has_connector_rules) {
                if (required_fields.length > 0 && Array.isArray(connector.readiness_requirements) && connector.readiness_requirements.length > 0) {
                    readiness_level = "RICH";
                } else {
                    readiness_level = "BASIC";
                }
            }

            const connector_capabilities = {
                has_connector_rules,
                readiness_level,
                required_fields
            };

            // Status
            let status;
            if (!enabled) {
                status = "DISABLED";
            } else if (objectives_supported.length === 0 && !has_connector_rules) {
                status = "UNKNOWN";
            } else if (objectives_supported.length === 0 || creative_types_supported.length === 0 || audience_types_supported.length === 0) {
                status = "PARTIAL";
            } else {
                status = "ENABLED";
            }

            // Add to global sets
            if (status === "ENABLED" || status === "PARTIAL") {
                enabled_venue_keys.push(venue_key);
                objectives_supported.forEach(o => global_objectives.add(o));
                creative_types_supported.forEach(c => global_creatives.add(c));
                audience_types_supported.forEach(a => global_audiences.add(a));
                sequencing_roles_supported.forEach(r => global_roles.add(r));
            }

            venues.push({
                venue_key,
                enabled,
                objectives_supported,
                objectives_blocked,
                creative_types_supported,
                audience_types_supported,
                sequencing_roles_supported,
                budget_constraints,
                connector_capabilities,
                status
            });
        });

        // 5. Global Capability View
        const global_capabilities = {
            objectives_supported: Array.from(global_objectives).sort(),
            creative_types_supported: Array.from(global_creatives).sort(),
            audience_types_supported: Array.from(global_audiences).sort(),
            sequencing_roles_supported: Array.from(global_roles).sort(),
            venues_supported: enabled_venue_keys.sort()
        };

        // 6. Diagnostics and Tags
        const capabilities_complete = missing_policy_entries.length === 0 && venues.every(v => v.status !== "UNKNOWN");
        const capabilities_partial = (missing_policy_entries.length > 0 || venues.some(v => v.status === "PARTIAL")) && enabled_venue_keys.length > 0;
        const capabilities_unknown = venues.every(v => v.status === "UNKNOWN" || v.status === "DISABLED");

        const summary_tags = [];
        if (capabilities_complete) summary_tags.push("capabilities_complete");
        if (capabilities_partial) summary_tags.push("capabilities_partial");
        if (capabilities_unknown) summary_tags.push("capabilities_unknown");
        if (missing_policy_entries.length > 0) summary_tags.push("missing_policy_entries");
        if (venues.some(v => v.status === "UNKNOWN")) summary_tags.push("venues_with_unknown_status");

        // Check for objectives missing from matrix
        const snapshot_objective = snapshot.request_context?.campaign_goal?.type;
        if (snapshot_objective && !all_objectives.includes(snapshot_objective)) {
            evaluation_warnings.push(`Snapshot objective "${snapshot_objective}" not found in compatibility matrix`);
            summary_tags.push("objectives_missing_from_matrix");
        }

        summary_tags.sort();

        // 7. Strict Mode
        if (flags.strict_mode && missing_policy_entries.length > 0) {
            return createErrorEnvelope(execution_id, "CAPABILITIES_STRICT_MODE_FAILURE", "Missing policy entries in strict mode", { missing_policy_entries });
        }

        // Build report
        const capabilities_report_v1 = {
            version: "CAPABILITIES_V1",
            snapshot_version: snapshot.version || null,
            policy_mirror_version: mirror.policy_version || null,
            global_capabilities,
            venues,
            missing_policy_entries: missing_policy_entries.sort(),
            evaluation_warnings: evaluation_warnings.sort(),
            summary_tags,
            capabilities_complete,
            capabilities_partial,
            capabilities_unknown
        };

        // Return success envelope
        return {
            ok: true,
            execution_id,
            intent: "RESOLVE_CAPABILITIES_V1",
            timestamp,
            payload: {
                capabilities_report_v1: sortKeys(capabilities_report_v1)
            }
        };

    } catch (err) {
        return createErrorEnvelope(
            envelope?.execution_id,
            "CAPABILITIES_UNEXPECTED_ERROR",
            err.message || "Unexpected error"
        );
    }
}

module.exports = {
    resolveCapabilities
};
