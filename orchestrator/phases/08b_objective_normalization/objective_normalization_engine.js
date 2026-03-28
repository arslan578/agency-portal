/**
 * Phase 8B: Objective Normalization Engine
 * 
 * Converts vague, high-level campaign intents into structured, multi-objective
 * performance vectors that downstream planners can optimize against.
 * 
 * Contract: objective_normalization_v1
 * Feature Flag: FF_OBJECTIVE_NORMALIZATION
 */

/**
 * Deep clone an object to prevent mutation (Framework Rule #1)
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Error codes for structured error handling
 */
const ERROR_CODES = {
    OBJECTIVE_UNRECOGNIZED: 'OBJECTIVE_UNRECOGNIZED',
    OBJECTIVE_CONFLICT: 'OBJECTIVE_CONFLICT',
    POLICY_BLOCKED_OBJECTIVE: 'POLICY_BLOCKED_OBJECTIVE',
    KNOWLEDGE_RESOLUTION_FAILURE: 'KNOWLEDGE_RESOLUTION_FAILURE',
    INVALID_INPUT: 'INVALID_INPUT'
};

/**
 * Emit observability signals (Framework Rule #3)
 */
function emitObservability(execution_id, raw_intent, normalized_objectives, feasibility_summary) {
    if (process.env.NODE_ENV !== 'test') {
        // Metric
        console.log(JSON.stringify({
            metric: 'phase_8b_objective_normalization_invoked',
            execution_id,
            raw_intent_type: typeof raw_intent,
            objectives_count: Object.keys(normalized_objectives).length
        }));

        // Log event
        console.log(JSON.stringify({
            event: 'objective_normalization',
            phase: '8B',
            execution_id,
            raw_intent: typeof raw_intent === 'string' ? raw_intent.substring(0, 100) : 'structured',
            normalized_objectives,
            feasibility_summary
        }));

        // Trace span (placeholder - would integrate with OpenTelemetry)
        console.log(JSON.stringify({
            trace_span: 'objective_normalization',
            execution_id,
            intent_complexity: typeof raw_intent === 'object' ? 'high' : 'medium',
            venues_evaluated: Object.keys(feasibility_summary).length
        }));
    }
}

/**
 * Parse raw intent into intent phrases
 */
function parseRawIntent(raw_intent) {
    if (typeof raw_intent === 'string') {
        // Simple parsing: split by common delimiters and clean
        return raw_intent
            .toLowerCase()
            .split(/\s+and\s+|\s+or\s+|,|;/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    } else if (typeof raw_intent === 'object' && raw_intent.intents) {
        // Structured intent tree
        return raw_intent.intents.map(i => i.phrase || i.text || '').filter(s => s.length > 0);
    }
    return [];
}

/**
 * Normalize objectives from parsed intents using knowledge mappings
 */
function normalizeObjectives(intent_phrases, knowledge_mappings, learning_signals, policy_rules) {
    const intent_to_objective = knowledge_mappings.intent_to_objective || {};
    const objective_weights = knowledge_mappings.objective_weights || {};

    // Initialize objective vector
    const objectives = {
        reach: 0,
        conversions: 0,
        frequency: 0,
        value: 0
    };

    let matched_count = 0;

    // Map each intent phrase to objectives
    for (const phrase of intent_phrases) {
        let matched = false;
        for (const [pattern, weights] of Object.entries(intent_to_objective)) {
            // More resilient match: token-overlap AND ordered-subsequence matching
            const phrase_lower = phrase.toLowerCase();
            const pattern_lower = pattern.toLowerCase();

            const phraseTokens = phrase_lower.split(/\s+/);
            const patternTokens = pattern_lower.split(/\s+/);

            // Token overlap count
            const overlap = phraseTokens.filter(t => patternTokens.includes(t)).length;

            // Ordered subsequence check
            const orderedMatch =
                phrase_lower.replace(/\bmy\b/g, '').includes(pattern_lower) ||
                pattern_lower.includes(phrase_lower);

            // Accept a match if:
            // - at least 2 tokens overlap, OR
            // - ordered subsequence match is true
            if (overlap >= 2 || orderedMatch) {
                // Add weights to objectives
                for (const [obj_name, weight] of Object.entries(weights)) {
                    if (objectives.hasOwnProperty(obj_name)) {
                        objectives[obj_name] += weight;
                        matched = true;
                    }
                }
            }
        }
        if (matched) matched_count++;
    }

    // If no matches, flag unrecognized
    if (matched_count === 0 && intent_phrases.length > 0) {
        return { objectives, error: ERROR_CODES.OBJECTIVE_UNRECOGNIZED };
    }

    // Normalize to 0-1 range (divide by max possible from #phrases)
    const max_val = Math.max(...Object.values(objectives), 1);
    for (const key of Object.keys(objectives)) {
        objectives[key] = Math.round((objectives[key] / max_val) * 100) / 100;
    }

    // Apply learning signals boost/reduction
    if (learning_signals && learning_signals.historical_performance) {
        for (const [obj_name, boost] of Object.entries(learning_signals.historical_performance)) {
            if (objectives.hasOwnProperty(obj_name) && typeof boost === 'number') {
                objectives[obj_name] = Math.min(1.0, objectives[obj_name] * (1 + boost * 0.1));
                objectives[obj_name] = Math.round(objectives[obj_name] * 100) / 100;
            }
        }
    }

    // Apply policy constraints (trim blocked objectives)
    const policy_blocked = [];
    if (policy_rules && policy_rules.allowed_objectives) {
        for (const obj_name of Object.keys(objectives)) {
            if (!policy_rules.allowed_objectives.includes(obj_name)) {
                objectives[obj_name] = 0;
                policy_blocked.push(obj_name);
            }
        }
    }

    return { objectives, policy_blocked };
}

/**
 * Compute priority order from normalized objectives
 */
function computePriorityOrder(objectives) {
    // Sort by weight descending, then alphabetically for ties
    return Object.entries(objectives)
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        })
        .map(([name]) => name);
}

