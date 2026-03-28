function parseIntent(rawInput) {
    return {
        intent_type: rawInput.intent_type || "unknown",
        target_module: rawInput.target_module || rawInput.module || null,
        type: rawInput.type || null,  // Support action-based routing
        action: rawInput.action || null, // Support explicit action
        payload: rawInput.payload || rawInput.input || {} // Support input as payload alias
    };
}

module.exports = { parseIntent };
