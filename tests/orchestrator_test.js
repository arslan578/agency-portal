const { runOrchestrator } = require('../orchestrator/index');

async function test() {
    console.log("Starting Orchestrator Tests...\n");

    const tests = [
        {
            name: "Valid Module: knowledge_engine",
            input: {
                target_module: "knowledge_engine",
                payload: {
                    base64: "SGVsbG8gV29ybGQ=",
                    filename: "test.txt",
                    mime: "text/plain"
                }
            }
        },
        {
            name: "Invalid Module",
            input: { target_module: "invalid_module", payload: {} }
        },
        {
            name: "Empty Input",
            input: {}
        }
    ];

    let passed = true;

    for (const t of tests) {
        console.log(`--- Test: ${t.name} ---`);
        try {
            const result = await runOrchestrator(t.input);
            console.log(JSON.stringify(result, null, 2));

            // Basic validation
            if (!result.timestamp) {
                console.error("FAIL: Missing timestamp");
                passed = false;
            }
            if (t.name.includes("Valid")) {
                if (!result.ok) {
                    if (result.error && result.error.code === 'R2_CONFIG_MISSING') {
                        console.log("SKIP: R2 not configured, skipping upload test");
                    } else {
                        console.error("FAIL: Expected success and correct module");
                        passed = false;
                    }
                } else if (result.module !== t.input.target_module) {
                    console.error("FAIL: Expected correct module");
                    passed = false;
                }
            }
            if (t.name.includes("Invalid") && (result.ok || result.error.code !== 'MODULE_NOT_FOUND')) {
                console.error("FAIL: Expected error MODULE_NOT_FOUND");
                passed = false;
            }
        } catch (e) {
            console.error("FAIL: Exception thrown", e);
            passed = false;
        }
        console.log("\n");
    }

    if (passed) {
        console.log("ALL TESTS PASSED");
    } else {
        console.error("SOME TESTS FAILED");
        process.exit(1);
    }
}

test();
