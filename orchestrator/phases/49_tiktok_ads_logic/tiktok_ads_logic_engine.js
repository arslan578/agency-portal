/**
 * Phase 49: TikTok Ads Connector Logic Layer
 * 
 * Contract: Phase49ConnectorInputV1
 * Feature Flag: FF_TIKTOK_ADS_LOGIC_LAYER
 * 
 * Pure translation layer. No IO. No inference. Deterministic.
 *
 * // This connector is constrained by Phase 27B connector_backplane_v1 (request, response, capabilities, error_surface, metadata_fields).
 */

const { resolveTikTokMappings, resolveGender } = require('../../knowledge/tiktok_mappings_resolver');

// --- Helper Functions ---

function createErrorEnvelope(code, message, execution_id, mode = 'LIVE', iteration_index = 0) {
    return {
        ok: false,
        code,
        message,
        connector_key: 'tiktok_ads',
        mode,
        execution_id,
        iteration_index
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

// Forbidden TikTok API fields
const FORBIDDEN_TIKTOK_KEYS = [
    'campaign_id',
    'adgroup_id',
    'ad_id',
    'placement_type',
    'placement_list',
    'objective_type',
    'campaign_status',
    'budget_mode',
    'creative_material_mode'
];

function validateAllowedKeys(obj, allowedKeys, context, execution_id) {
    for (const key of Object.keys(obj)) {
        if (!allowedKeys.includes(key)) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Unknown field "${key}" in ${context}`,
                execution_id
            );
        }
    }
    return null;
}

function ensureNoTikTokShape(obj, context, execution_id) {
    for (const key of Object.keys(obj)) {
        if (FORBIDDEN_TIKTOK_KEYS.includes(key)) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Forbidden TikTok API field "${key}" present in ${context}`,
                execution_id
            );
        }
    }
    return null;
}

// --- Validation Functions ---

function validateRequiredRoots(input, execution_id) {
    const requiredRoots = ['execution_id', 'iteration_index', 'mode', 'tenant', 'request'];

    for (const field of requiredRoots) {
        if (input[field] === undefined || input[field] === null) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Missing required root field: ${field}`,
                execution_id || 'unknown'
            );
        }
    }

    // Validate execution_id
    if (typeof input.execution_id !== 'string' || input.execution_id.trim() === '') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'execution_id must be a non-empty string',
            execution_id || 'unknown'
        );
    }

    // Validate iteration_index
    if (typeof input.iteration_index !== 'number' || !Number.isInteger(input.iteration_index) || input.iteration_index < 0) {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'iteration_index must be an integer >= 0',
            input.execution_id
        );
    }

    // Validate mode
    if (input.mode !== 'LIVE' && input.mode !== 'REPLAY') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'mode must be exactly "LIVE" or "REPLAY"',
            input.execution_id
        );
    }

    // Validate allowed keys at root
    const allowedRootKeys = ['execution_id', 'iteration_index', 'mode', 'tenant', 'request', 'meta'];
    const error = validateAllowedKeys(input, allowedRootKeys, 'root', execution_id);
    if (error) return error;

    return null;
}

function validateTenant(tenant, execution_id) {
    // Validate allowed keys
    const allowedTenantKeys = ['workspace_id', 'brand_id'];
    let error = validateAllowedKeys(tenant, allowedTenantKeys, 'tenant', execution_id);
    if (error) return error;

    if (!tenant.workspace_id || typeof tenant.workspace_id !== 'string' || tenant.workspace_id.trim() === '') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'tenant.workspace_id must be a non-empty string',
            execution_id
        );
    }

    if (!tenant.brand_id || typeof tenant.brand_id !== 'string' || tenant.brand_id.trim() === '') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'tenant.brand_id must be a non-empty string',
            execution_id
        );
    }

    return null;
}

function validateRequest(request, execution_id) {
    const allowedRequestKeys = ['campaign', 'adgroups', 'creatives', 'brand'];
    return validateAllowedKeys(request, allowedRequestKeys, 'request', execution_id);
}

function validateCampaign(campaign, execution_id, mappings) {
    // Validate allowed keys
    const allowedCampaignKeys = ['name', 'objective', 'status', 'special_ad_categories'];
    let error = validateAllowedKeys(campaign, allowedCampaignKeys, 'request.campaign', execution_id);
    if (error) return error;

    // Check for forbidden TikTok fields
    error = ensureNoTikTokShape(campaign, 'request.campaign', execution_id);
    if (error) return error;

    // Check disallowed campaign fields
    const disallowedCampaignFields = mappings.disallowed_fields.campaign || [];
    for (const key of Object.keys(campaign)) {
        if (disallowedCampaignFields.includes(key)) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Campaign field "${key}" is not allowed`,
                execution_id
            );
        }
    }

    if (!campaign.name || typeof campaign.name !== 'string' || campaign.name.trim() === '') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'campaign.name must be a non-empty string',
            execution_id
        );
    }

    if (!campaign.objective || typeof campaign.objective !== 'string') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'campaign.objective is required and must be a string',
            execution_id
        );
    }

    if (!mappings.objectives[campaign.objective]) {
        return createErrorEnvelope(
            'TIKTOK_UNSUPPORTED_OBJECTIVE',
            `Unsupported objective: ${campaign.objective}`,
            execution_id
        );
    }

    if (!campaign.status || !['ACTIVE', 'PAUSED', 'DRAFT'].includes(campaign.status)) {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'campaign.status must be one of: ACTIVE, PAUSED, DRAFT',
            execution_id
        );
    }

    return null;
}

