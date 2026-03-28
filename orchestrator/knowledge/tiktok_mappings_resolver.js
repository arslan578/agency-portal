/**
 * TikTok Ads Mapping Resolver
 * 
 * Returns all mapping tables for TikTok ads validation and translation.
 * No hardcoded rules in the logic engine - all mappings centralized here.
 */

function resolveTikTokMappings() {
    return {
        objectives: {
            'CONVERSIONS': 'CONVERSIONS',
            'TRAFFIC': 'TRAFFIC',
            'APP_PROMOTION': 'APP_PROMOTION',
            'LEAD_GENERATION': 'LEAD_GENERATION',
            'REACH': 'REACH',
            'VIDEO_VIEWS': 'VIDEO_VIEWS',
            'ENGAGEMENT': 'ENGAGEMENT'
        },
        optimization_goals: {
            'CLICK': 'CLICK',
            'CONVERSION': 'CONVERSION',
            'REACH': 'REACH',
            'VIDEO_VIEW': 'VIDEO_VIEW',
            'ENGAGEMENT': 'ENGAGEMENT',
            'INSTALL': 'INSTALL'
        },
        billing_events: {
            'CPC': 'CPC',
            'CPM': 'CPM',
            'OCPM': 'OCPM',
            'CPV': 'CPV'
        },
        placements: {
            'AUTOMATIC': ['PLACEMENT_TIKTOK', 'PLACEMENT_PANGLE'],
            'TIKTOK_ONLY': ['PLACEMENT_TIKTOK'],
            'PANGLE_ONLY': ['PLACEMENT_PANGLE']
        },
        disallowed_fields: {
            targeting: ['custom_audiences', 'lookalike_audiences', 'excluded_custom_audiences'],
            adgroup: [],
            campaign: []
        },
        allowed_targeting_fields: [
            'geo',
            'age',
            'genders',
            'interests',
            'behaviors',
            'os_types',
            'device_types',
            'languages'
        ],
        status_mapping: {
            'ACTIVE': 'ENABLE',
            'PAUSED': 'DISABLE',
            'DRAFT': 'DISABLE'
        },
        budget_mode_mapping: {
            'DAILY': 'BUDGET_MODE_DAY',
            'LIFETIME': 'BUDGET_MODE_TOTAL'
        },
        gender_mapping: {
            'MALE': 'GENDER_MALE',
            'FEMALE': 'GENDER_FEMALE',
            'UNKNOWN': 'GENDER_UNLIMITED'
        },
        bid_strategy_mapping: {
            // Fill with known safe values as needed
            // Currently empty - will validate as error if provided
        },
        placement_type_mapping: {
            'AUTOMATIC': 'PLACEMENT_TYPE_AUTOMATIC',
            'TIKTOK_ONLY': 'PLACEMENT_TYPE_MANUAL',
            'PANGLE_ONLY': 'PLACEMENT_TYPE_MANUAL'
        }
    };
}

function resolveGender(targetingGenders, gender_mapping) {
    if (!Array.isArray(targetingGenders) || targetingGenders.length === 0) {
        return undefined;
    }
    if (targetingGenders.length === 1) {
        return gender_mapping[targetingGenders[0]] || 'GENDER_UNLIMITED';
    }
    // For mixed gender combinations, including UNKNOWN, we standardize to GENDER_UNLIMITED
    return 'GENDER_UNLIMITED';
}

module.exports = {
    resolveTikTokMappings,
    resolveGender
};
