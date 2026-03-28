/**
 * Shopify Embedded API Client
 * 
 * This client handles API calls from Shopify embedded app context.
 * It uses Shopify session tokens for authentication instead of Kaivo tokens.
 * 
 * Required for Shopify App Store compliance:
 * "Using session tokens for user authentication"
 */

export interface ApiError {
    ok: boolean;
    status: number;
    code?: string;
    message: string;
    details?: unknown;
}

export interface RequestOptions extends RequestInit {
    timeout?: number;
    skipAuth?: boolean;
}

const DEFAULT_TIMEOUT = 10000;
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com';

/**
 * Create a fetch wrapper that uses Shopify session tokens for authentication.
 * 
 * @param getSessionToken - Function to get fresh session token from App Bridge
 * @returns API client with get/post/put/delete/patch methods
 */
export function createShopifyEmbeddedClient(getSessionToken: () => Promise<string>) {
    async function fetchWrapper<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const { timeout = DEFAULT_TIMEOUT, skipAuth = false, ...fetchOptions } = options;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        // Ensure endpoint starts with / if not present
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

        // Construct URL
        // For proxy paths (/api/proxy/*), use same-origin (relative URL) so Next.js handles the proxy
        // For other paths, use BASE_URL to call backend directly
        let url: string;
        if (normalizedEndpoint.startsWith('http')) {
            // Already a full URL
            url = normalizedEndpoint;
        } else if (normalizedEndpoint.startsWith('/api/proxy/')) {
            // Proxy path - use same-origin (relative) so Next.js frontend handles it
            url = normalizedEndpoint;
        } else {
            // Direct backend call
            url = `${BASE_URL}${normalizedEndpoint}`;
        }

        // Headers
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...fetchOptions.headers,
        };

        // Remove Content-Type for FormData
        if (fetchOptions.body instanceof FormData) {
            if ((headers as any)['Content-Type'] === 'application/json') {
                delete (headers as any)['Content-Type'];
            }
        }

        // Add session token for authentication
        if (!skipAuth) {
            try {
                // Get fresh session token (tokens expire after 1 minute)
                const sessionToken = await getSessionToken();
                (headers as any)['Authorization'] = `Bearer ${sessionToken}`;
                console.log('[ShopifyEmbeddedClient] Added session token to request');
            } catch (error) {
                console.error('[ShopifyEmbeddedClient] Failed to get session token:', error);
                // Continue without auth if token fetch fails
                // Backend will return 401 if auth is required
            }
        }

        const config: RequestInit = {
            ...fetchOptions,
            signal: controller.signal,
            headers,
        };

        try {
            const response = await fetch(url, config);
            clearTimeout(id);

            // Handle 401 Unauthorized
            if (response.status === 401) {
                console.error('[ShopifyEmbeddedClient] 401 Unauthorized - session token may be invalid');
                throw { status: 401, message: 'Unauthorized - Session token invalid or expired' };
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return {} as T;
            }

            const contentType = response.headers.get('content-type');
            const isJson = contentType && contentType.includes('application/json');

            let data;
            if (isJson) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                const error: ApiError = {
                    ok: false,
                    status: response.status,
                    message: response.statusText,
                    ...((typeof data === 'object' && data !== null) ? data : { details: data }),
                };
                throw error;
            }

            return data as T;
        } catch (err: unknown) {
            clearTimeout(id);

            if ((err as any).status) {
                throw err;
            }

            const error: ApiError = {
                ok: false,
                status: 0,
                code: 'NETWORK_ERROR',
                message: err instanceof Error ? err.message : 'Unknown network error',
            };
            throw error;
        }
    }

    return {
        get: <T>(endpoint: string, options?: RequestOptions) => 
            fetchWrapper<T>(endpoint, { ...options, method: 'GET' }),
        post: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
            fetchWrapper<T>(endpoint, { 
                ...options, 
                method: 'POST', 
                body: body instanceof FormData ? body : JSON.stringify(body) 
            }),
        put: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
            fetchWrapper<T>(endpoint, { 
                ...options, 
                method: 'PUT', 
                body: body instanceof FormData ? body : JSON.stringify(body) 
            }),
        delete: <T>(endpoint: string, options?: RequestOptions) => 
            fetchWrapper<T>(endpoint, { ...options, method: 'DELETE' }),
        patch: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
            fetchWrapper<T>(endpoint, { 
                ...options, 
                method: 'PATCH', 
                body: body instanceof FormData ? body : JSON.stringify(body) 
            }),
    };
}
