/**
 * @typedef {"ORCHESTRATION_CORE" | "GATING_FINAL" | "TRANSFORM" | "TAGGING" | "VISION"} LLMTaskType
 */

/**
 * @typedef {"minimal" | "medium" | "high"} ReasoningEffort
 */

/**
 * @typedef {Object} LLMMessageContentImage
 * @property {"input_image"} type
 * @property {string} image_url
 */

/**
 * @typedef {Object} LLMMessageContentText
 * @property {"text"} type
 * @property {string} text
 */

/**
 * @typedef {Object} LLMMessage
 * @property {"system" | "user" | "assistant"} role
 * @property {string | Array<LLMMessageContentText | LLMMessageContentImage>} content
 */

/**
 * @typedef {Object} RunLLMOptions
 * @property {LLMTaskType} task - The task type for model routing
 * @property {LLMMessage[]} messages - The conversation history
 * @property {Object} [jsonSchema] - Optional JSON schema for structured output
 * @property {ReasoningEffort} [reasoningEffort] - Effort level for reasoning models
 * @property {number} [timeoutMs] - Timeout in milliseconds
 * @property {string} [idempotencyKey] - Required for GATING_FINAL task
 * @property {string} [requestedAt] - Original request timestamp to pass through
 */

/**
 * @typedef {Object} RunLLMResult
 * @property {Object} [raw] - Raw provider response (if needed)
 * @property {Object} [outputJson] - Validated JSON output (if schema provided)
 * @property {string} [outputText] - Text output (if no schema provided)
 * @property {Object} usage - Token usage stats
 * @property {string} model - The specific model used
 * @property {string} requestedAt - Timestamp of the request
 */

module.exports = {};
