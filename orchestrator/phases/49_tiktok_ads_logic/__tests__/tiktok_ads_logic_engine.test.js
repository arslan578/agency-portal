/**
 * Phase 49: TikTok Ads Connector Logic Layer - Test Suite
 * Exactly 18 tests: 6 happy, 6 negative, 4 edge, 1 regression, 1 determinism
 */

const assert = require('assert');
const { executeTikTokLogic } = require('../tiktok_ads_logic_engine');

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
        toContain: (substring) => assert.ok(actual.includes(substring)),
        toBeGreaterThan: (value) => assert.ok(actual > value)
    };
}

// Helper to create valid input
function createValidInput() {
    return {
        execution_id: 'exec-test-123',
        iteration_index: 0,
        mode: 'LIVE',
        tenant: {
            workspace_id: 'ws-123',
            brand_id: 'brand-456'
        },
        request: {
            campaign: {
                name: 'Test Campaign',
                objective: 'CONVERSIONS',
                status: 'ACTIVE'
            },
            adgroups: [
                {
                    name: 'Test AdGroup',
                    status: 'ACTIVE',
                    optimization_goal: 'CONVERSION',
                    billing_event: 'OCPM',
                    budget: {
                        type: 'DAILY',
                        amount: 5000,
                        currency: 'USD'
                    },
                    schedule: {
                        start_time: '2024-01-01T00:00:00Z'
                    },
                    placements: ['AUTOMATIC'],
                    targeting: {
                        geo: {
                            countries: ['US']
                        },
                        age: {
                            min: 18,
                            max: 65
                        },
                        genders: ['MALE', 'FEMALE']
                    },
                    creatives: ['creative-1']
                }
            ],
            creatives: {
                'creative-1': {
                    type: 'VIDEO',
                    name: 'Test Video',
                    primary_text: 'Check this out!',
                    landing_page_url: 'https://example.com',
                    video_asset_id: 'video-123'
                }
            },
            brand: {
                name: 'Test Brand'
            }
        }
    };
}

