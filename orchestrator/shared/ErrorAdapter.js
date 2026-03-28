/**
 * @file ErrorAdapter.js
 * @description Boundary adapter to map internal KaivoErrors to external HTTP responses.
 * Strictly enforces "No Drift" policy and strict retry logic.
 */

const KaivoError = require('./errors/KaivoError');

// Transient codes that are safe to retry (Network/Infrastructure)
const RETRY_ALLOWLIST = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN', // DNS temporary failure
    'DEADLOCK_DETECTED',
    'UPSTREAM_TIMEOUT'
]);

class ErrorAdapter {
    /**
     * Safe determination if an error is retryable.
     * STRICT: Category is NOT enough. Must be in allowlist.
     * @param {Error} error 
     * @returns {boolean}
     */
    static isRetryable(error) {
        if (error.retryable === true) return true; // Explicit override
        if (RETRY_ALLOWLIST.has(error.code)) return true;
        return false;
    }

    /**
     * Maps internal error to standard HTTP Response format.
     * Preserves legacy contract unless FF_STANDARD_ERRORS is on.
     * @param {Error} error 
     * @param {Object} context 
     */
    static toHttpResponse(error, context = {}) {
        const isStandard = process.env.FF_STANDARD_ERRORS === 'true';

        // Default fallback
        let status = 500;
        let body = { error: 'Internal Server Error' };

        if (error instanceof KaivoError) {
            status = this.categoryToStatus(error.category);
            if (isStandard) {
                body = {
                    code: error.code,
                    category: error.category,
                    message: error.message,
                    // Do NOT expose retryable or meta externally by default
                };
            } else {
                // Legacy mapping (Attempt to preserve old shape if known)
                body = { error: error.message };
            }
        } else {
            // Unknown javascript error
            body = { error: isStandard ? error.message : 'An unexpected error occurred' };
        }

        return { status, body };
    }

    static categoryToStatus(category) {
        switch (category) {
            case 'VALIDATION': return 400;
            case 'AUTH': return 401;
            case 'FORBIDDEN': return 403;
            case 'NOT_FOUND': return 404;
            case 'CONFLICT': return 409;
            case 'UPSTREAM': return 502;
            case 'TIMEOUT': return 504;
            default: return 500;
        }
    }
}

module.exports = ErrorAdapter;
