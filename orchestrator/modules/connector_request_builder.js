/**
 * Connector Request Builder Engine (Phase 20)
 *
 * Builds platform-specific request payloads without IO.
 * Pure logic, deterministic, no network calls.
 */

/**
 * Main entry point for Phase 20.
 *
 * @param {object} payload - Phase 19 output
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run(payload) {
    const timestamp = new Date().toISOString();

    // 1. Input Validation
    if (!payload || typeof payload !== "object") {
        return createErrorEnvelope(
            timestamp,
            "INVALID_INPUT",
            "Phase 20 requires payload with plan, readiness, validation, policy, connector_contracts"
        );
    }

    if (
        !payload.connector_contracts ||
        !Array.isArray(payload.connector_contracts.venues)
    ) {
        return createErrorEnvelope(
            timestamp,
            "INVALID_INPUT",
            "connector_contracts.venues must be an array"
        );
    }

    try {
        // 2. Build requests for each venue
        const connector_requests_venues =
            payload.connector_contracts.venues.map((venue) =>
                buildVenueRequest(venue)
            );

        return {
            ok: true,
            module: "connector_request_builder",
            timestamp,
            payload: {
                plan: payload.plan,
                readiness: payload.readiness,
                validation: payload.validation,
                policy: payload.policy,
                connector_contracts: payload.connector_contracts,
                connector_requests: {
                    venues: connector_requests_venues
                }
            }
        };
    } catch (error) {
        return createErrorEnvelope(
            timestamp,
            "INTERNAL_ERROR",
            error.message || "Unknown error in connector_request_builder"
        );
    }
}

/**
 * Builds a ConnectorVenueRequest for a single venue.
 */
function buildVenueRequest(venue) {
    const errors = [];
    const warnings = [];

    // Base fields
    const venue_key = venue.venue_key || "";
    const is_connector_ready = venue.is_connector_ready || false;
    const can_submit = venue.can_submit || false;

    // Derive platform_kind
    const platform_kind = derivePlatformKind(venue);

    // Debug fields pulled from real Phase 19 contract
    const debug = {
        objective_normalized:
            venue.objective && venue.objective.normalized_type
                ? venue.objective.normalized_type
                : null,
        raw_bid: venue.raw_bid ?? null,
        effective_bid: venue.effective_bid ?? null,
        currency: venue.currency ?? null
    };

    // Determine can_build_request and status
    let can_build_request = false;
    let status = "SKIPPED";
    let requests = { primary: null, secondary: [] };

    if (!is_connector_ready || !can_submit) {
        // Not ready, skip
        can_build_request = false;
        status = "SKIPPED";
        warnings.push({
            code: "NOT_READY",
            message: `Venue ${venue_key} is not connector ready or cannot submit`
        });
    } else {
        // Attempt to build platform request
        const buildResult = buildPlatformRequest(venue, platform_kind);

        errors.push(...buildResult.errors);
        warnings.push(...buildResult.warnings);

        if (buildResult.primary !== null) {
            can_build_request = true;
            status = "READY";
            requests = {
                primary: buildResult.primary,
                secondary: buildResult.secondary
            };
        } else {
            can_build_request = false;
            status = "ERROR";
        }
    }

    return {
        venue_key,
        platform_kind,
        is_connector_ready,
        can_build_request,
        status,
        errors,
        warnings,
        requests,
        debug
    };
}

/**
 * Derives platform_kind from venue.
 * Prefers objective.platform_kind, falls back to venue_key heuristics.
 */
function derivePlatformKind(venue) {
    // Prefer objective.platform_kind if present
    if (venue.objective && venue.objective.platform_kind) {
        return venue.objective.platform_kind;
    }

    // Derive from venue_key
    const vk = (venue.venue_key || "").toLowerCase();

    if (
        vk.includes("meta") ||
        vk.includes("facebook") ||
        vk.includes("instagram")
    ) {
        return "META";
    }
    if (
        vk.includes("google") ||
        vk.includes("youtube") ||
        vk.includes("gdisplay")
    ) {
        return "GOOGLE_ADS";
    }
    if (vk.includes("tiktok")) {
        return "TIKTOK";
    }

    return "GENERIC";
}

/**
 * Routes to platform-specific builder.
 */
function buildPlatformRequest(venue, platform_kind) {
    switch (platform_kind) {
        case "META":
            return buildMetaRequest(venue);
        case "GOOGLE_ADS":
            return buildGoogleAdsRequest(venue);
        case "TIKTOK":
            return buildTikTokRequest(venue);
        default:
            return buildGenericPassThroughRequest(venue);
    }
}

/**
 * Common helpers for Phase 19 contract fields.
 */

function getObjectiveNormalized(venue) {
    return venue.objective && venue.objective.normalized_type
        ? venue.objective.normalized_type
        : null;
}

