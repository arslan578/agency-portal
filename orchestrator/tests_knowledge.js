require('dotenv').config();
const { runOrchestrator } = require('../orchestrator/index');

/**
 * Test A: registerDocument triggers vectorization
 */
async function testA() {
    console.log("Test A: registerDocument triggers vectorization");

    const sampleText = "This is a test document for brand knowledge. It contains information about our pricing model and features.";
    const base64 = Buffer.from(sampleText).toString('base64');

    const input = {
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64,
            filename: "brand_guide.txt",
            mime: "text/plain",
            brand_id: "brand_test_001"
        }
    };

    const result = await runOrchestrator(input);

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Expected ok: true, got: ${JSON.stringify(result.error)}`);
    }

    if (!result.payload.document || !result.payload.document.document_id) {
        throw new Error("Missing document_id in response");
    }

    const document_id = result.payload.document.document_id;
    console.log(`  ✓ Document registered: ${document_id}`);

    // Verify vectors exist
    const { findByDocumentId } = require('../orchestrator/vector_engine/vector_store');
    const vectors = await findByDocumentId(document_id);

    if (vectors.length === 0) {
        throw new Error("No vectors found for document");
    }

    console.log(`  ✓ ${vectors.length} vectors created`);
    console.log("  ✓ PASS\n");

    return document_id;
}

/**
 * Test B: queryKnowledge by document_id
 */
async function testB(document_id) {
    console.log("Test B: queryKnowledge by document_id");

    const input = {
        type: "KNOWLEDGE_QUERY",
        payload: {
            document_id,
            query_text: "pricing model",
            k: 3
        }
    };

    const result = await runOrchestrator(input);

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Expected ok: true, got: ${JSON.stringify(result.error)}`);
    }

    if (!Array.isArray(result.payload.results)) {
        throw new Error("Expected results to be an array");
    }

    // Verify schema
    for (const r of result.payload.results) {
        if (!r.text || typeof r.score !== 'number' || !r.document_id || typeof r.chunk_index !== 'number') {
            throw new Error(`Invalid result schema: ${JSON.stringify(r)}`);
        }
    }

    console.log(`  ✓ ${result.payload.results.length} results returned`);
    console.log(`  ✓ Schema validated`);
    console.log("  ✓ PASS\n");
}

/**
 * Test C: Brand-scoped search
 */
async function testC() {
    console.log("Test C: Brand-scoped search");

    // Register two documents under same brand
    const brand_id = "brand_test_002";

    const doc1Text = "Our pricing starts at $29 per month for the basic plan.";
    const doc2Text = "Enterprise customers get dedicated support and custom pricing.";

    const doc1 = await runOrchestrator({
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64: Buffer.from(doc1Text).toString('base64'),
            filename: "pricing.txt",
            mime: "text/plain",
            brand_id
        }
    });

    const doc2 = await runOrchestrator({
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64: Buffer.from(doc2Text).toString('base64'),
            filename: "enterprise.txt",
            mime: "text/plain",
            brand_id
        }
    });

    console.log(`  ✓ Registered 2 documents for ${brand_id}`);

    // Register one document under different brand
    const doc3 = await runOrchestrator({
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64: Buffer.from("Unrelated content").toString('base64'),
            filename: "other.txt",
            mime: "text/plain",
            brand_id: "brand_other"
        }
    });

    console.log(`  ✓ Registered 1 document for brand_other`);

    // Query using brand_id
    const queryResult = await runOrchestrator({
        type: "KNOWLEDGE_QUERY",
        payload: {
            brand_id,
            query_text: "pricing",
            k: 5
        }
    });

    if (!queryResult.ok) {
        throw new Error(`Query failed: ${JSON.stringify(queryResult.error)}`);
    }

    // Verify all results are from the correct brand
    for (const r of queryResult.payload.results) {
        if (!r.document_id.startsWith(`doc_${brand_id}_`)) {
            throw new Error(`Result from wrong brand: ${r.document_id}`);
        }
    }

    console.log(`  ✓ ${queryResult.payload.results.length} results, all from ${brand_id}`);
    console.log(`  ✓ Brand isolation verified`);
    console.log("  ✓ PASS\n");
}

/**
 * Test D: Missing scope error
 */
async function testD() {
    console.log("Test D: Missing scope error");

    const input = {
        type: "KNOWLEDGE_QUERY",
        payload: {
            query_text: "hello world"
            // No document_id or brand_id
        }
    };

    const result = await runOrchestrator(input);

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (result.ok !== false) {
        throw new Error("Expected ok: false");
    }

    if (result.error.code !== "MISSING_SCOPE") {
        throw new Error(`Expected error code MISSING_SCOPE, got: ${result.error.code}`);
    }

    console.log(`  ✓ Correct error code: ${result.error.code}`);
    console.log("  ✓ PASS\n");
}

/**
 * Run all integration tests
 */
async function runTests() {
    console.log("=".repeat(60));
    console.log("KNOWLEDGE ENGINE INTEGRATION TESTS");
    console.log("=".repeat(60) + "\n");

    try {
        const doc_id = await testA();
        await testB(doc_id);
        await testC();
        await testD();

        console.log("=".repeat(60));
        console.log("✓ ALL INTEGRATION TESTS PASSED");
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
