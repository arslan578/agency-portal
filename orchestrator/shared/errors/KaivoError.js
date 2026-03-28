/**
 * orchestrator/shared/errors/KaivoError.js
 *
 * Standard Error Object for Kaivo Services.
 * Guaranteed fields: code, category, retryable, message.
 *
 * Categories:
 * - VALIDATION: User/Input error (400)
 * - UNAUTHORIZED: Auth failure (401/403)
 * - INTERNAL: System error (500)
 * - UPSTREAM: External dependency failure (502/503)
 */

class KaivoError extends Error {
    constructor({ message, code, category, retryable = false, meta = {} }) {
        super(message);
        this.name = 'KaivoError';
        this.code = code || 'UNKNOWN_ERROR';
        this.category = category || 'INTERNAL';
        this.retryable = retryable;
        this.meta = meta;

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, KaivoError);
        }
    }

    static isKaivoError(err) {
        return err instanceof KaivoError;
    }

    toJSON() {
        return {
            message: this.message,
            code: this.code,
            category: this.category,
            retryable: this.retryable,
            meta: this.meta
        };
    }
}

module.exports = KaivoError;
