require('dotenv').config();
const { runOrchestrator } = require('../orchestrator/index');

/**
 * Test 1: Happy Path - Interpret brand voice from registered document
 */
async function test1() {
    console.log("Test 1: Happy Path - Brand voice interpretation");

    // First, register a document with brand voice content
    const brandVoiceText = `
        Our brand voice is friendly, approachable, and optimistic. 
        We speak directly to busy small business owners who value simplicity.
        We use plain language and avoid technical jargon.
        Our tone is confident but never arrogant.
        We celebrate our customers' wins and empathize with their challenges.
        We never use sarcasm or negative language.
        Our audience consists of entrepreneurs, marketing managers, and SMB decision-makers.
    `;

    const registerResult = await runOrchestrator({
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64: Buffer.from(brandVoiceText).toString('base64'),
            filename: "brand_voice_guide.txt",
            mime: "text/plain",
            brand_id: "brand_test_voice"
        }
    });

    if (!registerResult.ok) {
        throw new Error(`Failed to register document: ${JSON.stringify(registerResult.error)}`);
    }

    console.log(`  ✓ Document registered: ${registerResult.payload.document.document_id}`);

    // Now interpret the brand voice
    const result = await runOrchestrator({
        type: "KNOWLEDGE_INTERPRET_BRAND_VOICE",
        payload: {
            brand_id: "brand_test_voice"
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Interpretation failed: ${JSON.stringify(result.error)}`);
    }

    // Validate structure
    if (!result.payload.profile) {
        throw new Error("Missing profile in response");
    }

    const profile = result.payload.profile;

    // Validate primary_tone
    if (typeof profile.primary_tone !== 'string' || profile.primary_tone.length === 0) {
        throw new Error("Invalid primary_tone");
    }

    // Validate array fields
    const arrayFields = ['secondary_tones', 'style_guidelines', 'forbidden_elements', 'audience_descriptors'];
    for (const field of arrayFields) {
        if (!Array.isArray(profile[field])) {
            throw new Error(`${field} is not an array`);
        }
        if (!profile[field].every(item => typeof item === 'string')) {
            throw new Error(`${field} contains non-string items`);
        }
    }

    // Validate sources
    if (!result.payload.sources || !Array.isArray(result.payload.sources.document_ids)) {
        throw new Error("Invalid sources structure");
    }

    console.log(`  ✓ Profile generated:`);
    console.log(`    - Primary tone: ${profile.primary_tone}`);
    console.log(`    - Secondary tones: ${profile.secondary_tones.length}`);
    console.log(`    - Style guidelines: ${profile.style_guidelines.length}`);
    console.log(`    - Forbidden elements: ${profile.forbidden_elements.length}`);
    console.log(`    - Audience descriptors: ${profile.audience_descriptors.length}`);
    console.log(`  ✓ Sources tracked: ${result.payload.sources.document_ids.length} documents`);
    console.log("  ✓ PASS\n");
}

/**
 * Test 2: Missing brand_id validation
 */
async function test2() {
    console.log("Test 2: Missing brand_id validation");

    const result = await runOrchestrator({
        type: "KNOWLEDGE_INTERPRET_BRAND_VOICE",
        payload: {}
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
 * Test 3: No knowledge available
 */
async function test3() {
    console.log("Test 3: No knowledge available");

    const result = await runOrchestrator({
        type: "KNOWLEDGE_INTERPRET_BRAND_VOICE",
        payload: {
            brand_id: "brand_no_docs_exists_nowhere"
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (result.ok !== false) {
        throw new Error("Expected ok: false");
    }

    if (result.error.code !== "NO_KNOWLEDGE") {
        throw new Error(`Expected error code NO_KNOWLEDGE, got: ${result.error.code}`);
    }

    console.log(`  ✓ Correct error code: ${result.error.code}`);
    console.log("  ✓ PASS\n");
}

/**
 * Run all tests
 */
async function runTests() {
    console.log("=".repeat(60));
    console.log("KNOWLEDGE INTERPRETER TESTS");
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
