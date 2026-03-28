/**
 * Connector Contracts Engine (Phase 19)
 *
 * Validates and normalizes execution submission bundles for platform connectors.
 * Pure logic, deterministic, no IO.
 */

// Default retry policy
const DEFAULT_RETRY_POLICY = {
    strategy: "LINEAR_BACKOFF",
    max_attempts: 3,
    initial_delay_ms: 1000,
    max_delay_ms: 30000
};

/**
 * Runs connector contract validation and normalization.
 *
 * @param {object} input - ExecutionSubmissionBundleInput
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run(input) {
    const timestamp = new Date().toISOString();

    // 1. Validate input presence and shape
    if (!input || typeof input !== 'object') {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Input must be an object");
    }

    if (!input.submission_id || typeof input.submission_id !== 'string') {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing or invalid submission_id");
    }

    if (!input.brand_id || typeof input.brand_id !== 'string') {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "Missing or invalid brand_id");
    }

    if (!Array.isArray(input.venues)) {
        return createErrorEnvelope(timestamp, "INVALID_INPUT", "venues must be an array");
    }

    // C. Top-level venue presence check when can_launch === true
    if (input.readiness && input.readiness.can_launch && input.venues.length === 0) {
        return createErrorEnvelope(
            timestamp,
            "INVALID_INPUT",
            "readiness.can_launch is true but venues array is empty"
        );
    }

    try {
        // 2. Initialize report
        let total_error_count = 0;
        let total_warning_count = 0;
        let total_unit_count = 0;

        const venue_contracts = [];

        // 3. Process each venue
        for (let vIdx = 0; vIdx < input.venues.length; vIdx++) {
            const venue = input.venues[vIdx];
            const venueContract = processVenue(venue, vIdx, input.currency);

            total_error_count += venueContract.errors.length;
            total_warning_count += venueContract.warnings.length;
            total_unit_count += venueContract.units.length;

            // Count unit-level errors/warnings
            for (const unit of venueContract.units) {
                total_error_count += unit.errors.length;
                total_warning_count += unit.warnings.length;
            }

            venue_contracts.push(venueContract);
        }

        // 4. Compute global connector readiness
        const is_connector_ready = venue_contracts.every(v =>
            v.status === "READY" &&
            v.can_submit &&
            v.errors.length === 0 &&
            v.units.every(u => u.is_connector_ready)
        ) && total_error_count === 0;

        const report = {
            is_connector_ready,
            summary: {
                venue_count: input.venues.length,
                unit_count: total_unit_count,
                error_count: total_error_count,
                warning_count: total_warning_count
            },
            venues: venue_contracts
        };

        return {
            ok: true,
            module: "connector_contracts_engine",
            timestamp,
            payload: {
                bundle: input,
                connector_contracts: report
            }
        };

    } catch (error) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", error.message);
    }
}

/**
 * Processes a single venue.
 */
function processVenue(venue, venueIndex, globalCurrency) {
    const errors = [];
    const warnings = [];

    // Validate required fields
    if (!venue.venue_key || typeof venue.venue_key !== 'string') {
        errors.push({
            level: "ERROR",
            code: "MISSING_FIELD",
            message: "venue_key is required",
            path: `venues[${venueIndex}].venue_key`
        });
    }

    // Normalize connector_key
    const connector_key = normalizeConnectorKey(venue.venue_key || "");
    if (connector_key === "UNKNOWN") {
        warnings.push({
            level: "WARNING",
            code: "UNKNOWN_CONNECTOR_KEY",
            message: `Unknown venue_key: ${venue.venue_key}`,
            path: `venues[${venueIndex}].venue_key`
        });
    }

    // Normalize objective
    const normalized_objective = normalizeObjective(venue.objective || "", venue.venue_key || "");
    if (normalized_objective === "CUSTOM") {
        warnings.push({
            level: "WARNING",
            code: "UNMAPPED_OBJECTIVE",
            message: `Objective "${venue.objective}" mapped to CUSTOM`,
            path: `venues[${venueIndex}].objective`
        });
    }

    // Normalize currency
    const normalized_currency = normalizeCurrency(venue.budget?.currency || globalCurrency);

    // Validate budget
    const allocated = venue.budget?.allocated;
    if (typeof allocated !== 'number' || !isFinite(allocated)) {
        errors.push({
            level: "ERROR",
            code: "INVALID_BUDGET",
            message: "budget.allocated must be a finite number",
            path: `venues[${venueIndex}].budget.allocated`
        });
    } else if (allocated < 0) {
        errors.push({
            level: "ERROR",
            code: "NEGATIVE_BUDGET",
            message: `budget.allocated cannot be negative: ${allocated}`,
            path: `venues[${venueIndex}].budget.allocated`
        });
    }

    // Validate units
    const units = Array.isArray(venue.units) ? venue.units : [];
    if (venue.can_submit && venue.status === "READY" && units.length === 0) {
        errors.push({
            level: "ERROR",
            code: "MISSING_UNITS_FOR_VENUE",
            message: "Venue is READY but has no units",
            path: `venues[${venueIndex}].units`
        });
    }

    // Process units
    const unit_contracts = units.map((unit, uIdx) =>
        processUnit(unit, venueIndex, uIdx, venue.venue_key || "", connector_key)
    );

    // B. Optional unit_index validation (detect duplicates)
    const indexSeen = new Map();
    for (const unit of unit_contracts) {
        if (indexSeen.has(unit.unit_index)) {
            errors.push({
                level: "ERROR",
                code: "DUPLICATE_UNIT_INDEX",
                message: `Duplicate unit_index ${unit.unit_index} in venue ${venue.venue_key}`,
                path: `venues[${venueIndex}].units`
            });
        } else {
            indexSeen.set(unit.unit_index, true);
        }
    }

    // Determine venue can_submit (overridden if contract fails)
    let final_can_submit = venue.can_submit || false;
    if (errors.length > 0) {
        final_can_submit = false;
    }

    // D. Derived per-venue connector_ready flag
    const is_connector_ready =
        (venue.status === "READY") &&
        final_can_submit &&
        errors.length === 0 &&
        unit_contracts.every(u => u.is_connector_ready);

    return {
        venue_key: venue.venue_key || "",
        role: venue.role || "SUPPORTING",
        objective: venue.objective || "",
        status: venue.status || "BLOCKED",
        can_submit: final_can_submit,
        is_connector_ready,
        connector_key,
        normalized_objective,
        normalized_currency,
        schedule: {
            start_date: venue.schedule?.start_date || null,
            end_date: venue.schedule?.end_date || null,
            timezone: venue.schedule?.timezone || null
        },
        units: unit_contracts,
        retry_policy: { ...DEFAULT_RETRY_POLICY },
        errors,
        warnings
    };
}