function getBudgetTotalMinor(venue) {
    // Phase 19 budget field
    return venue.budget_total_minor ?? null;
}

function getSchedule(venue) {
    const sched = venue.schedule || null;
    return {
        start_time: sched && sched.start_time ? sched.start_time : null,
        end_time: sched && sched.end_time ? sched.end_time : null
    };
}

/**
 * Builds Meta-style request.
 */
function buildMetaRequest(venue) {
    const errors = [];
    const warnings = [];

    const objective_normalized = getObjectiveNormalized(venue);
    const budget_total_minor = getBudgetTotalMinor(venue);
    const schedule = getSchedule(venue);

    if (!objective_normalized) {
        errors.push({
            code: "MISSING_OBJECTIVE",
            message: "Meta request requires objective.normalized_type"
        });
    }

    if (budget_total_minor === null || budget_total_minor === undefined) {
        errors.push({
            code: "MISSING_BUDGET",
            message: "Meta request requires budget_total_minor"
        });
    }

    // If requirements fail, return null primary
    if (errors.length > 0) {
        return { primary: null, secondary: [], errors, warnings };
    }

    const primary = {
        account_id: venue.meta?.account_id || null,
        campaign: {
            name: `Campaign_${venue.venue_key}`,
            objective: objective_normalized
        },
        ad_set: {
            daily_budget_minor: budget_total_minor,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            bid_amount_minor: venue.effective_bid ?? null
        },
        targeting: venue.audience || null,
        creative: venue.creative || null,
        tracking: venue.tracking || null
    };

    return { primary, secondary: [], errors, warnings };
}

/**
 * Builds Google Ads-style request.
 */
function buildGoogleAdsRequest(venue) {
    const errors = [];
    const warnings = [];

    const objective_normalized = getObjectiveNormalized(venue);
    const budget_total_minor = getBudgetTotalMinor(venue);
    const schedule = getSchedule(venue);

    if (!objective_normalized) {
        errors.push({
            code: "MISSING_OBJECTIVE",
            message: "Google Ads request requires objective.normalized_type"
        });
    }

    if (budget_total_minor === null || budget_total_minor === undefined) {
        errors.push({
            code: "MISSING_BUDGET",
            message: "Google Ads request requires budget_total_minor"
        });
    }

    if (errors.length > 0) {
        return { primary: null, secondary: [], errors, warnings };
    }

    const primary = {
        customer_id: venue.meta?.customer_id || null,
        campaign: {
            name: `Campaign_${venue.venue_key}`,
            objective: objective_normalized,
            budget_minor: budget_total_minor,
            start_date: schedule.start_time,
            end_date: schedule.end_time
        },
        ad_group: {
            cpc_bid_minor: venue.effective_bid ?? null
        },
        targeting: venue.audience || null,
        creative: venue.creative || null,
        tracking: venue.tracking || null
    };

    return { primary, secondary: [], errors, warnings };
}

/**
 * Builds TikTok-style request.
 */
function buildTikTokRequest(venue) {
    const errors = [];
    const warnings = [];

    const objective_normalized = getObjectiveNormalized(venue);
    const budget_total_minor = getBudgetTotalMinor(venue);
    const schedule = getSchedule(venue);

    if (!objective_normalized) {
        errors.push({
            code: "MISSING_OBJECTIVE",
            message: "TikTok request requires objective.normalized_type"
        });
    }

    if (budget_total_minor === null || budget_total_minor === undefined) {
        errors.push({
            code: "MISSING_BUDGET",
            message: "TikTok request requires budget_total_minor"
        });
    }

    if (errors.length > 0) {
        return { primary: null, secondary: [], errors, warnings };
    }

    const primary = {
        advertiser_id: venue.meta?.advertiser_id || null,
        campaign: {
            objective: objective_normalized,
            budget_minor: budget_total_minor
        },
        ad_group: {
            bid_minor: venue.effective_bid ?? null,
            start_time: schedule.start_time,
            end_time: schedule.end_time
        },
        targeting: venue.audience || null,
        creative: venue.creative || null,
        tracking: venue.tracking || null
    };

    return { primary, secondary: [], errors, warnings };
}

/**
 * Builds generic pass-through request.
 */
function buildGenericPassThroughRequest(venue) {
    const errors = [];
    const warnings = [];

    const schedule = getSchedule(venue);

    const primary = {
        venue_key: venue.venue_key || "",
        budget_total_minor: getBudgetTotalMinor(venue),
        currency: venue.currency ?? null,
        objective: venue.objective ?? null,
        audience: venue.audience || null,
        creative: venue.creative || null,
        tracking: venue.tracking || null,
        schedule,
        meta: venue.meta || null
    };

    return { primary, secondary: [], errors, warnings };
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "connector_request_builder",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { run };
