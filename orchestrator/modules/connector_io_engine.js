/**
 * Universal IO Connector Interface (Phases 21A–21D)
 *
 * Phase 21A implements the abstract connector interface, deterministic routing,
 * and non-IO execution skeleton.
 *
 * Later phases extend this module:
 *   - Phase 21B: Google Ads connector (IO-ready via injected http_client)
 *   - Phase 21C: Deterministic configuration injection layer
 *   - Phase 21D: Meta connector (IO-ready via injected http_client)
 *
 * IMPORTANT:
 * This module performs no real network IO unless an http_client is supplied
 * through injected configuration. Phase 21A remains pure logic; IO behavior
 * originates only from later phases and only when http_client is provided.
 */

/**
 * Main entry point for Phase 21A.
 *
 * @param {object} payload - Phase 20 output
 * @param {object} injectedConfig - Optional config injection (Phase 21C)
 * @returns {Promise<object>} - The orchestrator envelope
 */
async function run(payload, injectedConfig = {}) {
    const timestamp = new Date().toISOString();

    // 1. Input Validation
    if (!payload || typeof payload !== 'object') {
        return createErrorEnvelope(timestamp, "INVALID_INPUT",
            "Phase 21A requires payload with plan, readiness, validation, policy, connector_contracts, connector_requests");
    }

    if (!payload.connector_requests || !Array.isArray(payload.connector_requests.venues)) {
        return createErrorEnvelope(timestamp, "INVALID_INPUT",
            "connector_requests.venues must be an array");
    }

    try {
        // 2. Execute connectors for each venue
        const venue_results = await Promise.all(
            payload.connector_requests.venues.map(venueRequest =>
                executeVenue(venueRequest, injectedConfig, payload.connector_contracts)
            )
        );

        return {
            ok: true,
            module: "connector_io_engine",
            timestamp,
            payload: {
                venues: venue_results
            }
        };

    } catch (error) {
        return createErrorEnvelope(timestamp, "INTERNAL_ERROR", error.message);
    }
}

/**
 * Executes connector logic for a single venue.
 */
async function executeVenue(venueRequest, injectedConfig = {}, connector_contracts = {}) {
    const venue_key = venueRequest.venue_key || "";
    const platform_kind = venueRequest.platform_kind || "GENERIC";

    // Default result shape
    const result = {
        venue_key,
        platform_kind,
        request: venueRequest.requests?.primary || null,
        status: "SKIPPED",
        http_status: null,
        response_body: null,
        errors: [],
        warnings: []
    };

    // 1. Check if we should skip
    if (!venueRequest.can_build_request || venueRequest.status !== "READY") {
        result.status = "SKIPPED";
        result.warnings.push({
            code: "SKIPPED_NOT_READY",
            message: `Venue ${venue_key} skipped because it is not READY`
        });
        return result;
    }

    // 2. Get Connector Class
    const ConnectorClass = getConnectorClass(platform_kind);

    try {
        // 3. Build Merged Config (Phase 21C)
        const platformConfig = injectedConfig.global_connector_config?.[platform_kind] || {};
        const venueConfig = findVenueContractConfig(venue_key, connector_contracts);
        const mergedConfig = buildConnectorConfig(platformConfig, venueConfig, injectedConfig.http_client);

        // 4. Instantiate and Execute
        const connector = new ConnectorClass(mergedConfig);
        const executionResult = await connector.execute(venueRequest.requests.primary);

        // 5. Map result
        result.status = "READY"; // In Phase 21A we only go to READY, execution is stubbed
        result.http_status = executionResult.http_status;
        result.response_body = executionResult.response_body;
        result.errors = executionResult.errors;
        result.warnings = executionResult.warnings;

    } catch (error) {
        result.status = "FAILED";
        result.errors.push({
            code: "CONNECTOR_EXECUTION_ERROR",
            message: error.message
        });
    }

    return result;
}

/**
 * Helper: Find venue-level config from connector contracts
 */
function findVenueContractConfig(venue_key, connector_contracts) {
    if (!connector_contracts || !Array.isArray(connector_contracts.venues)) {
        return {};
    }
    const venueContract = connector_contracts.venues.find(v => v.venue_key === venue_key);
    return venueContract?.meta || {};
}

