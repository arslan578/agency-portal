/**
 * Campaign Plan Composer - Phase 8
 * 
 * Pure, synchronous data composition module.
 * No AI calls, no I/O, no network operations.
 * Combines structured objects from earlier phases into a unified CampaignPlan.
 */

/**
 * Generate ISO 8601 timestamp
 * @returns {string} ISO timestamp
 */
function nowIso() {
    return new Date().toISOString();
}

/**
 * Normalize knowledge input, handling optional/missing sources
 * @param {Object} knowledgeInput - Raw knowledge input
 * @returns {Object} Normalized knowledge with source_documents
 */
function normalizeKnowledge(knowledgeInput) {
    if (!knowledgeInput) {
        return {
            summary: undefined,
            key_points: [],
            sources: [],
            source_documents: 0
        };
    }

    const sources = Array.isArray(knowledgeInput.sources) ? knowledgeInput.sources : [];

    return {
        summary: knowledgeInput.summary,
        key_points: knowledgeInput.key_points || [],
        sources: sources,
        source_documents: sources.length
    };
}

/**
 * Derive source document count from sources array
 * @param {Array} sources - Array of source objects
 * @returns {number} Count of sources
 */
function deriveSourceDocuments(sources) {
    return Array.isArray(sources) ? sources.length : 0;
}

/**
 * Build venues array from budget hints
 * Simple deterministic mapping, no external calls
 * @param {Array<string>} hints - Venue hints like ["YOUTUBE", "TIKTOK"]
 * @returns {Array<Object>} Venue configuration objects
 */
function buildVenuesFromHints(hints) {
    if (!Array.isArray(hints) || hints.length === 0) {
        return [];
    }

    // Simple heuristic: first hint is PRIMARY, rest are SUPPORTING
    return hints.map((venue_key, index) => ({
        venue_key: venue_key,
        role: index === 0 ? 'PRIMARY' : 'SUPPORTING',
        priority: index + 1,
        budget_hint: index === 0 ? 'HEAVY' : 'MEDIUM'
    }));
}

/**
 * Build meta object with version and source tracking
 * @param {Object} metaInput - Raw meta input
 * @param {number} sourceDocuments - Count of source documents
 * @returns {Object} Meta object
 */
function buildMeta(metaInput, sourceDocuments) {
    return {
        version: 'phase-8.0',
        created_at: nowIso(),
        initiated_by: metaInput?.initiated_by,
        source: metaInput?.source,
        source_documents: sourceDocuments
    };
}

/**
 * Build a unified CampaignPlan from structured components
 * Pure function - no I/O, no AI calls, no network
 * 
 * @param {Object} input - Campaign plan input
 * @returns {Object} Standard orchestrator envelope with CampaignPlan
 */
function build_campaign_plan(input) {
    // Validate required fields
    if (!input.brand_id) {
        return {
            ok: false,
            module: 'campaign_planner',
            timestamp: nowIso(),
            payload: null,
            error: {
                message: 'Missing required field: brand_id',
                code: 'INVALID_INPUT'
            }
        };
    }

    if (!input.campaign_goal) {
        return {
            ok: false,
            module: 'campaign_planner',
            timestamp: nowIso(),
            payload: null,
            error: {
                message: 'Missing required field: campaign_goal',
                code: 'INVALID_INPUT'
            }
        };
    }

    if (!input.brief || !input.brief.raw_text) {
        return {
            ok: false,
            module: 'campaign_planner',
            timestamp: nowIso(),
            payload: null,
            error: {
                message: 'Missing required field: brief.raw_text',
                code: 'INVALID_INPUT'
            }
        };
    }

    if (!input.audience) {
        return {
            ok: false,
            module: 'campaign_planner',
            timestamp: nowIso(),
            payload: null,
            error: {
                message: 'Missing required field: audience',
                code: 'INVALID_INPUT'
            }
        };
    }

    // Normalize knowledge (handles optional/missing sources)
    const knowledge = normalizeKnowledge(input.knowledge);

    // Build venues from budget hints
    const venues = buildVenuesFromHints(input.budget?.venue_hints);

    // Build meta with source document tracking
    const meta = buildMeta(input.meta, knowledge.source_documents);

    // Compose the CampaignPlan
    const campaign_plan = {
        brand_id: input.brand_id,
        campaign_goal: {
            type: input.campaign_goal.type,
            primary_kpi: input.campaign_goal.primary_kpi,
            secondary_kpi: input.campaign_goal.secondary_kpi
        },
        brief: {
            raw_text: input.brief.raw_text,
            normalized_text: input.brief.normalized_text,
            language: input.brief.language,
            metadata: input.brief.metadata
        },
        audience: input.audience,
        creative: input.creative || {},
        knowledge: knowledge,
        budget: {
            total: input.budget?.total,
            currency: input.budget?.currency,
            flight_start: input.budget?.flight_start,
            flight_end: input.budget?.flight_end,
            venue_hints: input.budget?.venue_hints
        },
        venues: venues,
        meta: meta
    };

    return {
        ok: true,
        module: 'campaign_planner',
        timestamp: nowIso(),
        payload: {
            campaign_plan: campaign_plan
        },
        error: null
    };
}

module.exports = {
    build_campaign_plan
};
