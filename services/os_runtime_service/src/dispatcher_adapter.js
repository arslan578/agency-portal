const dispatch = require('../../orchestrator/dispatcher');

/**
 * Adapts strict API contract to internal orchestrator signature.
 */
async function adaptAndDispatch(request) {
    const { execution_id, intent, payload } = request;

    // Map External Request -> Internal Dispatcher Signature
    // Signature: async function dispatch(normalizedIntent)
    // normalizedIntent = { target_module, payload, type }

    const normalizedIntent = {
        type: intent, // Map intent -> type checks in dispatcher
        payload: {
            ...payload,
            execution_id // Ensure execution_id is propagated for observability
        },
        // internal: true, // Optional marker if dispatcher needs to know origin
        target_module: null // Intents usually route by type first, module is secondary fallback
    };

    // Invoke dispatcher
    return await dispatch(normalizedIntent);
}

module.exports = { adaptAndDispatch };
