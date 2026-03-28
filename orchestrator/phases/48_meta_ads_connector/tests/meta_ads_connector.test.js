/**
 * Phase 48: Meta Ads Connector Logic Layer - Test Suite
 * Exactly 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const assert = require('assert');
const { execute } = require('../meta_ads_connector_engine');

const tests = [];

function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

function test(name, fn) {
    tests.push({ name, fn });
}

function expect(actual) {
    return {
        toBe: (expected) => assert.strictEqual(actual, expected),
        toEqual: (expected) => assert.deepStrictEqual(actual, expected),
        toBeTruthy: () => assert.ok(actual),
        toBeFalsy: () => assert.ok(!actual),
        toContain: (substring) => assert.ok(actual.includes(substring))
    };
}

// Helper to create valid request
function createValidRequest() {
    return {
        campaign: {
            name: 'Test Campaign',
            status: 'ACTIVE',
            special_ad_categories: ['NONE']
        },
        adsets: [
            {
                name: 'Test AdSet',
                optimization_goal: 'LINK_CLICKS',
                billing_event: 'LINK_CLICKS',
                daily_budget: 5000,
                targeting: {
                    geo: { countries: ['US'] },
                    age_min: 18,
                    age_max: 65
                },
                placements: ['facebook', 'instagram']
            }
        ],
        creatives: [
            {
                name: 'Test Creative',
                type: 'SINGLE_IMAGE',
                body: 'Ad body text',
                headline: 'Ad headline',
                media_url: 'https://example.com/image.jpg'
            }
        ],
        targeting: {
            geo: { countries: ['US'] },
            age_min: 18,
            age_max: 65
        },
        special_ad_categories: ['NONE'],
        objective: 'CONVERSIONS',
        optimization_goal: 'LINK_CLICKS',
        billing_event: 'LINK_CLICKS',
        placement_bundle: 'AUTOMATIC',
        budget: 10000,
        currency: 'USD',
        brand_metadata: {
            brand_id: 'brand-123',
            workspace_id: 'ws-456'
        }
    };
}

function createValidContext(overrides = {}) {
    return {
        execution_id: 'exec-test-123',
        mode: 'LIVE',
        iteration_index: 0,
        ...overrides
    };
}

describe('Phase 48: Meta Ads Connector Logic Layer', () => {
    // Enable feature flag for tests
    process.env.FF_META_ADS_CONNECTOR = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Valid single adset campaign', () => {
        const request = createValidRequest();
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.connector_key).toBe('meta_ads');
        expect(result.connector_input.mode).toBe('LIVE');
        expect(result.connector_input.execution_id).toBe('exec-test-123');
        expect(result.connector_input.meta.input_contract_version).toBe('Phase47ConnectorInputV1');
        expect(result.connector_input.request.raw_request.campaign.name).toBe('Test Campaign');
        expect(result.connector_input.request.raw_request.campaign.objective).toBe('OUTCOME_TRAFFIC');
    });

    test('Happy 2: Multiple adsets', () => {
        const request = createValidRequest();
        request.adsets.push({
            name: 'Second AdSet',
            optimization_goal: 'IMPRESSIONS',
            billing_event: 'IMPRESSIONS',
            lifetime_budget: 20000,
            targeting: {
                geo: { countries: ['CA'] },
                age_min: 25,
                age_max: 45
            },
            placements: ['facebook']
        });

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.adsets.length).toBe(2);
        expect(result.connector_input.request.raw_request.adsets[1].optimization_goal).toBe('IMPRESSIONS');
    });

    test('Happy 3: Placement bundle translation', () => {
        const request = createValidRequest();
        request.placement_bundle = 'FACEBOOK_ONLY';
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.placements.publisher_platforms).toEqual(['facebook']);
        expect(result.connector_input.request.raw_request.placements.instagram_positions).toEqual([]);
    });

    test('Happy 4: Complex targeting with interests and behaviors', () => {
        const request = createValidRequest();
        request.targeting.interests = ['sports', 'technology'];
        request.targeting.behaviors = ['frequent_travelers'];
        request.targeting.genders = [1, 2];
        request.adsets[0].targeting.interests = ['sports', 'technology'];
        request.adsets[0].targeting.behaviors = ['frequent_travelers'];
        request.adsets[0].targeting.genders = [1, 2];

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        const targeting = result.connector_input.request.raw_request.adsets[0].targeting;
        expect(targeting.interests).toEqual(['sports', 'technology']);
        expect(targeting.behaviors).toEqual(['frequent_travelers']);
    });

    test('Happy 5: Special ad categories sorting', () => {
        const request = createValidRequest();
        request.special_ad_categories = ['CREDIT', 'EMPLOYMENT', 'HOUSING'];
        request.campaign.special_ad_categories = ['CREDIT', 'EMPLOYMENT', 'HOUSING'];

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.campaign.special_ad_categories).toEqual(['CREDIT', 'EMPLOYMENT', 'HOUSING']);
    });

    test('Happy 6: Valid creative set with all fields', () => {
        const request = createValidRequest();
        request.creatives = [
            {
                name: 'Video Creative',
                type: 'SINGLE_VIDEO',
                body: 'Video ad body',
                headline: 'Video headline',
                media_url: 'https://example.com/video.mp4'
            },
            {
                name: 'Carousel Creative',
                type: 'CAROUSEL',
                body: 'Carousel body',
                headline: 'Carousel headline',
                media_url: 'https://example.com/carousel.jpg'
            }
        ];

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.creatives.length).toBe(2);
        expect(result.connector_input.request.raw_request.creatives[0].meta_creative_type).toBe('SINGLE_VIDEO');
        expect(result.connector_input.request.raw_request.creatives[1].meta_creative_type).toBe('CAROUSEL');
    });

    test('Happy 7: Special ad category "NONE" maps to empty array in raw_request', () => {
        const request = createValidRequest();
        request.special_ad_categories = ['NONE'];
        request.campaign.special_ad_categories = ['NONE'];

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);

        // raw_request must have []
        expect(result.connector_input.request.raw_request.campaign.special_ad_categories)
            .toEqual([]);

        // normalized_request must retain ["NONE"]
        expect(result.connector_input.request.normalized_request.special_ad_categories)
            .toEqual(['NONE']);
    });

    // --- Negative Path Tests (6) ---

    test('Negative 1: Missing campaign', () => {
        const request = createValidRequest();
        delete request.campaign;
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('Missing required field: campaign');
    });

    test('Negative 2: Missing adsets', () => {
        const request = createValidRequest();
        delete request.adsets;
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('Missing required field: adsets');
    });

    test('Negative 3: Invalid objective', () => {
        const request = createValidRequest();
        request.objective = 'INVALID_OBJECTIVE';
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('Invalid objective');
    });

    test('Negative 4: Missing age_min in targeting', () => {
        const request = createValidRequest();
        delete request.targeting.age_min;
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('age_min is required');
    });

    test('Negative 5: Disallowed targeting field', () => {
        const request = createValidRequest();
        request.targeting.custom_audiences = ['audience-123'];
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('custom_audiences is not allowed');
    });

    test('Negative 6: Missing creative media_url', () => {
        const request = createValidRequest();
        delete request.creatives[0].media_url;
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('media_url is required');
    });

    test('Negative 7: Disallowed targeting field inside adset targeting', () => {
        const request = createValidRequest();
        request.adsets[0].targeting.custom_audiences = ['aud-1'];

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('targeting.custom_audiences is not allowed');
    });

    test('Negative 8: Invalid placement_bundle', () => {
        const request = createValidRequest();
        request.placement_bundle = 'UNKNOWN_BUNDLE';

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('META_VALIDATION_ERROR');
        expect(result.message).toContain('Invalid placement_bundle');
    });

    // --- Edge Case Tests (4) ---

    test('Edge 1: Large adset array (100+ adsets)', () => {
        const request = createValidRequest();
        for (let i = 1; i < 100; i++) {
            request.adsets.push({
                name: `AdSet ${i}`,
                optimization_goal: 'LINK_CLICKS',
                billing_event: 'LINK_CLICKS',
                daily_budget: 1000 + i,
                targeting: {
                    geo: { countries: ['US'] },
                    age_min: 18,
                    age_max: 65
                },
                placements: ['facebook', 'instagram']
            });
        }

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.adsets.length).toBe(100);
    });

    test('Edge 2: Large targeting arrays', () => {
        const request = createValidRequest();
        const largeInterests = [];
        for (let i = 0; i < 50; i++) {
            largeInterests.push(`interest-${i}`);
        }
        request.targeting.interests = largeInterests;
        request.adsets[0].targeting.interests = largeInterests;

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.adsets[0].targeting.interests.length).toBe(50);
    });

    test('Edge 3: Multiple placement combinations', () => {
        const request = createValidRequest();
        request.placement_bundle = 'MOBILE_FEED';
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input.request.raw_request.placements.publisher_platforms).toEqual(['facebook', 'instagram']);
        expect(result.connector_input.request.raw_request.placements.facebook_positions).toEqual(['feed']);
        expect(result.connector_input.request.raw_request.placements.instagram_positions).toEqual(['stream']);
    });

    test('Edge 4: Empty interests and behaviors arrays', () => {
        const request = createValidRequest();
        request.targeting.interests = [];
        request.targeting.behaviors = [];
        request.adsets[0].targeting.interests = [];
        request.adsets[0].targeting.behaviors = [];

        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);
        const targeting = result.connector_input.request.raw_request.adsets[0].targeting;
        expect(targeting.interests).toEqual([]);
        expect(targeting.behaviors).toEqual([]);
    });

    // --- Regression Guard (1) ---

    test('Regression: Golden snapshot for standard campaign', () => {
        const request = createValidRequest();
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(true);

        // Verify exact structure
        const connectorInput = result.connector_input;
        expect(connectorInput.connector_key).toBe('meta_ads');
        expect(connectorInput.mode).toBe('LIVE');
        expect(connectorInput.meta.input_contract_version).toBe('Phase47ConnectorInputV1');

        // Verify raw_request structure
        const raw = connectorInput.request.raw_request;
        expect(raw.campaign.name).toBe('Test Campaign');
        expect(raw.campaign.objective).toBe('OUTCOME_TRAFFIC');
        expect(raw.campaign.status).toBe('ACTIVE');
        expect(raw.adsets.length).toBe(1);
        expect(raw.creatives.length).toBe(1);

        // Verify normalized_request structure
        const normalized = connectorInput.request.normalized_request;
        expect(normalized.campaign.name).toBe('Test Campaign');
        expect(normalized.objective).toBe('CONVERSIONS');
        expect(normalized.budget).toBe(10000);
        expect(normalized.currency).toBe('USD');
    });

    // --- Determinism Guard (1) ---

    test('Determinism: Identical inputs produce byte-identical outputs', () => {
        const request1 = createValidRequest();
        const request2 = createValidRequest();
        const context1 = createValidContext();
        const context2 = createValidContext();

        const result1 = execute(request1, context1);
        const result2 = execute(request2, context2);

        const json1 = JSON.stringify(result1);
        const json2 = JSON.stringify(result2);

        expect(json1).toBe(json2);
    });

    // --- Additional Tests ---

    test('Feature flag disabled returns error', () => {
        process.env.FF_META_ADS_CONNECTOR = 'false';
        const request = createValidRequest();
        const context = createValidContext();
        const result = execute(request, context);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('FEATURE_DISABLED');
        expect(result.message).toBe('Meta Ads Connector disabled');

        process.env.FF_META_ADS_CONNECTOR = 'true';
    });

    test('REPLAY mode passthrough', () => {
        const mockConnectorInput = {
            mode: 'REPLAY',
            connector_key: 'meta_ads',
            execution_id: 'exec-replay-123',
            iteration_index: 5,
            request: {
                raw_request: { test: 'data' },
                normalized_request: { test: 'normalized' }
            },
            meta: { input_contract_version: 'Phase47ConnectorInputV1' }
        };

        const context = {
            execution_id: 'exec-replay-123',
            mode: 'REPLAY',
            connector_input: mockConnectorInput
        };

        const result = execute({}, context);

        expect(result.ok).toBe(true);
        expect(result.connector_input).toEqual(mockConnectorInput);
    });
});

// Run all tests
(async () => {
    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
            passed++;
        } catch (e) {
            console.error(`  ✗ ${t.name}`);
            console.error(`    ${e.message}`);
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
})();
