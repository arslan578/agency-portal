/**
 * Phase 42: Optimization Trace Reconstruction Engine
 *
 * Reconstructs delta information from optimization trace snapshots.
 * Pure mathematical transformation with no business logic.
 *
 * Input Contract: input_contract_v1
 * Output Contract: output_contract_v1
 */

/**
 * Reconstructs optimization trace with delta calculations.
 * @param {object} input - Input containing execution_id, trace
 * @returns {object} Reconstruction result
 */
function reconstructTrace(input = {}) {
    // Feature flag check
    const FF_OPTIMIZATION_TRACE_RECON_V1 = process.env.FF_OPTIMIZATION_TRACE_RECON_V1 === 'true';

    if (!FF_OPTIMIZATION_TRACE_RECON_V1) {
        return {
            ok: true,
            reconstruction: {},
            diagnostics: { feature_disabled: true }
        };
    }

    // Input validation
    const { execution_id, feature_flags, trace } = input;

    // Validate trace structure
    if (!trace || typeof trace !== 'object') {
        return {
            ok: false,
            reconstruction: {},
            diagnostics: { error: 'MISSING_TRACE' }
        };
    }

    if (!Array.isArray(trace.rounds)) {
        return {
            ok: false,
            reconstruction: {},
            diagnostics: { error: 'INVALID_ROUNDS_STRUCTURE' }
        };
    }

    // Empty trace is valid
    if (trace.rounds.length === 0) {
        return {
            ok: true,
            reconstruction: { rounds: [] },
            diagnostics: { empty_trace: true }
        };
    }

    // Validate each round
    const validationResult = validateRounds(trace.rounds);
    if (!validationResult.ok) {
        return {
            ok: false,
            reconstruction: {},
            diagnostics: { error: validationResult.error }
        };
    }

    // Reconstruct trace
    try {
        const reconstruction = buildReconstruction(trace.rounds);

        return {
            ok: true,
            reconstruction,
            diagnostics: {
                execution_id,
                rounds_processed: trace.rounds.length
            }
        };
    } catch (err) {
        return {
            ok: false,
            reconstruction: {},
            diagnostics: { error: 'RECONSTRUCTION_ERROR', message: err.message }
        };
    }
}

/**
 * Validates rounds structure.
 */
function validateRounds(rounds) {
    const seenIndices = new Set();

    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];

        // Validate round structure
        if (!round || typeof round !== 'object') {
            return { ok: false, error: 'INVALID_ROUND_STRUCTURE' };
        }

        // Validate round_index
        if (typeof round.round_index !== 'number' || !Number.isInteger(round.round_index) || round.round_index < 0) {
            return { ok: false, error: 'INVALID_ROUND_INDEX' };
        }

        // Check for duplicate round_index
        if (seenIndices.has(round.round_index)) {
            return { ok: false, error: 'DUPLICATE_ROUND_INDEX' };
        }
        seenIndices.add(round.round_index);

        // Validate venue_states
        if (!Array.isArray(round.venue_states)) {
            return { ok: false, error: 'INVALID_VENUE_STATES' };
        }

        // Validate each venue state
        for (const state of round.venue_states) {
            if (!state || typeof state !== 'object') {
                return { ok: false, error: 'INVALID_VENUE_STATE' };
            }

            // Validate venue_key
            if (typeof state.venue_key !== 'string' || state.venue_key.length === 0) {
                return { ok: false, error: 'INVALID_VENUE_KEY' };
            }

            // Validate budget_before
            if (typeof state.budget_before !== 'number' || !Number.isFinite(state.budget_before) || state.budget_before < 0) {
                return { ok: false, error: 'INVALID_BUDGET_BEFORE' };
            }

            // Validate budget_after
            if (typeof state.budget_after !== 'number' || !Number.isFinite(state.budget_after) || state.budget_after < 0) {
                return { ok: false, error: 'INVALID_BUDGET_AFTER' };
            }
        }
    }

    return { ok: true };
}

/**
 * Builds reconstruction from validated rounds.
 */
function buildReconstruction(rounds) {
    // Sort rounds by round_index
    const sortedRounds = [...rounds].sort((a, b) => a.round_index - b.round_index);

    const reconstructedRounds = sortedRounds.map(round => {
        // Calculate deltas for each venue
        const deltas = round.venue_states.map(state => {
            const delta = state.budget_after - state.budget_before;
            const sign = determineSign(delta);

            return {
                venue_key: state.venue_key,
                delta,
                sign
            };
        });

        // Sort deltas by venue_key (lexicographically)
        deltas.sort((a, b) => a.venue_key.localeCompare(b.venue_key));

        // Calculate global_delta (sum of absolute deltas)
        const global_delta = deltas.reduce((sum, d) => sum + Math.abs(d.delta), 0);

        return {
            round_index: round.round_index,
            deltas,
            global_delta
        };
    });

    return {
        rounds: reconstructedRounds
    };
}

/**
 * Determines sign of delta.
 */
function determineSign(delta) {
    if (delta > 0) return 'POS';
    if (delta < 0) return 'NEG';
    return 'ZERO';
}

module.exports = {
    reconstructTrace
};
