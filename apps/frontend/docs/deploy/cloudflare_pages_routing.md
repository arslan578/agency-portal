# Cloudflare Pages + Next-on-Pages Routing Requirements

## Overview
This document describes the critical routing configuration required to ensure `app.getkaivo.com` correctly serves API proxy requests via the Next-on-Pages worker instead of falling back to Nginx defaults (which cause 503 HTML errors).

## Routing Architecture
- **Domain**: `app.getkaivo.com`
- **Platform**: Cloudflare Pages (serving Next.js via @cloudflare/next-on-pages)
- **Path `/api/*`**: MUST be handled by the Pages Worker (Function), NOT by an external reverse proxy (Nginx).

## Critical Requirement: No Nginx for API
The `app.getkaivo.com` domain must be a **Custom Domain** attached directly to the Cloudflare Pages project.
There must **NOT** be a wildly-scoped DNS record or Page Rule that sends `/api/*` to the Nginx Ingress Controller.

If Nginx handles `/api/*` requests intended for the Next.js Proxy, it will return HTML 404/503 responses, crashing the client which expects JSON.

## Verification
To verify that the Cloudflare Pages worker is serving the request, check for the `x-kaivo-proxy` header.

### Verification Command
```bash
curl -i https://app.getkaivo.com/api/proxy/capabilities | sed -n '1,25p'
```

### Expected Output
1. **HTTP Status**: 200 (OK) or 500/502 (JSON Error) - NEVER HTML.
2. **Content-Type**: `application/json`
3. **Header**: `x-kaivo-proxy: next-on-pages`

### Failure Indicators
- `Server: nginx` (Indicates misrouting)
- `Content-Type: text/html` (Indicates misrouting or unhardened error)
- `cf-mitigated: challenge` (Indicates Cloudflare WAF blocking API calls - needs WAF exclusion rule)
