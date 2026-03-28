const { parseIntent } = require('./intent_parser');
const dispatch = require('./dispatcher');

async function runOrchestrator(rawInput) {
    try {
        const normalizedIntent = parseIntent(rawInput || {});
        return await dispatch(normalizedIntent);
    } catch (err) {
        return {
            ok: false,
            module: 'orchestrator',
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: err.message || 'Orchestrator internal error',
                code: 'INTERNAL_ERROR'
            }
        };
    }
}

module.exports = { runOrchestrator };
