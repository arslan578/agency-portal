const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { franc } = require('franc');
const OpenAI = require('openai');

// Initialize S3 Client for R2
let s3Client = null;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
        }
    });
}

// Initialize OpenAI Client
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

/**
 * Validates and decodes base64 file input
 * @param {Object} input - Input containing base64, filename, mime
 * @returns {Object} - { ok, buffer, filename, mime, size_bytes, error }
 */
function handle_upload(input) {
    const { base64, filename, mime } = input;

    if (!base64 || !filename || !mime) {
        return {
            ok: false,
            error: {
                message: "Missing required upload fields: base64, filename, mime",
                code: "INVALID_INPUT"
            }
        };
    }

    try {
        const buffer = Buffer.from(base64, 'base64');
        const size_bytes = buffer.length;
        return { ok: true, buffer, filename, mime, size_bytes };
    } catch (e) {
        return {
            ok: false,
            error: {
                message: "Invalid base64 encoding",
                code: "INVALID_INPUT",
                details: e.message
            }
        };
    }
}

/**
 * Uploads buffer to Cloudflare R2 using S3-compatible API
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @returns {Promise<Object>} - { ok, location, error }
 */
async function upload_to_r2(buffer, filename) {
    if (!s3Client || !process.env.R2_BUCKET) {
        return {
            ok: false,
            error: {
                message: "R2 configuration missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET required)",
                code: "R2_CONFIG_MISSING"
            }
        };
    }

    try {
        const key = `${Date.now()}-${filename}`;
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
            Body: buffer
        });

        await s3Client.send(command);

        return {
            ok: true,
            location: `r2://${process.env.R2_BUCKET}/${key}`
        };
    } catch (error) {
        return {
            ok: false,
            error: {
                message: `R2 upload failed: ${error.message}`,
                code: "R2_UPLOAD_FAILED",
                details: error.message
            }
        };
    }
}

/**
 * Parses document buffer based on MIME type
 * @param {Buffer} buffer - Document buffer
 * @param {string} mime - MIME type
 * @returns {Promise<Object>} - { text, page_count }
 */
async function parse_document(buffer, mime) {
    try {
        if (mime === 'application/pdf') {
            const data = await pdf(buffer);
            return {
                text: data.text,
                page_count: data.numpages || null
            };
        } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer });
            return {
                text: result.value,
                page_count: null
            };
        } else if (mime === 'text/plain') {
            return {
                text: buffer.toString('utf8'),
                page_count: null
            };
        } else {
            throw new Error(`Unsupported MIME type: ${mime}`);
        }
    } catch (error) {
        if (error.message.includes('Unsupported MIME')) {
            throw error;
        }
        throw new Error(`Document parsing failed: ${error.message}`);
    }
}

/**
 * Detects language from text using franc
 * @param {string} text - Text to analyze
 * @returns {string} - 2-letter ISO 639-1 code or "und"
 */
function detect_language(text) {
    const langCode = franc(text, { minLength: 10 });

    // Map ISO 639-3 to ISO 639-1
    const langMap = {
        'eng': 'en',
        'spa': 'es',
        'fra': 'fr',
        'fre': 'fr',
        'deu': 'de',
        'ger': 'de',
        'por': 'pt',
        'ita': 'it',
        'nld': 'nl',
        'dut': 'nl',
        'rus': 'ru',
        'zho': 'zh',
        'cmn': 'zh',
        'jpn': 'ja',
        'kor': 'ko',
        'ara': 'ar',
        'hin': 'hi',
        'und': 'und'
    };

    return langMap[langCode] || 'und';
}

/**
 * Normalizes text for consistent processing
 * @param {string} text - Raw text
 * @returns {string} - Normalized text
 */
function normalize_text(text) {
    // UTF-8 NFC normalization
    let normalized = text.normalize('NFC');

    // Replace Windows/Mac line endings with \n
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse more than 2 consecutive newlines to 2
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Collapse multiple spaces/tabs (but not newlines) into single space
    normalized = normalized.replace(/[ \t]+/g, ' ');

    // Trim leading/trailing whitespace
    normalized = normalized.trim();

    return normalized;
}

/**
 * Chunks text into overlapping segments
 * @param {string} fullText - Normalized full text
 * @returns {Array<Object>} - Array of chunk objects
 */
