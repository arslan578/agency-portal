const { runLLM } = require('../../services/shared/llm');
const knowledge_engine = require('./knowledge_engine');

// Initialize OpenAI Client - REMOVED (using shared runLLM)

/**
 * BrandVoiceProfile schema (internal documentation)
 * {
 *   primary_tone: string,
 *   secondary_tones: string[],
 *   style_guidelines: string[],
 *   forbidden_elements: string[],
 *   audience_descriptors: string[]
 * }
 */

/**
 * Validates a BrandVoiceProfile object
 * @param {Object} profile - Profile to validate
 * @returns {boolean} - True if valid
 */
function validateBrandVoiceProfile(profile) {
    if (!profile || typeof profile !== 'object') {
        return false;
    }

    // Check primary_tone
    if (typeof profile.primary_tone !== 'string' || profile.primary_tone.length === 0) {
        return false;
    }

    // Check array fields
    const arrayFields = ['secondary_tones', 'style_guidelines', 'forbidden_elements', 'audience_descriptors'];
    for (const field of arrayFields) {
        if (!Array.isArray(profile[field])) {
            return false;
        }
        // Ensure all elements are strings
        if (!profile[field].every(item => typeof item === 'string')) {
            return false;
        }
    }

    return true;
}

/**
 * Interprets brand voice from knowledge base using structured reasoning
 * @param {Object} input - { brand_id, query_text?, k? }
 * @returns {Promise<Object>} - { ok, brand_id, profile, sources } or { ok: false, error }
 */
async function interpretBrandVoice(input) {
    const { brand_id, query_text = "brand tone and voice", k = 10 } = input;

    // Step 1: Validate brand_id
    if (!brand_id || brand_id.length === 0) {
        return {
            ok: false,
            module: "knowledge_interpreter",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: "brand_id is required",
                code: "INVALID_INPUT"
            }
        };
    }

    // Step 2: Retrieve knowledge
    try {
        const queryResult = await knowledge_engine.queryKnowledge({
            brand_id,
            query_text,
            k
        });

        // Check if we got results
        if (!queryResult.ok || !queryResult.payload.results || queryResult.payload.results.length === 0) {
            return {
                ok: false,
                module: "knowledge_interpreter",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "No brand knowledge available for voice interpretation",
                    code: "NO_KNOWLEDGE"
                }
            };
        }

        // Step 3: Prepare segments
        const segments = queryResult.payload.results.map(r => ({
            document_id: r.document_id,
            chunk_index: r.chunk_index,
            text: r.text
        }));

        // Step 4: Call OpenAI
        const systemPrompt = `You are Kaivo's Brand Voice Interpreter.

You will be given text segments from a brand's documents.
Your task is to infer the brand's voice and return a JSON object ONLY with this schema:

{
  "primary_tone": string,
  "secondary_tones": string[],
  "style_guidelines": string[],
  "forbidden_elements": string[],
  "audience_descriptors": string[]
}

Do not include any keys other than these.
Do not include comments or explanations.
Return valid JSON only.`;

        const userPrompt = JSON.stringify({
            segments: segments
        }, null, 2);

        const BRAND_VOICE_SCHEMA = {
            type: "object",
            properties: {
                primary_tone: { type: "string" },
                secondary_tones: { type: "array", items: { type: "string" } },
                style_guidelines: { type: "array", items: { type: "string" } },
                forbidden_elements: { type: "array", items: { type: "string" } },
                audience_descriptors: { type: "array", items: { type: "string" } }
            },
            required: ["primary_tone", "secondary_tones", "style_guidelines", "forbidden_elements", "audience_descriptors"],
            additionalProperties: false
        };

        let profile;
        try {
            const llmResult = await runLLM({
                task: 'ORCHESTRATION_CORE',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                jsonSchema: BRAND_VOICE_SCHEMA
            });
            profile = llmResult.outputJson;
        } catch (llmError) {
            return {
                ok: false,
                module: "knowledge_interpreter",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: llmError.message || "LLM request failed",
                    code: llmError.code || "LLM_ERROR",
                    details: llmError.details || llmError.message
                }
            };
        }

        // Step 6: Validate profile
        if (!validateBrandVoiceProfile(profile)) {
            return {
                ok: false,
                module: "knowledge_interpreter",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "Model did not return a valid BrandVoiceProfile",
                    code: "INVALID_MODEL_OUTPUT"
                }
            };
        }

        // Step 7: Build final return object
        const document_ids = Array.from(new Set(segments.map(s => s.document_id)));
        const sample_chunks = segments.map(s => ({
            document_id: s.document_id,
            chunk_index: s.chunk_index
        }));

        return {
            ok: true,
            module: "knowledge_interpreter",
            timestamp: new Date().toISOString(),
            payload: {
                brand_id,
                profile,
                sources: {
                    document_ids,
                    sample_chunks
                }
            },
            error: null
        };

    } catch (error) {
        return {
            ok: false,
            module: "knowledge_interpreter",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: error.message || "Brand voice interpretation failed",
                code: "INTERPRETATION_FAILED",
                details: error.message
            }
        };
    }
}

module.exports = {
    interpretBrandVoice
};
