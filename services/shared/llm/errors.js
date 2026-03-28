class LLMError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
    }
}

class LLMConfigError extends LLMError {
    constructor(message, details) {
        super(message, 'LLM_CONFIG_ERROR', details);
    }
}

class LLMTimeoutError extends LLMError {
    constructor(message = 'LLM request timed out', details) {
        super(message, 'LLM_TIMEOUT_ERROR', details);
    }
}

class LLMRateLimitError extends LLMError {
    constructor(message = 'LLM rate limit exceeded', details) {
        super(message, 'LLM_RATE_LIMIT_ERROR', details);
    }
}

class LLMTransientNetworkError extends LLMError {
    constructor(message = 'LLM transient network error', details) {
        super(message, 'LLM_TRANSIENT_NETWORK_ERROR', details);
    }
}

class LLMInvalidOutputError extends LLMError {
    constructor(message = 'LLM output validation failed', details) {
        super(message, 'LLM_INVALID_OUTPUT_ERROR', details);
    }
}

module.exports = {
    LLMError,
    LLMConfigError,
    LLMTimeoutError,
    LLMRateLimitError,
    LLMTransientNetworkError,
    LLMInvalidOutputError
};