function validateAdgroups(adgroups, creatives, execution_id, mappings) {
    if (!Array.isArray(adgroups) || adgroups.length === 0) {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'adgroups must be a non-empty array',
            execution_id
        );
    }

    let commonCurrency = null;

    for (let i = 0; i < adgroups.length; i++) {
        const adgroup = adgroups[i];

        // Validate allowed keys
        const allowedAdgroupKeys = ['name', 'status', 'optimization_goal', 'billing_event', 'budget', 'schedule', 'placements', 'targeting', 'creatives', 'bid_strategy', 'tracking'];
        let error = validateAllowedKeys(adgroup, allowedAdgroupKeys, `request.adgroups[${i}]`, execution_id);
        if (error) return error;

        // Check for forbidden TikTok fields
        error = ensureNoTikTokShape(adgroup, `request.adgroups[${i}]`, execution_id);
        if (error) return error;

        // Check disallowed adgroup fields
        const disallowedAdgroupFields = mappings.disallowed_fields.adgroup || [];
        for (const key of Object.keys(adgroup)) {
            if (disallowedAdgroupFields.includes(key)) {
                return createErrorEnvelope(
                    'TIKTOK_VALIDATION_ERROR',
                    `adgroups[${i}].${key} is not allowed`,
                    execution_id
                );
            }
        }

        // Name
        if (!adgroup.name || typeof adgroup.name !== 'string' || adgroup.name.trim() === '') {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].name must be a non-empty string`,
                execution_id
            );
        }

        // Status
        if (!adgroup.status || !['ACTIVE', 'PAUSED', 'DRAFT'].includes(adgroup.status)) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].status must be one of: ACTIVE, PAUSED, DRAFT`,
                execution_id
            );
        }

        // Optimization goal
        if (!adgroup.optimization_goal) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].optimization_goal is required`,
                execution_id
            );
        }

        if (!mappings.optimization_goals[adgroup.optimization_goal]) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Unsupported optimization_goal: ${adgroup.optimization_goal}`,
                execution_id
            );
        }

        // Billing event
        if (!adgroup.billing_event) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].billing_event is required`,
                execution_id
            );
        }

        if (!mappings.billing_events[adgroup.billing_event]) {
            return createErrorEnvelope(
                'TIKTOK_UNSUPPORTED_BILLING_EVENT',
                `Unsupported billing_event: ${adgroup.billing_event}`,
                execution_id
            );
        }

        // Bid strategy validation
        if (adgroup.bid_strategy) {
            if (!mappings.bid_strategy_mapping[adgroup.bid_strategy]) {
                return createErrorEnvelope(
                    'TIKTOK_VALIDATION_ERROR',
                    `Unsupported bid_strategy: ${adgroup.bid_strategy}`,
                    execution_id
                );
            }
        }

        // Budget
        if (!adgroup.budget || typeof adgroup.budget !== 'object') {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].budget is required and must be an object`,
                execution_id
            );
        }

        if (typeof adgroup.budget.amount !== 'number' || adgroup.budget.amount <= 0) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].budget.amount must be a number > 0`,
                execution_id
            );
        }

        if (!adgroup.budget.currency || typeof adgroup.budget.currency !== 'string') {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].budget.currency is required`,
                execution_id
            );
        }

        // Currency consistency
        if (commonCurrency === null) {
            commonCurrency = adgroup.budget.currency;
        } else if (commonCurrency !== adgroup.budget.currency) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Currency mismatch: all adgroups must use the same currency (found ${commonCurrency} and ${adgroup.budget.currency})`,
                execution_id
            );
        }

        if (!adgroup.budget.type || !['DAILY', 'LIFETIME'].includes(adgroup.budget.type)) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].budget.type must be "DAILY" or "LIFETIME"`,
                execution_id
            );
        }

        // Schedule
        if (!adgroup.schedule || !adgroup.schedule.start_time) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].schedule.start_time is required`,
                execution_id
            );
        }

        // Placements
        if (!Array.isArray(adgroup.placements) || adgroup.placements.length === 0) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].placements must be a non-empty array`,
                execution_id
            );
        }

        for (const placement of adgroup.placements) {
            if (!mappings.placements[placement]) {
                return createErrorEnvelope(
                    'TIKTOK_UNSUPPORTED_PLACEMENT',
                    `Unsupported placement: ${placement}`,
                    execution_id
                );
            }
        }

        // Creatives
        if (!Array.isArray(adgroup.creatives) || adgroup.creatives.length === 0) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${i}].creatives must be a non-empty array`,
                execution_id
            );
        }

        // Validate creative references
        for (const creativeId of adgroup.creatives) {
            if (!creatives[creativeId]) {
                return createErrorEnvelope(
                    'TIKTOK_VALIDATION_ERROR',
                    `adgroups[${i}] references non-existent creative: ${creativeId}`,
                    execution_id
                );
            }
        }

        // Targeting validation
        if (adgroup.targeting) {
            const targetingError = validateTargeting(adgroup.targeting, i, execution_id, mappings);
            if (targetingError) return targetingError;
        }
    }

    return null;
}

function validateTargeting(targeting, adgroupIndex, execution_id, mappings) {
    // Validate allowed keys
    const allowedTargetingKeys = mappings.allowed_targeting_fields || [];
    for (const key of Object.keys(targeting)) {
        if (!allowedTargetingKeys.includes(key)) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `Unknown targeting field "${key}" in adgroups[${adgroupIndex}].targeting`,
                execution_id
            );
        }
    }

    // Check for disallowed fields
    const disallowed = mappings.disallowed_fields.targeting || [];
    for (const field of Object.keys(targeting)) {
        if (disallowed.includes(field)) {
            return createErrorEnvelope(
                'TIKTOK_UNSUPPORTED_TARGETING',
                `Targeting field "${field}" is not allowed`,
                execution_id
            );
        }
    }

    // Age validation
    if (targeting.age) {
        if (typeof targeting.age.min !== 'number' || typeof targeting.age.max !== 'number') {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${adgroupIndex}].targeting.age.min and age.max must be numbers`,
                execution_id
            );
        }

        if (targeting.age.min < 13 || targeting.age.max > 65 || targeting.age.min >= targeting.age.max) {
            return createErrorEnvelope(
                'TIKTOK_VALIDATION_ERROR',
                `adgroups[${adgroupIndex}].targeting.age must satisfy: 13 <= min < max <= 65`,
                execution_id
            );
        }
    }

    return null;
}

