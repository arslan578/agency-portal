/**
 * Phase 33: Policy Reasoner Engine - Validators
 */

function validateEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') return "Envelope must be an object";
    if (envelope.intent !== "POLICY_REASONING_V1") return "Invalid intent";
    if (envelope.module !== "orchestrator") return "Invalid module";
    if (typeof envelope.execution_id !== 'string' || !envelope.execution_id) return "Missing or invalid execution_id";
    if (!envelope.payload || typeof envelope.payload !== 'object') return "Missing or invalid payload";
    if (!envelope.payload.execution_snapshot || typeof envelope.payload.execution_snapshot !== 'object') return "Missing execution_snapshot";
    if (!envelope.payload.policy_mirror || typeof envelope.payload.policy_mirror !== 'object') return "Missing policy_mirror";
    return null;
}

function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return "Snapshot must be an object";
    // Minimal structural check as per spec
    // Optional fields are allowed to be missing, but if present must be correct type?
    // Spec says: "minimal structural validation: must be object"
    // We can check deeper if needed but spec says minimal.
    return null;
}

function validateMirror(mirror) {
    if (!mirror || typeof mirror !== 'object') return "Mirror must be an object";
    if (!mirror.rules || typeof mirror.rules !== 'object') return "Mirror missing rules object";

    const rules = mirror.rules;
    if (!rules.budget || typeof rules.budget.min_total !== 'number' || typeof rules.budget.max_total !== 'number') {
        return "Mirror missing valid budget rules";
    }
    if (!rules.venues || typeof rules.venues !== 'object') {
        return "Mirror missing valid venue rules";
    }
    if (!rules.compatibility_matrix || typeof rules.compatibility_matrix !== 'object') {
        return "Mirror missing valid compatibility matrix";
    }

    return null;
}

module.exports = {
    validateEnvelope,
    validateSnapshot,
    validateMirror
};
