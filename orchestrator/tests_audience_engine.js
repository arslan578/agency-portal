require('dotenv').config();
const { runOrchestrator } = require('../orchestrator/index');

/**
 * Test 1: Happy Path - Infer audience with knowledge
 */
async function test1() {
    console.log("Test 1: Happy Path - Infer audience with knowledge");

    // Register a brand document with audience information
    const audienceText = `
        Our ideal customers are small business owners aged 30-50 who operate local businesses.
        They're looking for affordable marketing solutions but don't have time to learn complex tools.
        They value simplicity, reliability, and good customer support.
        Most are in retail, restaurants, or professional services.
    `;

    const registerResult = await runOrchestrator({
        type: "KNOWLEDGE_REGISTER_DOCUMENT",
        payload: {
            base64: Buffer.from(audienceText).toString('base64'),
            filename: "target_audience.txt",
            mime: "text/plain",
            brand_id: "brand_audience_001"
        }
    });

    if (!registerResult.ok) {
        throw new Error(`Failed to register document: ${JSON.stringify(registerResult.error)}`);
    }

    console.log(`  ✓ Document registered: ${registerResult.payload.document.document_id}`);

    // Infer audience profile
    const result = await runOrchestrator({
        type: "AUDIENCE_INFER_PROFILE",
        payload: {
            brand_id: "brand_audience_001",
            campaign_goal: "leads",
            product_description: "A simple marketing automation platform for small businesses",
            target_audience_hint: "time-poor local business owners"
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Audience inference failed: ${JSON.stringify(result.error)}`);
    }

    const profile = result.payload.profile;

    // Validate structure
    if (typeof profile.summary !== 'string' || profile.summary.length === 0) {
        throw new Error("Invalid summary");
    }

    // Validate demographics
    if (!profile.demographics || !Array.isArray(profile.demographics.age_ranges)) {
        throw new Error("Invalid demographics");
    }

    // Validate firmographics
    if (!profile.firmographics || !Array.isArray(profile.firmographics.business_sizes)) {
        throw new Error("Invalid firmographics");
    }

    // Validate psychographics
    if (!profile.psychographics || !Array.isArray(profile.psychographics.interests)) {
        throw new Error("Invalid psychographics");
    }

    // Validate behaviors
    if (!profile.behaviors || !Array.isArray(profile.behaviors.buying_triggers)) {
        throw new Error("Invalid behaviors");
    }

    // Validate sources
    if (!result.payload.sources || result.payload.sources.document_ids.length === 0) {
        throw new Error("Expected source documents");
    }

    console.log(`  ✓ Profile generated:`);
    console.log(`    - Summary: ${profile.summary.substring(0, 60)}...`);
    console.log(`    - Age ranges: ${profile.demographics.age_ranges.length}`);
    console.log(`    - Industries: ${profile.firmographics.industries.length}`);
    console.log(`    - Motivations: ${profile.psychographics.motivations.length}`);
    console.log(`    - Buying triggers: ${profile.behaviors.buying_triggers.length}`);
    console.log(`  ✓ Source documents: ${result.payload.sources.document_ids.length}`);
    console.log("  ✓ PASS\n");
}

/**
 * Test 2: Missing required fields
 */
async function test2() {
    console.log("Test 2: Missing required fields");

    const result = await runOrchestrator({
        type: "AUDIENCE_INFER_PROFILE",
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
 * Test 3: No knowledge available
 */
async function test3() {
    console.log("Test 3: No knowledge - reasonable assumptions");

    const result = await runOrchestrator({
        type: "AUDIENCE_INFER_PROFILE",
        payload: {
            brand_id: "brand_no_docs_audience_test",
            campaign_goal: "awareness",
            product_description: "A cloud-based inventory management system for warehouses"
        }
    });

    console.log("  Result:", JSON.stringify(result, null, 2));

    if (!result.ok) {
        throw new Error(`Expected ok: true, got: ${JSON.stringify(result.error)}`);
    }

    const profile = result.payload.profile;

    // Should have profile even without brand knowledge
    if (!profile.summary || profile.summary.length === 0) {
        throw new Error("Expected non-empty summary");
    }

    // At least one array should have content (reasonable assumptions)
    const hasContent =
        profile.demographics.age_ranges.length > 0 ||
        profile.firmographics.business_sizes.length > 0 ||
        profile.psychographics.interests.length > 0 ||
        profile.behaviors.buying_triggers.length > 0;

    if (!hasContent) {
        throw new Error("Expected at least some profile content");
    }

    // Sources should be empty
    if (result.payload.sources.document_ids.length !== 0) {
        throw new Error("Expected empty sources");
    }

    console.log(`  ✓ Profile generated without knowledge`);
    console.log(`    - Summary: ${profile.summary.substring(0, 60)}...`);
    console.log(`  ✓ Empty sources: ${result.payload.sources.document_ids.length}`);
    console.log("  ✓ PASS\n");
}

/**
 * Run all tests
 */
async function runTests() {
    console.log("=".repeat(60));
    console.log("AUDIENCE ENGINE TESTS");
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
