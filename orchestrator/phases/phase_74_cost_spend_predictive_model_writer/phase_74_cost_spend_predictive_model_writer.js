/**
 * Phase 74: Cost/Spend Predictive Model Writer
 *
 * Role: Deterministic cost expectation engine.
 * Input: Rate Limit Forecast (Phase 73) + Pricing/Rate Plans.
 * Output: Cost Expectation Model + Billing Projection.
 *
 * Forward-Hardening:
 * - Pure logic only (no IO, no DB, no APIs, no Date.now/new Date()).
 * - Deterministic output (lexicographical sorting).
 * - Explicit versioning.
 * - Error as value (status: ERROR).
 */

const REQUIRED_INPUT_FIELDS = [
    'execution_id',
    'phase',
    'feature_flags',
    'tenant_context',
    'rate_limit_forecast',
    'pricing_model'
];

const REQUIRED_TENANT_CONTEXT_FIELDS = ['tenant_id', 'currency'];
const REQUIRED_PRICING_MODEL_FIELDS = ['pricing_model_id', 'version', 'currency', 'component_definitions'];
const FORBIDDEN_TOP_LEVEL_FIELDS = ['_debug', 'debug_info', 'internal_only'];

function execute(input) {
    try {
        // Basic input presence check (cannot assume anything)
        if (!input || typeof input !== 'object') {
            return buildErrorResponse({ execution_id: 'unknown', feature_flags: {} }, createError(
                'INVALID_INPUT_CONTRACT',
                'Input must be a non-null object'
            ));
        }

        if (!input.feature_flags || typeof input.feature_flags !== 'object') {
            return buildErrorResponse(input, createError(
                'INVALID_INPUT_CONTRACT',
                'Missing feature_flags object'
            ));
        }

        // Feature flag off → deterministic passthrough with zeroed shape
        if (!input.feature_flags.FF_COST_SPEND_PREDICTIVE_MODEL_WRITER) {
            return buildPassthroughResponse(input);
        }

        // Full validation only when FF is enabled
        validateInput(input);

        const tenantContext = input.tenant_context;
        const rateLimitForecast = input.rate_limit_forecast;
        const pricingModel = input.pricing_model;
        const policyAdjustments = input.policy_adjustments || {};
        const constraints = policyAdjustments.constraints || {};
        const historicalSnapshot = input.historical_spend_snapshot;

        // 1. Effective pricing profile (with overrides resolved)
        const effectivePricing = buildEffectivePricingProfile(
            pricingModel,
            tenantContext.rate_plan_id,
            tenantContext.custom_pricing_overrides
        );

        // 2. Per-connector expectations (includes daily-constraint clipping and recomputed impressions)
        const perConnector = computePerConnectorExpectations(
            rateLimitForecast,
            effectivePricing,
            constraints
        );

        // 3. Fixed-fee allocation (deterministic split across connectors)
        allocateFixedFees(perConnector, effectivePricing.fixed_monthly_fees || []);

        // 4. Totals (media, fees, fixed, credits, surcharges, net spend, caps)
        const totals = computeTotals(perConnector, policyAdjustments);

        // 5. Billing projection
        const billingProjection = buildBillingProjection(
            input,
            perConnector,
            totals
        );

        // 6. Warnings
        const warnings = [];
        if (totals.bounded_by_constraints) {
            warnings.push({
                code: 'SPEND_CEILING_TRUNCATED',
                message: 'Expected total spend exceeds max_total_spend constraint; totals clipped to constraint.',
                connector_key: null
            });
        }
        if (!historicalSnapshot) {
            warnings.push({
                code: 'MISSING_HISTORICAL_SNAPSHOT',
                message: 'Historical spend snapshot missing; variance analysis unavailable.',
                connector_key: null
            });
        }

        return buildSuccessResponse(input, perConnector, totals, billingProjection, warnings);
    } catch (err) {
        return buildErrorResponse(input || { execution_id: 'unknown', feature_flags: {} }, err);
    }
}

// -----------------------------------------------------------------------------
// Passthrough (FF off)
// -----------------------------------------------------------------------------