/**
 * Helper: Build deterministic merged config
 */
function buildConnectorConfig(globalConfig, venueConfig, httpClient) {
    return {
        ...globalConfig,
        ...venueConfig,
        http_client: httpClient
    };
}

/**
 * Routing Skeleton
 */
function getConnectorClass(platform_kind) {
    switch (platform_kind) {
        case "META": return MetaConnector;
        case "GOOGLE_ADS": return GoogleAdsConnector;
        case "TIKTOK": return TikTokConnector;
        default: return GenericHttpConnector;
    }
}

/**
 * Base Connector Interface
 */
class BaseConnector {
    constructor(config) { }

    async execute(primaryRequest) {
        // MUST NOT perform network IO
        // MUST return object:
        return {
            http_status: null,
            response_body: null,
            errors: [],
            warnings: []
        };
    }

    static validateConfig(config) { }
}

/**
 * Stub Connectors
 */
class MetaConnector extends BaseConnector {
    constructor(config) {
        super(config);
        this.config = config || {};
    }

    async execute(primaryRequest) {
        // 1. Validate config
        const configErrors = MetaConnector.validateConfig(this.config);
        if (configErrors.length > 0) {
            return {
                http_status: null,
                response_body: null,
                errors: configErrors,
                warnings: []
            };
        }

        // 2. Validate primaryRequest
        if (!primaryRequest || typeof primaryRequest !== 'object') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "INVALID_PRIMARY_REQUEST", message: "Primary request must be an object" }],
                warnings: []
            };
        }

        if (!primaryRequest.ad_account_id || typeof primaryRequest.ad_account_id !== 'string') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "INVALID_PRIMARY_REQUEST", message: "Missing or invalid ad_account_id" }],
                warnings: []
            };
        }

        // 3. Build URL, headers
        const apiBase = this.config.api_base_url || "https://graph.facebook.com";
        const apiVersion = this.config.api_version || "v18.0";
        const adAccountId = primaryRequest.ad_account_id;
        const fields = primaryRequest.fields || "id,name";

        // Remove trailing slash from base if present
        const baseUrl = apiBase.replace(/\/$/, "");
        const url = `${baseUrl}/${apiVersion}/${adAccountId}?fields=${fields}`;

        const headers = {
            "Authorization": `Bearer ${this.config.access_token}`,
            "Content-Type": "application/json"
        };

        const options = {
            method: "GET",
            headers
        };

        // 4. Call http_client
        if (typeof this.config.http_client !== 'function') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "HTTP_CLIENT_MISSING", message: "MetaConnector requires http_client" }],
                warnings: []
            };
        }

        let httpResponse;
        try {
            httpResponse = await this.config.http_client(url, options);
        } catch (err) {
            return {
                http_status: null,
                response_body: null,
                errors: [{
                    code: "META_NETWORK_ERROR",
                    message: err.message || "Network error calling Meta API"
                }],
                warnings: []
            };
        }

        // Parse JSON
        let responseBody = null;
        if (httpResponse && typeof httpResponse.json === 'function') {
            try {
                responseBody = await httpResponse.json();
            } catch (err) {
                // Leave null
            }
        }

        // 5. Map result
        if (httpResponse.status >= 200 && httpResponse.status <= 299) {
            return {
                http_status: httpResponse.status,
                response_body: responseBody,
                errors: [],
                warnings: []
            };
        } else {
            return {
                http_status: httpResponse.status || null,
                response_body: responseBody,
                errors: [{
                    code: "META_HTTP_ERROR",
                    message: "Non-success status from Meta API"
                }],
                warnings: []
            };
        }
    }

    static validateConfig(config) {
        const errors = [];
        if (!config || typeof config !== 'object') {
            errors.push({ code: "INVALID_CONFIG", message: "Config must be an object" });
            return errors;
        }

        if (!config.access_token || typeof config.access_token !== 'string') {
            errors.push({ code: "INVALID_CONFIG", message: "Missing access_token" });
        }

        return errors;
    }
}
class GoogleAdsConnector extends BaseConnector {
    constructor(config) {
        super(config);
        this.config = config || {};
    }

