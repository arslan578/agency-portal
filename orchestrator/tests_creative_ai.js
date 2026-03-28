require('dotenv').config();
const { runOrchestrator } = require('../orchestrator/index');

/**
 * Test 1: Happy Path - Full creative pipeline with brand voice
 */
async function test1() {
    console.log("Test 1: Happy Path - Full creative pipeline");

    // Register a brand document
    const brandText = "Our brand is friendly, helpful, and optimistic. We speak to small business owners who are ambitious but overwhelmed. We use simple language and celebrate their wins.";

    const registerResult = await runOrchestrator({
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64: Buffer.from(brandText).toString('base64'),
            filename: "brand_voice.txt",
            mime: "text/plain",
            brand_id: "brand_creative_001"
        }
    });

    if (!registerResult.ok) {
        throw new Error(`Failed to register document: ${JSON.stringify(registerResult.error)}`);
    }

    console.log(`  ✓ Document registered: ${registerResult.payload.document.document_id}`);

    // Generate ad copy
    const result = await runOrchestrator({
        type: "CREATIVE_GENERATE_AD_COPY",
        payload: {
            brand_id: "brand_creative_001",
            campaign_goal: "awareness",
            product_description: "A self-serve ad platform for small businesses that simplifies cross-platform advertising.",
            target_audience: "local business owners",
            language: "en"
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Creative generation failed: ${JSON.stringify(result.error)}`);
    }

    const creative = result.payload.creative;

    // Validate structure
    if (typeof creative.primary_text !== 'string' || creative.primary_text.length === 0) {
        throw new Error("Invalid primary_text");
    }
    if (typeof creative.headline !== 'string' || creative.headline.length === 0) {
        throw new Error("Invalid headline");
    }
    if (typeof creative.description !== 'string') {
        throw new Error("Invalid description");
    }
    if (typeof creative.call_to_action !== 'string' || creative.call_to_action.length === 0) {
        throw new Error("Invalid call_to_action");
    }

    // Validate variants
    if (!Array.isArray(creative.variants.primary_text)) {
        throw new Error("variants.primary_text is not an array");
    }
    if (!Array.isArray(creative.variants.headline)) {
        throw new Error("variants.headline is not an array");
    }

    // Validate meta
    if (result.payload.meta.profile_used !== true) {
        throw new Error("Expected profile_used to be true");
    }

    console.log(`  ✓ Creative generated:`);
    console.log(`    - Headline: ${creative.headline}`);
    console.log(`    - Primary text: ${creative.primary_text.substring(0, 50)}...`);
    console.log(`    - CTA: ${creative.call_to_action}`);
    console.log(`    - Variants: ${creative.variants.primary_text.length} primary, ${creative.variants.headline.length} headlines`);
    console.log(`  ✓ Brand voice used: ${result.payload.meta.profile_used}`);
    console.log(`  ✓ Source documents: ${result.payload.meta.source_documents.length}`);
    console.log("  ✓ PASS\n");
}

/**
 * Test 2: Missing required fields
 */
async function test2() {
    console.log("Test 2: Missing required fields");

    const result = await runOrchestrator({
        type: "CREATIVE_GENERATE_AD_COPY",
        payload: {
            brand_id: "test"
            // Missing campaign_goal and product_description
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (result.ok !== false) {
        throw new Error("Expected ok: false");
    }

    if (result.error.code !== "INVALID_INPUT") {
        throw new Error(`Expected error code INVALID_INPUT, got: ${result.error.code}`);
    }

    console.log(`  ✓ Correct error code: ${result.error.code}`);
    console.log("  ✓ PASS\n");
}

/**
 * Test 3: Brand with no knowledge (graceful fallback)
 */
async function test3() {
    console.log("Test 3: Brand with no knowledge - graceful fallback");

    const result = await runOrchestrator({
        type: "CREATIVE_GENERATE_AD_COPY",
        payload: {
            brand_id: "brand_no_docs_creative_test",
            campaign_goal: "awareness",
            product_description: "A test product for demonstration purposes."
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Expected ok: true, got: ${JSON.stringify(result.error)}`);
    }

    // Should have creative even without brand profile
    const creative = result.payload.creative;
    if (!creative.primary_text || !creative.headline || !creative.call_to_action) {
        throw new Error("Missing creative fields");
    }

    // profile_used should be false
    if (result.payload.meta.profile_used !== false) {
        throw new Error("Expected profile_used to be false");
    }

    console.log(`  ✓ Creative generated without brand profile`);
    console.log(`    - Headline: ${creative.headline}`);
    console.log(`    - Primary text: ${creative.primary_text.substring(0, 50)}...`);
    console.log(`  ✓ Profile used: ${result.payload.meta.profile_used}`);
    console.log(`  ✓ Note: ${result.payload.meta.notes}`);
    console.log("  ✓ PASS\n");
}

/**
 * Run all tests
 */
async function runTests() {
    console.log("=".repeat(60));
    console.log("CREATIVE AI TESTS");
    console.log("=".repeat(60) + "\n");

    try {
        await test1();
        await test2();
        await test3();

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