function validateCreatives(creatives, execution_id) {
    if (!creatives || typeof creatives !== 'object') {
        return createErrorEnvelope(
            'TIKTOK_VALIDATION_ERROR',
            'request.creatives must be an object',
            execution_id
        );
    }

    for (const creativeId of Object.keys(creatives)) {
        const creative = creatives[creativeId];

        // Validate allowed keys
        const allowedCreativeKeys = ['type', 'name', 'primary_text', 'call_to_action', 'landing_page_url', 'video_asset_id', 'image_asset_id'];
        const error = validateAllowedKeys(creative, allowedCreativeKeys, `request.creatives[${creativeId}]`, execution_id);
        if (error) return error;

        // Check for forbidden TikTok fields
        const forbiddenError = ensureNoTikTokShape(creative, `request.creatives[${creativeId}]`, execution_id);
        if (forbiddenError) return forbiddenError;
    }

    return null;
}

// --- Mapping Functions ---

function translateCampaign(campaign, mappings) {
    const translated = {
        campaign_name: campaign.name,
        objective_type: mappings.objectives[campaign.objective],
        campaign_status: mappings.status_mapping[campaign.status],
        budget_mode: 'BUDGET_MODE_INFINITE' // TikTok uses adgroup-level budgets
    };

    if (campaign.special_ad_categories && campaign.special_ad_categories.length > 0) {
        translated.special_industry = campaign.special_ad_categories[0];
    }

    return sortObjectKeys(translated);
}

