
const assert = require('assert');
const { describe, test, before } = require('node:test');
const path = require('path');

// Mock Environment Flags
process.env.FF_OS_CONNECTOR_REGISTRY = 'true';
process.env.FF_GOOGLE_ADS_CONNECTOR_IO = 'true';
process.env.FF_META_ADS_CONNECTOR = 'true';
process.env.FF_TIKTOK_ADS_CONNECTOR_ENGINE = 'true';

// Mock Dependencies via require.cache
// We must do this BEFORE requiring the registry module
const metricsPath = path.resolve(__dirname, '../../orchestrator/shared/metrics.js');
const tracingPath = path.resolve(__dirname, '../../orchestrator/shared/tracing.js');

// Mock Metrics: Provide a flat object with .count()
require.cache[metricsPath] = {
    id: metricsPath,
    filename: metricsPath,
    loaded: true,
    exports: {
        count: () => { },
        histogram: () => { }
    }
};

// Mock Tracing: Provide startSpan -> { end(), setAttribute() }
require.cache[tracingPath] = {
    id: tracingPath,
    filename: tracingPath,
    loaded: true,
    exports: {
        startSpan: () => ({
            end: () => { },
            setAttribute: () => { }
        })
    }
};

const connectorRegistry = require('../../kaivo_os/os_65_connector_registry/os_65_connector_registry');

const validGoogle = {
    connector_id: "google_ads",
    version: "1.0.0",
    lifecycle_status: "ACTIVE",
    description: "Google Ads Connector",
    capabilities: { search: true },
    constraints: { rate_limit: 100 },
    metadata: { owner: "Google Team" },
    backplane_contract_version: "1.0",
    os_registry_contract: "1.0",
    intent_name: "google_ads_connector",
    supported_environments: ["staging", "production"],
    owner: "Google",
    backplane_fields: {},
    io_schema: {},
    routing: {},
    safety_profile: {},
    knowledge_sources: {}
};

const validMeta = {
    connector_id: "meta_ads",
    version: "1.0.0",
    lifecycle_status: "ACTIVE",
    description: "Meta Ads Connector",
    capabilities: { social: true },
    constraints: { rate_limit: 200 },
    metadata: { owner: "Meta Team" },
    backplane_contract_version: "1.0",
    os_registry_contract: "1.0",
    intent_name: "meta_ads_connector",
    supported_environments: ["staging", "production"],
    owner: "Meta",
    backplane_fields: {},
    io_schema: {},
    routing: {},
    safety_profile: {},
    knowledge_sources: {}
};

const validTikTok = {
    connector_id: "tiktok_ads",
    version: "1.0.0",
    lifecycle_status: "ACTIVE",
    description: "TikTok Ads Connector",
    capabilities: { video: true },
    constraints: { rate_limit: 300 },
    metadata: { owner: "TikTok Team" },
    backplane_contract_version: "1.0",
    os_registry_contract: "1.0",
    intent_name: "tiktok_ads_connector",
    supported_environments: ["staging", "production"],
    owner: "TikTok",
    backplane_fields: {},
    io_schema: {},
    routing: {},
    safety_profile: {},
    knowledge_sources: {}
};

describe('OS-65 Multi-Connector Staging Smoke Test', () => {

    test('Registry processes Google, Meta, and TikTok definitions correctly', () => {
        const input = {
            execution_id: "e2e-smoke-test-01",
            phase: "OS-65",
            feature_flags: {
                FF_OS_CONNECTOR_REGISTRY: true
            },
            tenant_context: { tenant_id: "staging-tenant" },
            connector_definitions: {
                google_ads: validGoogle,
                meta_ads: validMeta,
                tiktok_ads: validTikTok
            }
        };

        const output = connectorRegistry.execute(input);

        // Check for Errors
        if (output.status === 'ERROR') {
            console.error("Registry Errors:", JSON.stringify(output.errors, null, 2));
        }

        assert.strictEqual(output.status, "OK", "Registry execution failed");

        const registry = output.registry.connectors;
        assert.strictEqual(registry.length, 3, `Expected 3 registered connectors, got ${registry.length}`);

        const ids = registry.map(c => c.connector_id).sort();
        assert.deepStrictEqual(ids, ['google_ads', 'meta_ads', 'tiktok_ads'], "Registry must contain all 3 connectors");

        console.log('✅ Google Connector: REGISTERED');
        console.log('✅ Meta Connector: REGISTERED');
        console.log('✅ TikTok Connector: REGISTERED');
    });

    test('Registry adheres to Staging Flags (No-Op if disabled)', () => {
        const input = {
            execution_id: "e2e-smoke-test-02",
            phase: "OS-65",
            feature_flags: {
                FF_OS_CONNECTOR_REGISTRY: false
            },
            tenant_context: {},
            connector_definitions: { google_ads: validGoogle }
        };

        const output = connectorRegistry.execute(input);
        assert.strictEqual(output.status, "NO_OP", "Should return NO_OP when flag is disabled");
    });
});
