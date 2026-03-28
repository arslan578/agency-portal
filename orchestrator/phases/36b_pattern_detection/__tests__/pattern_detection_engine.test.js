/**
 * Phase 36B: Pattern Detection Engine - Test Suite
 *
 * 26 Deterministic Tests:
 * - 6 Happy Path
 * - 6 Negative Path
 * - 4 Edge Cases
 * - 1 Regression Guard
 * - 1 Determinism Guard
 * - 6 New Tests (Tightening Patch)
 * - 2 New Tests (Final Alignment)
 */

const { execute, _internal } = require('../pattern_detection_engine');

// --- Test Helpers ---

function createMockInput() {
    return {
        memory_graph: { id: 'mg_1', edges: [] },
        nodes: [
            { id: 'v1', type: 'VENUE', metrics: { roas: 2.5, spend: 5000, stability_score: 0.9 } },
            { id: 'v2', type: 'VENUE', metrics: { roas: 0.5, spend: 100, stability_score: 0.2 } },
            { id: 'c1', type: 'CREATIVE', metrics: { conversion_rate: 0.05 } },
            { id: 'c2', type: 'CREATIVE', metrics: { conversion_rate: 0.01 } }
        ],
        edges: [],
        metadata: {},
        execution_snapshot: {},
        drift_events: [],
        health_events: [],
        optimizer_results: {},
        creative_scores: {
            'c1': { visual_score: 0.9, copy_score: 0.8 },
            'c2': { visual_score: 0.2, copy_score: 0.3 }
        },
        policy_outputs: {}
    };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// --- Tests ---

const tests = {
    // Happy Path (6)

    'Happy Path 1: Venue Clustering': () => {
        const input = createMockInput();
        const result = execute(input);
        assert(result.ok === true, 'Should be ok');
        assert(result.pattern_clusters.venue_patterns.clusters.length > 0, 'Should have venue clusters');
        // v1 should be in a cluster with a neutral label
        const v1Cluster = result.pattern_clusters.venue_patterns.clusters.find(c => c.members.includes('v1'));
        assert(v1Cluster.label.startsWith('cluster_'), 'Label should be neutral (cluster_X)');
        assert(result.pattern_clusters.venue_patterns.label_resolver === 'NEUTRAL_LABELS_V1', 'Should use neutral resolver');
    },

    'Happy Path 2: Creative Clustering': () => {
        const input = createMockInput();
        const result = execute(input);
        assert(result.pattern_clusters.creative_patterns.clusters.length > 0, 'Should have creative clusters');
    },

    'Happy Path 3: Failure Signature Detection': () => {
        const input = createMockInput();
        input.drift_events = [
            { connector_id: 'meta', drift_type: 'BUDGET_DRIFT' },
            { connector_id: 'meta', drift_type: 'BUDGET_DRIFT' },
            { connector_id: 'meta', drift_type: 'BUDGET_DRIFT' }
        ];
        const result = execute(input);
        assert(result.pattern_clusters.failure_patterns.signatures.length === 1, 'Should detect 1 failure pattern');
        assert(result.pattern_clusters.failure_patterns.signatures[0].type === 'REPEATED_DRIFT', 'Should be REPEATED_DRIFT');
    },

    'Happy Path 4: Temporal Pattern Detection': () => {
        const input = createMockInput();
        const result = execute(input);
        assert(result.pattern_clusters.temporal_patterns !== undefined, 'Should return temporal patterns structure');
    },

    'Happy Path 5: Cross-Source Aggregation': () => {
        const input = createMockInput();
        const result = execute(input);
        assert(result.stats.node_count === 4, 'Should count nodes correctly');
        assert(result.pattern_vectors.venue_vector.length > 0, 'Should generate vectors');
    },

    'Happy Path 6: Contract Structure Validity': () => {
        const input = createMockInput();
        const result = execute(input);
        assert(Array.isArray(result.explanations), 'Explanations should be array');
        assert(typeof result.stats === 'object', 'Stats should be object');
        assert(Array.isArray(result.warnings), 'Warnings should be array');
    },

    // Negative Path (6)

    'Negative Path 1: Missing Memory Graph': () => {
        const input = createMockInput();
        delete input.memory_graph;
        const result = execute(input);
        assert(result.ok === false, 'Should fail');
        assert(result.error === 'INVALID_INPUT', 'Should be INVALID_INPUT');
    },

    'Negative Path 2: Malformed Nodes': () => {
        const input = createMockInput();
        input.nodes = null;
        const result = execute(input);
        assert(result.ok === false, 'Should fail');
    },

    'Negative Path 3: Malformed Edges': () => {
        const input = createMockInput();
        input.edges = null;
        const result = execute(input);
        assert(result.ok === false, 'Should fail');
    },

    'Negative Path 4: Corrupted Drift Events': () => {
        const input = createMockInput();
        input.drift_events = null; // Should handle gracefully or default to empty
        // The engine defaults to [] if missing/null in destructuring, so this might pass as valid empty
        // Let's check if it throws. If it doesn't throw and returns ok, that's robust behavior.
        try {
            const result = execute(input);
            assert(result.ok === true, 'Should handle null drift_events gracefully');
        } catch (e) {
            throw new Error('Should not throw on null drift_events');
        }
    },

    'Negative Path 5: Missing Optimizer Results': () => {
        const input = createMockInput();
        delete input.optimizer_results;
        const result = execute(input);
        assert(result.ok === true, 'Should be optional/robust');
    },

    'Negative Path 6: Incorrect Field Types': () => {
        const input = createMockInput();
        input.nodes = "not-an-array";
        const result = execute(input); // Should fail validation
        assert(result.ok === false, 'Should fail on invalid nodes type');
    },

    // Edge Cases (4)

    'Edge Case 1: Empty Inputs': () => {
        const input = createMockInput();
        input.nodes = [];
        input.edges = [];
        const result = execute(input);
        assert(result.ok === true, 'Should handle empty graph');
        assert(result.pattern_clusters.venue_patterns.clusters.length === 0, 'Should have 0 clusters');
    },

    'Edge Case 2: Huge Dataset (Mock Stress)': () => {
        const input = createMockInput();
        // Create 1000 nodes
        for (let i = 0; i < 1000; i++) {
            input.nodes.push({ id: `n${i}`, type: 'VENUE', metrics: { roas: Math.random() * 5, spend: Math.random() * 10000 } });
        }
        const start = Date.now();
        const result = execute(input);
        const duration = Date.now() - start;
        assert(result.ok === true, 'Should handle large dataset');
        assert(duration < 1000, 'Should be reasonably fast (<1s)');
    },

    'Edge Case 3: Single Node Graph': () => {
        const input = createMockInput();
        input.nodes = [{ id: 'v1', type: 'VENUE', metrics: { roas: 2 } }];
        const result = execute(input);
        assert(result.ok === true, 'Should handle single node');
        assert(result.pattern_clusters.venue_patterns.clusters.length > 0, 'Should cluster single node');
    },

    'Edge Case 4: Single Repeated Failure Pattern': () => {
        const input = createMockInput();
        input.drift_events = Array(10).fill({ connector_id: 'c1', drift_type: 'TYPE_A' });
        const result = execute(input);
        assert(result.pattern_clusters.failure_patterns.signatures.length === 1, 'Should collapse to 1 signature');
        assert(result.pattern_clusters.failure_patterns.signatures[0].frequency === 10, 'Should count 10');
    },

    // Guards (2)

    'Regression Guard': () => {
        const input = createMockInput();
        // Lock specific values
        input.nodes[0].metrics.roas = 3.0;
        input.nodes[0].metrics.spend = 5000;
        const result = execute(input);
        const v1Cluster = result.pattern_clusters.venue_patterns.clusters.find(c => c.members.includes('v1'));
        assert(v1Cluster.label.startsWith('cluster_'), 'Regression: Label logic should be neutral');
    },

    'Determinism Guard': () => {
        const input = createMockInput();
        // Add some randomness to input generation to ensure sorting works
        input.nodes.push({ id: 'v3', type: 'VENUE', metrics: { roas: 1.5, spend: 500 } });

        const executeWithoutStats = (inp) => {
            const res = execute(inp);
            delete res.stats.build_ms; // Ignore timing
            return JSON.stringify(res);
        };

        const ref = executeWithoutStats(input);
        for (let i = 0; i < 100; i++) {
            const res = executeWithoutStats(input);
            assert(res === ref, `Determinism failed on run ${i}`);
        }
    },

    // --- New Tightening Patch Tests (6) ---

    'New Test 1: Forbidden Field Rejection': () => {
        const input = createMockInput();
        input.forbidden_field = 'I should not be here';
        const result = execute(input);
        assert(result.ok === false, 'Should fail on forbidden field');
        assert(result.error === 'INVALID_FIELD', 'Should return INVALID_FIELD error');
        assert(result.field === 'forbidden_field', 'Should identify offending field');
    },

    'New Test 2: Invalid Dimension Values': () => {
        const input = createMockInput();
        input.nodes[0].metrics = null; // Should fallback to [0,0,0]
        const result = execute(input);
        assert(result.ok === true, 'Should handle missing metrics gracefully');
        const v1Cluster = result.pattern_clusters.venue_patterns.clusters.find(c => c.members.includes('v1'));
        assert(v1Cluster, 'Should still cluster node with missing metrics');
    },

    'New Test 3: Null memory_graph.metadata': () => {
        const input = createMockInput();
        input.metadata = null; // Should be allowed if optional, or handled gracefully
        // The engine doesn't explicitly check metadata existence, just passes it through or ignores.
        // Let's ensure it doesn't crash.
        const result = execute(input);
        assert(result.ok === true, 'Should handle null metadata');
    },

    'New Test 4: Deterministic Dimension Resolver': () => {
        const node = { metrics: { roas: 2, spend: 100, stability_score: 0.5 } };
        const dims1 = _internal.resolvePatternDimensions(node, 'VENUE');
        const dims2 = _internal.resolvePatternDimensions(node, 'VENUE');
        assert(JSON.stringify(dims1) === JSON.stringify(dims2), 'Resolver should be deterministic');
        assert(dims1.length === 3, 'Should return 3 dimensions');
    },

    'New Test 5: Semantic-Neutral Labeling Stability': () => {
        const input = createMockInput();
        const result = execute(input);
        const labels = result.pattern_clusters.venue_patterns.labels;
        labels.forEach(label => {
            assert(label.startsWith('cluster_'), `Label ${label} should be neutral`);
        });
    },

    'New Test 6: Temporal Pattern Extraction': () => {
        const input = createMockInput();
        input.memory_graph.edges = [
            { properties: { timestamp: '2023-01-01T10:00:00Z' } },
            { properties: { timestamp: '2023-01-01T11:00:00Z' } },
            { properties: { timestamp: '2023-01-01T12:00:00Z' } }
        ];
        const result = execute(input);
        const intervals = result.pattern_clusters.temporal_patterns.intervals;
        assert(intervals.length > 0, 'Should detect intervals');
        assert(intervals[0].mean_delta_ms === 3600000, 'Should detect 1 hour intervals');
    },

    // --- Final Alignment Tests (2) ---

    'New Test A: Spec-Required dimension_resolver field exists': () => {
        const input = createMockInput();
        const result = execute(input);
        assert(result.pattern_clusters.venue_patterns.dimension_resolver === 'DEFAULT_V1', 'Venue dimension resolver mismatch');
        assert(result.pattern_clusters.creative_patterns.dimension_resolver === 'DEFAULT_V1', 'Creative dimension resolver mismatch');
    },

    'New Test B: memory_graph.edges ignored when nodes/edges provided': () => {
        const input = createMockInput();
        // Top-level nodes (Authoritative)
        input.nodes = [
            { id: 'v1', type: 'VENUE', metrics: { roas: 2.5, spend: 5000, stability_score: 0.9 } },
            { id: 'v2', type: 'VENUE', metrics: { roas: 0.5, spend: 100, stability_score: 0.2 } }
        ];
        // memory_graph.edges (Supplemental/Ignored for clustering)
        // We put timestamps here to verify temporal patterns still work, but clustering shouldn't break
        input.memory_graph.edges = [
            { properties: { timestamp: '2023-01-01T10:00:00Z' } },
            { properties: { timestamp: '2023-01-01T11:00:00Z' } }
        ];

        const result = execute(input);

        // 1. Clustering should work based on top-level nodes
        assert(result.pattern_clusters.venue_patterns.clusters.length > 0, 'Clustering should succeed');
        const v1Cluster = result.pattern_clusters.venue_patterns.clusters.find(c => c.members.includes('v1'));
        assert(v1Cluster, 'v1 should be clustered');

        // 2. Temporal patterns should still be extracted from memory_graph
        assert(result.pattern_clusters.temporal_patterns.intervals.length > 0, 'Temporal patterns should be extracted');
    }
};

// --- Runner ---

async function runTests() {
    // Enable Feature Flag for tests
    process.env.FF_PATTERN_DETECTION_ENGINE = 'true';

    let passed = 0;
    let total = 0;

    console.log('Running Phase 36B Tests...');

    for (const [name, testFn] of Object.entries(tests)) {
        total++;
        try {
            testFn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (e) {
            console.error(`✗ ${name}`);
            console.error(`  ${e.message}`);
        }
    }

    console.log(`\nResult: ${passed}/${total} passed`);

    if (passed !== total) {
        process.exit(1);
    }
}

runTests();
