/**
 * Phase 48: Meta Ads Connector Logic Layer
 * 
 * Contract: Phase47ConnectorInputV1
 * Feature Flag: FF_META_ADS_CONNECTOR
 * 
 * Pure translation layer. No IO. No inference. Deterministic.
 *
 * // Phase 48 logic layer aligns with Phase 27B connector_backplane_v1 validation and error definitions.
 */

const objectivesMapping = require('./mapping/meta_objectives.json');
const optimizationGoalsMapping = require('./mapping/meta_optimization_goals.json');
const billingEventsMapping = require('./mapping/meta_billing_events.json');
const specialAdCategoriesMapping = require('./mapping/meta_special_ad_categories.json');
const placementsMapping = require('./mapping/meta_placements.json');
const targetingFieldsMapping = require('./mapping/meta_targeting_fields.json');
const disallowedTargetingFieldsMapping = require('./mapping/meta_disallowed_targeting_fields.json');
const creativeTypesMapping = require('./mapping/meta_creative_types.json');

// --- Helper Functions ---

function createErrorEnvelope(code, message, executionId) {
    return {
        ok: false,
        code,
        message,
        envelope: { execution_id: executionId }
    };
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
        if (obj[prop] !== null && (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return obj;
}

function sortArrayLexicographically(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.slice().sort((a, b) => {
        const aStr = typeof a === 'string' ? a : JSON.stringify(a);
        const bStr = typeof b === 'string' ? b : JSON.stringify(b);
        return aStr.localeCompare(bStr);
    });
}

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

// --- Validation Functions ---

function validateRequiredFields(request, executionId) {
    const requiredFields = [
        'campaign',
        'adsets',
        'creatives',
        'targeting',
        'special_ad_categories',
        'objective',
        'optimization_goal',
        'billing_event',
        'placement_bundle',
        'budget',
        'currency',
        'brand_metadata'
    ];

    for (const field of requiredFields) {
        if (request[field] === undefined || request[field] === null) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `Missing required field: ${field}`,
                executionId
            );
        }
    }

    return null;
}

function validateObjective(objective, executionId) {
    if (!objectivesMapping.mappings[objective]) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            `Invalid objective: ${objective}`,
            executionId
        );
    }
    return null;
}

function validateCampaign(campaign, executionId) {
    if (!campaign.name || typeof campaign.name !== 'string' || campaign.name.trim() === '') {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'campaign.name must be a non-empty string',
            executionId
        );
    }

    if (campaign.status !== 'ACTIVE') {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'campaign.status must be exactly "ACTIVE"',
            executionId
        );
    }

    if (!Array.isArray(campaign.special_ad_categories) || campaign.special_ad_categories.length === 0) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'campaign.special_ad_categories must be a non-empty array',
            executionId
        );
    }

    return null;
}

function validateSpecialAdCategories(categories, executionId) {
    const allowed = specialAdCategoriesMapping.allowed_categories;

    for (const category of categories) {
        if (!allowed.includes(category)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `Invalid special ad category: ${category}`,
                executionId
            );
        }
    }

    // Check if sorted
    const sorted = sortArrayLexicographically(categories);
    if (JSON.stringify(categories) !== JSON.stringify(sorted)) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'special_ad_categories must be sorted lexicographically',
            executionId
        );
    }

    return null;
}

function validateAdsets(adsets, executionId) {
    if (!Array.isArray(adsets) || adsets.length === 0) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'adsets must be a non-empty array',
            executionId
        );
    }

    for (let i = 0; i < adsets.length; i++) {
        const adset = adsets[i];

        if (!adset.name || typeof adset.name !== 'string' || adset.name.trim() === '') {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].name must be a non-empty string`,
                executionId
            );
        }

        if (!adset.optimization_goal) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].optimization_goal is required`,
                executionId
            );
        }

        if (!optimizationGoalsMapping.mappings[adset.optimization_goal]) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].optimization_goal "${adset.optimization_goal}" is invalid`,
                executionId
            );
        }

        if (!adset.billing_event) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].billing_event is required`,
                executionId
            );
        }

        if (!billingEventsMapping.allowed_events.includes(adset.billing_event)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].billing_event "${adset.billing_event}" is invalid`,
                executionId
            );
        }

        if (!adset.daily_budget && !adset.lifetime_budget) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}] must have either daily_budget or lifetime_budget`,
                executionId
            );
        }

        if (!adset.targeting || typeof adset.targeting !== 'object') {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].targeting must be an object`,
                executionId
            );
        }

        if (!Array.isArray(adset.placements)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].placements must be an array`,
                executionId
            );
        }

        // Verify placements are sorted
        const sortedPlacements = sortArrayLexicographically(adset.placements);
        if (JSON.stringify(adset.placements) !== JSON.stringify(sortedPlacements)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `adsets[${i}].placements must be sorted lexicographically`,
                executionId
            );
        }

        const targetingError = validateTargeting(adset.targeting, executionId);
        if (targetingError) {
            return targetingError;
        }
    }

    return null;
}

