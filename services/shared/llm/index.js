const { resolveModel } = require('./router');
const { executeCompletion } = require('./responses_client');
const { LLMInvalidOutputError, LLMConfigError } = require('./errors');
const { performance } = require('perf_hooks');

/**
 * @typedef {import('./types').RunLLMOptions} RunLLMOptions
 * @typedef {import('./types').RunLLMResult} RunLLMResult
 */

/**
 * Executes an LLM request with routing, structured output enforcement, and logging.
 * 
 * @param {RunLLMOptions} options
 * @returns {Promise<RunLLMResult>}
 */
async function runLLM({
    task,
    messages,
    jsonSchema,
    reasoningEffort,
    timeoutMs,
    idempotencyKey,
    requestedAt = new Date().toISOString()
}) {
    // 1. Validation
    if (task === 'GATING_FINAL' && !idempotencyKey) {
        throw new LLMConfigError("idempotencyKey is required for GATING_FINAL task");
    }

    // 2. Model Selection
    // If flag is OFF, this returns 'gpt-4o' (legacy default)
    // If flag is ON, this returns the pinned model from env
    const model = resolveModel(task);

    // 3. Prepare Request
    const startTime = performance.now();
    const requestOptions = {};
    if (idempotencyKey) {
        requestOptions.idempotencyKey = idempotencyKey;
    }

    try {
        const rawResponse = await executeCompletion({
            model,
            messages,
            jsonSchema,
            timeoutMs,
            requestOptions
        });

        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);
        const usage = rawResponse.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

        // 4. Log Telemetry
        console.log(JSON.stringify({
            level: 'info',
            event: 'llm_request_completed',
            request_id: rawResponse.id,
            task,
            model: rawResponse.model, // Actual model returned by API
            latency_ms: latencyMs,
            token_usage: usage
        }));

        const result = {
            raw: rawResponse,
            usage,
            model: rawResponse.model,
            requestedAt
        };

        // 5. Parse Output
        const choice = rawResponse.choices[0];
        const content = choice.message.content;

        if (jsonSchema) {
            try {
                // OpenAI Structured Outputs guarantees JSON matching the schema
                result.outputJson = JSON.parse(content);
            } catch (e) {
                // Should not happen with 'strict: true' but safety net
                throw new LLMInvalidOutputError("Failed to parse JSON from strict output", e);
            }
        } else {
            // If the user didn't provide a strict schema, but the prompt returns JSON (legacy behavior)
            // we check if it looks like JSON or just return text.
            // The requirements say: "If jsonSchema is provided ... return validated object".
            // It doesn't explicitly say what to do if not provided, implied is return raw text 
            // or let the caller parse.
            // However, existing calls rely on `JSON.parse(content)`. 
            // For the migration, if we are mimicking legacy `response_format: { type: 'json_object' }`,
            // we can try to parse if it looks like JSON, but safest is to return text 
            // and let the legacy code parse it if it wasn't a strict schema call.
            result.outputText = content;
        }

        return result;

    } catch (error) {
        // Log error telemetry
        console.error(JSON.stringify({
            level: 'error',
            event: 'llm_request_failed',
            task,
            model,
            error_code: error.code || 'UNKNOWN',
            error_message: error.message
        }));
        throw error;
    }
}

module.exports = {
    runLLM
};
