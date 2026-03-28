/**
 * VectorEntry schema
 * Represents a single vector embedding for a text chunk
 */
const VectorEntry = {
    id: String,              // Unique vector entry ID
    document_id: String,     // Parent document ID
    chunk_index: Number,     // 0-based chunk position
    embedding: Array,        // Embedding vector (number[])
    text: String             // Chunk text
};

/**
 * QueryResult schema
 * Represents a search result with similarity score
 */
const QueryResult = {
    text: String,            // Matched chunk text
    score: Number,           // Similarity score (0-1)
    document_id: String,     // Source document
    chunk_index: Number      // Chunk position
};

module.exports = {
    VectorEntry,
    QueryResult
};
