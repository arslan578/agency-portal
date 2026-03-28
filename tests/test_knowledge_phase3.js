// Load environment variables from .env
require('dotenv').config();

const { runOrchestrator } = require('../orchestrator/index');

async function test() {
    console.log("Testing Knowledge Engine Phase 3...\n");

    // Test 1: Simple text document
    const simpleText = "Hello World. This is a test document for the Knowledge Engine. It contains multiple sentences to test chunking and embedding generation.";
    const base64Text = Buffer.from(simpleText).toString('base64');

    const input = {
        target_module: "knowledge_engine",
        payload: {
            base64: base64Text,
            filename: "test.txt",
            mime: "text/plain"
        }
    };

    console.log("Test 1: Simple Text Document");
    console.log("Input:", JSON.stringify(input, null, 2));
    console.log("\nProcessing...\n");

    try {
        const result = await runOrchestrator(input);

        if (result.ok) {
            console.log("✓ SUCCESS\n");
            console.log("Intelligence Object:");
            console.log("- Version:", result.payload.intelligence_object.version);
            console.log("- Source:", JSON.stringify(result.payload.intelligence_object.source, null, 2));
            console.log("- Document:", JSON.stringify(result.payload.intelligence_object.document, null, 2));
            console.log("- Chunks:", result.payload.intelligence_object.text.chunks.length);
            console.log("- Embedding dimensions:", result.payload.intelligence_object.embedding_meta.dimensions);
            console.log("\nFirst chunk:");
            const firstChunk = result.payload.intelligence_object.text.chunks[0];
            console.log("  ID:", firstChunk.id);
            console.log("  Text length:", firstChunk.text.length);
            console.log("  Embedding length:", firstChunk.embedding?.length || 0);
            console.log("  Token estimate:", firstChunk.token_estimate);
        } else {
            console.error("✗ FAILED");
            console.error("Error:", JSON.stringify(result.error, null, 2));
            process.exit(1);
        }
    } catch (e) {
        console.error("✗ EXCEPTION:", e.message);
        console.error(e);
        process.exit(1);
    }

    console.log("\n" + "=".repeat(60));
    console.log("ALL TESTS PASSED");
    console.log("=".repeat(60));
}

test();
