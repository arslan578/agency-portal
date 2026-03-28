const logStructured = (event, data) => {
    // In a real implementation, this might write to stdout/JSON
    console.log(JSON.stringify({ event, ...data }));
};

const resolveContextValue = (key, explicit, inputFallback) => {
    if (explicit) return explicit;
    if (inputFallback && inputFallback[key]) return inputFallback[key];
    return 'unknown';
};

// Redaction Logic
const SENSITIVE_KEYS = /password|secret|token|key|auth|credential/i;
const redact = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) return obj.map(redact);

    const newObj = {};
    for (const k in obj) {
        if (SENSITIVE_KEYS.test(k)) {
            newObj[k] = '[REDACTED]';
        } else {
            newObj[k] = redact(obj[k]);
        }
    }
    return newObj;
};

const logStructuredRequired = (event, payload, context = {}) => {
    const { input } = context;

    // Resolve required fields with precedence: Explicit -> Input -> Unknown
    const execution_id = resolveContextValue('execution_id', context.execution_id, input);
    const phase = resolveContextValue('phase', context.phase, input);
    const contract_version = resolveContextValue('contract_version', context.contract_version, input);

    // Intent is optional/situational, but we inject if present nearby
    const intent = context.intent || (input && input.intent) || undefined;

    const rawPayload = {
        ...payload,
        execution_id,
        phase,
        contract_version
    };

    if (intent) {
        rawPayload.intent = intent;
    }

    // Apply redaction before logging
    const safePayload = redact(rawPayload);

    logStructured(event, safePayload);
};

module.exports = {
    logStructured,
    logStructuredRequired
};
