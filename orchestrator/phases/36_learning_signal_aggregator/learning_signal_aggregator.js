/**
 * Phase 36: Learning Signal Aggregator
 * Converts Phase 35 outputs into normalized, replay-safe learning signals
 */

// Helper: Clamp to 0-1 range
function clamp01(val) {
    return Math.max(0, Math.min(1, val));
}

// Helper: Sort object keys recursively
function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
}

// Main aggregation function
function aggregateLearningSignals(envelope) {
    const timestamp = new Date().toISOString();

    try {
        // 1. Input Validation
        if (!envelope || typeof envelope !== 'object') {
            return createErrorEnvelope("MALFORMED_PHASE_35_OUTPUT", "Envelope must be an object");
        }

        if (!envelope.payload || typeof envelope.payload !== 'object') {
            return createErrorEnvelope("MALFORMED_PHASE_35_OUTPUT", "Missing payload");
        }

        const { payload } = envelope;

        // Validate required arrays
        if (!Array.isArray(payload.recommended)) {
            return createErrorEnvelope("MALFORMED_PHASE_35_OUTPUT", "Missing recommended array");
        }

        if (!Array.isArray(payload.excluded)) {
            return createErrorEnvelope("MALFORMED_PHASE_35_OUTPUT", "Missing excluded array");
        }

        // Validate required numbers
        if (typeof payload.global_score !== 'number' || isNaN(payload.global_score)) {
            return createErrorEnvelope("MALFORMED_PHASE_35_OUTPUT", "Missing or invalid global_score");
        }

        if (typeof payload.constraint_tightness !== 'number' || isNaN(payload.constraint_tightness)) {
            return createErrorEnvelope("MALFORMED_PHASE_35_OUTPUT", "Missing or invalid constraint_tightness");
        }

        // Optional fields with defaults
        const coverage_score = typeof payload.coverage_score === 'number' ? payload.coverage_score : 1.0;
        const required_venues = payload.required_venues || [];

        // Check for empty recommended (edge case)
        if (payload.recommended.length === 0) {
            return createErrorEnvelope("PHASE_36_ERROR", "No recommended venues to process");
        }

        // 2. Generate Venue-Level Signals
        const recommended_signals = generateVenueSignals(
            payload.recommended,
            required_venues,
            payload.constraint_tightness
        );

        // 3. Generate Exclusion Signals
        const exclusion_signals = generateExclusionSignals(payload.excluded);

        // 4. Generate Global Signals
        const global_signals = generateGlobalSignals(
            payload.global_score,
            coverage_score,
            payload.constraint_tightness
        );

        // 5. Observability
        logObservability(envelope.execution_id, recommended_signals.length, exclusion_signals.length);

        // 6. Build output
        const result = {
            ok: true,
            phase: "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1",
            timestamp,
            payload: {
                recommended_signals,
                exclusion_signals,
                global_signals
            }
        };

        return result;

    } catch (err) {
        return createErrorEnvelope("PHASE_36_ERROR", err.message || "Unexpected error");
    }
}

// Generate venue-level signals
function generateVenueSignals(recommended, required_venues, constraint_tightness) {
    // Calculate max_raw_score for normalization
    const raw_scores = recommended.map(v => v.raw_score || 0);
    const max_raw_score = Math.max(...raw_scores, 0);

    const signals = recommended.map(v => {
        // Validate required fields
        if (!v.venue_key || typeof v.venue_key !== 'string') {
            throw new Error("Invalid venue_key in recommended");
        }

        if (typeof v.raw_score !== 'number' || isNaN(v.raw_score)) {
            throw new Error(`Invalid raw_score for venue ${v.venue_key}`);
        }

        // Calculate normalized_score
        const normalized_score = max_raw_score === 0 ? 1.0 : v.raw_score / max_raw_score;

        return {
            venue_key: v.venue_key,
            allocated_budget: v.recommended_budget || v.allocated_budget || 0,
            role: v.role || "PRIMARY",
            raw_score: v.raw_score,
            normalized_score: clamp01(normalized_score),
            selection_rank: v.rank || 0,
            constraint_tightness,
            was_required: required_venues.includes(v.venue_key)
        };
    });

    // Sort by selection_rank, then venue_key
    return signals.sort((a, b) => {
        if (a.selection_rank !== b.selection_rank) {
            return a.selection_rank - b.selection_rank;
        }
        return a.venue_key.localeCompare(b.venue_key);
    });
}

// Generate exclusion signals
function generateExclusionSignals(excluded) {
    const signals = excluded.map(v => {
        if (!v.venue_key || typeof v.venue_key !== 'string') {
            throw new Error("Invalid venue_key in excluded");
        }

        return {
            venue_key: v.venue_key,
            exclusion_reason: v.reason || "UNKNOWN",
            suitability: null, // Phase 36 does not reinterpret scores
            reliability: null,
            learning_score: null
        };
    });

    // Sort by venue_key
    return signals.sort((a, b) => a.venue_key.localeCompare(b.venue_key));
}

// Generate global optimization signals
function generateGlobalSignals(global_score, coverage_score, constraint_tightness) {
    const coverage_penalty = 1 - coverage_score;

    const optimization_pressure = clamp01(
        (1 - global_score) * 0.5 +
        constraint_tightness * 0.3 +
        coverage_penalty * 0.2
    );

    return {
        global_score,
        coverage_score,
        constraint_tightness,
        optimization_pressure
    };
}

// Create error envelope
function createErrorEnvelope(code, message) {
    return {
        ok: false,
        phase: "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1",
        timestamp: new Date().toISOString(),
        error: {
            code,
            message
        }
    };
}

// Observability logging (stub for framework compliance)
function logObservability(execution_id, venue_count, exclusion_count) {
    // Metric: kaivo.phase36.learning_signal_aggregator.invoked
    // Structured log with execution_id, venue counts
    // Trace span: PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1

    // In production, this would emit to observability platform
    // For now, silent no-op to maintain purity
}

module.exports = {
    aggregateLearningSignals
};
