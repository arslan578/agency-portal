const OpenAI = require('openai');
const {
    LLMConfigError,
    LLMTimeoutError,
    LLMRateLimitError,
    LLMTransientNetworkError,
    LLMInvalidOutputError
} = require('./errors');

// Initialize OpenAI client strictly once if possible, or per request if env changes (unlikely)
let openaiInstance = null;
function getOpenAIClient() {
    if (!openaiInstance) {
        if (!process.env.OPENAI_API_KEY) {
            throw new LLMConfigError("OPENAI_API_KEY is not set");
        }
        openaiInstance = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 0 // We handle retries manually
        });
    }
    return openaiInstance;
}

/**
 * Executes a completion request with retries and error normalization.
 * @param {Object} params
 * @param {string} params.model
 * @param {Array} params.messages
 * @param {Object} [params.jsonSchema]
 * @param {number} [params.timeoutMs]
 * @param {Object} [params.requestOptions] - e.g. idempotencyKey
 * @returns {Promise<Object>}
 */
async function executeCompletion({ model, messages, jsonSchema, timeoutMs = 30000, requestOptions = {} }, retryCount = 0) {
    const client = getOpenAIClient();
    const MAX_RETRIES = 2; // Cap deterministic retries
    const BACKOFF_MS = 1000;

    try {
        const body = {
            model,
            messages,
        };

        if (jsonSchema) {
            body.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "output_schema",
                    strict: true,
                    schema: jsonSchema
                }
            };
        } else {
            // Default to json_object if we want structured output but no strict schema is provided, 
            // OR generic text. 
            // Current existing code uses `response_format: { type: 'json_object' }`.
            // For this new client, if no schema is passed but the existing code expects JSON,
            // we might need to support 'json_object' mode.
            // Requirement: "Must support structured outputs via JSON schema when provided."
            // Existing code uses `json_object` + prompt "return JSON". 
            // We should allow basic json_object if implied, but `runLLM` contract says `jsonSchema` is optional.
            // If jsonSchema is missing, we default to text, unless we want to support the legacy mode.
            // For now, simple text or strict schema.
        }

        const options = {
            timeout: timeoutMs,
            ...requestOptions
        };

        // Pass idempotency key via headers if present in requestOptions (OpenAI helpers handle this?)
        // OpenAI Node SDK supports `idempotencyKey` in the options object of the method.
        if (requestOptions.idempotencyKey) {
            options.idempotencyKey = requestOptions.idempotencyKey;
        }

        const response = await client.chat.completions.create(body, options);
        return response;

    } catch (error) {
        // Handle Retries
        if (retryCount < MAX_RETRIES) {
            if (error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.RateLimitError || error.status >= 500) {
                // Wait and retry
                await new Promise(resolve => setTimeout(resolve, BACKOFF_MS * (retryCount + 1)));
                return executeCompletion({ model, messages, jsonSchema, timeoutMs, requestOptions }, retryCount + 1);
            }
        }

        // Normalize Error
        if (error instanceof OpenAI.APIConnectionError) {
            throw new LLMTransientNetworkError(error.message, error);
        }
        if (error instanceof OpenAI.RateLimitError) {
            throw new LLMRateLimitError(error.message, error);
        }
        if (error instanceof OpenAI.APIError && error.status === 408) { // Request Timeout
            throw new LLMTimeoutError(error.message, error);
        }

        // Propagate other errors or wrap generic
        throw error;
    }
}

module.exports = {
    executeCompletion,
    getOpenAIClient // Exported mainly for mocking/testing
};
