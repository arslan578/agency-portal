/**
 * Platform Payload Engine (Phase 11)
 *
 * Transforms a deterministic VenueExecutionPlan (Phase 10) into a PlatformPayloadBundle.
 *
 * Constraints:
 * - No external IO
 * - No randomness
 * - No platform SDKs
 * - Strict adherence to the spec
 */

const PLATFORM_FLAVORS = {
    youtube: {
        hierarchy: "CAMPAIGN_ADGROUP_AD",
        needs_ad_group: true,
        supports_multiple_creatives: true,
        supported_aspect_ratios: ["16:9", "9:16", "1:1"],
        recommended_creative_counts: { video: 2, image: 0, text: 2 },
        naming_constraints: {
            max_length: 128,
            safe_character_pattern: "^[a-zA-Z0-9 _\\-]+$"
        },
        notes: ["Video first venue", "Shorts support vertical 9:16"]
    },
    meta: {
        hierarchy: "CAMPAIGN_ADSET_AD",
        needs_ad_group: true,
        supports_multiple_creatives: true,
        supported_aspect_ratios: ["1:1", "4:5", "9:16"],
        recommended_creative_counts: { video: 1, image: 2, text: 3 },
        naming_constraints: {
            max_length: 512,
            safe_character_pattern: "^[a-zA-Z0-9 _\\-]+$"
        },
        notes: ["Campaign, ad set, ad pattern", "Supports many placements"]
    },
    tiktok: {
        hierarchy: "CAMPAIGN_ADGROUP_AD",
        needs_ad_group: true,
        supports_multiple_creatives: true,
        supported_aspect_ratios: ["9:16"],
        recommended_creative_counts: { video: 2, image: 0, text: 2 },
        naming_constraints: {
            max_length: 255,
            safe_character_pattern: "^[a-zA-Z0-9 _\\-]+$"
        },
        notes: ["Vertical video primary", "Short form focus"]
    },
    reddit: {
        hierarchy: "CAMPAIGN_ADGROUP_AD",
        needs_ad_group: true,
        supports_multiple_creatives: true,
        supported_aspect_ratios: ["1:1", "4:5"],
        recommended_creative_counts: { video: 1, image: 2, text: 2 },
        naming_constraints: {
            max_length: 300,
            safe_character_pattern: "^[a-zA-Z0-9 _\\-]+$"
        },
        notes: ["Community driven inventory"]
    },
    google_display: {
        hierarchy: "CAMPAIGN_LINEITEM_CREATIVE",
        needs_ad_group: false,
        supports_multiple_creatives: true,
        supported_aspect_ratios: ["1:1", "1.91:1"],
        recommended_creative_counts: { video: 0, image: 3, text: 3 },
        naming_constraints: {
            max_length: 90,
            safe_character_pattern: "^[a-zA-Z0-9 _\\-]+$"
        },
        notes: ["Display and responsive inventory"]
    }
};

const DEFAULT_FLAVOR = {
    hierarchy: "SINGLE_LEVEL",
    needs_ad_group: false,
    supports_multiple_creatives: true,
    supported_aspect_ratios: [],
    recommended_creative_counts: { video: 1, image: 1, text: 1 },
    naming_constraints: {
        max_length: 255,
        safe_character_pattern: "^[a-zA-Z0-9 _\\-]+$"
    },
    notes: ["Generic flavor, unknown venue"]
};

/**
 * Builds the PlatformPayloadBundle from the input.
 *
 * @param {object} input - The input object containing venue_execution_plan.
 * @returns {Promise<object>} - The orchestrator envelope.
 */
