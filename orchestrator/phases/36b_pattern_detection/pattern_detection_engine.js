/**
 * Phase 36B: Pattern Detection Engine
 *
 * Transforms Memory Graph (Phase 35B) into deterministic pattern signatures.
 * Pure logic, no IO, replay-safe.
 *
 * Contract: pattern_detection_engine_v1
 * Feature Flag: FF_PATTERN_DETECTION_ENGINE
 */

const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const { metrics } = require('../../shared/metrics');
const tracing = require('../../shared/tracing');

// --- Constants ---
const FEATURE_FLAG = 'FF_PATTERN_DETECTION_ENGINE';
const CLUSTER_K = 3; // Default number of clusters for simple segmentation
const MAX_ITERATIONS = 10; // Max K-means iterations for determinism safety

const ALLOWED_INPUT_FIELDS = [
    'memory_graph',
    'nodes',
    'edges',
    'metadata',
    'execution_snapshot',
    'drift_events',
    'health_events',
    'optimizer_results',
    'creative_scores',
    'policy_outputs'
];

// --- Helper Functions ---

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const cloned = {};
    for (const key of Object.keys(obj)) {
        cloned[key] = deepClone(obj[key]);
    }
    return cloned;
}

function sortByKey(array, key) {
    return array.sort((a, b) => {
        if (a[key] < b[key]) return -1;
        if (a[key] > b[key]) return 1;
        return 0;
    });
}

function getEuclideanDistance(a, b) {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

// Deterministic Dimension Resolver
function resolvePatternDimensions(node, type) {
    // Fallback default
    const defaultDims = [0, 0, 0];

    if (!node || !node.metrics) return defaultDims;

    if (type === 'VENUE') {
        // Deterministic mapping: [metric_a, metric_b, metric_c]
        // Using neutral keys if possible, or standardized metric names
        return [
            node.metrics.roas || 0,
            node.metrics.spend || 0,
            node.metrics.stability_score || 0
        ];
    } else if (type === 'CREATIVE') {
        return [
            node.scores?.visual_score || 0,
            node.scores?.copy_score || 0,
            node.metrics?.conversion_rate || 0
        ];
    }

    return defaultDims;
}

// Deterministic K-Means Clustering
function clusterData(items, dimensionsExtractor, k = CLUSTER_K) {
    if (!items || items.length === 0) {
        return { clusters: [], centroids: [], labels: [], label_resolver: 'NEUTRAL_LABELS_V1', dimension_resolver: 'DEFAULT_V1' };
    }

    // 1. Prepare vectors
    const vectors = items.map(item => ({
        id: item.id,
        vector: dimensionsExtractor(item)
    }));

    // 2. Deterministic Initialization: Sort by ID and take first K as initial centroids
    vectors.sort((a, b) => a.id.localeCompare(b.id));

    // Handle edge case where items < k
    const effectiveK = Math.min(k, vectors.length);
    let centroids = vectors.slice(0, effectiveK).map(v => [...v.vector]);
    let assignments = new Array(vectors.length).fill(-1);

    // 3. Iteration
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let changed = false;
        const newClusterSums = Array(effectiveK).fill(0).map(() => Array(centroids[0].length).fill(0));
        const newClusterCounts = Array(effectiveK).fill(0);

        // Assign points to nearest centroid
        for (let i = 0; i < vectors.length; i++) {
            let minDist = Infinity;
            let clusterIdx = -1;

            for (let c = 0; c < effectiveK; c++) {
                const dist = getEuclideanDistance(vectors[i].vector, centroids[c]);
                if (dist < minDist) {
                    minDist = dist;
                    clusterIdx = c;
                }
            }

            if (assignments[i] !== clusterIdx) {
                assignments[i] = clusterIdx;
                changed = true;
            }

            // Accumulate for centroid update
            for (let d = 0; d < vectors[i].vector.length; d++) {
                newClusterSums[clusterIdx][d] += vectors[i].vector[d];
            }
            newClusterCounts[clusterIdx]++;
        }

        // Update centroids
        if (changed) {
            for (let c = 0; c < effectiveK; c++) {
                if (newClusterCounts[c] > 0) {
                    centroids[c] = newClusterSums[c].map(sum => sum / newClusterCounts[c]);
                }
            }
        } else {
            break; // Converged
        }
    }

    // 4. Format Output with Neutral Labels
    const clusters = Array(effectiveK).fill(null).map((_, i) => ({
        id: `cluster_${i}`,
        label: `cluster_${i}`, // Neutral label
        members: [],
        centroid: centroids[i]
    }));

    for (let i = 0; i < vectors.length; i++) {
        clusters[assignments[i]].members.push(vectors[i].id);
    }

    // Sort members for determinism
    clusters.forEach(c => c.members.sort());

    return {
        clusters,
        centroids,
        labels: clusters.map(c => c.label),
        label_resolver: 'NEUTRAL_LABELS_V1',
        dimension_resolver: 'DEFAULT_V1'
    };
}

