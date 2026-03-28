/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    eslint: {
        ignoreDuringBuilds: true,
    },
    images: {
        domains: [
            'kaivo-public.s3.amazonaws.com',
            'storage.googleapis.com',
            'lh3.googleusercontent.com',
        ],
    },
    // async rewrites() removed in favor of explicit Proxy Route Handler
    // See apps/frontend/app/api/proxy/api/[service]/[...path]/route.ts
    // output: 'export',  // ❌ REMOVED - incompatible with dynamic API routes
    // trailingSlash: true,  // ❌ REMOVED - causes 308 redirects that strip /api/proxy/api/ prefix
}

module.exports = nextConfig
