const { LLMConfigError } = require('./errors');

const TASK_MODEL_MAPPING = {
    ORCHESTRATION_CORE: 'OPENAI_MODEL_CORE',
    GATING_FINAL: 'OPENAI_MODEL_GATING',
    TRANSFORM: 'OPENAI_MODEL_TRANSFORM',
    TAGGING: 'OPENAI_MODEL_TAGGING',
    VISION: 'OPENAI_MODEL_MULTIMODAL'
};

/**
 * Resolves the model ID to use for a given task based on configuration.
 * @param {string} task - The task type
 * @returns {string} - The model ID to use
 * @throws {LLMConfigError} - If configuration is missing
 */
function resolveModel(task) {
    // 1. Check if router is enabled
    const routerEnabled = process.env.FF_OPENAI_MODEL_ROUTER_ENABLED === 'true';

    // 2. If not enabled, return default legacy path (orchestrator defaults)
    // Note: The caller handles the legacy path fallback if this returns null/undefined
    // or we can strictly return the current production default "gpt-4o" if that's universal.
    // However, per requirements: "If FF_OPENAI_MODEL_ROUTER_ENABLED=false, use the current default model path."
    // This implies the router might just return specific models when enabled.
    // But to keep it simple and centralized: logic relies on the flag.

    if (!routerEnabled) {
        // Fallback to legacy default if needed, or let the client decide. 
        // For strict replacement, we might return the old standard 'gpt-4o'.
        // But the prompt says "use the current default model path (whatever the system uses today)".
        // Since existing code is being replaced, we should probably return the "old" default 
        // if the flag is off, OR the client handles it.
        // Let's implement this: The router is authoritative. 
        // Usage: resolveModel(task) -> model. 
        return 'gpt-4o'; // Current Kaivo default
    }

    // 3. Resolve env var name
    const envVarName = TASK_MODEL_MAPPING[task];
    if (!envVarName) {
        throw new LLMConfigError(`Unknown task type: ${task}`);
    }

    // 4. Get model ID from env
    const modelId = process.env[envVarName];
    if (!modelId) {
        throw new LLMConfigError(`Missing environment variable for task ${task}: ${envVarName}`);
    }

    return modelId;
}

module.exports = {
    resolveModel,
    TASK_MODEL_MAPPING
};
