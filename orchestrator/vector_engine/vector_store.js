const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');

// Initialize S3 Client for R2 (reuse from knowledge_engine)
let s3Client = null;
let useR2 = false;

if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
        }
    });
    useR2 = true;
}

const LOCAL_STORE_PATH = path.join(process.cwd(), 'vector_store_local.json');

/**
 * Saves a single VectorEntry to storage (R2 or local JSON)
 * @param {Object} entry - VectorEntry object
 * @returns {Promise<void>}
 */
async function saveVectorEntry(entry) {
    if (useR2) {
        // Save to R2
        const key = `vectors/${entry.document_id}/${entry.id}.json`;
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
            Body: JSON.stringify(entry),
            ContentType: 'application/json'
        });
        await s3Client.send(command);
    } else {
        // Save to local JSON
        let store = [];
        try {
            const data = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
            store = JSON.parse(data);
        } catch (e) {
            // File doesn't exist yet, start with empty array
        }

        // Remove existing entry with same ID if present
        store = store.filter(e => e.id !== entry.id);
        store.push(entry);

        await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));
    }
}

/**
 * Loads all VectorEntry objects from storage
 * @returns {Promise<Array<Object>>} - Array of VectorEntry objects
 */
async function loadAllVectors() {
    if (useR2) {
        // Load from R2
        const entries = [];
        const listCommand = new ListObjectsV2Command({
            Bucket: process.env.R2_BUCKET,
            Prefix: 'vectors/'
        });

        const listResponse = await s3Client.send(listCommand);

        if (listResponse.Contents) {
            for (const item of listResponse.Contents) {
                const getCommand = new GetObjectCommand({
                    Bucket: process.env.R2_BUCKET,
                    Key: item.Key
                });

                const response = await s3Client.send(getCommand);
                const body = await response.Body.transformToString();
                entries.push(JSON.parse(body));
            }
        }

        return entries;
    } else {
        // Load from local JSON
        try {
            const data = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            // File doesn't exist, return empty array
            return [];
        }
    }
}

/**
 * Finds all VectorEntry objects for a specific document
 * @param {string} doc_id - Document ID
 * @returns {Promise<Array<Object>>} - Filtered VectorEntry objects
 */
async function findByDocumentId(doc_id) {
    const allVectors = await loadAllVectors();
    return allVectors.filter(entry => entry.document_id === doc_id);
}

module.exports = {
    saveVectorEntry,
    loadAllVectors,
    findByDocumentId
};
