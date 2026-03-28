/**
 * Phase 33: Policy Reasoner Engine - Entry Point
 */

const { reasonPolicy } = require('./policy_reasoner_engine');
const { validateEnvelope } = require('./validators');
const { createErrorEnvelope } = require('./helpers');

function runPolicyReasoner(envelope) {
    // 1. Validate Envelope
    const envError = validateEnvelope(envelope);
    if (envError) {
        return createErrorEnvelope(envelope?.execution_id, "MALFORMED_POLICY_REASONER_CONTRACT", envError);
    }

    const { execution_id } = envelope;

    // 2. Feature Flag Check
    const isEnabled = process.env.FF_POLICY_REASONER_V1 === "true" || process.env.FF_POLICY_REASONER_V1 === true;

    if (!isEnabled) {
        return {
            ok: true,
            module: "policy_reasoner_engine",
            execution_id,
            timestamp: new Date().toISOString(),
            payload: null,
            error: null,
            diagnostics: { disabled: true }
        };
    }

    // 4. Call Reasoner
    return reasonPolicy(envelope);
}

module.exports = {
    runPolicyReasoner
};
