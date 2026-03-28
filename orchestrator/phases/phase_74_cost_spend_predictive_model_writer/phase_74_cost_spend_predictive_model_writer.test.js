const { execute } = require('./phase_74_cost_spend_predictive_model_writer');
const { createHash } = require('crypto');

const BASE_INPUT = {
    execution_id: 'exec_test_123',
    phase: '74',
    feature_flags: { FF_COST_SPEND_PREDICTIVE_MODEL_WRITER: true },
    tenant_context: {
        tenant_id: 'tenant_a',
        currency: 'USD',
        rate_plan_id: 'plan_a',
        custom_pricing_overrides: {}
    },
    rate_limit_forecast: {
        forecast_horizon: {
            start_iso: '2025-01-01T00:00:00Z',
            end_iso: '2025-01-31T23:59:59Z',
            granularity: 'DAY'
        },
        forecast_version: 'v1',
        per_connector: {
            meta_ads: {
                units: 'IMPRESSIONS',
                forecast_buckets: [
                    {
                        bucket_start_iso: '2025-01-01T00:00:00Z',
                        bucket_end_iso: '2025-01-01T23:59:59Z',
                        max_impressions: 1000
                    }
                ]
            }
        }
    },
    pricing_model: {
        pricing_model_id: 'pm_1',
        version: '1',
        currency: 'USD',
        effective_from_iso: '2024-01-01T00:00:00Z',
        component_definitions: {
            media_spend: {
                basis: 'CPM',
                per_connector: {
                    meta_ads: { unit_price: 10.0, unit_type: 'CPM' } // $10 CPM
                }
            },
            platform_fee: {
                basis: 'PERCENT_OF_MEDIA',
                default_rate_percent: 10.0 // 10%
            },
            fixed_monthly_fees: []
        }
    },
    policy_adjustments: {
        credits: [],
        surcharges: [],
        constraints: {}
    }
};