function buildPassthroughResponse(input) {
    const horizon = input && input.rate_limit_forecast && input.rate_limit_forecast.forecast_horizon
        ? input.rate_limit_forecast.forecast_horizon
        : {
            start_iso: null,
            end_iso: null,
            granularity: null
        };

    return sortObjectKeys({
        execution_id: input && input.execution_id ? input.execution_id : 'unknown',
        phase: '74',
        feature_flags: input && input.feature_flags ? input.feature_flags : {},
        status: 'OK',
        cost_expectation_model: {
            model_version: 'cost_expectation_v1',
            currency: input && input.tenant_context && input.tenant_context.currency
                ? input.tenant_context.currency
                : 'UNKNOWN',
            assumptions: {
                pricing_model_id: input && input.pricing_model && input.pricing_model.pricing_model_id
                    ? input.pricing_model.pricing_model_id
                    : 'unknown',
                pricing_model_version: input && input.pricing_model && input.pricing_model.version
                    ? input.pricing_model.version
                    : 'unknown',
                rate_limit_forecast_version: input && input.rate_limit_forecast && input.rate_limit_forecast.forecast_version
                    ? input.rate_limit_forecast.forecast_version
                    : 'unknown',
                forecast_horizon: horizon,
                safety_margin_factor: 1.0
            },
            per_connector: {},
            totals: {
                expected_impressions: 0,
                expected_media_spend: 0,
                expected_platform_fees: 0,
                expected_fixed_fees: 0,
                expected_credits: 0,
                expected_surcharges: 0,
                expected_total_spend: 0,
                upper_bound_spend: null,
                bounded_by_constraints: false
            }
        },
        billing_projection: {
            projection_version: 'billing_projection_v1',
            line_items: []
        },
        warnings: [],
        annotations: {
            output_contract_version: 'output_contract_v1'
        }
    });
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function validateInput(input) {
    // Required top-level fields
    for (const field of REQUIRED_INPUT_FIELDS) {
        if (input[field] === undefined || input[field] === null) {
            throw createError('INVALID_INPUT_CONTRACT', `Missing required field: ${field}`);
        }
    }

    // Forbidden top-level fields
    for (const forbidden of FORBIDDEN_TOP_LEVEL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(input, forbidden)) {
            throw createError('INVALID_INPUT_CONTRACT', `Forbidden field present: ${forbidden}`);
        }
    }

    if (typeof input.execution_id !== 'string' || input.execution_id.length === 0) {
        throw createError('INVALID_INPUT_CONTRACT', 'execution_id must be a non-empty string');
    }

    if (input.phase !== '74') {
        throw createError('INVALID_INPUT_CONTRACT', `Invalid phase: ${input.phase}`);
    }

    // Tenant context required fields
    for (const field of REQUIRED_TENANT_CONTEXT_FIELDS) {
        if (!input.tenant_context || input.tenant_context[field] === undefined || input.tenant_context[field] === null) {
            throw createError('INVALID_INPUT_CONTRACT', `Missing tenant_context field: ${field}`);
        }
    }

    // Pricing model required fields
    for (const field of REQUIRED_PRICING_MODEL_FIELDS) {
        if (!input.pricing_model || input.pricing_model[field] === undefined || input.pricing_model[field] === null) {
            throw createError('INVALID_INPUT_CONTRACT', `Missing pricing_model field: ${field}`);
        }
    }

    // Currency alignment
    if (input.tenant_context.currency !== input.pricing_model.currency) {
        throw createError(
            'INCONSISTENT_CURRENCY',
            `Tenant currency ${input.tenant_context.currency} does not match pricing model currency ${input.pricing_model.currency}`
        );
    }

    // ISO validations (known fields)
    const horizon = input.rate_limit_forecast.forecast_horizon;
    if (!horizon || !horizon.start_iso || !horizon.end_iso) {
        throw createError('INVALID_INPUT_CONTRACT', 'Missing required forecast_horizon fields');
    }

    const isoCandidates = [
        horizon.start_iso,
        horizon.end_iso,
        input.pricing_model.effective_from_iso
    ].filter(Boolean);

    for (const val of isoCandidates) {
        if (!isValidIsoDate(val)) {
            throw createError('INVALID_INPUT_CONTRACT', `Invalid ISO date format: ${val}`);
        }
    }
}