function translateAdgroup(adgroup, mappings) {
    const placementList = [];
    for (const placement of adgroup.placements) {
        const mapped = mappings.placements[placement];
        if (mapped) {
            placementList.push(...mapped);
        }
    }

    // Derive placement_type from mappings
    let placementTypeKey = 'AUTOMATIC';
    if (Array.isArray(adgroup.placements) && adgroup.placements.length === 1) {
        placementTypeKey = adgroup.placements[0];
    }
    const placement_type = mappings.placement_type_mapping[placementTypeKey] || 'PLACEMENT_TYPE_AUTOMATIC';

    const translated = {
        adgroup_name: adgroup.name,
        campaign_id: null,
        placement_type,
        placement_list: sortArrayLexicographically([...new Set(placementList)]),
        optimization_goal: mappings.optimization_goals[adgroup.optimization_goal],
        billing_event: mappings.billing_events[adgroup.billing_event],
        budget: adgroup.budget.amount,
        budget_mode: mappings.budget_mode_mapping[adgroup.budget.type],
        schedule_start_time: adgroup.schedule.start_time,
        status: mappings.status_mapping[adgroup.status],
        creative_ids: sortArrayLexicographically(adgroup.creatives.slice())
    };

    if (adgroup.schedule.end_time) {
        translated.schedule_end_time = adgroup.schedule.end_time;
    }

    if (adgroup.bid_strategy) {
        translated.bid_type = mappings.bid_strategy_mapping[adgroup.bid_strategy];
    }

    if (adgroup.targeting) {
        translated.targeting = translateTargeting(adgroup.targeting, mappings);
    }

    return sortObjectKeys(translated);
}

function translateTargeting(targeting, mappings) {
    const translated = {};

    if (targeting.geo) {
        translated.location = {};
        if (targeting.geo.countries) {
            translated.location.country = sortArrayLexicographically(targeting.geo.countries.slice());
        }
        if (targeting.geo.regions) {
            translated.location.region = sortArrayLexicographically(targeting.geo.regions.slice());
        }
        if (targeting.geo.cities) {
            translated.location.city = sortArrayLexicographically(targeting.geo.cities.slice());
        }
    }

    if (targeting.age) {
        // TikTok uses age range arrays - simplified for this implementation
        translated.age = [targeting.age.min, targeting.age.max];
    }

    if (targeting.genders && targeting.genders.length > 0) {
        translated.gender = resolveGender(targeting.genders, mappings.gender_mapping);
    }

    if (targeting.interests) {
        translated.interest_category = sortArrayLexicographically(targeting.interests.slice());
    }

    if (targeting.behaviors) {
        translated.behavior_category = sortArrayLexicographically(targeting.behaviors.slice());
    }

    if (targeting.os_types) {
        translated.os = sortArrayLexicographically(targeting.os_types.slice());
    }

    if (targeting.device_types) {
        translated.device = sortArrayLexicographically(targeting.device_types.slice());
    }

    if (targeting.languages) {
        translated.language = sortArrayLexicographically(targeting.languages.slice());
    }

    return sortObjectKeys(translated);
}

function translateAd(adgroupName, adgroupStatus, creative, creativeId, mappings) {
    const translated = {
        ad_name: `${adgroupName}_${creativeId}`,
        adgroup_id: null,
        creative_material_mode: creative.type === 'VIDEO' ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE',
        ad_format: creative.type,
        landing_page_url: creative.landing_page_url,
        creative: {
            ad_text: creative.primary_text
        },
        status: mappings.status_mapping[adgroupStatus]
    };

    if (creative.type === 'VIDEO' && creative.video_asset_id) {
        translated.creative.video_id = creative.video_asset_id;
    }

    if (creative.type === 'IMAGE' && creative.image_asset_id) {
        translated.creative.image_id = creative.image_asset_id;
    }

    if (creative.call_to_action) {
        translated.creative.call_to_action = creative.call_to_action;
    }

    return sortObjectKeys(translated);
}

