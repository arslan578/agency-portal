const { runLLM } = require('../../services/shared/llm');
const knowledge_interpreter = require('./knowledge_interpreter');
const knowledge_engine = require('./knowledge_engine');

// Initialize OpenAI Client - REMOVED (using shared runLLM)

/**
 * AdCreativeBundle schema (internal documentation)
 * {
 *   primary_text: string,
 *   headline: string,
 *   description: string,
 *   call_to_action: string,
 *   variants: {
 *     primary_text: string[],
 *     headline: string[]
 *   }
 * }
 */

/**
 * Validates an AdCreativeBundle object
 * @param {Object} creative - Creative bundle to validate
 * @returns {boolean} - True if valid
 */
function validateAdCreativeBundle(creative) {
    if (!creative || typeof creative !== 'object') {
        return false;
    }

    // Check required string fields
    if (typeof creative.primary_text !== 'string' || creative.primary_text.length === 0) {
        return false;
    }
    if (typeof creative.headline !== 'string' || creative.headline.length === 0) {
        return false;
    }
    if (typeof creative.description !== 'string') {
        return false;
    }
    if (typeof creative.call_to_action !== 'string' || creative.call_to_action.length === 0) {
        return false;
    }

    // Check variants
    if (!creative.variants || typeof creative.variants !== 'object') {
        return false;
    }
    if (!Array.isArray(creative.variants.primary_text) || !Array.isArray(creative.variants.headline)) {
        return false;
    }

    // Ensure variant arrays have 0-3 string elements
    if (creative.variants.primary_text.length > 3 || creative.variants.headline.length > 3) {
        return false;
    }
    if (!creative.variants.primary_text.every(item => typeof item === 'string')) {
        return false;
    }
    if (!creative.variants.headline.every(item => typeof item === 'string')) {
        return false;
    }

    return true;
}

/**
 * Generates brand-safe ad copy using brand voice and product knowledge
 * @param {Object} input - { brand_id, campaign_goal, product_description, target_audience?, language? }
 * @returns {Promise<Object>} - { ok, brand_id, language, goal, creative, meta } or { ok: false, error }
 */
async function generateAdCopy(input) {
    const {
        brand_id,
        campaign_goal,
        product_description,
        target_audience,
        language = 'en'
    } = input;

    // Step 1: Validate input
    if (!brand_id || !campaign_goal || !product_description) {
        return {
            ok: false,
            module: "creative_ai",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: "brand_id, campaign_goal, and product_description are required",
                code: "INVALID_INPUT"
            }
        };
    }

    try {
        // Step 2: Get brand voice
        let voiceResult;
        let profile_used = false;
        const source_documents = [];

        try {
            voiceResult = await knowledge_interpreter.interpretBrandVoice({
                brand_id
            });

            if (voiceResult.ok) {
                profile_used = true;
                if (voiceResult.payload.sources && voiceResult.payload.sources.document_ids) {
                    source_documents.push(...voiceResult.payload.sources.document_ids);
                }
            } else if (voiceResult.error.code !== 'NO_KNOWLEDGE') {
                // If it's not a NO_KNOWLEDGE error, it's a real failure
                return {
                    ok: false,
                    module: "creative_ai",
                    timestamp: new Date().toISOString(),
                    payload: null,
                    error: {
                        message: voiceResult.error?.message || "Brand voice interpretation failed",
                        code: "VOICE_INTERPRETATION_FAILED"
                    }
                };
            }
        } catch (voiceError) {
            // Continue without voice profile
            voiceResult = { ok: false };
        }

        // Step 3: Get product knowledge segments (optional)
        let productQuery = { ok: false };
        try {
            productQuery = await knowledge_engine.queryKnowledge({
                brand_id,
                query_text: "product features and benefits",
                k: 5
            });

            if (productQuery.ok && productQuery.payload.results) {
                const productDocs = productQuery.payload.results.map(r => r.document_id);
                source_documents.push(...productDocs);
            }
        } catch (productError) {
            // Continue without product segments
        }

        // Step 4: Build OpenAI prompt
        const systemPrompt = `You are Kaivo's Creative Engine.

You will receive:
- A brand voice profile (if available)
- A campaign goal
- A product or offer description
- Optional audience and knowledge segments

Your task is to generate AD COPY ONLY and return a JSON object with this schema:

{
  "primary_text": string,
  "headline": string,
  "description": string,
  "call_to_action": string,
  "variants": {
    "primary_text": string[],
    "headline": string[]
  }
}

Rules:
- Use the brand's tone and voice consistently.
- Make the copy clear and specific to the product.
- Tailor to the campaign goal (awareness, traffic, leads, or sales).
- "variants.primary_text" should contain 1 to 3 alternative bodies.
- "variants.headline" should contain 1 to 3 alternative headlines.
- Do not include any keys other than the ones specified.
- Do not include comments or explanations.
- Return VALID JSON ONLY.`;

        const userPayload = {
            brand_id,
            language,
            campaign_goal,
            product_description,
            target_audience: target_audience || null,
            brand_voice_profile: voiceResult.ok ? voiceResult.payload.profile : null,
            knowledge_segments: productQuery.ok ? productQuery.payload.results : []
        };

        const CREATIVE_BUNDLE_SCHEMA = {
            type: "object",
            properties: {
                primary_text: { type: "string" },
                headline: { type: "string" },
                description: { type: "string" },
                call_to_action: { type: "string" },
                variants: {
                    type: "object",
                    properties: {
                        primary_text: { type: "array", items: { type: "string" } },
                        headline: { type: "array", items: { type: "string" } }
                    },
                    required: ["primary_text", "headline"],
                    additionalProperties: false
                }
            },
            required: ["primary_text", "headline", "description", "call_to_action", "variants"],
            additionalProperties: false
        };

        let creative;
        try {
            const llmResult = await runLLM({
                task: 'ORCHESTRATION_CORE',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(userPayload, null, 2) }
                ],
                jsonSchema: CREATIVE_BUNDLE_SCHEMA
            });
            creative = llmResult.outputJson;
        } catch (llmError) {
            return {
                ok: false,
                module: "creative_ai",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: llmError.message || "LLM request failed",
                    code: llmError.code || "LLM_ERROR",
                    details: llmError.details || llmError.message
                }
            };
        }

        if (!validateAdCreativeBundle(creative)) {
            return {
                ok: false,
                module: "creative_ai",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "Model did not return a valid AdCreativeBundle",
                    code: "INVALID_MODEL_OUTPUT"
                }
            };
        }

        // Step 6: Build final response
        const uniqueDocs = Array.from(new Set(source_documents));

        return {
            ok: true,
            module: "creative_ai",
            timestamp: new Date().toISOString(),
            payload: {
                brand_id,
                language,
                goal: campaign_goal,
                creative,
                meta: {
                    profile_used,
                    source_documents: uniqueDocs,
                    notes: profile_used ? null : "Brand voice profile not available, used generic tone"
                }
            },
            error: null
        };

    } catch (error) {
        return {
            ok: false,
            module: "creative_ai",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: error.message || "Ad copy generation failed",
                code: "GENERATION_FAILED",
                details: error.message
            }
        };
    }
}

module.exports = {
    generateAdCopy
};