/**
 * Processes a single unit.
 */
function processUnit(unit, venueIndex, unitIndex, venue_key, connector_key) {
    const errors = [];
    const warnings = [];
    const missing_fields = [];

    // Validate required fields
    if (!unit.unit_id || typeof unit.unit_id !== 'string') {
        missing_fields.push("unit_id");
        errors.push({
            level: "ERROR",
            code: "MISSING_REQUIRED_FIELD",
            message: "unit_id is required",
            path: `venues[${venueIndex}].units[${unitIndex}].unit_id`
        });
    }

    if (!unit.creative_ref || typeof unit.creative_ref !== 'string') {
        missing_fields.push("creative_ref");
        errors.push({
            level: "ERROR",
            code: "MISSING_REQUIRED_FIELD",
            message: "creative_ref is required",
            path: `venues[${venueIndex}].units[${unitIndex}].creative_ref`
        });
    }

    if (!unit.audience_ref || typeof unit.audience_ref !== 'string') {
        missing_fields.push("audience_ref");
        errors.push({
            level: "ERROR",
            code: "MISSING_REQUIRED_FIELD",
            message: "audience_ref is required",
            path: `venues[${venueIndex}].units[${unitIndex}].audience_ref`
        });
    }

    // A. Compute effective_bid (preserve raw bid value)
    const bid = unit.bid;
    const effective_bid =
        typeof bid === "number" && isFinite(bid) && bid > 0
            ? bid
            : null;

    const is_connector_ready = missing_fields.length === 0 && errors.length === 0;

    return {
        unit_id: unit.unit_id || "",
        unit_index: unit.unit_index != null ? unit.unit_index : 0,
        venue_key,
        connector_key,
        audience_ref: unit.audience_ref || null,
        creative_ref: unit.creative_ref || null,
        bid: bid === undefined ? null : bid,
        effective_bid,
        schedule: {
            start_date: unit.schedule?.start_date || null,
            end_date: unit.schedule?.end_date || null,
            timezone: unit.schedule?.timezone || null
        },
        is_connector_ready,
        missing_fields,
        errors,
        warnings
    };
}

/**
 * Normalizes venue_key to connector_key.
 */
function normalizeConnectorKey(venue_key) {
    const lower = venue_key.toLowerCase().trim();

    switch (lower) {
        case "meta":
        case "facebook":
        case "instagram":
            return "META_ADS";
        case "google":
        case "google_ads":
        case "youtube":
        case "gdisplay":
            return "GOOGLE_ADS";
        case "tiktok":
            return "TIKTOK_ADS";
        case "roku":
            return "ROKU_ADS";
        case "reddit":
            return "REDDIT_ADS";
        case "x":
        case "twitter":
            return "X_ADS";
        case "spotify":
            return "SPOTIFY_ADS";
        default:
            return "UNKNOWN";
    }
}

/**
 * Normalizes objective to standard labels.
 */
function normalizeObjective(objective, venue_key) {
    const normalized = objective.trim().toUpperCase();

    switch (normalized) {
        case "AWARENESS":
        case "REACH":
            return "AWARENESS";
        case "TRAFFIC":
        case "CLICKS":
            return "TRAFFIC";
        case "LEADS":
        case "LEAD_GEN":
            return "LEADS";
        case "SALES":
        case "CONVERSIONS":
        case "PURCHASE":
            return "SALES";
        default:
            return "CUSTOM";
    }
}

/**
 * Normalizes currency to uppercase.
 */
function normalizeCurrency(cur) {
    if (!cur) return null;
    const upper = String(cur).trim().toUpperCase();
    if (!upper) return null;
    return upper;
}

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "connector_contracts_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = { run };
