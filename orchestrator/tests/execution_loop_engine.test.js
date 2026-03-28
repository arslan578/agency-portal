/**
 * Tests for Execution Loop Engine (Phase 27)
 */

const assert = require("assert");
const { decideLoopAction } = require("../modules/execution_loop_engine");

async function runTests() {
    console.log("Running Execution Loop Engine Tests...");

    // Test 1: CONTINUE - Happy path with connector plan
    console.log("Test 1: CONTINUE - Happy path with connector plan");
    const input1 = {
        loop_context: {
            loop_id: "loop_1",
            iteration_index: 0,
            no_change_iterations: 0,
            last_connector_plan: {
                connector_actions: [{ job_id: "job_1", mode: "RETRY" }]
            }
        }
    };

    const res1 = decideLoopAction(input1);
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.payload.decision, "CONTINUE");
    assert.strictEqual(res1.payload.next_iteration_index, 1);
    assert.strictEqual(res1.payload.control.should_execute_connector_plan, true);
    console.log("PASS");

    // Test 2: STOP - Clean success with no drift
    console.log("\nTest 2: STOP - Clean success with no drift");
    const input2 = {
        loop_context: {
            loop_id: "loop_2",
            iteration_index: 2,
            no_change_iterations: 0,
            last_run_result: {
                summary: { success: 3, failed: 0, skipped: 0 }
            },
            last_drift_report: {
                summary: { has_drift: false }
            },
            last_correction: {
                action: "NO_ACTION"
            }
        }
    };

    const res2 = decideLoopAction(input2);
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.decision, "STOP");
    assert.strictEqual(res2.payload.reason.code, "STOP_SUCCESS_NO_DRIFT");
    assert.strictEqual(res2.payload.control.is_terminal, true);
    console.log("PASS");

    // Test 3: ABORT - Correction requested abort
    console.log("\nTest 3: ABORT - Correction requested abort");
    const input3 = {
        loop_context: {
            loop_id: "loop_3",
            iteration_index: 1,
            last_correction: {
                action: "ABORT_EXECUTION"
            }
        }
    };

    const res3 = decideLoopAction(input3);
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.decision, "ABORT");
    assert.strictEqual(res3.payload.reason.code, "ABORT_CORRECTION");
    assert.strictEqual(res3.payload.control.is_terminal, true);
    console.log("PASS");

    // Test 4: ABORT - Max iterations reached
    console.log("\nTest 4: ABORT - Max iterations reached");
    const input4 = {
        loop_context: {
            loop_id: "loop_4",
            iteration_index: 5
        },
        loop_config: {
            max_iterations: 5
        }
    };

    const res4 = decideLoopAction(input4);
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload.decision, "ABORT");
    assert.strictEqual(res4.payload.reason.code, "ABORT_MAX_ITERATIONS");
    console.log("PASS");

    // Test 5: ABORT - Failed run, retries disabled
    console.log("\nTest 5: ABORT - Failed run, retries disabled");
    const input5 = {
        loop_context: {
            loop_id: "loop_5",
            iteration_index: 1,
            last_run_result: {
                summary: { success: 0, failed: 3, skipped: 0 }
            }
        },
        loop_config: {
            treat_failed_as_retryable: false
        }
    };

    const res5 = decideLoopAction(input5);
    assert.strictEqual(res5.ok, true);
    assert.strictEqual(res5.payload.decision, "ABORT");
    assert.strictEqual(res5.payload.reason.code, "ABORT_FAILED_NOT_RETRYABLE");
    console.log("PASS");

    // Test 6: No-change counter increment
    console.log("\nTest 6: No-change counter increment");
    const input6 = {
        loop_context: {
            loop_id: "loop_6",
            iteration_index: 1,
            no_change_iterations: 0,
            last_run_result: {
                summary: { success: 1, failed: 0, skipped: 0 }
            },
            last_drift_report: {
                summary: { has_drift: false }
            },
            last_correction: {
                action: "NO_ACTION"
            },
            last_connector_plan: {
                connector_actions: []
            }
        }
    };

    const res6 = decideLoopAction(input6);
    assert.strictEqual(res6.ok, true);
    assert.strictEqual(res6.payload.diagnostics.no_change_iterations, 1);
    console.log("PASS");

    // Test 7: No-change counter reset
    console.log("\nTest 7: No-change counter reset");
    const input7 = {
        loop_context: {
            loop_id: "loop_7",
            iteration_index: 2,
            no_change_iterations: 1,
            last_run_result: {
                summary: { success: 0, failed: 1, skipped: 0 }
            },
            last_connector_plan: {
                connector_actions: [{ job_id: "retry_1" }]
            }
        }
    };

    const res7 = decideLoopAction(input7);
    assert.strictEqual(res7.ok, true);
    assert.strictEqual(res7.payload.diagnostics.no_change_iterations, 0);
    console.log("PASS");

    // Test 8: STOP - Max no-change iterations
    console.log("\nTest 8: STOP - Max no-change iterations");
    const input8 = {
        loop_context: {
            loop_id: "loop_8",
            iteration_index: 3,
            no_change_iterations: 1,
            last_run_result: {
                summary: { success: 1, failed: 0, skipped: 0 }
            },
            last_drift_report: {
                summary: { has_drift: false }
            },
            last_correction: {
                action: "NO_ACTION"
            },
            last_connector_plan: {
                connector_actions: []
            }
        },
        loop_config: {
            max_no_change_iterations: 2
        }
    };

    const res8 = decideLoopAction(input8);
    assert.strictEqual(res8.ok, true);
    assert.strictEqual(res8.payload.decision, "STOP");
    assert.strictEqual(res8.payload.reason.code, "STOP_NO_CHANGE_LIMIT");
    console.log("PASS");

    // Test 9: Defensive STOP - No connector plan
    console.log("\nTest 9: Defensive STOP - No connector plan");
    const input9 = {
        loop_context: {
            loop_id: "loop_9",
            iteration_index: 1,
            last_connector_plan: {
                connector_actions: []
            }
        }
    };

    const res9 = decideLoopAction(input9);
    assert.strictEqual(res9.ok, true);
    assert.strictEqual(res9.payload.decision, "STOP");
    assert.strictEqual(res9.payload.reason.code, "STOP_NO_CONNECTOR_PLAN");
    console.log("PASS");

    // Test 10: Input immutability
    console.log("\nTest 10: Input immutability");
    const input10 = {
        loop_context: {
            loop_id: "loop_10",
            iteration_index: 0,
            last_connector_plan: { connector_actions: [] }
        }
    };

    const inputCopy = JSON.stringify(input10);
    decideLoopAction(input10);
    assert.strictEqual(JSON.stringify(input10), inputCopy);
    console.log("PASS");

    // Test 11: Invalid input - missing loop_id
    console.log("\nTest 11: Invalid input - missing loop_id");
    const res11 = decideLoopAction({
        loop_context: {
            iteration_index: 0
        }
    });
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.error.code, "INVALID_INPUT");
    assert.strictEqual(res11.payload, null);
    console.log("PASS");

    // Test 12: Invalid input - missing iteration_index
    console.log("\nTest 12: Invalid input - missing iteration_index");
    const res12 = decideLoopAction({
        loop_context: {
            loop_id: "loop_12"
        }
    });
    assert.strictEqual(res12.ok, false);
    assert.strictEqual(res12.error.code, "INVALID_INPUT");
    console.log("PASS");

    // Test 13: Invalid input - null input
    console.log("\nTest 13: Invalid input - null input");
    const res13 = decideLoopAction(null);
    assert.strictEqual(res13.ok, false);
    assert.strictEqual(res13.error.code, "INVALID_INPUT");
    assert.strictEqual(res13.module, "execution_loop_engine");
    console.log("PASS");

    // Test 14: Diagnostics populated correctly
    console.log("\nTest 14: Diagnostics populated correctly");
    const input14 = {
        loop_context: {
            loop_id: "loop_14",
            iteration_index: 2,
            last_run_result: {
                summary: { success: 1, failed: 0, skipped: 0 }
            },
            last_drift_report: {
                summary: { has_drift: true }
            },
            last_correction: {
                action: "RETRY_CONNECTOR_IO"
            },
            last_connector_plan: {
                connector_actions: [{ job_id: "j1" }]
            }
        },
        loop_config: {
            max_iterations: 10
        }
    };

    const res14 = decideLoopAction(input14);
    assert.strictEqual(res14.ok, true);
    assert.strictEqual(res14.payload.diagnostics.run_status, "SUCCESS");
    assert.strictEqual(res14.payload.diagnostics.correction_action, "RETRY_CONNECTOR_IO");
    assert.strictEqual(res14.payload.diagnostics.has_drift, true);
    assert.strictEqual(res14.payload.diagnostics.max_iterations, 10);
    console.log("PASS");

    console.log("\nAll Phase 27 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