// --- Main Execute Function ---

async function executeTikTokLogic(input) {
    const execution_id = input?.execution_id || 'unknown';

    try {
        // 1. Feature Flag Check
        const featureFlagEnabled = process.env.FF_TIKTOK_ADS_LOGIC_LAYER === 'true';
        if (!featureFlagEnabled) {
            return createErrorEnvelope(
                'TIKTOK_LOGIC_FEATURE_DISABLED',
                'TikTok Ads Logic Layer disabled',
                execution_id,
                input?.mode || 'LIVE',
                input?.iteration_index || 0
            );
        }

        // 2. Shallow Validate Envelope Structure
        let error = validateRequiredRoots(input, execution_id);
        if (error) return error;

        error = validateTenant(input.tenant, execution_id);
        if (error) return error;

        // 3. Load Mapping Tables
        let mappings;
        try {
            mappings = resolveTikTokMappings();
            if (!mappings || !mappings.objectives || !mappings.optimization_goals) {
                return createErrorEnvelope(
                    'TIKTOK_MAPPING_ERROR',
                    'Failed to load TikTok mapping tables',
                    execution_id,
                    input.mode,
                    input.iteration_index
                );
            }
        } catch (e) {
            return createErrorEnvelope(
                'TIKTOK_MAPPING_ERROR',
                `Mapping resolution failed: ${e.message}`,
                execution_id,
                input.mode,
                input.iteration_index
            );
        }

        // 4. Validate request structure
        error = validateRequest(input.request, execution_id);
        if (error) return error;

        // 5. Validate creatives
        error = validateCreatives(input.request.creatives, execution_id);
        if (error) return error;

        // 6. Deep Validate TikTokLogicInputV1
        error = validateCampaign(input.request.campaign, execution_id, mappings);
        if (error) return error;

        error = validateAdgroups(input.request.adgroups, input.request.creatives, execution_id, mappings);
        if (error) return error;

        // 7. Map to TikTok API Shapes (all validations complete)
        const clonedRequest = deepClone(input.request);

        const rawCampaign = translateCampaign(clonedRequest.campaign, mappings);

        // Sort adgroups by name
        const sortedAdgroups = clonedRequest.adgroups.slice().sort((a, b) => a.name.localeCompare(b.name));
        const rawAdgroups = sortedAdgroups.map(adgroup => translateAdgroup(adgroup, mappings));

        // Generate ads (one per adgroup × creative)
        const rawAds = [];
        for (const adgroup of sortedAdgroups) {
            const sortedCreativeIds = sortArrayLexicographically(adgroup.creatives.slice());
            for (const creativeId of sortedCreativeIds) {
                const creative = clonedRequest.creatives[creativeId];
                if (creative) {
                    const ad = translateAd(adgroup.name, adgroup.status, creative, creativeId, mappings);
                    rawAds.push(ad);
                }
            }
        }

        // Sort ads by ad_name
        rawAds.sort((a, b) => a.ad_name.localeCompare(b.ad_name));

        const raw_request = sortObjectKeys({
            campaign: rawCampaign,
            adgroups: rawAdgroups,
            ads: rawAds
        });

        const normalized_request = sortObjectKeys(deepClone(clonedRequest));

        // 8. Construct Phase49ConnectorInputV1
        const connector_input = {
            ok: true,
            code: 'OK',
            connector_key: 'tiktok_ads',
            mode: input.mode,
            execution_id: input.execution_id,
            iteration_index: input.iteration_index,
            request: {
                raw_request: deepFreeze(raw_request),
                normalized_request: deepFreeze(normalized_request)
            },
            meta: {
                input_contract_version: 'TikTokLogicInputV1',
                output_contract_version: 'Phase49ConnectorInputV1'
            }
        };

        if (input.meta?.snapshot_id) {
            connector_input.meta.snapshot_id = input.meta.snapshot_id;
        }

        if (input.meta?.trace_domain) {
            connector_input.meta.trace_domain = input.meta.trace_domain;
        }

        return deepFreeze(connector_input);

    } catch (e) {
        return createErrorEnvelope(
            'TIKTOK_INTERNAL_ERROR',
            `Internal error: ${e.message}`,
            execution_id,
            input?.mode || 'LIVE',
            input?.iteration_index || 0
        );
    }
}

module.exports = {
    executeTikTokLogic
};