// --- Pattern Detection Logic ---

function detectVenuePatterns(nodes, edges) {
    // Defensive Guard: We do NOT use edges for clustering in v1 if nodes are provided.
    // The dimensions are extracted purely from node metrics.
    // This function signature accepts edges to match the contract, but they are intentionally ignored
    // to prevent split-brain logic with memory_graph.edges.
    const venueNodes = nodes.filter(n => n.type === 'VENUE');
    return clusterData(venueNodes, (node) => resolvePatternDimensions(node, 'VENUE'));
}

function detectCreativePatterns(nodes, creativeScores) {
    const creativeNodes = nodes.filter(n => n.type === 'CREATIVE');

    // Join with scores
    const enrichedCreatives = creativeNodes.map(node => {
        const score = creativeScores[node.id] || {};
        return { ...node, scores: score };
    });

    return clusterData(enrichedCreatives, (node) => resolvePatternDimensions(node, 'CREATIVE'));
}

function detectFailurePatterns(driftEvents, healthEvents) {
    const signatures = [];

    // 1. Repeated Drift
    const driftCounts = {};
    driftEvents.forEach(event => {
        const key = `${event.connector_id}:${event.drift_type}`;
        driftCounts[key] = (driftCounts[key] || 0) + 1;
    });

    Object.entries(driftCounts).forEach(([key, count]) => {
        if (count >= 3) {
            const [connector, type] = key.split(':');
            signatures.push({
                id: `fp_drift_${crypto.createHash('md5').update(key).digest('hex').substring(0, 8)}`,
                type: 'REPEATED_DRIFT',
                connector,
                details: type,
                frequency: count
            });
        }
    });

    // 2. Health Instability
    const healthCounts = {};
    healthEvents.forEach(event => {
        if (event.status === 'UNHEALTHY' || event.status === 'DEGRADED') {
            healthCounts[event.connector_id] = (healthCounts[event.connector_id] || 0) + 1;
        }
    });

    Object.entries(healthCounts).forEach(([connector, count]) => {
        if (count >= 3) {
            signatures.push({
                id: `fp_health_${crypto.createHash('md5').update(connector).digest('hex').substring(0, 8)}`,
                type: 'HEALTH_INSTABILITY',
                connector,
                frequency: count
            });
        }
    });

    // Sort signatures for determinism
    signatures.sort((a, b) => a.id.localeCompare(b.id));

    return { signatures, frequencies: signatures.map(s => s.frequency) };
}

function extractTemporalPatterns(memoryGraph) {
    // Minimal deterministic temporal extraction
    // Looks for 'timestamp' in edge properties
    const intervals = [];
    const timestamps = [];

    if (memoryGraph && Array.isArray(memoryGraph.edges)) {
        memoryGraph.edges.forEach(edge => {
            if (edge.properties && edge.properties.timestamp) {
                timestamps.push(new Date(edge.properties.timestamp).getTime());
            }
        });
    }

    timestamps.sort((a, b) => a - b);

    if (timestamps.length > 1) {
        let minDelta = Infinity;
        let maxDelta = 0;
        let totalDelta = 0;

        for (let i = 1; i < timestamps.length; i++) {
            const delta = timestamps[i] - timestamps[i - 1];
            if (delta < minDelta) minDelta = delta;
            if (delta > maxDelta) maxDelta = delta;
            totalDelta += delta;
        }

        intervals.push({
            type: 'INTERVAL_STATS',
            min_delta_ms: minDelta,
            max_delta_ms: maxDelta,
            mean_delta_ms: totalDelta / (timestamps.length - 1),
            count: timestamps.length
        });
    }

    return {
        seasonality: [], // Placeholder for future expansion
        intervals
    };
}

