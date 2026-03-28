require('dotenv').config();
const { vectorizeDocument, queryText } = require('./index');
const { findByDocumentId, saveVectorEntry, loadAllVectors } = require('./vector_store');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_STORE_PATH = path.join(process.cwd(), 'vector_store_local.json');

/**
 * Test 1: Vectorization produces multiple vector entries
 */
async function test1() {
    console.log("Test 1: Vectorization produces multiple entries");

    const sampleText = `
        This is a sample document about pricing models. 
        Our platform offers various pricing tiers for different business needs.
        The basic plan starts at $29 per month.
        Professional plans include additional features and support.
        Enterprise customers get custom pricing and dedicated account management.
        All plans include unlimited storage and bandwidth.
        We also offer annual billing with a 20% discount.
    `;

    const ids = await vectorizeDocument(null, sampleText.trim(), "test_doc_1");

    console.log(`  ✓ Created ${ids.length} vector entries`);

    if (ids.length === 0) {
        throw new Error("Expected multiple vector entries but got 0");
    }

    // Verify entries were saved
    const entries = await findByDocumentId("test_doc_1");
    console.log(`  ✓ Verified ${entries.length} entries saved for test_doc_1`);

    if (entries.length !== ids.length) {
        throw new Error(`Mismatch: saved ${ids.length} IDs but found ${entries.length} entries`);
    }

    console.log("  ✓ PASS\n");
}

/**
 * Test 2: Query returns results ordered by similarity
 */
async function test2() {
    console.log("Test 2: Query returns ordered results");

    const results = await queryText("test_doc_1", "pricing", 3);

    console.log(`  ✓ Retrieved ${results.length} results`);

    if (results.length === 0) {
        throw new Error("Expected results but got 0");
    }

    // Verify results are ordered by descending score
    for (let i = 0; i < results.length - 1; i++) {
        if (results[i].score < results[i + 1].score) {
            throw new Error(`Results not ordered: result[${i}].score (${results[i].score}) < result[${i + 1}].score (${results[i + 1].score})`);
        }
    }

    console.log(`  ✓ Results ordered correctly (scores: ${results.map(r => r.score.toFixed(3)).join(', ')})`);
    console.log("  ✓ PASS\n");
}

/**
 * Test 3: R2 fallback works (local JSON)
 */
async function test3() {
    console.log("Test 3: R2 fallback (local JSON)");

    // Clean up local store
    try {
        await fs.unlink(LOCAL_STORE_PATH);
    } catch (e) {
        // Ignore if file doesn't exist
    }

    // Temporarily disable R2 (save original values)
    const originalR2Keys = {
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET: process.env.R2_BUCKET
    };

    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;

    // Re-require to pick up env changes
    delete require.cache[require.resolve('./vector_store')];
    const { saveVectorEntry: saveLocal, loadAllVectors: loadLocal } = require('./vector_store');

    // Save a test entry
    const testEntry = {
        id: "local_test_001",
        document_id: "local_doc",
        chunk_index: 0,
        embedding: [0.1, 0.2, 0.3],
        text: "Local storage test"
    };

    await saveLocal(testEntry);
    console.log("  ✓ Saved entry to local JSON");

    // Load and verify
    const loaded = await loadLocal();
    const found = loaded.find(e => e.id === "local_test_001");

    if (!found) {
        throw new Error("Failed to load entry from local JSON");
    }

    console.log("  ✓ Loaded entry from local JSON");
    console.log("  ✓ PASS\n");

    // Restore R2 env vars
    Object.assign(process.env, originalR2Keys);
    delete require.cache[require.resolve('./vector_store')];
}

/**
 * Test 4: Deterministic embeddings produce identical results
 */
async function test4() {
    console.log("Test 4: Deterministic embeddings");

    const query = "pricing models";

    const results1 = await queryText("test_doc_1", query, 5);
    const results2 = await queryText("test_doc_1", query, 5);

    console.log(`  ✓ Query 1: ${results1.length} results`);
    console.log(`  ✓ Query 2: ${results2.length} results`);

    if (results1.length !== results2.length) {
        throw new Error("Results count mismatch");
    }

    for (let i = 0; i < results1.length; i++) {
        if (Math.abs(results1[i].score - results2[i].score) > 0.0001) {
            throw new Error(`Score mismatch at index ${i}: ${results1[i].score} vs ${results2[i].score}`);
        }
        if (results1[i].text !== results2[i].text) {
            throw new Error(`Text mismatch at index ${i}`);
        }
    }

    console.log("  ✓ Identical results across both queries");
    console.log("  ✓ PASS\n");
}

/**
 * Test 5: findByDocumentId returns only entries from that document
 */
async function test5() {
    console.log("Test 5: findByDocumentId filters correctly");

    // Create a second document
    const sampleText2 = "This is a completely different document about technology and innovation.";
    await vectorizeDocument(null, sampleText2, "test_doc_2");

    const doc1Entries = await findByDocumentId("test_doc_1");
    const doc2Entries = await findByDocumentId("test_doc_2");

    console.log(`  ✓ test_doc_1: ${doc1Entries.length} entries`);
    console.log(`  ✓ test_doc_2: ${doc2Entries.length} entries`);

    // Verify no cross-contamination
    for (const entry of doc1Entries) {
        if (entry.document_id !== "test_doc_1") {
            throw new Error(`Found entry with wrong document_id in doc1Entries: ${entry.document_id}`);
        }
    }

    for (const entry of doc2Entries) {
        if (entry.document_id !== "test_doc_2") {
            throw new Error(`Found entry with wrong document_id in doc2Entries: ${entry.document_id}`);
        }
    }

    console.log("  ✓ No cross-contamination between documents");
    console.log("  ✓ PASS\n");
}

/**
 * Run all tests
 */
async function runTests() {
    console.log("=".repeat(60));
    console.log("VECTOR ENGINE TEST SUITE");
    console.log("=".repeat(60) + "\n");

    try {
        await test1();
        await test2();
        await test3();
        await test4();
        await test5();

        console.log("=".repeat(60));
        console.log("✓ ALL TESTS PASSED");
        console.log("=".repeat(60));
    } catch (error) {
        console.error("\n✗ TEST FAILED:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };
