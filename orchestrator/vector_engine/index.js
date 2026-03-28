const { chunkText, embedChunks, embedQuery } = require('./embedder');
const { saveVectorEntry, loadAllVectors, findByDocumentId } = require('./vector_store');
const { rankResults } = require('./query');
const { v4: uuidv4 } = require('uuid');

/**
 * Vectorizes a document by chunking, embedding, and storing vectors
 * @param {Buffer} buffer - Document buffer (unused but kept for interface compatibility)
 * @param {string} cleaned_text - Pre-normalized document text
 * @param {string} document_id - Unique document identifier
 * @returns {Promise<string[]>} - Array of saved VectorEntry IDs
 */
async function vectorizeDocument(buffer, cleaned_text, document_id) {
    // Step 1: Chunk text
    const chunks = chunkText(cleaned_text);

    if (chunks.length === 0) {
        return [];
    }

    // Step 2: Generate embeddings
    const embeddedChunks = await embedChunks(chunks);

    // Step 3: Save each chunk as VectorEntry
    const savedIds = [];

    for (const chunk of embeddedChunks) {
        const entry = {
            id: uuidv4(),
            document_id: document_id,
            chunk_index: chunk.index,
            embedding: chunk.embedding,
            text: chunk.text
        };

        await saveVectorEntry(entry);
        savedIds.push(entry.id);
    }

    return savedIds;
}

/**
 * Queries vectorized documents for similar text chunks
 * @param {string} document_id - Document ID to search within (or null for all documents)
 * @param {string} query_text - Query text
 * @param {number} k - Number of results to return
 * @returns {Promise<Array<Object>>} - Top k QueryResult objects
 */
async function queryText(document_id, query_text, k) {
    // Step 1: Embed query
    const query_embedding = await embedQuery(query_text);

    // Step 2: Load vectors (filtered by document_id if provided)
    let vectors;
    if (document_id) {
        vectors = await findByDocumentId(document_id);
    } else {
        vectors = await loadAllVectors();
    }

    // Step 3: Rank and return top k results
    return rankResults(query_embedding, vectors, k);
}

module.exports = {
    vectorizeDocument,
    queryText
};