function generateExplanations(venuePatterns, failurePatterns) {
    const explanations = [];

    venuePatterns.clusters.forEach(c => {
        if (c.members.length > 0) {
            explanations.push(`Identified ${c.label} with ${c.members.length} venues.`);
        }
    });

    failurePatterns.signatures.forEach(s => {
        explanations.push(`Detected ${s.type} on ${s.connector} (${s.frequency} occurrences).`);
    });

    return explanations.sort();
}

function calculateStats(nodes, edges, venuePatterns) {
    return {
        node_count: nodes.length,
        edge_count: edges.length,
        cluster_count: venuePatterns.clusters.length,
        build_ms: 0
    };
}

// --- Main Execute Function ---

function execute(input) {
    const startTime = Date.now();
    const span = tracing.startSpan('phase_36b_pattern_detection');
    const executionId = input?.execution_snapshot?.execution_id || 'unknown';

    try {
        // 1. Feature Flag Check
        if (process.env[FEATURE_FLAG] !== 'true') {
            return {
                ok: false,
                status: 'FEATURE_DISABLED',
                pattern_clusters: {
                    venue_patterns: { clusters: [], centroids: [], labels: [], label_resolver: 'NEUTRAL_LABELS_V1', dimension_resolver: 'DEFAULT_V1' },
                    creative_patterns: { clusters: [], centroids: [], labels: [], label_resolver: 'NEUTRAL_LABELS_V1', dimension_resolver: 'DEFAULT_V1' },
                    failure_patterns: { signatures: [], frequencies: [] },
                    temporal_patterns: { seasonality: [], intervals: [] }
                },
                pattern_vectors: { venue_vector: [], creative_vector: [] },
                explanations: [],
                stats: { node_count: 0, edge_count: 0, cluster_count: 0, build_ms: 0 },
                warnings: [],
                stop_reason: 'FEATURE_FLAG_OFF'
            };
        }

        // 2. Strict Input Validation
        if (!input || typeof input !== 'object') {
            return { ok: false, error: 'INVALID_INPUT', message: 'Input must be an object' };
        }

        // Check for forbidden fields
        const inputKeys = Object.keys(input);
        for (const key of inputKeys) {
            if (!ALLOWED_INPUT_FIELDS.includes(key)) {
                return {
                    ok: false,
                    error: 'INVALID_FIELD',
                    field: key
                };
            }
        }

        if (!input.memory_graph || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
            return {
                ok: false,
                error: 'INVALID_INPUT',
                message: 'Missing required memory_graph, nodes (array), or edges (array)'
            };
        }

        const safeInput = deepClone(input);
        const nodes = safeInput.nodes;
        const edges = safeInput.edges;
        const drift_events = safeInput.drift_events || [];
        const health_events = safeInput.health_events || [];
        const creative_scores = safeInput.creative_scores || {};

        // 3. Pattern Detection
        const venuePatterns = detectVenuePatterns(nodes, edges);
        const creativePatterns = detectCreativePatterns(nodes, creative_scores);
        const failurePatterns = detectFailurePatterns(drift_events, health_events);
        const temporalPatterns = extractTemporalPatterns(safeInput.memory_graph);

        // 4. Vector Construction
        const patternVectors = {
            venue_vector: venuePatterns.centroids.flat(),
            creative_vector: creativePatterns.centroids.flat()
        };

        // 5. Explanations & Stats
        const explanations = generateExplanations(venuePatterns, failurePatterns);
        const stats = calculateStats(nodes, edges, venuePatterns);
        stats.build_ms = Date.now() - startTime;

        // Observability
        metrics.count('pattern_detection_clusters_total', venuePatterns.clusters.length + creativePatterns.clusters.length);
        metrics.count('pattern_detection_failure_signatures', failurePatterns.signatures.length);
        logStructured('pattern_detection_engine_event_v1', {
            execution_id: executionId,
            cluster_count: stats.cluster_count,
            failure_count: failurePatterns.signatures.length
        });

        // 6. Construct Output
        return {
            ok: true,
            pattern_clusters: {
                venue_patterns: venuePatterns,
                creative_patterns: creativePatterns,
                failure_patterns: failurePatterns,
                temporal_patterns: temporalPatterns
            },
            pattern_vectors: patternVectors,
            explanations,
            stats,
            warnings: []
        };

    } finally {
        span.end();
    }
}

module.exports = {
    execute,
    _internal: {
        clusterData,
        detectVenuePatterns,
        detectFailurePatterns,
        resolvePatternDimensions,
        extractTemporalPatterns
    }
};
