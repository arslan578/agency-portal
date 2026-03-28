import { NextRequest, NextResponse } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http/proxyResponse';

export const runtime = 'edge';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    return handleProxyRequest(request, params, 'GET');
}

export async function POST(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    return handleProxyRequest(request, params, 'POST');
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    return handleProxyRequest(request, params, 'PUT');
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    return handleProxyRequest(request, params, 'DELETE');
}

export async function OPTIONS(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    // Handle CORS preflight requests
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
}

async function handleProxyRequest(
    request: NextRequest,
    params: { path: string[] },
    method: string
) {
    try {
        const pathSegments = params.path || [];
        const backendPath = `/integrations/shopify/${pathSegments.join('/')}`;
        
        // Get query string from request
        const searchParams = request.nextUrl.searchParams.toString();
        const backendUrl = `${BACKEND_URL}${backendPath}${searchParams ? `?${searchParams}` : ''}`;
        
        console.log(`[Proxy] ${method} ${request.nextUrl.pathname} -> ${backendUrl}`);
        console.log(`[Proxy] Path segments:`, pathSegments);
        console.log(`[Proxy] Backend path:`, backendPath);
        
        // Get request body if present
        // CRITICAL: For webhook routes, preserve raw body bytes to maintain HMAC signature validity
        // Shopify webhooks require exact raw body bytes for HMAC verification
        let body: BodyInit | undefined;
        const contentType = request.headers.get('content-type');
        const isWebhookRoute = pathSegments.includes('webhooks');
        
        if (method !== 'GET' && method !== 'DELETE') {
            if (isWebhookRoute) {
                // For webhooks, preserve raw body bytes (use arrayBuffer instead of text)
                // This ensures HMAC signature verification works correctly with exact bytes
                // Text conversion can alter encoding/normalization, breaking HMAC verification
                body = await request.arrayBuffer();
            } else if (contentType?.includes('application/json')) {
                body = JSON.stringify(await request.json());
            } else if (contentType?.includes('form-data')) {
                body = await request.formData();
            } else {
                body = await request.text();
            }
        }
        
        // Forward headers (excluding host and connection)
        const headers: HeadersInit = {};
        request.headers.forEach((value, key) => {
            const lowerKey = key.toLowerCase();
            if (!['host', 'connection', 'content-length'].includes(lowerKey)) {
                headers[key] = value;
            }
        });
        
        // Add ngrok bypass headers to avoid Cloudflare challenge
        if (request.headers.get('host')?.includes('ngrok')) {
            headers['ngrok-skip-browser-warning'] = 'true';
        }
        
        // Make request to backend
        console.log(`[Proxy] Making ${method} request to backend: ${backendUrl}`);
        const response = await fetch(backendUrl, {
            method,
            headers,
            body,
            redirect: 'manual', // Handle redirects manually
        });
        
        console.log(`[Proxy] Backend response status: ${response.status} ${response.statusText}`);
        
        // Handle redirects (for OAuth flow)
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location) {
                console.log(`[Proxy] Redirecting to: ${location}`);
                // Ensure absolute URL for redirect
                const redirectUrl = location.startsWith('http') 
                    ? location 
                    : new URL(location, request.nextUrl.origin).toString();
                
                // Add ngrok bypass header to redirect response
                const redirectHeaders = new Headers();
                if (request.headers.get('host')?.includes('ngrok')) {
                    redirectHeaders.set('ngrok-skip-browser-warning', 'true');
                }
                
                return NextResponse.redirect(redirectUrl, { 
                    status: response.status as 301 | 302 | 303 | 307 | 308,
                    headers: redirectHeaders
                });
            }
        }
        
        // Get response data
        const responseContentType = response.headers.get('content-type');
        let data: any;
        
        if (responseContentType?.includes('application/json')) {
            data = await response.json();
        } else if (responseContentType?.includes('text/html')) {
            // For HTML responses (like OAuth callback page), return as-is
            const htmlText = await response.text();
            return new NextResponse(htmlText, {
                status: response.status,
                headers: {
                    'Content-Type': responseContentType,
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } else {
            data = await response.text();
        }
        
        // Return response with same status and CORS headers
        const responseHeaders = new Headers({
            'Content-Type': responseContentType || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        
        return jsonOk(data, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (error: any) {
        console.error('[Proxy] Error proxying request:', error);
        return jsonError(
            502,
            'PROXY_ERROR',
            `Failed to proxy request: ${error.message}`,
            true
        );
    }
}