    async execute(primaryRequest) {
        // 1. Validate config
        const configErrors = GoogleAdsConnector.validateConfig(this.config);
        if (configErrors.length > 0) {
            return {
                http_status: null,
                response_body: null,
                errors: configErrors,
                warnings: []
            };
        }

        // 2. Validate primaryRequest
        if (!primaryRequest || typeof primaryRequest !== 'object') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "INVALID_PRIMARY_REQUEST", message: "Primary request must be an object" }],
                warnings: []
            };
        }

        if (!primaryRequest.customer_id || typeof primaryRequest.customer_id !== 'string') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "INVALID_PRIMARY_REQUEST", message: "Missing or invalid customer_id" }],
                warnings: []
            };
        }

        if (!primaryRequest.gaql || typeof primaryRequest.gaql !== 'string') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "INVALID_PRIMARY_REQUEST", message: "Missing or invalid gaql" }],
                warnings: []
            };
        }

        // 3. Build URL, headers, body
        const apiBase = this.config.api_base_url || "https://googleads.googleapis.com";
        const customerId = primaryRequest.customer_id;
        const pageSize = typeof primaryRequest.page_size === "number" && primaryRequest.page_size > 0
            ? primaryRequest.page_size
            : 100;

        const url = apiBase.replace(/\/$/, "") + `/v16/customers/${customerId}/googleAds:searchStream`;

        const headers = {
            "Authorization": `Bearer ${this.config.access_token}`,
            "developer-token": this.config.developer_token,
            "Content-Type": "application/json"
        };

        if (this.config.login_customer_id) {
            headers["login-customer-id"] = this.config.login_customer_id;
        }

        const body = JSON.stringify({
            query: primaryRequest.gaql,
            pageSize
        });

        const options = {
            method: "POST",
            headers,
            body
        };

        // 4. Call http_client
        if (typeof this.config.http_client !== 'function') {
            return {
                http_status: null,
                response_body: null,
                errors: [{ code: "HTTP_CLIENT_MISSING", message: "GoogleAdsConnector requires http_client in config" }],
                warnings: []
            };
        }

        let httpResponse;
        try {
            httpResponse = await this.config.http_client(url, options);
        } catch (err) {
            return {
                http_status: null,
                response_body: null,
                errors: [{
                    code: "GOOGLE_ADS_NETWORK_ERROR",
                    message: err.message || "Network error calling Google Ads"
                }],
                warnings: []
            };
        }

        // Parse JSON
        let responseBody = null;
        if (httpResponse && typeof httpResponse.json === 'function') {
            try {
                responseBody = await httpResponse.json();
            } catch (err) {
                // Leave null, add warning if needed (spec says just leave null)
            }
        }

        // 5. Map result
        if (httpResponse.status >= 200 && httpResponse.status <= 299) {
            return {
                http_status: httpResponse.status,
                response_body: responseBody,
                errors: [],
                warnings: []
            };
        } else {
            return {
                http_status: httpResponse.status || null,
                response_body: responseBody,
                errors: [{
                    code: "GOOGLE_ADS_HTTP_ERROR",
                    message: "Non-success status from Google Ads"
                }],
                warnings: []
            };
        }
    }

    static validateConfig(config) {
        const errors = [];
        if (!config || typeof config !== 'object') {
            errors.push({ code: "INVALID_CONFIG", message: "Config must be an object" });
            return errors;
        }

        if (!config.developer_token || typeof config.developer_token !== 'string') {
            errors.push({ code: "INVALID_CONFIG", message: "Missing developer_token" });
        }

        if (!config.access_token || typeof config.access_token !== 'string') {
            errors.push({ code: "INVALID_CONFIG", message: "Missing access_token" });
        }

        return errors;
    }
}
class TikTokConnector extends BaseConnector { }
class GenericHttpConnector extends BaseConnector { }

function createErrorEnvelope(timestamp, code, message) {
    return {
        ok: false,
        module: "connector_io_engine",
        timestamp,
        payload: null,
        error: {
            code,
            message
        }
    };
}

module.exports = {
    run,
    BaseConnector,
    MetaConnector,
    GoogleAdsConnector,
    TikTokConnector,
    GenericHttpConnector
};
