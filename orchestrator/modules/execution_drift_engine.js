/**
 * Phase 23: Execution Drift Engine (Pure Logic)
 *
 * Compares expected execution plan (Phase 14) to actual connector run result (Phase 22)
 * and produces a deterministic drift report.
 */

const BUDGET_EPSILON = 0.01;

/**
 * Main entry point for Phase 23.
 *
 * @param {object} input - { plan, run }
 * @returns {object} - Orchestrator envelope
 */
function detectDrift(input) {
    const timestamp = new Date().toISOString();

    // 1. Input Validation
    if (!input || typeof input !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "DETECT_EXECUTION_DRIFT_V1 requires { plan, run } payload");
    }

    const { plan, run } = input;

    if (!plan || typeof plan !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing 'plan' in input");
    }

    if (!run || typeof run !== "object") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing 'run' in input");
    }

    if (typeof run.run_id !== "string" || run.run_id.trim() === "") {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing or invalid 'run_id' in run");
    }

    try {
        // 2. Index data
        const expectedByKey = indexExpectedVenues(plan);
        const requestedByKey = indexRequestedVenues(run);
        const resultByKey = indexResultVenues(run);

        const allKeys = new Set([
            ...expectedByKey.keys(),
            ...requestedByKey.keys(),
            ...resultByKey.keys()
        ]);

        // 3. Global summary drift
        const venueCount = requestedByKey.size;
        const globalIssues = checkSummaryConsistency(run, venueCount);

        const venueDrifts = [];

        // 4. Per venue drift
        const sortedVenueKeys = Array.from(allKeys).sort();

        for (const venueKey of sortedVenueKeys) {
            const expected = expectedByKey.get(venueKey) || null;
            const requested = requestedByKey.get(venueKey) || null;
            const result = resultByKey.get(venueKey) || null;

            const issues = [];

            if (expected && !requested) {
                // Expected in plan, missing in actual
                issues.push({
                    code: "VENUE_MISSING_IN_ACTUAL",
                    message: `Venue '${venueKey}' is present in plan but missing from connector requests`,
                    severity: "CRITICAL",
                    venue_key: venueKey,
                    expected: { present_in_plan: true },
                    actual: { present_in_requests: false }
                });
            } else if (!expected && requested) {
                // Unexpected in actual
                issues.push({
                    code: "VENUE_UNEXPECTED_IN_ACTUAL",
                    message: `Venue '${venueKey}' appears in connector requests but not in plan`,
                    severity: "WARNING",
                    venue_key: venueKey,
                    expected: { present_in_plan: false },
                    actual: { present_in_requests: true }
                });
            } else if (expected && requested) {
                // Budget, units, connector errors
                checkBudgetMismatch(expected, requested, issues, venueKey);
                checkUnitsMismatch(expected, requested, issues, venueKey);
            }

            if (result) {
                checkConnectorError(result, issues, venueKey);
            }

            const severity = aggregateSeverity(issues);

            venueDrifts.push({
                venue_key: venueKey,
                severity,
                issues
            });
        }

        // 5. Attach global drift (if any), always last
        if (globalIssues.length > 0) {
            venueDrifts.push({
                venue_key: "_global_",
                severity: aggregateSeverity(globalIssues),
                issues: globalIssues
            });
        }

        // 6. Summary
        const summary = computeDriftSummary({
            venueDrifts,
            totalExpected: expectedByKey.size,
            totalActual: requestedByKey.size
        });

        return {
            ok: true,
            module: "execution_drift_engine",
            timestamp,
            payload: {
                run_id: run.run_id,
                summary,
                venues: venueDrifts
            }
        };

    } catch (err) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", err.message || "Unknown error");
    }
}

// ---------- Index helpers ----------

function indexExpectedVenues(plan) {
    const map = new Map();
    const venues = Array.isArray(plan.venues) ? plan.venues : [];

    for (const v of venues) {
        const key = normalizeVenueKey(v && v.venue_key);
        if (!key) continue;
        map.set(key, v);
    }

    return map;
}

function indexRequestedVenues(run) {
    const map = new Map();

    const requests =
        run &&
            run.connector_payload &&
            run.connector_payload.connector_requests &&
            Array.isArray(run.connector_payload.connector_requests.venues)
            ? run.connector_payload.connector_requests.venues
            : [];

    for (const v of requests) {
        const key = normalizeVenueKey(v && v.venue_key);
        if (!key) continue;
        map.set(key, v);
    }

    return map;
}

function indexResultVenues(run) {
    const map = new Map();

    const venues =
        run &&
            run.connector_result &&
            Array.isArray(run.connector_result.venues)
            ? run.connector_result.venues
            : [];

    for (const v of venues) {
        const key = normalizeVenueKey(v && v.venue_key);
        if (!key) continue;
        map.set(key, v);
    }

    return map;
}

