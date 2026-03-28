/**
 * Execution Readiness Engine (Phase 17)
 *
 * Aggregates validation and policy reports to compute launch readiness.
 * Pure logic, deterministic, no IO.
 */

/**
 * Runs readiness evaluation on ExecutionIndexedPlan with validation and policy reports.
 *
 * @param {object} input - Input containing plan, validation, and policy
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run_execution_readiness(input) {
    // 1. Validate Input
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Input must be an object");
    }

    const { plan, validation, policy } = input;

    if (!plan || typeof plan !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Plan must be an object");
    }

    if (!validation || typeof validation !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Validation must be an object");
    }

    if (!policy || typeof policy !== 'object') {
        return createErrorEnvelope("INVALID_INPUT", "Policy must be an object");
    }

    try {
        // 2. Compute readiness
        const readiness = computeReadiness(validation, policy);

        return createSuccessEnvelope(plan, validation, policy, readiness);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", "An internal error occurred");
    }
}

/**
 * Normalizes fix field to stable shape: string | null.
 */
function normalizeFix(fix) {
    if (typeof fix === "string") {
        return fix;
    }
    if (fix && typeof fix === "object" && typeof fix.description === "string") {
        return fix.description;
    }
    return null;
}

/**
 * Computes the readiness report from validation and policy.
 */
function computeReadiness(validation, policy) {
    // Extract validation errors
    const validationErrors = Array.isArray(validation.errors) ? validation.errors : [];

    // Extract policy issues
    const policyIssues = Array.isArray(policy.issues) ? policy.issues : [];

    // Categorize policy issues by level
    const policyErrors = policyIssues.filter(i => i.level === "ERROR");
    const policyWarnings = policyIssues.filter(i => i.level === "WARNING");
    const policyInfos = policyIssues.filter(i => i.level === "INFO");

    // Compute flags
    const has_validation_errors = validationErrors.length > 0;
    const has_policy_errors = policyErrors.length > 0;
    const is_launchable = !has_validation_errors && !has_policy_errors;

    // Compute counts
    const counts = {
        validation_errors: validationErrors.length,
        policy_errors: policyErrors.length,
        policy_warnings: policyWarnings.length,
        policy_infos: policyInfos.length,
        total_blocking: validationErrors.length + policyErrors.length,
        total_non_blocking: policyWarnings.length + policyInfos.length
    };

    // Compute worst_level
    let worst_level = "NONE";
    if (counts.total_blocking > 0) {
        worst_level = "ERROR";
    } else if (counts.policy_warnings > 0) {
        worst_level = "WARNING";
    } else if (counts.policy_infos > 0) {
        worst_level = "INFO";
    }

    // Build blocks array (VALIDATION errors first, then POLICY errors)
    const blocks = [];

    // Add validation errors
    validationErrors.forEach(err => {
        blocks.push({
            source: "VALIDATION",
            level: "ERROR",
            code: err.code || "UNKNOWN",
            message: err.message || "",
            path: err.path,
            details: err.details,
            fix: null
        });
    });

    // Add policy errors
    policyErrors.forEach(err => {
        blocks.push({
            source: "POLICY",
            level: "ERROR",
            code: err.code || "UNKNOWN",
            message: err.message || "",
            path: err.path,
            details: err.details,
            fix: normalizeFix(err.fix)
        });
    });

    // Build warnings array (POLICY warnings only)
    const warnings = policyWarnings.map(warn => ({
        source: "POLICY",
        level: "WARNING",
        code: warn.code || "UNKNOWN",
        message: warn.message || "",
        path: warn.path,
        details: warn.details,
        fix: normalizeFix(warn.fix)
    }));

    // Build infos array (POLICY infos only)
    const infos = policyInfos.map(info => ({
        source: "POLICY",
        level: "INFO",
        code: info.code || "UNKNOWN",
        message: info.message || "",
        path: info.path,
        details: info.details,
        fix: normalizeFix(info.fix)
    }));

    return {
        is_launchable,
        has_validation_errors,
        has_policy_errors,
        worst_level,
        counts,
        blocks,
        warnings,
        infos
    };
}

function createSuccessEnvelope(plan, validation, policy, readiness) {
    return {
        ok: true,
        module: "execution_readiness_engine",
        timestamp: new Date().toISOString(),
        payload: {
            plan,
            validation,
            policy,
            readiness
        }
    };
}

function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "execution_readiness_engine",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { run_execution_readiness };
