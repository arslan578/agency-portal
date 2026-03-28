const { runLLM } = require('../../services/shared/llm');
const knowledge_engine = require('./knowledge_engine');

// Initialize OpenAI Client - REMOVED (using shared runLLM)


/**
 * AudienceProfile schema (internal documentation)
 * {
 *   summary: string,
 *   demographics: {
 *     age_ranges: string[],
 *     genders: string[],
 *     locations: string[],
 *     income_levels: string[]
 *   },
 *   firmographics: {
 *     business_sizes: string[],
 *     industries: string[]
 *   },
 *   psychographics: {
 *     interests: string[],
 *     motivations: string[],
 *     pain_points: string[]
 *   },
 *   behaviors: {
 *     buying_triggers: string[],
 *     objections: string[]
 *   }
 * }
 */

/**
 * Validates an AudienceProfile object
 * @param {Object} profile - Profile to validate
 * @returns {boolean} - True if valid
 */
function validateAudienceProfile(profile) {
    if (!profile || typeof profile !== 'object') {
        return false;
    }

    // Check summary
    if (typeof profile.summary !== 'string' || profile.summary.length === 0) {
        return false;
    }

    // Check demographics
    if (!profile.demographics || typeof profile.demographics !== 'object') {
        return false;
    }
    const demoFields = ['age_ranges', 'genders', 'locations', 'income_levels'];
    for (const field of demoFields) {
        if (!Array.isArray(profile.demographics[field])) {
            return false;
        }
        if (!profile.demographics[field].every(item => typeof item === 'string')) {
            return false;
        }
    }

    // Check firmographics
    if (!profile.firmographics || typeof profile.firmographics !== 'object') {
        return false;
    }
    const firmoFields = ['business_sizes', 'industries'];
    for (const field of firmoFields) {
        if (!Array.isArray(profile.firmographics[field])) {
            return false;
        }
        if (!profile.firmographics[field].every(item => typeof item === 'string')) {
            return false;
        }
    }

    // Check psychographics
    if (!profile.psychographics || typeof profile.psychographics !== 'object') {
        return false;
    }
    const psychoFields = ['interests', 'motivations', 'pain_points'];
    for (const field of psychoFields) {
        if (!Array.isArray(profile.psychographics[field])) {
            return false;
        }
        if (!profile.psychographics[field].every(item => typeof item === 'string')) {
            return false;
        }
    }

    // Check behaviors
    if (!profile.behaviors || typeof profile.behaviors !== 'object') {
        return false;
    }
    const behaviorFields = ['buying_triggers', 'objections'];
    for (const field of behaviorFields) {
        if (!Array.isArray(profile.behaviors[field])) {
            return false;
        }
        if (!profile.behaviors[field].every(item => typeof item === 'string')) {
            return false;
        }
    }

    return true;
}

/**
 * Infers target audience profile from brand knowledge and product description
 * @param {Object} input - { brand_id, campaign_goal, product_description, target_audience_hint? }
 * @returns {Promise<Object>} - { ok, brand_id, campaign_goal, profile, sources } or { ok: false, error }
 */
