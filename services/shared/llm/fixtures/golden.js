// success_schema_output.json
module.exports.SUCCESS_SCHEMA_OUTPUT = {
    id: "chatcmpl-123",
    object: "chat.completion",
    created: 1677652288,
    model: "gpt-5.2-preview",
    choices: [{
        index: 0,
        message: {
            role: "assistant",
            content: "{\"result\": \"success\", \"score\": 0.99}"
        },
        finish_reason: "stop"
    }],
    usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20
    }
};

// refusal_output.json (Schema Failure simulation - usually OpenAI returns 400 or refusal, 
// here we mock a malformed content that manages to bypass or a clean refusal)
module.exports.MALFORMED_JSON_OUTPUT = {
    id: "chatcmpl-456",
    object: "chat.completion",
    created: 1677652289,
    model: "gpt-5.2-preview",
    choices: [{
        index: 0,
        message: {
            role: "assistant",
            content: "{ invalid json "
        },
        finish_reason: "stop"
    }],
    usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
    }
};

// rate_limit_error.json
module.exports.RATE_LIMIT_ERROR = {
    message: "Rate limit reached for requests",
    type: "requests",
    param: null,
    code: "rate_limit_exceeded"
};

// network_error.json
module.exports.NETWORK_ERROR = {
    message: "Connection error",
    type: "server_error",
    param: null,
    code: null
};

// determinism_input.json
module.exports.DETERMINISM_INPUT = {
    task: "GATING_FINAL",
    messages: [{ role: "user", content: "Test" }],
    idempotencyKey: "idem-key-1",
    requestedAt: "2025-01-01T00:00:00.000Z"
};