/**
 * Compute feasibility per platform
 */
function computeFeasibility(objectives, platform_capabilities, creative_compliance, policy_rules) {
    const platforms = ['google', 'meta', 'tiktok', 'youtube', 'reddit'];
    const feasibility = {};

    // Identify primary objectives (weight > 0.5)
    const primary_objectives = Object.keys(objectives).filter(k => objectives[k] > 0.5);

    for (const platform of platforms) {
        const capabilities = (platform_capabilities && platform_capabilities[platform]) || {};

        // Check creative compliance
        if (creative_compliance && creative_compliance.overall_status === 'FAIL') {
            feasibility[platform] = 'UNSUPPORTED';
            continue;
        }

        // Check if platform supports primary objectives
        let supported_count = 0;
        let limited_count = 0;

        for (const obj of primary_objectives) {
            const support = capabilities[obj];
            if (support === 'full' || support === true) {
                supported_count++;
            } else if (support === 'limited') {
                limited_count++;
            }
        }

        if (primary_objectives.length === 0) {
            feasibility[platform] = 'SUPPORTED';
        } else if (supported_count === primary_objectives.length) {
            feasibility[platform] = 'SUPPORTED';
        } else if (supported_count + limited_count >= primary_objectives.length) {
            feasibility[platform] = 'LIMITED';
        } else {
            feasibility[platform] = 'UNSUPPORTED';
        }

        // Check platform constraints
        if (policy_rules && policy_rules.platform_constraints && policy_rules.platform_constraints[platform]) {
            const constraints = policy_rules.platform_constraints[platform];
            if (constraints.blocked === true) {
                feasibility[platform] = 'UNSUPPORTED';
            }
        }
    }

    return feasibility;
}

/**
 * Generate recommended modes based on objective vector
 */
function generateRecommendedModes(objectives, feasibility) {
    const modes = [];

    // Awareness-focused
    if (objectives.reach > 0.7 && objectives.frequency > 0.4) {
        modes.push('awareness_optimized');
    }

    // Conversion-focused
    if (objectives.conversions > 0.7) {
        modes.push('conversion_focused');
    }

    // Value-optimized
    if (objectives.value > 0.6) {
        modes.push('value_optimized');
    }

    // Balanced
    const weights = Object.values(objectives);
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + Math.pow(w - avg, 2), 0) / weights.length;
    if (variance < 0.05) {
        modes.push('balanced');
    }

    // If no modes identified, use balanced
    if (modes.length === 0) {
        modes.push('balanced_reach');
    }

    return modes.sort();
}

/**
 * Generate structured explanations
 */
function generateExplanations(objectives, priority_order, policy_blocked, feasibility, error) {
    const explanations = [];

    // Error explanation
    if (error) {
        if (error === ERROR_CODES.OBJECTIVE_UNRECOGNIZED) {
            explanations.push('Raw intent could not be mapped to known objectives, using fallback');
        } else if (error === ERROR_CODES.KNOWLEDGE_RESOLUTION_FAILURE) {
            explanations.push('Knowledge mappings incomplete, using uniform distribution');
        }
    }

    // Primary objective
    if (priority_order.length > 0 && objectives[priority_order[0]] > 0) {
        explanations.push(`Primary objective: ${priority_order[0]} (${objectives[priority_order[0]]})`);
    }

    // Policy constraints
    if (policy_blocked && policy_blocked.length > 0) {
        const blocked_str = policy_blocked.sort().join(', ');
        explanations.push(`Policy trimmed unsupported objectives: ${blocked_str}`);
    }

    // Feasibility warnings
    for (const [platform, status] of Object.entries(feasibility).sort()) {
        if (status === 'LIMITED') {
            explanations.push(`${platform.charAt(0).toUpperCase() + platform.slice(1)} has limited support`);
        } else if (status === 'UNSUPPORTED') {
            explanations.push(`${platform.charAt(0).toUpperCase() + platform.slice(1)} cannot support primary objectives`);
        }
    }

    return explanations.sort();
}

/**
 * Main execution function
 * 
 * @param {object} input - objective_normalization_input_v1
 * @returns {object} - objective_normalization_v1
 */