describe('Phase 74: Cost/Spend Predictive Model Writer (Corrected)', () => {
    // ---------------------------------------------------------------------------
    // Happy Path (6)
    // ---------------------------------------------------------------------------

    test('HP-1: Standard Single Connector Flow', () => {
        const output = execute(JSON.parse(JSON.stringify(BASE_INPUT)));
        expect(output.status).toBe('OK');

        const totals = output.cost_expectation_model.totals;
        // 1000 imps @ $10 CPM = $10 media
        // 10% fee = $1
        // Total gross before credits/surcharges = $11
        expect(totals.expected_impressions).toBe(1000);
        expect(totals.expected_media_spend).toBe(10.0);
        expect(totals.expected_platform_fees).toBe(1.0);
        expect(totals.expected_fixed_fees).toBe(0);
        expect(totals.expected_total_spend).toBe(11.0);
        expect(totals.upper_bound_spend).toBeNull();

        const items = output.billing_projection.line_items;
        expect(items.length).toBe(2); // MEDIA + PLATFORM_FEE
        const mediaItem = items.find(i => i.charge_type === 'MEDIA');
        expect(mediaItem.amount).toBe(10.0);
    });

    test('HP-2: Fixed Fee Allocation Across Connectors', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.rate_limit_forecast.per_connector.google_ads = {
            units: 'IMPRESSIONS',
            forecast_buckets: []
        };
        input.pricing_model.component_definitions.fixed_monthly_fees = [
            { amount: 100.0, applies_to_rate_plans: ['plan_a'] }
        ];

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;
        const perConnector = output.cost_expectation_model.per_connector;

        expect(totals.expected_fixed_fees).toBe(100.0);

        // Two connectors, deterministic split: $50 each
        expect(perConnector.meta_ads.expected_fixed_fees).toBe(50.0);
        expect(perConnector.google_ads.expected_fixed_fees).toBe(50.0);

        // Google has no media, only fixed
        expect(perConnector.google_ads.expected_total_spend).toBe(50.0);
    });

    test('HP-3: Fixed Fee Allocation With Rounding', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.rate_limit_forecast.per_connector.google_ads = {
            units: 'IMPRESSIONS',
            forecast_buckets: []
        };
        input.rate_limit_forecast.per_connector.tiktok_ads = {
            units: 'IMPRESSIONS',
            forecast_buckets: []
        };

        input.pricing_model.component_definitions.fixed_monthly_fees = [
            { amount: 100.0, applies_to_rate_plans: ['plan_a'] }
        ];

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;
        const perConnector = output.cost_expectation_model.per_connector;

        expect(totals.expected_fixed_fees).toBe(100.0);

        const fixedValues = Object.values(perConnector)
            .map(c => c.expected_fixed_fees)
            .sort();

        expect(fixedValues).toEqual([33.33, 33.33, 33.34]);
    });

    test('HP-4: Daily Spend Constraint With Recomputed Impressions', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // Raw total = $11; cap daily spend at $5
        input.policy_adjustments.constraints.max_daily_spend = 5.0;

        const output = execute(input);
        const meta = output.cost_expectation_model.per_connector.meta_ads;
        const bucket = meta.time_buckets[0];

        expect(bucket.expected_total_spend).toBeLessThanOrEqual(5.0);
        expect(bucket.expected_total_spend).toBeGreaterThan(0);
        // Impressions should be reduced from original 1000
        expect(bucket.expected_impressions).toBeLessThan(1000);

        // Connector-level total matches bucket total (single bucket)
        expect(meta.expected_total_spend).toBe(bucket.expected_total_spend);
    });

    test('HP-5: Credits and Global CREDIT Line Item', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.policy_adjustments.credits = [{ amount: 5.0 }];

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;

        // Gross = 11.00, credits = 5.00, net = 6.00
        expect(totals.expected_credits).toBe(5.0);
        expect(totals.expected_total_spend).toBe(6.0);

        const items = output.billing_projection.line_items;
        const creditItem = items.find(i => i.charge_type === 'CREDIT');
        expect(creditItem).toBeDefined();
        expect(creditItem.connector_key).toBe('GLOBAL');
        expect(creditItem.amount).toBe(5.0);
    });

    test('HP-6: Feature Flag Off → Passthrough Zeroed Shape', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.feature_flags.FF_COST_SPEND_PREDICTIVE_MODEL_WRITER = false;

        const output = execute(input);
        expect(output.status).toBe('OK');
        expect(output.cost_expectation_model.per_connector).toEqual({});
        expect(output.cost_expectation_model.totals.expected_total_spend).toBe(0);
        expect(output.cost_expectation_model.totals.upper_bound_spend).toBeNull();
    });

    // ---------------------------------------------------------------------------
    // Negative Path (6)
    // ---------------------------------------------------------------------------

    test('NP-1: Missing Required Top-Level Field', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.tenant_context;

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.error.code).toBe('INVALID_INPUT_CONTRACT');
    });

    test('NP-2: Currency Mismatch', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.pricing_model.currency = 'EUR';

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.error.code).toBe('INCONSISTENT_CURRENCY');
    });

    test('NP-3: Bad Overrides Type', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.tenant_context.custom_pricing_overrides = {
            connector_overrides: {
                meta_ads: 'NOT_AN_OBJECT'
            }
        };

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.error.code).toBe('INVALID_INPUT_CONTRACT');
    });

    test('NP-4: Forbidden Top-Level Field', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input._debug = true;

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.error.code).toBe('INVALID_INPUT_CONTRACT');
        expect(output.error.message).toMatch(/Forbidden field/);
    });

    test('NP-5: Invalid ISO Date', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.rate_limit_forecast.forecast_horizon.start_iso = 'not-a-date';

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.error.code).toBe('INVALID_INPUT_CONTRACT');
        expect(output.error.message).toMatch(/Invalid ISO/);
    });

    test('NP-6: Invalid Phase', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.phase = '73';

        const output = execute(input);
        expect(output.status).toBe('ERROR');
        expect(output.error.code).toBe('INVALID_INPUT_CONTRACT');
        expect(output.error.message).toMatch(/Invalid phase/);
    });

    // ---------------------------------------------------------------------------
    // Edge Cases (4)
    // ---------------------------------------------------------------------------

    test('EC-1: No Connectors But Fixed Fees Present', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.rate_limit_forecast.per_connector = {};
        input.pricing_model.component_definitions.fixed_monthly_fees = [
            { amount: 50.0, applies_to_rate_plans: ['plan_a'] }
        ];

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;
        const perConnector = output.cost_expectation_model.per_connector;

        // No connectors → fixed fees are not allocated
        expect(Object.keys(perConnector).length).toBe(0);
        expect(totals.expected_fixed_fees).toBe(0);
        expect(totals.expected_total_spend).toBe(0);
    });

    test('EC-2: Upper Bound Clipping On Total Spend', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        // Raw net = 11.0
        input.policy_adjustments.constraints.max_total_spend = 5.0;

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;

        expect(totals.upper_bound_spend).toBe(5.0);
        expect(totals.expected_total_spend).toBe(5.0);
        expect(totals.bounded_by_constraints).toBe(true);

        const warning = output.warnings.find(w => w.code === 'SPEND_CEILING_TRUNCATED');
        expect(warning).toBeDefined();
    });

    test('EC-3: Zero-Impression Forecast', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.rate_limit_forecast.per_connector.meta_ads.forecast_buckets[0].max_impressions = 0;

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;

        expect(totals.expected_impressions).toBe(0);
        expect(totals.expected_media_spend).toBe(0);
        expect(totals.expected_total_spend).toBe(0);
    });

    test('EC-4: Nullable Upper Bound When No Constraint', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        delete input.policy_adjustments.constraints.max_total_spend;

        const output = execute(input);
        const totals = output.cost_expectation_model.totals;

        expect(totals.upper_bound_spend).toBeNull();
        expect(totals.bounded_by_constraints).toBe(false);
    });

    // ---------------------------------------------------------------------------
    // Guards (2)
    // ---------------------------------------------------------------------------

    test('Guard-1: Determinism Across 100 Runs', () => {
        const input = JSON.parse(JSON.stringify(BASE_INPUT));
        input.rate_limit_forecast.per_connector.google_ads = {
            units: 'IMPRESSIONS',
            forecast_buckets: [
                {
                    bucket_start_iso: '2025-01-02T00:00:00Z',
                    bucket_end_iso: '2025-01-02T23:59:59Z',
                    max_impressions: 500
                }
            ]
        };
        input.pricing_model.component_definitions.media_spend.per_connector.google_ads = {
            unit_price: 8.0,
            unit_type: 'CPM'
        };

        let previousHash = null;
        for (let i = 0; i < 100; i++) {
            const out = execute(input);
            const hash = createHash('sha256').update(JSON.stringify(out)).digest('hex');
            if (previousHash && hash !== previousHash) {
                throw new Error('Determinism violation: Output hash changed between runs');
            }
            previousHash = hash;
        }

        expect(true).toBe(true);
    });

    test('Guard-2: Top-Level Keys Sorted In Output', () => {
        const output = execute(JSON.parse(JSON.stringify(BASE_INPUT)));
        const keys = Object.keys(output);
        const sortedKeys = [...keys].sort();
        expect(keys).toEqual(sortedKeys);

        const firstLineItem = output.billing_projection.line_items[0];
        const liKeys = Object.keys(firstLineItem);
        const liSorted = [...liKeys].sort();
        expect(liKeys).toEqual(liSorted);
    });
});