describe('Phase 49: TikTok Ads Connector Logic Layer', () => {
    // Enable feature flag for tests
    process.env.FF_TIKTOK_ADS_LOGIC_LAYER = 'true';

    // --- Happy Path Tests (6) ---

    test('Happy 1: Single adgroup, single video creative', async () => {
        const input = createValidInput();
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.code).toBe('OK');
        expect(result.connector_key).toBe('tiktok_ads');
        expect(result.request.raw_request.campaign.campaign_name).toBe('Test Campaign');
        expect(result.request.raw_request.adgroups.length).toBe(1);
        expect(result.request.raw_request.ads.length).toBe(1);
        expect(result.meta.input_contract_version).toBe('TikTokLogicInputV1');
        expect(result.meta.output_contract_version).toBe('Phase49ConnectorInputV1');
    });

    test('Happy 2: Multiple adgroups, shared creatives', async () => {
        const input = createValidInput();
        input.request.adgroups.push({
            name: 'Second AdGroup',
            status: 'ACTIVE',
            optimization_goal: 'CLICK',
            billing_event: 'CPC',
            budget: {
                type: 'DAILY',
                amount: 3000,
                currency: 'USD'
            },
            schedule: {
                start_time: '2024-01-01T00:00:00Z'
            },
            placements: ['TIKTOK_ONLY'],
            targeting: {
                geo: {
                    countries: ['CA']
                },
                age: {
                    min: 21,
                    max: 50
                }
            },
            creatives: ['creative-1']
        });

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.request.raw_request.adgroups.length).toBe(2);
        expect(result.request.raw_request.ads.length).toBe(2);
        // Verify sorting by name
        expect(result.request.raw_request.adgroups[0].adgroup_name).toBe('Second AdGroup');
        expect(result.request.raw_request.adgroups[1].adgroup_name).toBe('Test AdGroup');
    });

    test('Happy 3: Daily budget with day budget mode', async () => {
        const input = createValidInput();
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.request.raw_request.adgroups[0].budget_mode).toBe('BUDGET_MODE_DAY');
        expect(result.request.raw_request.adgroups[0].budget).toBe(5000);
    });

    test('Happy 4: Lifetime budget with total budget mode', async () => {
        const input = createValidInput();
        input.request.adgroups[0].budget.type = 'LIFETIME';
        input.request.adgroups[0].budget.amount = 100000;
        input.request.adgroups[0].schedule.end_time = '2024-12-31T23:59:59Z';

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.request.raw_request.adgroups[0].budget_mode).toBe('BUDGET_MODE_TOTAL');
        expect(result.request.raw_request.adgroups[0].budget).toBe(100000);
        expect(result.request.raw_request.adgroups[0].schedule_end_time).toBe('2024-12-31T23:59:59Z');
    });

    test('Happy 5: Targeting with geo, age, gender, interests, behaviors', async () => {
        const input = createValidInput();
        input.request.adgroups[0].targeting = {
            geo: {
                countries: ['US', 'CA'],
                regions: ['California', 'Ontario'],
                cities: ['Los Angeles', 'Toronto']
            },
            age: {
                min: 25,
                max: 45
            },
            genders: ['FEMALE'],
            interests: ['sports', 'technology'],
            behaviors: ['online_shoppers'],
            os_types: ['ios', 'android'],
            device_types: ['mobile'],
            languages: ['en', 'fr']
        };

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        const targeting = result.request.raw_request.adgroups[0].targeting;
        expect(targeting.location.country).toEqual(['CA', 'US']);
        expect(targeting.age).toEqual([25, 45]);
        expect(targeting.gender).toBe('GENDER_FEMALE');
        expect(targeting.interest_category).toEqual(['sports', 'technology']);
    });

    test('Happy 6: Replay mode deterministic output', async () => {
        const input = createValidInput();
        input.mode = 'REPLAY';

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.mode).toBe('REPLAY');
        expect(result.code).toBe('OK');
    });

    // --- Negative Path Tests (6) ---

    test('Negative 7: Feature flag disabled', async () => {
        process.env.FF_TIKTOK_ADS_LOGIC_LAYER = 'false';
        const input = createValidInput();
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_LOGIC_FEATURE_DISABLED');
        expect(result.message).toContain('disabled');

        process.env.FF_TIKTOK_ADS_LOGIC_LAYER = 'true';
    });

    test('Negative 8: Missing required campaign objective', async () => {
        const input = createValidInput();
        delete input.request.campaign.objective;
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_VALIDATION_ERROR');
        expect(result.message).toContain('objective');
    });

    test('Negative 9: Unknown mapping for objective', async () => {
        const input = createValidInput();
        input.request.campaign.objective = 'UNKNOWN_OBJECTIVE';
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_UNSUPPORTED_OBJECTIVE');
        expect(result.message).toContain('UNKNOWN_OBJECTIVE');
    });

    test('Negative 10: Unknown mapping for billing event', async () => {
        const input = createValidInput();
        input.request.adgroups[0].billing_event = 'UNKNOWN_BILLING';
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_UNSUPPORTED_BILLING_EVENT');
        expect(result.message).toContain('UNKNOWN_BILLING');

        // Also test unknown field validation
        const input2 = createValidInput();
        input2.request.campaign.unknown_field = 'bad';
        const result2 = await executeTikTokLogic(input2);

        expect(result2.ok).toBe(false);
        expect(result2.code).toBe('TIKTOK_VALIDATION_ERROR');
        expect(result2.message).toContain('unknown_field');
    });

    test('Negative 11: Unknown placement', async () => {
        const input = createValidInput();
        input.request.adgroups[0].placements = ['UNKNOWN_PLACEMENT'];
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_UNSUPPORTED_PLACEMENT');
        expect(result.message).toContain('UNKNOWN_PLACEMENT');
    });

    test('Negative 12: Creative reference missing in creatives map', async () => {
        const input = createValidInput();
        input.request.adgroups[0].creatives = ['creative-999'];
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_VALIDATION_ERROR');
        expect(result.message).toContain('non-existent creative');

        // Also test forbidden TikTok field validation
        const input2 = createValidInput();
        input2.request.adgroups[0].campaign_id = '123';
        const result2 = await executeTikTokLogic(input2);

        expect(result2.ok).toBe(false);
        expect(result2.code).toBe('TIKTOK_VALIDATION_ERROR');
        expect(result2.message).toContain('campaign_id');
    });

    // --- Edge Case Tests (4) ---

    test('Edge 13: Empty optional targeting', async () => {
        const input = createValidInput();
        delete input.request.adgroups[0].targeting;

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.request.raw_request.adgroups[0].targeting).toBe(undefined);
    });

    test('Edge 14: Maximal targeting set', async () => {
        const input = createValidInput();
        const largeArray = [];
        for (let i = 0; i < 50; i++) {
            largeArray.push(`item-${i}`);
        }

        input.request.adgroups[0].targeting = {
            geo: {
                countries: largeArray.slice(0, 20),
                regions: largeArray.slice(0, 15),
                cities: largeArray.slice(0, 10)
            },
            age: {
                min: 18,
                max: 65
            },
            genders: ['MALE', 'FEMALE', 'UNKNOWN'],
            interests: largeArray,
            behaviors: largeArray.slice(0, 25),
            os_types: ['ios', 'android', 'windows'],
            device_types: ['mobile', 'tablet', 'desktop'],
            languages: ['en', 'es', 'fr', 'de', 'it']
        };

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.request.raw_request.adgroups[0].targeting.interest_category.length).toBe(50);
    });

    test('Edge 15: Mixed genders including UNKNOWN', async () => {
        const input = createValidInput();
        input.request.adgroups[0].targeting.genders = ['MALE', 'FEMALE', 'UNKNOWN'];

        const result = await executeTikTokLogic(input);

        // Verify resolveGender produces GENDER_UNLIMITED for mixed genders
        expect(result.ok).toBe(true);
        expect(result.request.raw_request.adgroups[0].targeting.gender).toBe('GENDER_UNLIMITED');
    });

    test('Edge 16: Currency mismatch across adgroups', async () => {
        const input = createValidInput();
        input.request.adgroups.push({
            name: 'Second AdGroup',
            status: 'ACTIVE',
            optimization_goal: 'CLICK',
            billing_event: 'CPC',
            budget: {
                type: 'DAILY',
                amount: 3000,
                currency: 'EUR' // Different currency
            },
            schedule: {
                start_time: '2024-01-01T00:00:00Z'
            },
            placements: ['AUTOMATIC'],
            targeting: {
                geo: { countries: ['DE'] },
                age: { min: 18, max: 65 }
            },
            creatives: ['creative-1']
        });

        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(false);
        expect(result.code).toBe('TIKTOK_VALIDATION_ERROR');
        expect(result.message).toContain('Currency mismatch');
    });

    // --- Regression Guard (1) ---

    test('Regression 17: Golden snapshot for known good payload', async () => {
        const input = createValidInput();
        const result = await executeTikTokLogic(input);

        expect(result.ok).toBe(true);
        expect(result.code).toBe('OK');
        expect(result.connector_key).toBe('tiktok_ads');

        // Verify structure
        const raw = result.request.raw_request;
        expect(raw.campaign.campaign_name).toBe('Test Campaign');
        expect(raw.campaign.objective_type).toBe('CONVERSIONS');
        expect(raw.campaign.campaign_status).toBe('ENABLE');
        expect(raw.adgroups.length).toBe(1);
        expect(raw.adgroups[0].optimization_goal).toBe('CONVERSION');
        expect(raw.ads.length).toBe(1);
        expect(raw.ads[0].ad_name).toBe('Test AdGroup_creative-1');

        // Verify normalized request
        const normalized = result.request.normalized_request;
        expect(normalized.campaign.name).toBe('Test Campaign');
        expect(normalized.adgroups.length).toBe(1);
    });

    // --- Determinism Guard (1) ---

    test('Determinism 18: Identical inputs produce byte-identical outputs', async () => {
        const input1 = createValidInput();
        const input2 = createValidInput();

        const result1 = await executeTikTokLogic(input1);
        const result2 = await executeTikTokLogic(input2);

        const json1 = JSON.stringify(result1);
        const json2 = JSON.stringify(result2);

        expect(json1).toBe(json2);
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