function isValidIsoDate(str) {
    if (typeof str !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(str);
}

// -----------------------------------------------------------------------------
// Pricing Profile (with overrides)
// -----------------------------------------------------------------------------

function buildEffectivePricingProfile(pricingModel, ratePlanId, overrides) {
    // Start from pricing model definitions
    const effective = deepClone(pricingModel.component_definitions || {});

    // Filter fixed monthly fees by rate plan
    if (Array.isArray(effective.fixed_monthly_fees)) {
        effective.fixed_monthly_fees = effective.fixed_monthly_fees.filter(fee => {
            if (!fee.applies_to_rate_plans || fee.applies_to_rate_plans.length === 0) return true;
            return !!ratePlanId && fee.applies_to_rate_plans.includes(ratePlanId);
        });
    }

    // Apply overrides
    if (overrides && typeof overrides === 'object') {
        const { connector_overrides, global_adjustments } = overrides;

        // Connector-level overrides: merge into media_spend.per_connector
        if (connector_overrides) {
            if (!effective.media_spend) effective.media_spend = {};
            if (!effective.media_spend.per_connector) effective.media_spend.per_connector = {};

            Object.keys(connector_overrides).forEach(connKey => {
                const overrideData = connector_overrides[connKey];
                if (!overrideData || typeof overrideData !== 'object' || Array.isArray(overrideData)) {
                    throw createError('INVALID_INPUT_CONTRACT', 'Override data must be an object');
                }
                const base = effective.media_spend.per_connector[connKey] || {};
                effective.media_spend.per_connector[connKey] = { ...base, ...overrideData };
            });
        }

        // Global adjustments: override known numeric knobs deterministically
        if (global_adjustments && typeof global_adjustments === 'object') {
            if (
                global_adjustments.platform_fee_percent !== undefined &&
                effective.platform_fee &&
                typeof effective.platform_fee === 'object'
            ) {
                effective.platform_fee.default_rate_percent = global_adjustments.platform_fee_percent;
            }
        }
    }

    return effective;
}

// -----------------------------------------------------------------------------
// Per-connector expectations (with daily clipping + recomputed impressions)
// -----------------------------------------------------------------------------

function computePerConnectorExpectations(forecast, pricing, constraints) {
    const result = {};
    const perConnector = forecast.per_connector || {};
    const connectorKeys = Object.keys(perConnector).sort();
    const maxDailySpend = constraints && typeof constraints.max_daily_spend === 'number'
        ? constraints.max_daily_spend
        : null;
    const granularity = forecast.forecast_horizon && forecast.forecast_horizon.granularity;

    for (const key of connectorKeys) {
        const connectorForecast = perConnector[key];
        const buckets = connectorForecast.forecast_buckets || [];
        const mediaPricing = pricing.media_spend &&
            pricing.media_spend.per_connector &&
            pricing.media_spend.per_connector[key];

        const unitPrice = mediaPricing && typeof mediaPricing.unit_price === 'number'
            ? mediaPricing.unit_price
            : 0;
        const unitType = mediaPricing && typeof mediaPricing.unit_type === 'string'
            ? mediaPricing.unit_type
            : 'CPM';

        const platformFeeConfig = pricing.platform_fee || {};
        const platformBasis = platformFeeConfig.basis;
        const platformRatePercent = typeof platformFeeConfig.default_rate_percent === 'number'
            ? platformFeeConfig.default_rate_percent
            : 0;
        const platformRate = platformBasis === 'PERCENT_OF_MEDIA' ? platformRatePercent / 100 : 0;

        let connectorImpressions = 0;
        let connectorMediaSpend = 0;
        let connectorPlatformFees = 0;

        const processedBuckets = [];

        for (const bucket of buckets) {
            const rawImpressions = typeof bucket.max_impressions === 'number'
                ? bucket.max_impressions
                : 0;

            let bucketImpressions = rawImpressions;
            let bucketMediaSpend = 0;

            // Compute raw media spend
            if (unitType === 'CPM') {
                bucketMediaSpend = (bucketImpressions / 1000) * unitPrice;
            } else {
                bucketMediaSpend = bucketImpressions * unitPrice;
            }

            let bucketPlatformFee = bucketMediaSpend * platformRate;
            let bucketTotal = bucketMediaSpend + bucketPlatformFee;

            // Daily spend constraint with recomputed impressions (Option 1)
            if (granularity === 'DAY' && maxDailySpend !== null && maxDailySpend >= 0 && bucketTotal > maxDailySpend) {
                const costPerImpression =
                    unitType === 'CPM'
                        ? (unitPrice / 1000) * (1 + platformRate)
                        : unitPrice * (1 + platformRate);

                if (costPerImpression > 0) {
                    const clippedImpressions = Math.floor(maxDailySpend / costPerImpression);
                    bucketImpressions = clippedImpressions >= 0 ? clippedImpressions : 0;
                } else {
                    bucketImpressions = 0;
                }

                if (unitType === 'CPM') {
                    bucketMediaSpend = (bucketImpressions / 1000) * unitPrice;
                } else {
                    bucketMediaSpend = bucketImpressions * unitPrice;
                }
                bucketPlatformFee = bucketMediaSpend * platformRate;
                bucketTotal = bucketMediaSpend + bucketPlatformFee;
            }

            bucketMediaSpend = round2(bucketMediaSpend);
            bucketPlatformFee = round2(bucketPlatformFee);
            bucketTotal = round2(bucketTotal);

            connectorImpressions += bucketImpressions;
            connectorMediaSpend += bucketMediaSpend;
            connectorPlatformFees += bucketPlatformFee;

            processedBuckets.push({
                bucket_start_iso: bucket.bucket_start_iso,
                bucket_end_iso: bucket.bucket_end_iso,
                expected_impressions: bucketImpressions,
                expected_media_spend: bucketMediaSpend,
                expected_platform_fees: bucketPlatformFee,
                expected_total_spend: bucketTotal
            });
        }

        result[key] = {
            connector_key: key,
            expected_impressions: connectorImpressions,
            expected_media_spend: round2(connectorMediaSpend),
            expected_platform_fees: round2(connectorPlatformFees),
            expected_fixed_fees: 0,
            expected_total_spend: round2(connectorMediaSpend + connectorPlatformFees),
            time_buckets: processedBuckets
        };
    }

    return result;
}

// -----------------------------------------------------------------------------
// Fixed Fee Allocation (deterministic split)
// -----------------------------------------------------------------------------

function allocateFixedFees(perConnectorResults, fixedMonthlyFees) {
    const connectorKeys = Object.keys(perConnectorResults).sort();
    const numConnectors = connectorKeys.length;

    if (!Array.isArray(fixedMonthlyFees) || fixedMonthlyFees.length === 0 || numConnectors === 0) {
        // Ensure expected_fixed_fees exists and no change to totals if no allocation
        connectorKeys.forEach(k => {
            const conn = perConnectorResults[k];
            if (typeof conn.expected_fixed_fees !== 'number') {
                conn.expected_fixed_fees = 0;
            }
            conn.expected_total_spend = round2(
                conn.expected_media_spend + conn.expected_platform_fees + conn.expected_fixed_fees
            );
        });
        return;
    }

    let totalFixed = 0;
    for (const fee of fixedMonthlyFees) {
        if (fee && typeof fee.amount === 'number') {
            totalFixed += fee.amount;
        }
    }
    totalFixed = round2(totalFixed);

    if (totalFixed === 0) {
        connectorKeys.forEach(k => {
            const conn = perConnectorResults[k];
            conn.expected_fixed_fees = 0;
            conn.expected_total_spend = round2(
                conn.expected_media_spend + conn.expected_platform_fees
            );
        });
        return;
    }

    const perConnectorBase = round2(totalFixed / numConnectors);
    let allocatedSoFar = 0;

    for (let i = 0; i < numConnectors; i++) {
        const key = connectorKeys[i];
        const conn = perConnectorResults[key];

        let allocation = perConnectorBase;
        if (i === numConnectors - 1) {
            allocation = round2(totalFixed - allocatedSoFar);
        }

        conn.expected_fixed_fees = allocation;
        conn.expected_total_spend = round2(
            conn.expected_media_spend + conn.expected_platform_fees + allocation
        );
        allocatedSoFar += allocation;
    }
}

// -----------------------------------------------------------------------------
// Totals
// -----------------------------------------------------------------------------

function computeTotals(perConnectorResults, policy) {
    const totals = {
        expected_impressions: 0,
        expected_media_spend: 0,
        expected_platform_fees: 0,
        expected_fixed_fees: 0,
        expected_credits: 0,
        expected_surcharges: 0,
        expected_total_spend: 0,
        upper_bound_spend: null,
        bounded_by_constraints: false
    };

    const connectorKeys = Object.keys(perConnectorResults).sort();

    for (const key of connectorKeys) {
        const conn = perConnectorResults[key];
        totals.expected_impressions += conn.expected_impressions || 0;
        totals.expected_media_spend += conn.expected_media_spend || 0;
        totals.expected_platform_fees += conn.expected_platform_fees || 0;
        totals.expected_fixed_fees += conn.expected_fixed_fees || 0;
        totals.expected_total_spend += conn.expected_total_spend || 0;
    }

    totals.expected_media_spend = round2(totals.expected_media_spend);
    totals.expected_platform_fees = round2(totals.expected_platform_fees);
    totals.expected_fixed_fees = round2(totals.expected_fixed_fees);
    totals.expected_total_spend = round2(totals.expected_total_spend);

    // Credits (sum, positive)
    const credits = Array.isArray(policy.credits) ? policy.credits : [];
    for (const c of credits) {
        if (c && typeof c.amount === 'number') {
            totals.expected_credits += c.amount;
        }
    }
    totals.expected_credits = round2(totals.expected_credits);

    // Surcharges
    const surcharges = Array.isArray(policy.surcharges) ? policy.surcharges : [];
    for (const s of surcharges) {
        if (s && typeof s.amount === 'number') {
            totals.expected_surcharges += s.amount;
        }
    }
    totals.expected_surcharges = round2(totals.expected_surcharges);

    // Gross spend before credits
    const gross = round2(totals.expected_total_spend + totals.expected_surcharges);

    // Net after credits, floored at 0
    let net = gross - totals.expected_credits;
    if (net < 0) net = 0;
    net = round2(net);

    const constraints = policy.constraints || {};
    if (typeof constraints.max_total_spend === 'number') {
        totals.upper_bound_spend = constraints.max_total_spend;
        if (net > constraints.max_total_spend) {
            totals.bounded_by_constraints = true;
            totals.expected_total_spend = round2(constraints.max_total_spend);
        } else {
            totals.expected_total_spend = net;
        }
    } else {
        totals.upper_bound_spend = null;
        totals.expected_total_spend = net;
    }

    return totals;
}

// -----------------------------------------------------------------------------
// Billing Projection
// -----------------------------------------------------------------------------

function buildBillingProjection(input, perConnectorResults, totals) {
    const lineItems = [];
    const connectorKeys = Object.keys(perConnectorResults).sort();
    const tenantId = input.tenant_context.tenant_id;
    const currency = input.tenant_context.currency;
    const pricingModelId = input.pricing_model.pricing_model_id;
    const ratePlanId = input.tenant_context.rate_plan_id;
    const horizon = input.rate_limit_forecast.forecast_horizon;
    const periodStart = horizon.start_iso;
    const periodEnd = horizon.end_iso;
    const refExecId = input.execution_id;

    for (const key of connectorKeys) {
        const conn = perConnectorResults[key];

        if (conn.expected_media_spend > 0) {
            lineItems.push({
                line_item_id: `li_media_${key}`,
                tenant_id: tenantId,
                connector_key: key,
                charge_type: 'MEDIA',
                amount: conn.expected_media_spend,
                currency,
                period_start_iso: periodStart,
                period_end_iso: periodEnd,
                pricing_model_id: pricingModelId,
                rate_plan_id: ratePlanId,
                reference_execution_id: refExecId
            });
        }

        if (conn.expected_platform_fees > 0) {
            lineItems.push({
                line_item_id: `li_platform_${key}`,
                tenant_id: tenantId,
                connector_key: key,
                charge_type: 'PLATFORM_FEE',
                amount: conn.expected_platform_fees,
                currency,
                period_start_iso: periodStart,
                period_end_iso: periodEnd,
                pricing_model_id: pricingModelId,
                rate_plan_id: ratePlanId,
                reference_execution_id: refExecId
            });
        }

        if (conn.expected_fixed_fees > 0) {
            lineItems.push({
                line_item_id: `li_fixed_${key}`,
                tenant_id: tenantId,
                connector_key: key,
                charge_type: 'FIXED_FEE',
                amount: conn.expected_fixed_fees,
                currency,
                period_start_iso: periodStart,
                period_end_iso: periodEnd,
                pricing_model_id: pricingModelId,
                rate_plan_id: ratePlanId,
                reference_execution_id: refExecId
            });
        }
    }

    if (totals.expected_surcharges > 0) {
        lineItems.push({
            line_item_id: 'li_surcharge_global',
            tenant_id: tenantId,
            connector_key: 'GLOBAL',
            charge_type: 'SURCHARGE',
            amount: totals.expected_surcharges,
            currency,
            period_start_iso: periodStart,
            period_end_iso: periodEnd,
            pricing_model_id: pricingModelId,
            rate_plan_id: ratePlanId,
            reference_execution_id: refExecId
        });
    }

    if (totals.expected_credits > 0) {
        lineItems.push({
            line_item_id: 'li_credit_global',
            tenant_id: tenantId,
            connector_key: 'GLOBAL',
            charge_type: 'CREDIT',
            amount: totals.expected_credits,
            currency,
            period_start_iso: periodStart,
            period_end_iso: periodEnd,
            pricing_model_id: pricingModelId,
            rate_plan_id: ratePlanId,
            reference_execution_id: refExecId
        });
    }

    lineItems.sort((a, b) => {
        if (a.tenant_id !== b.tenant_id) return a.tenant_id.localeCompare(b.tenant_id);
        if (a.connector_key !== b.connector_key) return a.connector_key.localeCompare(b.connector_key);
        if (a.charge_type !== b.charge_type) return a.charge_type.localeCompare(b.charge_type);
        return a.period_start_iso.localeCompare(b.period_start_iso);
    });

    return {
        projection_version: 'billing_projection_v1',
        line_items: lineItems
    };
}

// -----------------------------------------------------------------------------
// Response builders
// -----------------------------------------------------------------------------

function buildSuccessResponse(input, perConnector, totals, billingProjection, warnings) {
    const response = {
        execution_id: input.execution_id,
        phase: '74',
        feature_flags: input.feature_flags,
        status: 'OK',
        cost_expectation_model: {
            model_version: 'cost_expectation_v1',
            currency: input.tenant_context.currency,
            assumptions: {
                pricing_model_id: input.pricing_model.pricing_model_id,
                pricing_model_version: input.pricing_model.version,
                rate_limit_forecast_version: input.rate_limit_forecast.forecast_version,
                forecast_horizon: input.rate_limit_forecast.forecast_horizon,
                safety_margin_factor: 1.0
            },
            per_connector: perConnector,
            totals: totals
        },
        billing_projection: billingProjection,
        warnings: warnings || [],
        annotations: {
            output_contract_version: 'output_contract_v1'
        }
    };

    return sortObjectKeys(response);
}

function buildErrorResponse(input, error) {
    return sortObjectKeys({
        execution_id: input && input.execution_id ? input.execution_id : 'unknown',
        phase: '74',
        feature_flags: input && input.feature_flags ? input.feature_flags : {},
        status: 'ERROR',
        error: {
            code: error && error.code ? error.code : 'INTERNAL_ERROR',
            message: error && error.message ? error.message : 'Unknown error'
        }
    });
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function round2(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function createError(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
}

function deepClone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    const sorted = {};
    Object.keys(obj).sort().forEach(k => {
        sorted[k] = sortObjectKeys(obj[k]);
    });
    return sorted;
}

module.exports = { execute };
