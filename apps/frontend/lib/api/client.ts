import { API_ENDPOINTS } from './endpoints';

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
// Direct API URL - frontend calls backend directly via CORS
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com';

async function fetchWrapper<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { timeout = DEFAULT_TIMEOUT, skipAuth = false, ...fetchOptions } = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    // Ensure endpoint starts with / if not present
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    // Construct URL - if endpoint is already a full URL, use it directly, otherwise prepend BASE_URL
    const url = normalizedEndpoint.startsWith('http')
        ? normalizedEndpoint
        : `${BASE_URL}${normalizedEndpoint}`;

    // Auth Injection
    const headers: HeadersInit = {
        // Default to JSON, but allow overriding (e.g. for multipart/form-data where we delete Content-Type to let browser set boundary)
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
    };

    // If body is FormData, remove Content-Type to let browser set it with boundary
    if (fetchOptions.body instanceof FormData) {
        // @ts-ignore - we know headers is an object or Headers object, but strictly typing it is verbose.
        // If it's a simple object (which we initialized it as), we can delete.
        if (headers['Content-Type'] === 'application/json') {
            // @ts-ignore
            delete headers['Content-Type'];
        }
    }

    if (!skipAuth && typeof localStorage !== 'undefined') {
        const token = localStorage.getItem('kaivo_token');
        if (token) {
            (headers as any)['Authorization'] = `Bearer ${token}`;
        }
        
        const agencyId = localStorage.getItem('kaivo_agency_id');
        if (agencyId) {
            (headers as any)['X-Agency-ID'] = agencyId;
        }
        
        const clientId = localStorage.getItem('kaivo_current_client_id');
        if (clientId) {
            (headers as any)['X-Client-ID'] = clientId;
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
            if (typeof window !== 'undefined') {
                const currentPath = window.location.pathname;
                // NEVER redirect to login when inside the Shopify embedded app.
                // The embedded app uses Shopify session tokens, not Kaivo tokens.
                if (currentPath.startsWith('/integrations/shopify')) {
                    console.warn('[apiClient] 401 inside Shopify embedded context — skipping login redirect');
                } else if (!currentPath.startsWith('/auth') && !currentPath.startsWith('/public')) {
                    localStorage.removeItem('kaivo_token');
                    window.location.href = '/auth/signin';
                } else {
                    localStorage.removeItem('kaivo_token');
                }
            }
            throw { status: 401, message: 'Unauthorized - Token expired or invalid' };
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        // Parse body if JSON, otherwise text or empty
        let data;
        if (isJson) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            // Construct standardized error object
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

        // Re-throw our typed ApiError or known 401
        if ((err as any).status) {
            throw err;
        }

        // Handle network/timeout errors
        const error: ApiError = {
            ok: false,
            status: 0,
            code: 'NETWORK_ERROR',
            message: err instanceof Error ? err.message : 'Unknown network error',
        };
        throw error;
    }
}

export const apiClient = {
    get: <T>(endpoint: string, options?: RequestOptions) => fetchWrapper<T>(endpoint, { ...options, method: 'GET' }),
    post: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
    put: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
    delete: <T>(endpoint: string, options?: RequestOptions) => fetchWrapper<T>(endpoint, { ...options, method: 'DELETE' }),
    patch: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),
};
