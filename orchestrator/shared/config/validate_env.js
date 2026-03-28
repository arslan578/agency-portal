/**
 * orchestrator/shared/config/validate_env.js
 *
 * Validates presence of required environment variables at startup.
 * Deterministic: Sorts keys in output.
 * Non-mutating: Checks process.env but does not modify it.
 * Feature Flag: FF_STRICT_ENV_VALIDATION (default: false)
 *   - false: Warn only (Observe mode)
 *   - true: Error and Exit 1 (Enforce mode)
 */

module.exports = function validateEnv(requiredKeys = []) {
    const missing = [];

    // Deterministic check
    for (const key of requiredKeys) {
        if (!process.env[key]) {
            missing.push(key);
        }
    }

    if (missing.length === 0) {
        return;
    }

    // Sort for deterministic log output
    missing.sort();

    const isStrict = process.env.FF_STRICT_ENV_VALIDATION === 'true';

    if (isStrict) {
        console.error(`[FATAL] Missing required config keys: ${JSON.stringify(missing)}`);
        console.error(`[FATAL] Service refusing to start. Set correct env vars or disable FF_STRICT_ENV_VALIDATION.`);
        process.exit(1);
    } else {
        console.warn(`[WARN] Missing required config keys: ${JSON.stringify(missing)}`);
        console.warn(`[WARN] Service continuing in OBSERVE mode. This will be a fatal error when FF_STRICT_ENV_VALIDATION is enabled.`);
    }
};
