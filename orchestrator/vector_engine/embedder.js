const OpenAI = require('openai');

// Initialize OpenAI Client (reuse from knowledge_engine)
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

/**
 * Chunks text into fixed-size segments with sentence boundary detection
 * @param {string} cleaned_text - Pre-normalized text
 * @returns {Array<{index: number, text: string}>} - Array of chunk objects
 */
function chunkText(cleaned_text) {
    const TARGET_SIZE = 1000;
    const OVERLAP = 200;
    const chunks = [];

    if (!cleaned_text || cleaned_text.length === 0) {
        return chunks;
    }

    // If text is shorter than target, create single chunk
    if (cleaned_text.length <= TARGET_SIZE) {
        return [{
            index: 0,
            text: cleaned_text
        }];
    }

    let start = 0;
    let index = 0;

    while (start < cleaned_text.length) {
        let end = Math.min(start + TARGET_SIZE, cleaned_text.length);

        // Try to find sentence boundary near target size
        if (end < cleaned_text.length) {
            const searchStart = Math.max(start, end - 100);
            const segment = cleaned_text.substring(searchStart, Math.min(end + 100, cleaned_text.length));
            const match = segment.match(/[.!?]\s/);

            if (match) {
                end = searchStart + segment.indexOf(match[0]) + match[0].length;
            }
        }

        const chunkText = cleaned_text.substring(start, end);
        chunks.push({
            index: index,
            text: chunkText
        });

        // Move start forward, accounting for overlap
        start = end - OVERLAP;
        if (start >= cleaned_text.length) break;

        index++;
    }

    return chunks;
}

/**
 * Generates embeddings for an array of text chunks
 * @param {Array<{index: number, text: string}>} chunks - Array of chunks
 * @returns {Promise<Array<{index: number, text: string, embedding: number[]}>>} - Chunks with embeddings
 */
async function embedChunks(chunks) {
    if (!openaiClient) {
        throw new Error('OpenAI API key not configured');
    }

    if (!chunks || chunks.length === 0) {
        return [];
    }

    const texts = chunks.map(c => c.text);
    const response = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts
    });

    // Attach embeddings to chunks
    return chunks.map((chunk, i) => ({
        ...chunk,
        embedding: response.data[i].embedding
    }));
}

/**
 * Generates embedding for a single query string
 * @param {string} query_text - Query text
 * @returns {Promise<number[]>} - Embedding vector
 */
async function embedQuery(query_text) {
    if (!openaiClient) {
        throw new Error('OpenAI API key not configured');
    }

    const response = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: query_text
    });

    return response.data[0].embedding;
}

module.exports = {
    chunkText,
    embedChunks,
    embedQuery
};