function validateTargeting(targeting, executionId) {
    // Required fields
    if (!targeting.geo) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'targeting.geo is required',
            executionId
        );
    }

    if (targeting.age_min === undefined || targeting.age_min === null) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'targeting.age_min is required',
            executionId
        );
    }

    if (targeting.age_max === undefined || targeting.age_max === null) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'targeting.age_max is required',
            executionId
        );
    }

    // Check for disallowed fields
    const disallowedFields = disallowedTargetingFieldsMapping.disallowed_fields;
    for (const field of Object.keys(targeting)) {
        if (disallowedFields.includes(field)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `targeting.${field} is not allowed`,
                executionId
            );
        }
    }

    const allowedFields = targetingFieldsMapping.allowed_fields;
    for (const field of Object.keys(targeting)) {
        if (!allowedFields.includes(field)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `targeting.${field} is not an allowed field`,
                executionId
            );
        }
    }

    return null;
}

function validateCreatives(creatives, executionId) {
    if (!Array.isArray(creatives) || creatives.length === 0) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            'creatives must be a non-empty array',
            executionId
        );
    }

    for (let i = 0; i < creatives.length; i++) {
        const creative = creatives[i];

        if (!creative.name || typeof creative.name !== 'string') {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `creatives[${i}].name is required and must be a string`,
                executionId
            );
        }

        if (!creative.type) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `creatives[${i}].type is required`,
                executionId
            );
        }

        if (!creativeTypesMapping.allowed_types.includes(creative.type)) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `creatives[${i}].type "${creative.type}" is invalid`,
                executionId
            );
        }

        if (!creative.body || typeof creative.body !== 'string') {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `creatives[${i}].body is required and must be a string`,
                executionId
            );
        }

        if (!creative.headline || typeof creative.headline !== 'string') {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `creatives[${i}].headline is required and must be a string`,
                executionId
            );
        }

        if (!creative.media_url || typeof creative.media_url !== 'string') {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                `creatives[${i}].media_url is required and must be a string`,
                executionId
            );
        }
    }

    return null;
}

// --- Translation Functions ---

function translateCampaign(campaign, objective, specialAdCategories) {
    // Special rule: Kaivo-level "NONE" maps to empty array for Meta API
    let translatedCategories = specialAdCategories;
    if (Array.isArray(specialAdCategories) &&
        specialAdCategories.length === 1 &&
        specialAdCategories[0] === 'NONE') {
        translatedCategories = [];
    }

    const translated = {
        name: campaign.name,
        objective: objectivesMapping.mappings[objective],
        special_ad_categories: sortArrayLexicographically(translatedCategories),
        status: 'ACTIVE'
    };
    return sortObjectKeys(translated);
}

function translateAdset(adset) {
    const translated = {
        name: adset.name,
        optimization_goal: optimizationGoalsMapping.mappings[adset.optimization_goal],
        billing_event: adset.billing_event,
        targeting: translateTargeting(adset.targeting),
        status: 'ACTIVE'
    };

    if (adset.daily_budget !== undefined && adset.daily_budget !== null) {
        translated.daily_budget = adset.daily_budget;
    }

    if (adset.lifetime_budget !== undefined && adset.lifetime_budget !== null) {
        translated.lifetime_budget = adset.lifetime_budget;
    }

    return sortObjectKeys(translated);
}

function translateTargeting(targeting) {
    const translated = {
        geo_locations: targeting.geo,
        age_min: targeting.age_min,
        age_max: targeting.age_max
    };

    // Optional fields
    if (targeting.genders) {
        translated.genders = sortArrayLexicographically(targeting.genders);
    }

    if (targeting.interests) {
        translated.interests = sortArrayLexicographically(targeting.interests);
    }

    if (targeting.behaviors) {
        translated.behaviors = sortArrayLexicographically(targeting.behaviors);
    }

    if (targeting.publisher_platforms) {
        translated.publisher_platforms = sortArrayLexicographically(targeting.publisher_platforms);
    }

    if (targeting.facebook_positions) {
        translated.facebook_positions = sortArrayLexicographically(targeting.facebook_positions);
    }

    if (targeting.instagram_positions) {
        translated.instagram_positions = sortArrayLexicographically(targeting.instagram_positions);
    }

    if (targeting.audience_network_positions) {
        translated.audience_network_positions = sortArrayLexicographically(targeting.audience_network_positions);
    }

    if (targeting.messenger_positions) {
        translated.messenger_positions = sortArrayLexicographically(targeting.messenger_positions);
    }

    return sortObjectKeys(translated);
}