function chunk_text(fullText) {
    const TARGET_SIZE = 1000;
    const OVERLAP = 200;
    const chunks = [];

    if (!fullText || fullText.length === 0) {
        return chunks;
    }

    // If text is shorter than target, create single chunk
    if (fullText.length <= TARGET_SIZE) {
        return [{
            id: 'chunk-0001',
            index: 0,
            start_char: 0,
            end_char: fullText.length,
            text: fullText,
            token_estimate: Math.ceil(fullText.length / 4)
        }];
    }

    let start = 0;
    let index = 0;

    while (start < fullText.length) {
        let end = Math.min(start + TARGET_SIZE, fullText.length);

        // Try to find sentence boundary near target size
        if (end < fullText.length) {
            const searchStart = Math.max(start, end - 100);
            const segment = fullText.substring(searchStart, end + 100);
            const match = segment.match(/[.!?]\s/);

            if (match) {
                end = searchStart + segment.indexOf(match[0]) + match[0].length;
            }
        }

        const chunkText = fullText.substring(start, end);
        chunks.push({
            id: `chunk-${String(index + 1).padStart(4, '0')}`,
            index: index,
            start_char: start,
            end_char: end,
            text: chunkText,
            token_estimate: Math.ceil(chunkText.length / 4)
        });

        // Move start forward, accounting for overlap
        start = end - OVERLAP;
        if (start >= fullText.length) break;

        index++;
    }

    return chunks;
}

/**
 * Generates embeddings for text chunks using OpenAI
 * @param {Array<Object>} chunks - Array of chunks
 * @returns {Promise<Object>} - { ok, chunks, dimensions, error }
 */
async function embed_chunks(chunks) {
    if (!openaiClient) {
        return {
            ok: false,
            error: {
                message: "OpenAI API key not configured",
                code: "EMBEDDING_CONFIG_MISSING"
            }
        };
    }

    try {
        const texts = chunks.map(c => c.text);
        const response = await openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts
        });

        // Attach embeddings to chunks
        const embeddedChunks = chunks.map((chunk, i) => ({
            ...chunk,
            embedding: response.data[i].embedding
        }));

        const dimensions = response.data[0]?.embedding?.length || null;

        return {
            ok: true,
            chunks: embeddedChunks,
            dimensions
        };
    } catch (error) {
        return {
            ok: false,
            error: {
                message: `Embedding generation failed: ${error.message}`,
                code: "EMBEDDING_FAILED",
                details: error.message
            }
        };
    }
}

/**
 * Resolves content type from MIME
 * @param {string} mime - MIME type
 * @returns {string} - Content type
 */
function resolve_content_type(mime) {
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (mime === 'text/plain') return 'txt';
    return 'unknown';
}

/**
 * Main knowledge processing pipeline
 * @param {Object} input - { base64, filename, mime }
 * @returns {Promise<Object>} - Unified response envelope
 */
async function process_knowledge(input) {
    // Step 1: Validate and decode upload
    const uploadResult = handle_upload(input);
    if (!uploadResult.ok) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: uploadResult.error
        };
    }

    const { buffer, filename, mime, size_bytes } = uploadResult;

    try {
        // Step 2: Upload to R2
        const r2Result = await upload_to_r2(buffer, filename);
        if (!r2Result.ok) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: r2Result.error
            };
        }

        // Step 3: Parse document
        let parsed;
        try {
            parsed = await parse_document(buffer, mime);
        } catch (error) {
            if (error.message.includes('Unsupported MIME')) {
                return {
                    ok: false,
                    module: "knowledge_engine",
                    timestamp: new Date().toISOString(),
                    payload: null,
                    error: {
                        message: error.message,
                        code: "UNSUPPORTED_MIME"
                    }
                };
            }
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: error.message,
                    code: "PARSE_FAILED",
                    details: error.message
                }
            };
        }

        // Step 4: Normalize and analyze text
        const normalizedText = normalize_text(parsed.text);

        if (!normalizedText || normalizedText.length === 0) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "Document contains no extractable text",
                    code: "EMPTY_DOCUMENT"
                }
            };
        }

        const language = detect_language(normalizedText);
        const character_count = normalizedText.length;
        const word_count = normalizedText.split(/\s+/).filter(w => w.length > 0).length;

        // Step 5: Chunk text
        const chunks = chunk_text(normalizedText);

        if (chunks.length === 0) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "Failed to generate text chunks",
                    code: "EMPTY_DOCUMENT"
                }
            };
        }

        // Step 6: Generate embeddings
        const embedResult = await embed_chunks(chunks);
        if (!embedResult.ok) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: embedResult.error
            };
        }

        // Step 7: Build intelligence object v1
        const intelligence_object = {
            version: "v1",
            source: {
                filename,
                mime,
                size_bytes,
                r2_location: r2Result.location
            },
            document: {
                content_type: resolve_content_type(mime),
                language,
                character_count,
                word_count,
                page_count: parsed.page_count
            },
            text: {
                full: normalizedText,
                chunks: embedResult.chunks
            },
            embedding_meta: {
                provider: "openai",
                model: "text-embedding-3-small",
                dimensions: embedResult.dimensions
            },
            created_at: new Date().toISOString()
        };

        // Return success
        return {
            ok: true,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: {
                intelligence_object
            },
            error: null
        };
    } catch (e) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: e.message || "Internal processing error",
                code: "INTERNAL_ERROR",
                details: e.message
            }
        };
    }
}