function normalizeVenueKey(key) {
    if (typeof key !== "string") return null;
    const trimmed = key.trim();
    return trimmed === "" ? null : trimmed;
}

// ---------- Drift checks ----------

function checkSummaryConsistency(run, actualVenueCount) {
    const issues = [];

    if (run.summary && typeof run.summary.total_venues === "number") {
        const expectedTotal = run.summary.total_venues;
        if (expectedTotal !== actualVenueCount) {
            issues.push({
                code: "SUMMARY_TOTAL_VENUES_MISMATCH",
                message: `Run summary reports ${expectedTotal} venues but ${actualVenueCount} connector request venues were found`,
                severity: "WARNING",
                venue_key: null,
                expected: { summary_total_venues: expectedTotal },
                actual: { actual_venues: actualVenueCount }
            });
        }
    }

    return issues;
}

function checkBudgetMismatch(planVenue, requestedVenue, issues, venueKey) {
    const stats = planVenue && planVenue.stats;
    const expectedBudget = stats && typeof stats.expected_budget === "number"
        ? stats.expected_budget
        : null;

    const actualBudget = typeof requestedVenue.budget === "number"
        ? requestedVenue.budget
        : null;

    if (typeof expectedBudget === "number" && typeof actualBudget === "number") {
        const diff = Math.abs(expectedBudget - actualBudget);
        if (diff > BUDGET_EPSILON) {
            issues.push({
                code: "BUDGET_MISMATCH",
                message: `Budget mismatch for venue '${venueKey}': expected ${expectedBudget}, actual ${actualBudget}`,
                severity: "WARNING",
                venue_key: venueKey,
                expected: { budget: expectedBudget },
                actual: { budget: actualBudget }
            });
        }
    }
}

function checkUnitsMismatch(planVenue, requestedVenue, issues, venueKey) {
    const stats = planVenue && planVenue.stats;
    const expectedUnits = stats && typeof stats.expected_units === "number"
        ? stats.expected_units
        : null;

    const actualUnits = typeof requestedVenue.units === "number"
        ? requestedVenue.units
        : null;

    if (typeof expectedUnits === "number" && typeof actualUnits === "number") {
        if (expectedUnits !== actualUnits) {
            issues.push({
                code: "UNITS_MISMATCH",
                message: `Units mismatch for venue '${venueKey}': expected ${expectedUnits}, actual ${actualUnits}`,
                severity: "INFO",
                venue_key: venueKey,
                expected: { units: expectedUnits },
                actual: { units: actualUnits }
            });
        }
    }
}

function checkConnectorError(resultVenue, issues, venueKey) {
    const statusCode = typeof resultVenue.status_code === "number"
        ? resultVenue.status_code
        : null;

    const hasErrors = Array.isArray(resultVenue.errors) && resultVenue.errors.length > 0;

    if ((statusCode && statusCode >= 400) || hasErrors) {
        issues.push({
            code: "CONNECTOR_ERROR",
            message: `Connector reported error for venue '${venueKey}'`,
            severity: "CRITICAL",
            venue_key: venueKey,
            expected: null,
            actual: {
                status_code: statusCode,
                errors_count: hasErrors ? resultVenue.errors.length : 0
            }
        });
    }
}

// ---------- Severity and summary ----------

function aggregateSeverity(issues) {
    if (!issues || issues.length === 0) return "NONE";

    let hasCritical = false;
    let hasWarning = false;
    let hasInfo = false;

    for (const issue of issues) {
        if (issue.severity === "CRITICAL") hasCritical = true;
        else if (issue.severity === "WARNING") hasWarning = true;
        else if (issue.severity === "INFO") hasInfo = true;
    }

    if (hasCritical) return "CRITICAL";
    if (hasWarning) return "WARNING";
    if (hasInfo) return "INFO";
    return "NONE";
}

function computeDriftSummary({ venueDrifts, totalExpected, totalActual }) {
    let has_drift = false;
    let venues_with_drift = 0;
    let issues_total = 0;

    let highest_severity = "NONE";

    for (const drift of venueDrifts) {
        const severity = drift.severity || "NONE";
        const issueCount = Array.isArray(drift.issues) ? drift.issues.length : 0;

        issues_total += issueCount;

        if (severity !== "NONE") {
            has_drift = true;
            venues_with_drift++;
            highest_severity = maxSeverity(highest_severity, severity);
        }
    }

    return {
        has_drift,
        highest_severity,
        counts: {
            total_expected_venues: totalExpected,
            total_actual_venues: totalActual,
            venues_with_drift,
            issues_total
        }
    };
}

function maxSeverity(a, b) {
    const order = { NONE: 0, INFO: 1, WARNING: 2, CRITICAL: 3 };
    return order[b] > order[a] ? b : a;
}

// ---------- Envelope helper ----------

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "execution_drift_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    detectDrift
};