function translateCreative(creative) {
    const translated = {
        name: creative.name,
        body: creative.body,
        headline: creative.headline,
        media_url: creative.media_url,
        meta_creative_type: creative.type
    };
    return sortObjectKeys(translated);
}

function translatePlacementBundle(bundleKey, executionId) {
    const bundle = placementsMapping.placement_bundles[bundleKey];
    if (!bundle) {
        return createErrorEnvelope(
            'META_VALIDATION_ERROR',
            `Invalid placement_bundle: ${bundleKey}`,
            executionId
        );
    }

    return {
        publisher_platforms: sortArrayLexicographically(bundle.publisher_platforms),
        facebook_positions: sortArrayLexicographically(bundle.facebook_positions),
        instagram_positions: sortArrayLexicographically(bundle.instagram_positions),
        audience_network_positions: sortArrayLexicographically(bundle.audience_network_positions),
        messenger_positions: sortArrayLexicographically(bundle.messenger_positions)
    };
}

// --- Main Execute Function ---

function execute(request, context) {
    const executionId = context?.execution_id || 'unknown';

    // Feature Flag Check
    const featureFlagEnabled = process.env.FF_META_ADS_CONNECTOR === 'true';
    if (!featureFlagEnabled) {
        return createErrorEnvelope(
            'FEATURE_DISABLED',
            'Meta Ads Connector disabled',
            executionId
        );
    }

    // REPLAY Mode (strict passthrough)
    if (context?.mode === 'REPLAY') {
        if (!context.connector_input) {
            return createErrorEnvelope(
                'META_VALIDATION_ERROR',
                'REPLAY mode requires context.connector_input',
                executionId
            );
        }
        return {
            ok: true,
            connector_input: context.connector_input
        };
    }

    // LIVE Mode - Validation
    let error;

    error = validateRequiredFields(request, executionId);
    if (error) return error;

    error = validateObjective(request.objective, executionId);
    if (error) return error;

    error = validateCampaign(request.campaign, executionId);
    if (error) return error;

    error = validateSpecialAdCategories(request.special_ad_categories, executionId);
    if (error) return error;

    error = validateAdsets(request.adsets, executionId);
    if (error) return error;

    error = validateTargeting(request.targeting, executionId);
    if (error) return error;

    error = validateCreatives(request.creatives, executionId);
    if (error) return error;

    // Translation
    const clonedRequest = deepClone(request);

    const rawCampaign = translateCampaign(
        clonedRequest.campaign,
        clonedRequest.objective,
        clonedRequest.special_ad_categories
    );

    const rawAdsets = clonedRequest.adsets.map(adset => translateAdset(adset));

    const rawCreatives = clonedRequest.creatives.map(creative => translateCreative(creative));

    const placementConfig = translatePlacementBundle(clonedRequest.placement_bundle, executionId);

    if (placementConfig && placementConfig.ok === false) {
        return placementConfig;
    }

    const raw_request = sortObjectKeys({
        campaign: rawCampaign,
        adsets: rawAdsets,
        creatives: rawCreatives,
        placements: placementConfig
    });

    const normalized_request = sortObjectKeys({
        campaign: deepClone(clonedRequest.campaign),
        adsets: deepClone(clonedRequest.adsets),
        creatives: deepClone(clonedRequest.creatives),
        targeting: deepClone(clonedRequest.targeting),
        special_ad_categories: sortArrayLexicographically(clonedRequest.special_ad_categories),
        objective: clonedRequest.objective,
        optimization_goal: clonedRequest.optimization_goal,
        billing_event: clonedRequest.billing_event,
        placement_bundle: clonedRequest.placement_bundle,
        budget: clonedRequest.budget,
        currency: clonedRequest.currency,
        brand_metadata: deepClone(clonedRequest.brand_metadata)
    });

    // Construct Phase47ConnectorInputV1
    const connector_input = {
        mode: context?.mode || 'LIVE',
        connector_key: 'meta_ads',
        execution_id: executionId,
        iteration_index: context?.iteration_index || 0,
        request: {
            raw_request: deepFreeze(raw_request),
            normalized_request: deepFreeze(normalized_request)
        },
        meta: {
            input_contract_version: 'Phase47ConnectorInputV1'
        }
    };

    return {
        ok: true,
        connector_input: deepFreeze(connector_input)
    };
}

module.exports = {
    execute
};
