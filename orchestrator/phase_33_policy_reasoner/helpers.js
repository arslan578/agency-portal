/**
 * Phase 33: Policy Reasoner Engine - Helpers
 */

/**
 * Recursively sorts object keys lexicographically.
 * Arrays are NOT sorted here (must be sorted by caller).
 * @param {any} obj 
 * @returns {any}
 */
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

/**
 * Sorts violations by severity (ERROR > WARN > INFO), then rule_key, then message_code.
 * @param {Array} violations 
 * @returns {Array}
 */
function sortViolations(violations) {
    const severityRank = { "ERROR": 0, "WARN": 1, "INFO": 2 };
    return [...violations].sort((a, b) => {
        const rankA = severityRank[a.severity] ?? 99;
        const rankB = severityRank[b.severity] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        if (a.rule_key !== b.rule_key) return a.rule_key.localeCompare(b.rule_key);
        return a.message_code.localeCompare(b.message_code);
    });
}

/**
 * Creates a standard error envelope.
 * @param {string|null} execution_id 
 * @param {string} code 
 * @param {string} message 
 * @param {object} [details] 
 * @returns {object}
 */
function createErrorEnvelope(execution_id, code, message, details) {
    return {
        ok: false,
        module: "policy_reasoner_engine",
        execution_id: execution_id || null,
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message,
            ...(details ? { details } : {})
        }
    };
}

module.exports = {
    sortKeys,
    sortViolations,
    createErrorEnvelope
};
