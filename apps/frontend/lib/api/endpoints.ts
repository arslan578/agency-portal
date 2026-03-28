/**
 * Centralized API Endpoint Constants
 * Direct backend API paths - frontend calls backend directly via CORS.
 */

export const API_ENDPOINTS = {
    AUTH: {
        REGISTER: '/auth/register',
        LOGIN: '/auth/login',
        GOOGLE: '/auth/google',
        REFRESH: '/auth/refresh',
        // LOGOUT: Client-side only
        ME: '/auth/me',
        UPDATE_PROFILE: '/auth/profile',
    },
    ACCOUNT: {
        CREATE: '/accounts',
        DETAILS: (id: string) => `/accounts/${id}`,
        PLATFORM_ACCOUNTS: '/platform_accounts',
    },
    CAMPAIGN: {
        LIST: '/campaign/campaigns',
        CREATE: '/campaign/plans',
        DETAILS: (id: string) => `/campaign/campaigns/${id}`, // Also supports actions via /{action}
        UPDATE_PLATFORMS: (id: string) => `/campaign/campaigns/${id}/platforms`,
        SUBMIT_PLAN: (planId: string) => `/campaign/plans/${planId}/submit`,
        LAUNCH: (campaignId: string) => `/platforms/meta/campaigns/${campaignId}/launch`,
    },
    AUDIENCE: {
        LIST: '/audiences',
        CREATE: '/audiences',
        DETAILS: (id: string) => `/audiences/${id}`,
        UPDATE: (id: string) => `/audiences/${id}`,
        UPLOAD: '/audience/upload',
    },
    CREATIVE: {
        UPLOAD: '/creative/assets/upload',
        PRODUCT_DOCS: (brandId: string) => `/creative/brands/${brandId}/product-docs`,
        GENERATE: '/creative/generate-variants',
        SAVE_VARIANTS: '/creative/variants/save',
        GET_VARIANT: (id: number | string) => `/creative/variants/${id}`,
        LIST_VARIANTS: '/creative/variants',
    },
    BILLING: {
        BALANCE: '/billing/credits/balance',
        PURCHASE: '/billing/credits/purchase',
        SUBSCRIBE: '/billing/subscription/checkout',
        TRANSACTIONS: '/billing/credits/transactions',
        BILLING_MODE: (clientId: number) => `/billing/billing-mode/${clientId}`,
        AGENCY_BILLING_SUMMARY: (agencyId: number) => `/billing/agency-billing-summary/${agencyId}`,
    },
    REPORTING: {
        CAMPAIGN: (id: string) => `/reports/campaign/${id}`,
        // INTELLIGENCE: (id: string) => `/reporting/reports/intelligence/${id}`, // Unverified
    },
    AGENT: {
        ACT: '/agent/kaivo/act',
        INGEST: '/agent/brand-profile/ingest',
    },
    INTELLIGENCE: {
        ANALYZE: '/intelligence/analyze',
        SWEET_SPOT: '/intelligence/sweet-spot',
        RECOMMENDATIONS: '/intelligence/recommendations',
    },
    I18N: {
        LANGUAGES: '/i18n/languages',
        TRANSLATE: '/creative/translate',
    },
    SHOPIFY: {
        CONNECT: '/integrations/shopify/connect', // Frontend route
    },
    PLATFORM: {
        META: {
            TEST_CONNECTION: '/platforms/meta/test-connection',
            AD_ACCOUNTS: '/platforms/meta/ad-accounts',
            CAMPAIGNS: (adAccountId: string) =>
                `/platforms/meta/campaigns?ad_account_id=${adAccountId}`,
            AD_SETS: (campaignId: string) =>
                `/platforms/meta/ad-sets?campaign_id=${campaignId}`,
            CREATE_AD: '/platforms/meta/ads',
            UPDATE_CAMPAIGN: (campaignId: string) =>
                `/platforms/meta/campaigns/${campaignId}`,
            DELETE_CAMPAIGN: (campaignId: string) =>
                `/platforms/meta/campaigns/${campaignId}`,
            OAUTH: {
                INITIATE: (accountId: number) =>
                    `/platforms/meta/oauth/initiate?account_id=${accountId}`,
                CALLBACK: '/platforms/meta/oauth/callback',
                REFRESH: (accountId: number) =>
                    `/platforms/meta/oauth/refresh?account_id=${accountId}`,
            },
        },
        GOOGLE_ADS: {
            TEST_CONNECTION: '/platforms/google/test-connection',
            OAUTH: {
                INITIATE: (accountId: number) =>
                    `/platforms/google/oauth/initiate?account_id=${accountId}`,
                CALLBACK: '/platforms/google/oauth/callback',
                REFRESH: (accountId: number) =>
                    `/platforms/google/oauth/refresh?account_id=${accountId}`,
            },
        },
        TIKTOK: {
            TEST_CONNECTION: '/platforms/tiktok/test-connection',
            AD_ACCOUNTS: '/platforms/tiktok/ad-accounts',
            OAUTH: {
                INITIATE: (accountId: number) =>
                    `/platforms/tiktok/oauth/initiate?account_id=${accountId}`,
                CALLBACK: '/platforms/tiktok/oauth/callback',
                REFRESH: (accountId: number) =>
                    `/platforms/tiktok/oauth/refresh?account_id=${accountId}`,
            },
        },
        REDDIT: {
            TEST_CONNECTION: '/platforms/reddit/test-connection',
            AD_ACCOUNTS: '/platforms/reddit/ad-accounts',
            OAUTH: {
                INITIATE: (accountId: number) =>
                    `/platforms/reddit/oauth/initiate?account_id=${accountId}`,
                CALLBACK: '/platforms/reddit/oauth/callback',
                REFRESH: (accountId: number) =>
                    `/platforms/reddit/oauth/refresh?account_id=${accountId}`,
            },
        },
        MICROSOFT_ADS: {
            TEST_CONNECTION: '/platforms/microsoft/test-connection',
            AD_ACCOUNTS: '/platforms/microsoft/ad-accounts',
            OAUTH: {
                INITIATE: (accountId: number) =>
                    `/platforms/microsoft/oauth/initiate?account_id=${accountId}`,
                CALLBACK: '/platforms/microsoft/oauth/callback',
                REFRESH: (accountId: number) =>
                    `/platforms/microsoft/oauth/refresh?account_id=${accountId}`,
            },
        },
        SPOTIFY: {
            TEST_CONNECTION: '/platforms/spotify/test-connection',
            AD_ACCOUNTS: '/platforms/spotify/ad-accounts',
            LAUNCH: (campaignId: string) =>
                `/platforms/spotify/campaigns/${campaignId}/launch`,
            OAUTH: {
                INITIATE: (accountId: number) =>
                    `/platforms/spotify/oauth/initiate?account_id=${accountId}`,
                CALLBACK: '/platforms/spotify/oauth/callback',
                REFRESH: (accountId: number) =>
                    `/platforms/spotify/oauth/refresh?account_id=${accountId}`,
            },
        },
        CREDENTIALS: {
            STORE: '/platform-credentials/store',
            GET: (platform: string, clientId: number) =>
                `/platform-credentials/${platform}?client_id=${clientId}`,
            REVOKE: (platform: string, clientId: number) =>
                `/platform-credentials/${platform}?client_id=${clientId}`,
            SELECT_ACCOUNT: (platform: string, clientId: number) =>
                `/platform-credentials/${platform}/select-account?client_id=${clientId}`,
        },
    },
} as const;