async function inferAudience(input) {
    const {
        brand_id,
        campaign_goal,
        product_description,
        target_audience_hint
    } = input;

    // Step 1: Validate input
    if (!brand_id || !campaign_goal || !product_description) {
        return {
            ok: false,
            module: "audience_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: "brand_id, campaign_goal, and product_description are required",
                code: "INVALID_INPUT"
            }
        };
    }

    try {
        const segments = [];

        // Step 2: Retrieve brand knowledge
        try {
            const knowledgeResult = await knowledge_engine.queryKnowledge({
                brand_id,
                query_text: "ideal customer, target audience, who this is for",
                k: 10
            });

            if (knowledgeResult.ok && knowledgeResult.payload.results) {
                segments.push(...knowledgeResult.payload.results);
            }
        } catch (knowledgeError) {
            // Continue without brand knowledge
        }

        // Step 3: Retrieve product segments (optional)
        try {
            const productResult = await knowledge_engine.queryKnowledge({
                brand_id,
                query_text: "product features, pricing and use cases",
                k: 5
            });

            if (productResult.ok && productResult.payload.results) {
                segments.push(...productResult.payload.results);
            }
        } catch (productError) {
            // Continue without product knowledge
        }

        // Step 4: Build OpenAI prompt
        const systemPrompt = `You are Kaivo's Audience Interpreter.

You will receive:
- A campaign goal
- A product or offer description
- Optional free-text audience hint
- Optional knowledge segments from brand documents

Your task is to infer the target audience and return ONLY a JSON object with this schema:

{
  "summary": string,
  "demographics": {
    "age_ranges": string[],
    "genders": string[],
    "locations": string[],
    "income_levels": string[]
  },
  "firmographics": {
    "business_sizes": string[],
    "industries": string[]
  },
  "psychographics": {
    "interests": string[],
    "motivations": string[],
    "pain_points": string[]
  },
  "behaviors": {
    "buying_triggers": string[],
    "objections": string[]
  }
}

Rules:
- Use and respect any explicit hints in the input.
- If something is not specified, make a reasonable, concise assumption.
- Keep entries short, human-readable phrases.
- Do not invent personal data about specific individuals.
- Do not include any keys other than these.
- Return valid JSON only.`;

        const userPayload = {
            brand_id,
            campaign_goal,
            product_description,
            target_audience_hint: target_audience_hint || null,
            knowledge_segments: segments
        };

        const AUDIENCE_PROFILE_SCHEMA = {
            type: "object",
            properties: {
                summary: { type: "string" },
                demographics: {
                    type: "object",
                    properties: {
                        age_ranges: { type: "array", items: { type: "string" } },
                        genders: { type: "array", items: { type: "string" } },
                        locations: { type: "array", items: { type: "string" } },
                        income_levels: { type: "array", items: { type: "string" } }
                    },
                    required: ["age_ranges", "genders", "locations", "income_levels"],
                    additionalProperties: false
                },
                firmographics: {
                    type: "object",
                    properties: {
                        business_sizes: { type: "array", items: { type: "string" } },
                        industries: { type: "array", items: { type: "string" } }
                    },
                    required: ["business_sizes", "industries"],
                    additionalProperties: false
                },
                psychographics: {
                    type: "object",
                    properties: {
                        interests: { type: "array", items: { type: "string" } },
                        motivations: { type: "array", items: { type: "string" } },
                        pain_points: { type: "array", items: { type: "string" } }
                    },
                    required: ["interests", "motivations", "pain_points"],
                    additionalProperties: false
                },
                behaviors: {
                    type: "object",
                    properties: {
                        buying_triggers: { type: "array", items: { type: "string" } },
                        objections: { type: "array", items: { type: "string" } }
                    },
                    required: ["buying_triggers", "objections"],
                    additionalProperties: false
                }
            },
            required: ["summary", "demographics", "firmographics", "psychographics", "behaviors"],
            additionalProperties: false
        };

        let profile;
        try {
            const llmResult = await runLLM({
                task: 'ORCHESTRATION_CORE',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(userPayload, null, 2) }
                ],
                jsonSchema: AUDIENCE_PROFILE_SCHEMA
            });
            profile = llmResult.outputJson;
        } catch (llmError) {
            return {
                ok: false,
                module: "audience_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: llmError.message || "LLM request failed",
                    code: llmError.code || "LLM_ERROR",
                    details: llmError.details || llmError.message
                }
            };
        }

        // Step 5: Validate (Double check)
        if (!validateAudienceProfile(profile)) {
            return {
                ok: false,
                module: "audience_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "Model did not return a valid AudienceProfile",
                    code: "INVALID_MODEL_OUTPUT"
                }
            };
        }

        // Step 6: Build sources
        const documentIds = Array.from(new Set(segments.map(s => s.document_id)));
        const sampleChunks = segments.map(s => ({
            document_id: s.document_id,
            chunk_index: s.chunk_index
        }));

        // Step 7: Return
        return {
            ok: true,
            module: "audience_engine",
            timestamp: new Date().toISOString(),
            payload: {
                brand_id,
                campaign_goal,
                profile,
                sources: {
                    document_ids: documentIds,
                    sample_chunks: sampleChunks
                }
            },
            error: null
        };

    } catch (error) {
        return {
            ok: false,
            module: "audience_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: error.message || "Audience inference failed",
                code: "INFERENCE_FAILED",
                details: error.message
            }
        };
    }
}

module.exports = {
    inferAudience
};
