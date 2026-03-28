/**
 * Real Metrics Implementation
 * Replaces placeholder with actual metrics collection.
 * Uses Prometheus-style metrics that can be exported.
 */

// In-memory metrics store (can be replaced with Prometheus client in production)
const metricsStore = {
    counters: new Map(),
    histograms: new Map(),
    gauges: new Map()
};

// Thread-safe increment (simple implementation for Node.js)
function incrementCounter(name, value = 1, labels = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    const current = metricsStore.counters.get(key) || 0;
    metricsStore.counters.set(key, current + value);
    
    // Log for observability (can be replaced with actual metrics backend)
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[METRIC] counter:${name} = ${current + value}`, labels);
    }
}

function observeHistogram(name, value, labels = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    const values = metricsStore.histograms.get(key) || [];
    values.push(value);
    metricsStore.histograms.set(key, values);
    
    // Log for observability
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[METRIC] histogram:${name} = ${value}`, labels);
    }
}

function setGauge(name, value, labels = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    metricsStore.gauges.set(key, value);
    
    // Log for observability
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[METRIC] gauge:${name} = ${value}`, labels);
    }
}

function getMetrics() {
    return {
        counters: Object.fromEntries(metricsStore.counters),
        histograms: Object.fromEntries(metricsStore.histograms),
        gauges: Object.fromEntries(metricsStore.gauges)
    };
}

function resetMetrics() {
    metricsStore.counters.clear();
    metricsStore.histograms.clear();
    metricsStore.gauges.clear();
}

module.exports = {
    metrics: {
        count: incrementCounter,
        histogram: observeHistogram,
        gauge: setGauge,
        increment: incrementCounter,
        // Alias for compatibility
        observe: observeHistogram
    },
    // Expose additional functions
    getMetrics,
    resetMetrics
};
