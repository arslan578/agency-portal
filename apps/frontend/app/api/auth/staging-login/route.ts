import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
    // HARD GATE: Strict Environment Guard
    // Allow 'staging' (explicit) or 'development' (for local testing if env is set)
    // BLOCK 'production' explicitly.
    const env = process.env.KAIVO_ENV;

    if (env === 'production') {
        console.error("Attempted Staging Login in Production Environment");
        return NextResponse.json({ error: 'Not Available' }, { status: 404 });
    }

    if (env !== 'staging' && env !== 'development') {
        // If KAIVO_ENV is not explicitly set to allowed modes, fail to be safe.
        // This prevents accidental exposure in unspecified environments.
        return NextResponse.json({ error: 'Environment not authorized for test mode' }, { status: 404 });
    }

    // 1. Feature Flag Guard
    if (process.env.NEXT_PUBLIC_FF_STAGING_TEST_MODE !== 'true') {
        return NextResponse.json({ error: 'Staging mode disabled' }, { status: 404 });
    }

    const email = process.env.STAGING_TEST_EMAIL;
    const password = process.env.STAGING_TEST_PASSWORD;

    // 2. Secrets Guard
    if (!email || !password) {
        console.error("Staging Test Mode enabled but credentials missing");
        return NextResponse.json({ error: 'System Configuration Error' }, { status: 500 });
    }

    // 3. Staging Host Guard
    const apiHost = process.env.STAGING_API_HOST;
    if (!apiHost) {
        console.error("STAGING_API_HOST not configured");
        return NextResponse.json({ error: 'System Configuration Error: Missing Host' }, { status: 500 });
    }

    // principled URL guard
    try {
        const url = new URL(apiHost);
        const hostname = url.hostname;
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        // Strict Guard: Must match exact staging domain, no substrings
        const isStaging = hostname === 'staging-app.getkaivo.com';

        // Protocol Guard
        // Allow HTTP only for localhost, enforce HTTPS for everything else
        if (url.protocol !== 'https:' && !isLocal) {
            console.error("STAGING_API_HOST must be HTTPS (unless localhost)");
            return NextResponse.json({ error: 'System Configuration Error: Insecure Host' }, { status: 500 });
        }

        // Hostname Guard
        // Allow ONLY 'staging.app.getkaivo.com' OR 'localhost' (local dev)
        // Block everything else (including bare production domains)
        if (!isStaging && !isLocal) {
            console.error(`Blocked Potentially Unsafe Host: ${hostname}`);
            return NextResponse.json({ error: 'System Configuration Error: Invalid Host Environment' }, { status: 500 });
        }

    } catch (e) {
        console.error("STAGING_API_HOST is not a valid URL");
        return NextResponse.json({ error: 'System Configuration Error: Invalid Host Format' }, { status: 500 });
    }

    try {
        const res = await fetch(`${apiHost}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: 'Upstream login failed', details: err }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Internal proxy error', details: String(error) }, { status: 500 });
    }
}