/**
 * Registers a document in the knowledge base with automatic vectorization
 * @param {Object} input - { base64, filename, mime, brand_id }
 * @returns {Promise<Object>} - { ok, document: { document_id, brand_id, filename, mime, location } }
 */
async function registerDocument(input) {
    const { base64, filename, mime, brand_id } = input;

    // Step 1: Validate required fields
    if (!base64 || !filename || !mime || !brand_id) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: "Missing required fields: base64, filename, mime, brand_id",
                code: "INVALID_INPUT"
            }
        };
    }

    try {
        // Step 2: Decode base64
        const uploadResult = handle_upload({ base64, filename, mime });
        if (!uploadResult.ok) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: uploadResult.error
            };
        }

        const { buffer, size_bytes } = uploadResult;

        // Step 3: Upload to R2
        const r2Result = await upload_to_r2(buffer, filename);
        if (!r2Result.ok) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: r2Result.error
            };
        }

        // Step 4: Parse document
        let parsed;
        try {
            parsed = await parse_document(buffer, mime);
        } catch (error) {
            if (error.message.includes('Unsupported MIME')) {
                return {
                    ok: false,
                    module: "knowledge_engine",
                    timestamp: new Date().toISOString(),
                    payload: null,
                    error: {
                        message: error.message,
                        code: "UNSUPPORTED_MIME"
                    }
                };
            }
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: error.message,
                    code: "PARSE_FAILED",
                    details: error.message
                }
            };
        }

        // Step 5: Normalize text
        const normalizedText = normalize_text(parsed.text);

        if (!normalizedText || normalizedText.length === 0) {
            return {
                ok: false,
                module: "knowledge_engine",
                timestamp: new Date().toISOString(),
                payload: null,
                error: {
                    message: "Document contains no extractable text",
                    code: "EMPTY_DOCUMENT"
                }
            };
        }

        // Step 6: Generate deterministic document_id
        const document_id = `doc_${brand_id}_${Date.now()}`;

        // Step 7: Vectorize document
        const vector_engine = require('../vector_engine');
        await vector_engine.vectorizeDocument(buffer, normalizedText, document_id);

        // Step 8: Return success
        return {
            ok: true,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: {
                document: {
                    document_id,
                    brand_id,
                    filename,
                    mime,
                    location: r2Result.location
                }
            },
            error: null
        };
    } catch (e) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: e.message || "Internal processing error",
                code: "INTERNAL_ERROR",
                details: e.message
            }
        };
    }
}

/**
 * Queries the knowledge base for semantically similar content
 * @param {Object} input - { document_id?, brand_id?, query_text, k? }
 * @returns {Promise<Object>} - { ok, results: QueryResult[] }
 */
async function queryKnowledge(input) {
    const { document_id, brand_id, query_text, k = 5 } = input;

    // Step 1: Validate scope
    if (!document_id && !brand_id) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: "Must provide either document_id or brand_id for scoped search",
                code: "MISSING_SCOPE"
            }
        };
    }

    if (!query_text) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: "Missing required field: query_text",
                code: "INVALID_INPUT"
            }
        };
    }

    try {
        const vector_engine = require('../vector_engine');

        let results;

        if (document_id) {
            // Query single document
            results = await vector_engine.queryText(document_id, query_text, k);
        } else if (brand_id) {
            // Query all documents for brand
            const { loadAllVectors } = require('../vector_engine/vector_store');
            const { embedQuery } = require('../vector_engine/embedder');
            const { rankResults } = require('../vector_engine/query');

            // Get query embedding
            const query_embedding = await embedQuery(query_text);

            // Load all vectors and filter by brand prefix
            const allVectors = await loadAllVectors();
            const brandPrefix = `doc_${brand_id}_`;
            const brandVectors = allVectors.filter(v => v.document_id.startsWith(brandPrefix));

            // Rank results
            results = rankResults(query_embedding, brandVectors, k);
        }

        return {
            ok: true,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: {
                results: results
            },
            error: null
        };
    } catch (e) {
        return {
            ok: false,
            module: "knowledge_engine",
            timestamp: new Date().toISOString(),
            payload: null,
            error: {
                message: e.message || "Query processing error",
                code: "QUERY_FAILED",
                details: e.message
            }
        };
    }
}

module.exports = {
    process_knowledge,
    registerDocument,
    queryKnowledge
};
