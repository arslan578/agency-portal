/**
 * Phase 40: Optimization Loop Dispatcher Engine
 *
 * Provides the real roundFn for the Multi-Round Optimizer (Phase 39).
 * Chains Phase 35 -> Phase 36 -> Phase 37 -> Phase 38 using the full orchestrator envelope.
 */

const phase35 = require('../../phases/35_world_aware_optimizer/world_aware_optimizer_engine');
const phase36 = require('../../phases/36_learning_signal_aggregator/learning_signal_aggregator');
const phase37 = require('../../phases/37_budget_rebalancer/budget_rebalancer_engine');
const phase38 = require('../../phases/38_cross_venue_optimizer/cross_venue_optimizer_engine');

/**
 * Creates a real round function for Phase 39 that chains Phases 35-38.
 * @param {object} globalConfig - Global configuration (reserved for future use)
 * @param {object} dependencies - Dependency injection for testing
 * @returns {function} Async round function
 */
function createRealRoundFn(globalConfig = {}, dependencies = {}) {
    // Default to real engines, allow DI for tests
    const optimizeWorldAwareVenues =
        dependencies.optimizeWorldAwareVenues || phase35.optimizeWorldAwareVenues;
    const aggregateLearningSignals =
        dependencies.aggregateLearningSignals || phase36.aggregateLearningSignals;
    const runBudgetRebalancer =
        dependencies.runBudgetRebalancer || phase37.runBudgetRebalancer;
    const runCrossVenueOptimizer =
        dependencies.runCrossVenueOptimizer || phase38.runCrossVenueOptimizer;

    /**
     * The round function executed by Phase 39.
     * @param {object} context - OptimizationRoundContextV1
     * @returns {Promise<object>} OptimizationRoundResultV1
     */
    return async function roundFn(context = {}) {
        const { round_index, envelope, logger } = context;
        const diagnostics = {
            round_index
        };

        // Strict context validation
        if (!envelope || typeof envelope !== 'object') {
            return {
                ok: false,
                code: 'MALFORMED_ROUND_CONTEXT',
                message: 'context.envelope must be a non-null object',
                diagnostics
            };
        }

        let currentEnvelope;

        try {
            // 2.1 Deep clone envelope so we never mutate caller state
            currentEnvelope = JSON.parse(JSON.stringify(envelope));
        } catch (err) {
            return {
                ok: false,
                code: 'MALFORMED_ROUND_CONTEXT',
                message: 'context.envelope could not be cloned',
                diagnostics: {
                    ...diagnostics,
                    clone_error: err.message || String(err)
                }
            };
        }

        // Small helper to standardize failures
        function fail(code, message, extra = {}) {
            return {
                ok: false,
                code,
                message,
                diagnostics: {
                    ...diagnostics,
                    ...extra
                }
            };
        }

        // ---------- Phase 35 ----------
        let result35;
        try {
            result35 = await optimizeWorldAwareVenues(currentEnvelope);
        } catch (err) {
            logger?.error?.('Phase 35 threw in Phase 40 roundFn', { err });
            return fail(
                'PHASE_35_FAILED',
                `Phase 35 threw error: ${err.message || 'Unknown error'}`,
                { phase35: { thrown: err.message || String(err) } }
            );
        }

        diagnostics.phase35 = result35?.diagnostics;

        if (!result35 || result35.ok !== true || !result35.envelope) {
            logger?.error?.('Phase 35 failed in Phase 40 roundFn', { result35 });
            return fail(
                'PHASE_35_FAILED',
                result35?.error?.message || 'World aware optimizer did not return ok result with envelope',
                { phase35: result35 }
            );
        }

        currentEnvelope = result35.envelope;

        // ---------- Phase 36 ----------
        let result36;
        try {
            result36 = await aggregateLearningSignals(currentEnvelope);
        } catch (err) {
            logger?.error?.('Phase 36 threw in Phase 40 roundFn', { err });
            return fail(
                'PHASE_36_FAILED',
                `Phase 36 threw error: ${err.message || 'Unknown error'}`,
                { phase36: { thrown: err.message || String(err) } }
            );
        }

        diagnostics.phase36 = result36?.diagnostics;

        if (!result36 || result36.ok !== true || !result36.envelope) {
            logger?.error?.('Phase 36 failed in Phase 40 roundFn', { result36 });
            return fail(
                'PHASE_36_FAILED',
                result36?.error?.message || 'Learning signal aggregator did not return ok result with envelope',
                { phase36: result36 }
            );
        }

        currentEnvelope = result36.envelope;

        // ---------- Phase 37 ----------
        let result37;
        try {
            result37 = await runBudgetRebalancer(currentEnvelope);
        } catch (err) {
            logger?.error?.('Phase 37 threw in Phase 40 roundFn', { err });
            return fail(
                'PHASE_37_FAILED',
                `Phase 37 threw error: ${err.message || 'Unknown error'}`,
                { phase37: { thrown: err.message || String(err) } }
            );
        }

        diagnostics.phase37 = result37?.diagnostics;

        if (!result37 || result37.ok !== true || !result37.envelope) {
            logger?.error?.('Phase 37 failed in Phase 40 roundFn', { result37 });
            return fail(
                'PHASE_37_FAILED',
                result37?.error?.message || 'Budget rebalancer did not return ok result with envelope',
                { phase37: result37 }
            );
        }

        currentEnvelope = result37.envelope;

        // ---------- Phase 38 ----------
        let result38;
        try {
            result38 = await runCrossVenueOptimizer(currentEnvelope);
        } catch (err) {
            logger?.error?.('Phase 38 threw in Phase 40 roundFn', { err });
            return fail(
                'PHASE_38_FAILED',
                `Phase 38 threw error: ${err.message || 'Unknown error'}`,
                { phase38: { thrown: err.message || String(err) } }
            );
        }

        diagnostics.phase38 = result38?.diagnostics;

        if (!result38 || result38.ok !== true || !result38.envelope) {
            logger?.error?.('Phase 38 failed in Phase 40 roundFn', { result38 });
            return fail(
                'PHASE_38_FAILED',
                result38?.error?.message || 'Cross venue optimizer did not return ok result with envelope',
                { phase38: result38 }
            );
        }

        currentEnvelope = result38.envelope;

        // 2.4 Final venue extraction
        const analysis = currentEnvelope.payload?.analysis?.cross_venue_optimization_v1;
        const recommended = analysis?.recommended_venues;

        if (!Array.isArray(recommended)) {
            logger?.error?.('Phase 38 returned no recommended_venues', {
                analysis: currentEnvelope.payload?.analysis
            });
            return fail(
                'PHASE_38_FAILED',
                'Phase 38 did not return recommended_venues array',
                { phase38_analysis: currentEnvelope.payload?.analysis }
            );
        }

        const venues = recommended.map(v => ({
            venue_key: v.venue_key,
            new_budget: v.allocated_budget,
            cross_venue_score: v.score,
            constraint_tightness: v.constraint_tightness ?? 0
        }));

        return {
            ok: true,
            venues,
            diagnostics
        };
    };
}

module.exports = {
    createRealRoundFn
};
