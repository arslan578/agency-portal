/**
 * orchestrator/shared/serialization/stable_json.js
 *
 * Deterministic JSON Serializer.
 * Enforces key sorting to ensure byte-identical outputs for identical inputs.
 * Feature Flag: FF_STABLE_JSON (default: false)
 */

function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sortKeys);
    }

    // Object: Sort keys and recursively sort values
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};

    for (const key of sortedKeys) {
        sortedObj[key] = sortKeys(obj[key]);
    }

    return sortedObj;
}

function stableStringify(data) {
    const isStable = process.env.FF_STABLE_JSON === 'true';

    if (!isStable) {
        return JSON.stringify(data);
    }

    try {
        const sorted = sortKeys(data);
        return JSON.stringify(sorted);
    } catch (err) {
        // Fallback if sorting fails (e.g. circular dependency - though JSON.stringify handles that by throwing too)
        // We throw to surface the error
        throw err;
    }
}

module.exports = {
    stringify: stableStringify,
    sortKeys // Exported for testing/utility
};
