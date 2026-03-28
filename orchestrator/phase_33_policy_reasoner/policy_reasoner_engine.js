/**
 * Phase 33: Policy Reasoner Engine - Core Logic
 */

const { sortKeys, sortViolations, createErrorEnvelope } = require('./helpers');
const { validateEnvelope, validateSnapshot, validateMirror } = require('./validators');

function reasonPolicy(envelope) {
    const timestamp = new Date().toISOString();

    // 2. Validate Envelope
    const envError = validateEnvelope(envelope);
    if (envError) {
        return createErrorEnvelope(envelope?.execution_id, "MALFORMED_POLICY_REASONER_CONTRACT", envError);
    }

    const { execution_id, payload } = envelope;
    const { execution_snapshot, policy_mirror, options } = payload;

    // 4. Validate Mirror and Snapshot
    const snapError = validateSnapshot(execution_snapshot);
    if (snapError) {
        return createErrorEnvelope(execution_id, "INVALID_EXECUTION_SNAPSHOT", snapError);
    }

    const mirrorError = validateMirror(policy_mirror);
    if (mirrorError) {
        return createErrorEnvelope(execution_id, "INVALID_POLICY_MIRROR_PAYLOAD", mirrorError);
    }

    try {
        // 5. Initialize Report
        const report = {
            version: "V1",
            snapshot_version: execution_snapshot.version || null,
            policy_mirror_version: policy_mirror.policy_version || null,
            overall: {
                status: "ALLOWED",
                summary_tags: []
            },
            objectives: {
                requested_objective: "UNKNOWN",
                resolved_objective: null,
                allowed_venues: [],
                blocked_venues: [],
                legality_flags: {
                    compliant: false,
                    jurisdiction_conflicts: []
                }
            },
            budget_constraints: {
                total_budget: 0,
                currency: null,
                within_policy_bounds: true,
                violations: []
            },
            creative_requirements: {
                required_types: [],
                missing_types: [],
                disallowed_types: [],
                venue_findings: []
            },
            audience_requirements: {
                required_types: [],
                missing_types: [],
                disallowed_types: [],
                venue_findings: []
            },
            sequencing_and_roles: {
                roles_allowed: [],
                violations: []
            },
            connector_readiness_summary: {
                venues_blocked_by_policy: [],
                venues_allowed_with_conditions: [],
                venues_unconstrained: []
            },
            diagnostics: {
                strict_mode: Boolean(options?.strict_mode),
                missing_policy_entries: [],
                evaluation_warnings: []
            }
        };

        // 6. Extract Context
        const rules = policy_mirror.rules;
        const context = execution_snapshot.request_context || {};
        const venues = rules.venues || {};
        const objective = context.campaign_goal?.type || "UNKNOWN";

        report.objectives.requested_objective = objective;
        report.objectives.resolved_objective = objective;

        // 7. Objective Gating
        const matrix = rules.compatibility_matrix || {};
        const objectiveMap = matrix.objective_to_venue || {};

        if (!Object.prototype.hasOwnProperty.call(objectiveMap, objective)) {
            report.diagnostics.missing_policy_entries.push(`compatibility_matrix.objective_to_venue.${objective}`);
        }

        let compatibleVenues = objectiveMap[objective];
        if (!Array.isArray(compatibleVenues)) compatibleVenues = [];

        if (compatibleVenues.length === 0) {
            report.overall.status = "BLOCKED";
            report.overall.primary_blocking_reason = "OBJECTIVE_NOT_SUPPORTED";
            report.diagnostics.evaluation_warnings.push(`Objective ${objective} has no compatible venues`);
        }

        // 8. Budget Constraints
        const budget = context.budget_parameters?.total_budget ?? 0;
        const currency = context.budget_parameters?.currency || null;

        report.budget_constraints.total_budget = budget;
        report.budget_constraints.currency = currency;

        if (rules.budget) {
            if (Number.isFinite(rules.budget.min_total) && budget < rules.budget.min_total) {
                report.budget_constraints.within_policy_bounds = false;
                report.budget_constraints.violations.push({ rule_key: "min_total", severity: "ERROR", message_code: "BUDGET_TOO_LOW" });
            }
            if (Number.isFinite(rules.budget.max_total) && budget > rules.budget.max_total) {
                report.budget_constraints.within_policy_bounds = false;
                report.budget_constraints.violations.push({ rule_key: "max_total", severity: "ERROR", message_code: "BUDGET_TOO_HIGH" });
            }
        }

        // 9. Venue-level Reasoning
        const requiredCreativeSet = new Set();
        const requiredAudienceSet = new Set();
        const allowedRolesSet = new Set();

        Object.keys(venues).sort().forEach(venueKey => {
            const venue = venues[venueKey];

            // Check if blocked
            if (!venue.enabled) {
                report.objectives.blocked_venues.push({ venue_key: venueKey, reason_code: "VENUE_DISABLED" });
                return;
            }
            if (!compatibleVenues.includes(venueKey)) {
                report.objectives.blocked_venues.push({ venue_key: venueKey, reason_code: "INCOMPATIBLE_OBJECTIVE" });
                return;
            }

            // Allowed
            report.objectives.allowed_venues.push(venueKey);

            // Creative
            const venueCreatives = Array.isArray(venue.required_creative_types) ? venue.required_creative_types : [];
            venueCreatives.forEach(t => requiredCreativeSet.add(t));
            report.creative_requirements.venue_findings.push({
                venue_key: venueKey,
                status: "OK",
                required_creative_types: [...venueCreatives].sort(),
                missing_creative_types: [],
                incompatible_creative_types: []
            });

            // Audience
            const venueAudiences = Array.isArray(venue.required_audience_types) ? venue.required_audience_types : [];
            venueAudiences.forEach(t => requiredAudienceSet.add(t));
            report.audience_requirements.venue_findings.push({
                venue_key: venueKey,
                status: "OK",
                required_audience_types: [...venueAudiences].sort(),
                missing_audience_types: [],
                incompatible_audience_types: []
            });

            // Roles
            if (venue.sequencing && Array.isArray(venue.sequencing.allowed_roles)) {
                venue.sequencing.allowed_roles.forEach(r => allowedRolesSet.add(r));
            }
        });

        // 10. Fill Aggregates
        report.creative_requirements.required_types = Array.from(requiredCreativeSet).sort();
        report.audience_requirements.required_types = Array.from(requiredAudienceSet).sort();
        report.sequencing_and_roles.roles_allowed = Array.from(allowedRolesSet).sort();

        // 12. Connector Readiness Summary
        report.objectives.blocked_venues.forEach(v => report.connector_readiness_summary.venues_blocked_by_policy.push(v.venue_key));

        report.objectives.allowed_venues.forEach(venueKey => {
            const cr = rules.connector_rules ? rules.connector_rules[venueKey] : null;
            if (cr && (
                (Array.isArray(cr.min_payload_fields) && cr.min_payload_fields.length > 0) ||
                (Array.isArray(cr.readiness_requirements) && cr.readiness_requirements.length > 0)
            )) {
                report.connector_readiness_summary.venues_allowed_with_conditions.push(venueKey);
            } else {
                report.connector_readiness_summary.venues_unconstrained.push(venueKey);
            }
        });

        // 13. Legality Flags
        report.objectives.legality_flags.compliant = (report.overall.status !== "BLOCKED" || report.overall.primary_blocking_reason !== "OBJECTIVE_NOT_SUPPORTED");

        // 14. Diagnostics
        if (report.diagnostics.missing_policy_entries.length > 0) {
            report.diagnostics.evaluation_warnings.push("MISSING_POLICY_ENTRIES_DETECTED");
        }

        // 15. Strict Mode
        if (report.diagnostics.strict_mode && report.diagnostics.missing_policy_entries.length > 0) {
            return createErrorEnvelope(execution_id, "INVALID_POLICY_MIRROR_PAYLOAD", "Missing policy entries in strict mode", { missing_policy_entries: report.diagnostics.missing_policy_entries });
        }

        // 16. Final Status Derivation
        const hasBudgetError = report.budget_constraints.violations.some(v => v.severity === "ERROR");

        if (hasBudgetError) {
            report.overall.status = "BLOCKED";
            report.overall.primary_blocking_reason = "BUDGET_VIOLATION";
        } else if (report.objectives.allowed_venues.length === 0 && report.objectives.blocked_venues.length > 0) {
            if (!report.overall.primary_blocking_reason) {
                report.overall.primary_blocking_reason = "NO_COMPATIBLE_VENUES";
            }
            report.overall.status = "BLOCKED";
        } else if (report.objectives.allowed_venues.length > 0 && report.objectives.blocked_venues.length > 0) {
            report.overall.status = "CONDITIONAL";
            if (!report.overall.primary_blocking_reason) {
                report.overall.primary_blocking_reason = "PARTIAL_POLICY_RESTRICTION";
            }
        }

        // 17. Summary Tags
        const tags = new Set();
        if (report.overall.status === "ALLOWED") tags.add("policy_allowed");
        if (report.overall.status === "BLOCKED") tags.add("policy_blocked");
        if (report.overall.status === "CONDITIONAL") tags.add("policy_conditional");
        if (hasBudgetError) tags.add("budget_out_of_bounds");
        if (report.overall.primary_blocking_reason === "OBJECTIVE_NOT_SUPPORTED") tags.add("objective_not_supported");
        if (report.objectives.blocked_venues.some(v => v.reason_code === "VENUE_DISABLED")) tags.add("venue_disabled");
        if (report.objectives.blocked_venues.some(v => v.reason_code === "INCOMPATIBLE_OBJECTIVE")) tags.add("venue_objective_incompatible");

        report.overall.summary_tags = Array.from(tags).sort();

        // 18. Deterministic Sorting
        report.objectives.allowed_venues.sort();
        report.objectives.blocked_venues.sort((a, b) => a.venue_key.localeCompare(b.venue_key));
        report.budget_constraints.violations = sortViolations(report.budget_constraints.violations);
        report.creative_requirements.venue_findings.sort((a, b) => a.venue_key.localeCompare(b.venue_key));
        report.audience_requirements.venue_findings.sort((a, b) => a.venue_key.localeCompare(b.venue_key));

        // Deduplicate and sort connector arrays
        report.connector_readiness_summary.venues_blocked_by_policy = [...new Set(report.connector_readiness_summary.venues_blocked_by_policy)].sort();
        report.connector_readiness_summary.venues_allowed_with_conditions = [...new Set(report.connector_readiness_summary.venues_allowed_with_conditions)].sort();
        report.connector_readiness_summary.venues_unconstrained = [...new Set(report.connector_readiness_summary.venues_unconstrained)].sort();

        report.diagnostics.missing_policy_entries = [...new Set(report.diagnostics.missing_policy_entries)].sort();
        report.diagnostics.evaluation_warnings = [...new Set(report.diagnostics.evaluation_warnings)].sort();

        // 19. Final Return
        return {
            ok: true,
            module: "policy_reasoner_engine",
            execution_id,
            timestamp,
            payload: sortKeys(report),
            error: null
        };

    } catch (err) {
        return createErrorEnvelope(execution_id, "POLICY_REASONER_UNEXPECTED_ERROR", err.message || "Unexpected error");
    }
}

module.exports = {
    reasonPolicy
};
