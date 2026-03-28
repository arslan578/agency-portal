/**
 * Google Ads Client Stub
 *
 * In a real implementation, this would wrap the official Google Ads API client.
 * For this phase, it provides a mockable interface for LIVE_SEND mode.
 */

class GoogleAdsClient {
    constructor(config) {
        this.config = config || {};
    }

    async send(request) {
        // Simulate network latency in a minimal way
        await new Promise(resolve => setTimeout(resolve, 10));

        const customerId = request.customer_id;
        const payloads = Array.isArray(request.payloads) ? request.payloads : [];

        return {
            results: payloads.map((payload, index) => ({
                resource_name: `customers/${customerId}/${payload.entity_type.toLowerCase()}s/mock-${index}`,
                status: 'ENABLED'
            }))
        };
    }
}

module.exports = GoogleAdsClient;
