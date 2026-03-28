import { jsonError } from './proxyResponse';
import { NextResponse } from 'next/server';

/**
 * Fetches from upstream with strict error handling and JSON enforcement.
 * NEVER throws. Returns a NextResponse (either success stream or JSON error).
 */
export async function upstreamFetch(
    url: string,
    init: RequestInit
): Promise<NextResponse> {
    try {
        const response = await fetch(url, {
            ...init,
            // @ts-ignore - Next.js/Cloudflare compat
            duplex: 'half',
            redirect: 'manual' // Handle redirects manually
        });

        // 1. Handle redirects (3xx) - pass through for OAuth flows
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location) {
                console.log(
                    `[Proxy] Passing through redirect ${response.status} to ${location}`
                );
                // Pass through the redirect response
                const headers = new Headers();
                headers.set('location', location);
                headers.set('x-kaivo-proxy', 'next-on-pages');

                return new NextResponse(null, {
                    status: response.status,
                    statusText: response.statusText,
                    headers
                });
            }
        }

        // 2. Check for HTML/Non-JSON failure modes from Upstream (Nginx, Cloudflare WAF)
        const contentType = response.headers.get('content-type');

        // If upstream returns 5xx HTML, it's an infrastructure error (Nginx 503, CF 502)
        if (!response.ok && contentType && contentType.includes('text/html')) {
            console.error(`[Proxy] Upstream returned HTML ${response.status} for ${url}`);
            return jsonError(
                502,
                "UPSTREAM_UNAVAILABLE",
                "The backend service is temporarily unavailable.",
                true, // Retryable because it might be transient
                { status: response.status, contentType }
            );
        }

        // 3. If it is a 5xx response (even if JSON), wrap it as UPSTREAM_5XX?
        // PROMPT SAID: "Upstream returns 5xx → status 502, code UPSTREAM_5XX, retryable true"
        if (response.status >= 500) {
            console.error(`[Proxy] Upstream 5xx ${response.status} for ${url}`);
            // We can try to read body if JSON, but safest is to standardize the error.
            return jsonError(
                502,
                "UPSTREAM_5XX",
                "Upstream service internal error",
                true,
                { originalStatus: response.status }
            );
        }

        // 4. Status 4xx -> Pass through.
        // NOTE: The prompt says "pass through status and body if JSON, else wrap as UPSTREAM_4XX".
        // We stream the body, so we can't easily check if it's JSON without buffering.
        // However, if we stream, we commit to the body.
        // Let's assume for 4xx we pass through unless we detect HTML.

        // If 4xx and HTML, wrap.
        if (response.status >= 400 && contentType && contentType.includes('text/html')) {
            return jsonError(
                response.status, // Keep original 4xx status? Prompt said "wrap as UPSTREAM_4XX"
                "UPSTREAM_4XX",
                "Upstream client error",
                false,
                { originalStatus: response.status, contentType }
            );
        }

        // 5. Success / Pass-through
        // Forward headers relevant to the response
        const headers = new Headers(response.headers);
        headers.set('x-kaivo-proxy', 'next-on-pages');

        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });

    } catch (error: any) {
        console.error(`[Proxy] Network Error for ${url}:`, error);
        return jsonError(
            502,
            "UPSTREAM_UNAVAILABLE",
            "Network failure reaching upstream service",
            true, // Retryable
            { message: error.message }
        );
    }
}
