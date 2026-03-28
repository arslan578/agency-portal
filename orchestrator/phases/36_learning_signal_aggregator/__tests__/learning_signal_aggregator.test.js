/**
 * Phase 36: Learning Signal Aggregator - Test Suite (18 tests)
 */

const assert = require("assert");
const { aggregateLearningSignals } = require("../learning_signal_aggregator");

// Helper to create envelope
function createEnvelope(overrides = {}) {
    return {
        execution_id: "exec_123",
        payload: {
            recommended: [
                { venue_key: "YOUTUBE", recommended_budget: 5000, role: "PRIMARY", raw_score: 0.8, rank: 1 },
                { venue_key: "FACEBOOK", recommended_budget: 3000, role: "SUPPORTING", raw_score: 0.6, rank: 2 }
            ],
            excluded: [
                { venue_key: "TIKTOK", reason: "VENUE_DISABLED" }
            ],
            global_score: 0.75,
            constraint_tightness: 0.5,
            coverage_score: 0.8,
            required_venues: [],
            ...overrides
        }
    };
}

async function runTests() {
    console.log("Running Learning Signal Aggregator Tests (18 total)...\n");

    // ========== HAPPY PATH (6) ==========
    console.log("=== HAPPY PATHS ===");

    // 1. Standard recommended + excluded
    console.log("Test 1: Standard recommended + excluded");
    const res1 = aggregateLearningSignals(createEnvelope());
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.phase, "PHASE_36_LEARNING_SIGNAL_AGGREGATOR_V1");
    assert.strictEqual(res1.payload.recommended_signals.length, 2);
    assert.strictEqual(res1.payload.exclusion_signals.length, 1);
    assert(typeof res1.payload.global_signals.optimization_pressure === 'number');
    console.log("PASS\n");

    // 2. No excluded venues
    console.log("Test 2: No excluded venues");
    const res2 = aggregateLearningSignals(createEnvelope({ excluded: [] }));
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.payload.exclusion_signals.length, 0);
    console.log("PASS\n");

    // 3. No constraint tightness
    console.log("Test 3: No constraint tightness");
    const res3 = aggregateLearningSignals(createEnvelope({ constraint_tightness: 0.0 }));
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.payload.global_signals.constraint_tightness, 0.0);
    // Optimization pressure should be lower with no tightness
    assert(res3.payload.global_signals.optimization_pressure >= 0);
    console.log("PASS\n");

    // 4. Zero or small budgets
    console.log("Test 4: Zero/small budgets");
    const res4 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: "YOUTUBE", recommended_budget: 0, role: "PRIMARY", raw_score: 0.5, rank: 1 }
        ]
    }));
    assert.strictEqual(res4.ok, true);
    assert.strictEqual(res4.payload.recommended_signals[0].allocated_budget, 0);
    console.log("PASS\n");

    // 5. Different raw_score values
    console.log("Test 5: Different raw_scores and normalization");
    const res5 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: "A", recommended_budget: 1000, role: "PRIMARY", raw_score: 1.0, rank: 1 },
            { venue_key: "B", recommended_budget: 500, role: "SUPPORTING", raw_score: 0.5, rank: 2 }
        ]
    }));
    assert.strictEqual(res5.ok, true);
    assert.strictEqual(res5.payload.recommended_signals[0].normalized_score, 1.0);
    assert.strictEqual(res5.payload.recommended_signals[1].normalized_score, 0.5);
    console.log("PASS\n");

    // 6. Required venues included
    console.log("Test 6: Required venues properly flagged");
    const res6 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: "YOUTUBE", recommended_budget: 5000, role: "PRIMARY", raw_score: 0.8, rank: 1 }
        ],
        required_venues: ["YOUTUBE"]
    }));
    assert.strictEqual(res6.ok, true);
    assert.strictEqual(res6.payload.recommended_signals[0].was_required, true);
    console.log("PASS\n");

    // ========== NEGATIVE (6) ==========
    console.log("=== NEGATIVE PATHS ===");

    // 7. No recommended array
    console.log("Test 7: Missing recommended array");
    const res7 = aggregateLearningSignals({ payload: { excluded: [], global_score: 0.5, constraint_tightness: 0.0 } });
    assert.strictEqual(res7.ok, false);
    assert.strictEqual(res7.error.code, "MALFORMED_PHASE_35_OUTPUT");
    console.log("PASS\n");

    // 8. Malformed payload
    console.log("Test 8: Malformed payload");
    const res8 = aggregateLearningSignals({ execution_id: "test" });
    assert.strictEqual(res8.ok, false);
    assert.strictEqual(res8.error.code, "MALFORMED_PHASE_35_OUTPUT");
    console.log("PASS\n");

    // 9. NaN raw_score
    console.log("Test 9: NaN raw_score");
    const res9 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: "YOUTUBE", recommended_budget: 5000, role: "PRIMARY", raw_score: NaN, rank: 1 }
        ]
    }));
    assert.strictEqual(res9.ok, false);
    assert(res9.error.code === "PHASE_36_ERROR" || res9.error.code === "MALFORMED_PHASE_35_OUTPUT");
    console.log("PASS\n");

    // 10. Missing global_score
    console.log("Test 10: Missing global_score");
    const res10 = aggregateLearningSignals({
        payload: {
            recommended: [{ venue_key: "A", raw_score: 0.5, rank: 1 }],
            excluded: [],
            constraint_tightness: 0.0
        }
    });
    assert.strictEqual(res10.ok, false);
    assert.strictEqual(res10.error.code, "MALFORMED_PHASE_35_OUTPUT");
    console.log("PASS\n");

    // 11. Invalid venue_key
    console.log("Test 11: Invalid venue_key");
    const res11 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: null, recommended_budget: 5000, role: "PRIMARY", raw_score: 0.8, rank: 1 }
        ]
    }));
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.error.code, "PHASE_36_ERROR");
    console.log("PASS\n");

    // 12. Null coverage_score (should use default 1.0)
    console.log("Test 12: Null coverage_score uses default");
    const res12 = aggregateLearningSignals(createEnvelope({ coverage_score: null }));
    // Should use default 1.0
    assert.strictEqual(res12.ok, true);
    assert.strictEqual(res12.payload.global_signals.coverage_score, 1.0);
    console.log("PASS\n");

    // ========== EDGE CASES (4) ==========
    console.log("=== EDGE CASES ===");

    // 13. All venues required
    console.log("Test 13: All venues required");
    const res13 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: "YOUTUBE", recommended_budget: 5000, role: "PRIMARY", raw_score: 0.8, rank: 1 },
            { venue_key: "FACEBOOK", recommended_budget: 3000, role: "SUPPORTING", raw_score: 0.6, rank: 2 }
        ],
        required_venues: ["YOUTUBE", "FACEBOOK"]
    }));
    assert.strictEqual(res13.ok, true);
    assert(res13.payload.recommended_signals.every(s => s.was_required === true));
    console.log("PASS\n");

    // 14. All venues excluded (should error - no recommended)
    console.log("Test 14: All venues excluded (no recommended)");
    const res14 = aggregateLearningSignals({
        payload: {
            recommended: [],
            excluded: [{ venue_key: "A", reason: "FORBIDDEN" }],
            global_score: 0.0,
            constraint_tightness: 1.0
        }
    });
    assert.strictEqual(res14.ok, false);
    assert.strictEqual(res14.error.code, "PHASE_36_ERROR");
    console.log("PASS\n");

    // 15. max_raw_score = 0
    console.log("Test 15: max_raw_score = 0 (all get 1.0)");
    const res15 = aggregateLearningSignals(createEnvelope({
        recommended: [
            { venue_key: "A", recommended_budget: 1000, role: "PRIMARY", raw_score: 0, rank: 1 },
            { venue_key: "B", recommended_budget: 1000, role: "SUPPORTING", raw_score: 0, rank: 2 }
        ]
    }));
    assert.strictEqual(res15.ok, true);
    // When max_raw_score is 0, all should get normalized_score = 1.0
    assert.strictEqual(res15.payload.recommended_signals[0].normalized_score, 1.0);
    assert.strictEqual(res15.payload.recommended_signals[1].normalized_score, 1.0);
    console.log("PASS\n");

    // 16. constraint_tightness = 1.0
    console.log("Test 16: constraint_tightness = 1.0");
    const res16 = aggregateLearningSignals(createEnvelope({
        constraint_tightness: 1.0,
        global_score: 0.5
    }));
    assert.strictEqual(res16.ok, true);
    assert.strictEqual(res16.payload.global_signals.constraint_tightness, 1.0);
    // Optimization pressure should be higher with max tightness
    assert(res16.payload.global_signals.optimization_pressure > 0.2);
    console.log("PASS\n");

    // ========== REGRESSION (1) ==========
    console.log("=== REGRESSION GUARD ===");

    // 17. No reinterpretation of Phase 35 scoring
    console.log("Test 17: No score reinterpretation");
    const res17 = aggregateLearningSignals(createEnvelope());
    assert.strictEqual(res17.ok, true);
    // Suitability, reliability, learning_score should be null in exclusions
    assert.strictEqual(res17.payload.exclusion_signals[0].suitability, null);
    assert.strictEqual(res17.payload.exclusion_signals[0].reliability, null);
    assert.strictEqual(res17.payload.exclusion_signals[0].learning_score, null);
    // Normalized score should be simple division, not recomputed
    const yt = res17.payload.recommended_signals.find(s => s.venue_key === "YOUTUBE");
    assert.strictEqual(yt.raw_score, 0.8); // Original from Phase 35
    console.log("PASS\n");

    // ========== DETERMINISM (1) ==========
    console.log("=== DETERMINISM GUARD ===");

    // 18. Same input → same output
    console.log("Test 18: Determinism guard");
    const input18 = createEnvelope();
    const run1 = aggregateLearningSignals(JSON.parse(JSON.stringify(input18)));
    const run2 = aggregateLearningSignals(JSON.parse(JSON.stringify(input18)));

    // Compare payloads (ignore timestamp)
    const p1 = JSON.stringify({ ...run1.payload, timestamp: "IGNORE" });
    const p2 = JSON.stringify({ ...run2.payload, timestamp: "IGNORE" });
    assert.strictEqual(p1, p2);
    console.log("PASS\n");

    console.log("✅ All 18 Phase 36 tests passed.");
}

runTests().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
