/**
 * Tests for Execution Readiness Engine (Phase 17)
 */

const { run_execution_readiness } = require("../modules/execution_readiness_engine");
const assert = require("assert");

async function runTests() {
    console.log("Running Execution Readiness Engine Tests...");

    // Test 1: Happy Path - Launchable
    console.log("Test 1: Happy Path - Launchable");
    const input1 = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: { summary: { is_policy_clean: true, error_count: 0 }, issues: [] }
    };

    const result1 = await run_execution_readiness(input1);
    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.module, "execution_readiness_engine");
    assert.strictEqual(result1.payload.readiness.is_launchable, true);
    assert.strictEqual(result1.payload.readiness.has_validation_errors, false);
    assert.strictEqual(result1.payload.readiness.has_policy_errors, false);
    assert.strictEqual(result1.payload.readiness.worst_level, "NONE");
    assert.strictEqual(result1.payload.readiness.counts.validation_errors, 0);
    assert.strictEqual(result1.payload.readiness.counts.policy_errors, 0);
    assert.strictEqual(result1.payload.readiness.counts.total_blocking, 0);
    assert.strictEqual(result1.payload.readiness.blocks.length, 0);
    assert.strictEqual(result1.payload.readiness.warnings.length, 0);
    assert.strictEqual(result1.payload.readiness.infos.length, 0);
    console.log("PASS");

    // Test 2: Blocked by Validation Errors
    console.log("Test 2: Blocked by Validation Errors");
    const input2 = {
        plan: { brand_id: "test", groups: [] },
        validation: {
            is_valid: false,
            errors: [
                { code: "INDEX_GAP", message: "Missing index", path: "/groups/0" },
                { code: "BUDGET_MISMATCH", message: "Budget mismatch", path: "/" }
            ]
        },
        policy: { summary: { is_policy_clean: true, error_count: 0 }, issues: [] }
    };

    const result2 = await run_execution_readiness(input2);
    assert.strictEqual(result2.ok, true);
    assert.strictEqual(result2.payload.readiness.is_launchable, false);
    assert.strictEqual(result2.payload.readiness.has_validation_errors, true);
    assert.strictEqual(result2.payload.readiness.has_policy_errors, false);
    assert.strictEqual(result2.payload.readiness.worst_level, "ERROR");
    assert.strictEqual(result2.payload.readiness.counts.validation_errors, 2);
    assert.strictEqual(result2.payload.readiness.counts.total_blocking, 2);
    assert.strictEqual(result2.payload.readiness.blocks.length, 2);
    assert.strictEqual(result2.payload.readiness.blocks[0].source, "VALIDATION");
    assert.strictEqual(result2.payload.readiness.blocks[0].level, "ERROR");
    assert.strictEqual(result2.payload.readiness.blocks[0].fix, null);
    console.log("PASS");

    // Test 3: Blocked by Policy Errors
    console.log("Test 3: Blocked by Policy Errors");
    const input3 = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: {
            summary: { is_policy_clean: false, error_count: 1 },
            issues: [
                {
                    level: "ERROR",
                    code: "CAMPAIGN_BUDGET_EXCEEDS_MAX",
                    message: "Budget too high",
                    path: "/",
                    fix: { kind: "MANUAL_REQUIRED", description: "Reduce budget" }
                }
            ]
        }
    };

    const result3 = await run_execution_readiness(input3);
    assert.strictEqual(result3.ok, true);
    assert.strictEqual(result3.payload.readiness.is_launchable, false);
    assert.strictEqual(result3.payload.readiness.has_validation_errors, false);
    assert.strictEqual(result3.payload.readiness.has_policy_errors, true);
    assert.strictEqual(result3.payload.readiness.counts.policy_errors, 1);
    assert.strictEqual(result3.payload.readiness.blocks.length, 1);
    assert.strictEqual(result3.payload.readiness.blocks[0].source, "POLICY");
    assert.strictEqual(result3.payload.readiness.blocks[0].level, "ERROR");
    assert.ok(result3.payload.readiness.blocks[0].fix);
    console.log("PASS");

    // Test 4: Blocked by Both Validation and Policy
    console.log("Test 4: Blocked by Both Validation and Policy");
    const input4 = {
        plan: { brand_id: "test", groups: [] },
        validation: {
            is_valid: false,
            errors: [{ code: "VAL_ERR", message: "Validation error", path: "/" }]
        },
        policy: {
            summary: { is_policy_clean: false, error_count: 1 },
            issues: [
                { level: "ERROR", code: "POL_ERR", message: "Policy error", path: "/" }
            ]
        }
    };

    const result4 = await run_execution_readiness(input4);
    assert.strictEqual(result4.ok, true);
    assert.strictEqual(result4.payload.readiness.is_launchable, false);
    assert.strictEqual(result4.payload.readiness.counts.total_blocking, 2);
    assert.strictEqual(result4.payload.readiness.blocks.length, 2);
    // Verify VALIDATION errors come first
    assert.strictEqual(result4.payload.readiness.blocks[0].source, "VALIDATION");
    assert.strictEqual(result4.payload.readiness.blocks[1].source, "POLICY");
    console.log("PASS");

    // Test 5: Warnings and Infos Only
    console.log("Test 5: Warnings and Infos Only");
    const input5 = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: {
            summary: { is_policy_clean: true, error_count: 0, warning_count: 1, info_count: 1 },
            issues: [
                { level: "WARNING", code: "WARN", message: "Warning", path: "/" },
                { level: "INFO", code: "INFO", message: "Info", path: "/" }
            ]
        }
    };

    const result5 = await run_execution_readiness(input5);
    assert.strictEqual(result5.ok, true);
    assert.strictEqual(result5.payload.readiness.is_launchable, true);
    assert.strictEqual(result5.payload.readiness.has_policy_errors, false);
    assert.strictEqual(result5.payload.readiness.worst_level, "WARNING");
    assert.strictEqual(result5.payload.readiness.counts.policy_warnings, 1);
    assert.strictEqual(result5.payload.readiness.counts.policy_infos, 1);
    assert.strictEqual(result5.payload.readiness.warnings.length, 1);
    assert.strictEqual(result5.payload.readiness.infos.length, 1);
    assert.strictEqual(result5.payload.readiness.warnings[0].source, "POLICY");
    assert.strictEqual(result5.payload.readiness.infos[0].source, "POLICY");
    console.log("PASS");

    // Test 6: Worst Level Derivation
    console.log("Test 6: Worst Level Derivation");

    // Only infos
    const input6a = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: {
            summary: { is_policy_clean: true, error_count: 0 },
            issues: [{ level: "INFO", code: "INFO", message: "Info" }]
        }
    };
    const result6a = await run_execution_readiness(input6a);
    assert.strictEqual(result6a.payload.readiness.worst_level, "INFO");

    // Only warnings
    const input6b = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: {
            summary: { is_policy_clean: true, error_count: 0 },
            issues: [{ level: "WARNING", code: "WARN", message: "Warn" }]
        }
    };
    const result6b = await run_execution_readiness(input6b);
    assert.strictEqual(result6b.payload.readiness.worst_level, "WARNING");

    // Errors and warnings
    const input6c = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: false, errors: [{ code: "ERR", message: "Error" }] },
        policy: {
            summary: {},
            issues: [{ level: "WARNING", code: "WARN", message: "Warn" }]
        }
    };
    const result6c = await run_execution_readiness(input6c);
    assert.strictEqual(result6c.payload.readiness.worst_level, "ERROR");
    console.log("PASS");

    // Test 7: Input Immutability
    console.log("Test 7: Input Immutability");
    const input7 = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: { summary: { is_policy_clean: true }, issues: [] }
    };
    const snapshot7 = JSON.parse(JSON.stringify(input7));

    await run_execution_readiness(input7);
    assert.deepStrictEqual(input7, snapshot7);
    console.log("PASS");

    // Test 8: Invalid Input - Not an Object
    console.log("Test 8: Invalid Input - Not an Object");
    const result8 = await run_execution_readiness(null);
    assert.strictEqual(result8.ok, false);
    assert.strictEqual(result8.payload, null);
    assert.strictEqual(result8.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 9: Invalid Input - Missing Fields
    console.log("Test 9: Invalid Input - Missing Fields");

    // Missing plan
    const result9a = await run_execution_readiness({
        validation: { is_valid: true, errors: [] },
        policy: { summary: {}, issues: [] }
    });
    assert.strictEqual(result9a.ok, false);
    assert.strictEqual(result9a.error.code, "INVALID_INPUT");

    // Missing validation
    const result9b = await run_execution_readiness({
        plan: { brand_id: "test" },
        policy: { summary: {}, issues: [] }
    });
    assert.strictEqual(result9b.ok, false);
    assert.strictEqual(result9b.error.code, "INVALID_INPUT");

    // Missing policy
    const result9c = await run_execution_readiness({
        plan: { brand_id: "test" },
        validation: { is_valid: true, errors: [] }
    });
    assert.strictEqual(result9c.ok, false);
    assert.strictEqual(result9c.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 10: Determinism
    console.log("Test 10: Determinism");
    const input10 = {
        plan: { brand_id: "test", groups: [] },
        validation: {
            is_valid: false,
            errors: [{ code: "ERR1", message: "Error 1" }]
        },
        policy: {
            summary: { error_count: 1 },
            issues: [{ level: "ERROR", code: "ERR2", message: "Error 2" }]
        }
    };

    const resultA = await run_execution_readiness(input10);
    const resultB = await run_execution_readiness(input10);

    // Remove timestamps for comparison
    delete resultA.timestamp;
    delete resultB.timestamp;

    assert.deepStrictEqual(resultA.payload.readiness, resultB.payload.readiness);
    console.log("PASS");

    // Test 11: Fix Normalization
    console.log("Test 11: Fix Normalization");
    const input11 = {
        plan: { brand_id: "test", groups: [] },
        validation: { is_valid: true, errors: [] },
        policy: {
            summary: { is_policy_clean: false, error_count: 3 },
            issues: [
                { level: "ERROR", code: "E1", message: "Obj fix", fix: { description: "Reduce budget" } },
                { level: "ERROR", code: "E2", message: "String fix", fix: "Lower bid" },
                { level: "ERROR", code: "E3", message: "Null fix", fix: null }
            ]
        }
    };

    const result11 = await run_execution_readiness(input11);
    assert.strictEqual(result11.payload.readiness.blocks[0].fix, "Reduce budget");
    assert.strictEqual(result11.payload.readiness.blocks[1].fix, "Lower bid");
    assert.strictEqual(result11.payload.readiness.blocks[2].fix, null);
    console.log("PASS");

    console.log("All Phase 17 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