async function buildPlatformPayloads(input) {
    // 1. Validation
    if (!input || typeof input !== "object") {
        return createErrorEnvelope("INVALID_INPUT", "Input must be an object");
    }

    if (!input.venue_execution_plan) {
        return createErrorEnvelope("INVALID_INPUT", "Missing venue_execution_plan");
    }

    const { venue_execution_plan } = input;

    if (!Array.isArray(venue_execution_plan.venues) || venue_execution_plan.venues.length === 0) {
        return createErrorEnvelope("NO_VENUES", "Venues array is missing or empty");
    }

    try {
        // 2. Build bundle root
        const payload = {
            brand_id: venue_execution_plan.brand_id,
            campaign_goal: { ...venue_execution_plan.campaign_goal },
            currency: venue_execution_plan.currency,
            total_budget: venue_execution_plan.total_budget,
            venues: [],
            meta: {
                source_phase: 11,
                source_modules: ["venue_planner", "platform_payload_engine"],
                orchestrator_run_id: input.meta?.orchestrator_run_id || null,
                generated_at: new Date().toISOString(),
                input_version: "VENUE_EXECUTION_PLAN_V1",
                output_version: "PLATFORM_PAYLOAD_BUNDLE_V1"
            }
        };

        // 3. Build each PlatformVenuePayload
        venue_execution_plan.venues.forEach((venue, i) => {
            // Build spend
            const spendInput = venue.spend || {};
            const allocated = typeof spendInput.allocated === "number" ? spendInput.allocated : 0;
            const share = typeof spendInput.share === "number" ? spendInput.share : 0;

            const spend = {
                allocated,
                share,
                currency: venue_execution_plan.currency || null
            };

            // Build audience
            const hint = typeof venue.audience_hint === "undefined" ? null : venue.audience_hint;
            let segmentation_confidence = "LOW";
            if (hint && hint.meta && hint.meta.high_intent === true) {
                segmentation_confidence = "HIGH";
            } else if (hint) {
                segmentation_confidence = "MEDIUM";
            }

            // Build creative requirements
            const req = venue.creative_requirements || {};
            const requirements = {
                requires_video: !!req.requires_video,
                requires_vertical_video: !!req.requires_vertical_video,
                requires_image: !!req.requires_image,
                requires_short_form: !!req.requires_short_form
            };

            // Build creative recommended slots
            let recommended = { video: 1, image: 1, text: 2 };
            if (venue.role === "PRIMARY") {
                recommended.video = 2;
                recommended.text = 3;
            }
            if (venue.role === "REMARKETING") {
                recommended.image = 2;
            }

            // Build platform flavor
            const flavorConfig = PLATFORM_FLAVORS[venue.venue_key] || DEFAULT_FLAVOR;
            const platform_flavor = {
                hierarchy: flavorConfig.hierarchy,
                needs_ad_group: flavorConfig.needs_ad_group,
                supports_multiple_creatives: flavorConfig.supports_multiple_creatives,
                supported_aspect_ratios: flavorConfig.supported_aspect_ratios.slice(),
                recommended_creative_counts: { ...flavorConfig.recommended_creative_counts },
                naming_constraints: { ...flavorConfig.naming_constraints },
                notes: flavorConfig.notes.slice()
            };

            const venuePayload = {
                venue_key: venue.venue_key,
                role: venue.role,
                priority: venue.priority,
                objective: venue.objective,
                primary_kpi: venue.primary_kpi,
                spend: spend,
                abstract_structure: {
                    campaign_intent: {
                        type: venue_execution_plan.campaign_goal.type,
                        objective: venue.objective,
                        primary_kpi: venue.primary_kpi,
                        role: venue.role
                    },
                    budget: {
                        allocated: allocated,
                        share: share,
                        currency: venue_execution_plan.currency || null
                    },
                    audience: {
                        hint: hint,
                        segmentation_confidence: segmentation_confidence
                    },
                    creative: {
                        requirements: requirements,
                        recommended_slots: recommended
                    },
                    pacing: {
                        strategy: "STANDARD",
                        notes: []
                    }
                },
                platform_flavor: platform_flavor,
                meta: {
                    source_phase: 11,
                    from_venue_index: i,
                    from_venue_key: venue.venue_key,
                    generated_at: new Date().toISOString()
                }
            };

            payload.venues.push(venuePayload);
        });

        return createSuccessEnvelope(payload);

    } catch (error) {
        return createErrorEnvelope("INTERNAL_ERROR", error.message);
    }
}

// Helper to create success envelope
function createSuccessEnvelope(payload) {
    return {
        ok: true,
        module: "platform_payload_engine",
        timestamp: new Date().toISOString(),
        payload: payload
    };
}

// Helper to create error envelope
function createErrorEnvelope(code, message) {
    return {
        ok: false,
        module: "platform_payload_engine",
        timestamp: new Date().toISOString(),
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { buildPlatformPayloads };
