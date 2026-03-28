/**
 * Computes cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} - Cosine similarity score (0-1)
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Ranks vector entries by similarity to query embedding
 * @param {number[]} query_embedding - Query embedding vector
 * @param {Array<Object>} all_entries - All VectorEntry objects
 * @param {number} k - Number of results to return
 * @returns {Array<Object>} - Top k QueryResult objects ordered by descending score
 */
function rankResults(query_embedding, all_entries, k) {
    // Compute similarity scores for all entries
    const scored = all_entries.map(entry => ({
        text: entry.text,
        score: cosineSimilarity(query_embedding, entry.embedding),
        document_id: entry.document_id,
        chunk_index: entry.chunk_index
    }));

    // Sort by descending score
    scored.sort((a, b) => b.score - a.score);

    // Return top k
    return scored.slice(0, k);
}

module.exports = {
    cosineSimilarity,
    rankResults
};