async function execute(input) {
    const timestamp = new Date().toISOString();

    // Feature flag check
    const FF_OBJECTIVE_NORMALIZATION = process.env.FF_OBJECTIVE_NORMALIZATION === 'true';

    if (!FF_OBJECTIVE_NORMALIZATION) {
        // Return uniform fallback
        return {
            ok: true,
            module: 'objective_normalization_engine',
            timestamp,
            payload: {
                execution_id: input?.execution_id || 'unknown',
                normalized_objectives: {
                    reach: 0.25,
                    conversions: 0.25,
                    frequency: 0.25,
                    value: 0.25
                },
                priority_order: ['conversions', 'frequency', 'reach', 'value'],
                feasibility: {
                    google: 'SUPPORTED',
                    meta: 'SUPPORTED',
                    tiktok: 'SUPPORTED',
                    youtube: 'SUPPORTED',
                    reddit: 'SUPPORTED'
                },
                policy_constraints: [],
                recommended_modes: ['balanced'],
                explanations: ['Feature flag disabled, using uniform distribution']
            }
        };
    }

    // Input validation
    if (!input || typeof input !== 'object') {
        return {
            ok: false,
            module: 'objective_normalization_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Input must be an object'
            }
        };
    }

    if (!input.execution_id || typeof input.execution_id !== 'string') {
        return {
            ok: false,
            module: 'objective_normalization_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid execution_id'
            }
        };
    }

    if (input.raw_intent === undefined || input.raw_intent === null) {
        return {
            ok: false,
            module: 'objective_normalization_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing raw_intent'
            }
        };
    }

    if (!input.creative_compliance || typeof input.creative_compliance !== 'object') {
        return {
            ok: false,
            module: 'objective_normalization_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid creative_compliance'
            }
        };
    }

    if (!input.knowledge_mappings || typeof input.knowledge_mappings !== 'object') {
        return {
            ok: false,
            module: 'objective_normalization_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.INVALID_INPUT,
                message: 'Missing or invalid knowledge_mappings'
            }
        };
    }

    // Deep clone to prevent mutation
    const raw_intent_clone = deepClone(input.raw_intent);
    const creative_compliance = input.creative_compliance;
    const learning_signals = input.learning_signals || {};
    const policy_rules = input.policy_rules || {};
    const knowledge_mappings = input.knowledge_mappings || {};

    try {
        // Parse raw intent
        const intent_phrases = parseRawIntent(raw_intent_clone);

        // Empty intent fallback (spec requirement)
        if (intent_phrases.length === 0) {
            const fallbackObjectives = {
                reach: 0.25,
                conversions: 0.25,
                frequency: 0.25,
                value: 0.25
            };

            const feasibility = {
                google: 'SUPPORTED',
                meta: 'SUPPORTED',
                tiktok: 'SUPPORTED',
                youtube: 'SUPPORTED',
                reddit: 'SUPPORTED'
            };

            return {
                ok: true,
                module: 'objective_normalization_engine',
                timestamp,
                payload: {
                    execution_id: input.execution_id,
                    normalized_objectives: fallbackObjectives,
                    priority_order: ['conversions', 'frequency', 'reach', 'value'],
                    feasibility,
                    policy_constraints: [],
                    recommended_modes: ['balanced'],
                    explanations: [
                        'No intent provided, using uniform fallback distribution'
                    ]
                }
            };
        }

        // Normalize objectives
        const { objectives, error, policy_blocked } = normalizeObjectives(
            intent_phrases,
            knowledge_mappings,
            learning_signals,
            policy_rules
        );

        // Compute priority order
        const priority_order = computePriorityOrder(objectives);

        // Compute feasibility
        const platform_capabilities = knowledge_mappings.platform_capabilities || {};
        const feasibility = computeFeasibility(objectives, platform_capabilities, creative_compliance, policy_rules);

        // Generate recommended modes
        const recommended_modes = generateRecommendedModes(objectives, feasibility);

        // Generate policy constraints
        const policy_constraints = (policy_blocked || []).map(obj => `${obj.charAt(0).toUpperCase() + obj.slice(1)} blocked by policy rules`).sort();

        // Generate explanations
        const explanations = generateExplanations(objectives, priority_order, policy_blocked, feasibility, error);

        const result = {
            execution_id: input.execution_id,
            normalized_objectives: objectives,
            priority_order,
            feasibility,
            policy_constraints,
            recommended_modes,
            explanations
        };

        // Emit observability
        emitObservability(input.execution_id, input.raw_intent, objectives, feasibility);

        return {
            ok: true,
            module: 'objective_normalization_engine',
            timestamp,
            payload: result
        };

    } catch (err) {
        // Fallback on unexpected errors
        return {
            ok: false,
            module: 'objective_normalization_engine',
            timestamp,
            payload: null,
            error: {
                code: ERROR_CODES.KNOWLEDGE_RESOLUTION_FAILURE,
                message: `Normalization failed: ${err.message}`
            }
        };
    }
}

module.exports = {
    execute,
    ERROR_CODES,
    _internal: {
        parseRawIntent,
        normalizeObjectives,
        computePriorityOrder,
        computeFeasibility,
        generateRecommendedModes,
        generateExplanations
    }
};
