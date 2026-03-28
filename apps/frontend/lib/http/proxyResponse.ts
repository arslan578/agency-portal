import { NextResponse } from 'next/server';

/**
 * Standardized JSON response helper for successful proxy responses.
 * Sets the 'x-kaivo-proxy' header.
 */
export function jsonOk(
    data: unknown,
    init?: { status?: number; headers?: HeadersInit }
): NextResponse {
    const headers = new Headers(init?.headers);
    headers.set('x-kaivo-proxy', 'next-on-pages');
    headers.set('content-type', 'application/json; charset=utf-8');

    return NextResponse.json(data, {
        status: init?.status ?? 200,
        headers
    });
}

/**
 * Standardized JSON error envelope for proxy failures.
 * Ensures consistent key ordering and headers.
 */
export function jsonError(
    status: number,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>
): NextResponse {
    const headers = new Headers();
    headers.set('x-kaivo-proxy', 'next-on-pages');
    headers.set('content-type', 'application/json; charset=utf-8');

    return NextResponse.json(
        {
            ok: false,
            error: {
                code,
                message,
                retryable,
                ...(details ? { details } : {})
            }
        },
        {
            status,
            headers
        }
    );
}
