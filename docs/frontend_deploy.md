# Frontend Deployment & Hardening

## Next.js Versioning
- **Version**: Pinned to `14.2.14` (Fixed).
- **Reason**: Security patch for Next.js 14.x.
- **Requirement**: Use exact version in `package.json` (no caret `^`) for deterministic builds.

## Shopify Integration Routes
To ensure compatibility with Cloudflare Pages (Static Export) and prevent "deopted into client-side rendering" warnings, Shopify integration routes must follow the **Server Shell + Client Content** pattern.

### Pattern
1. **Server Component (`page.tsx`)**:
   - MUST NOT contain `'use client'`.
   - MUST NOT import client-side libraries (e.g., `@shopify/polaris`) directly.
   - Imports a Client Component for content.
   - Wraps the Client Component in a `<Suspense>` boundary with a fallback (e.g., `<LoadingSpinner />`).

2. **Client Component (`_components/KwargsContent.tsx`)**:
   - Contains `'use client'`.
   - Uses `useSearchParams()`.
   - Contains the actual page logic and UI.

### Example
```tsx
// page.tsx (Server)
import { Suspense } from 'react';
import { PageContent } from '../_components/PageContent';
import { LoadingSpinner } from '../_components/LoadingSpinner';

export default function Page() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <PageContent />
        </Suspense>
    );
}
```

This ensures the page shell is statically optimized (`○`) while the dynamic search params logic is suspended on the client.

## Maintenance Rules (The "Locked but not Fragile" Posture)
1. **Regressions as Bugs**: Any new "deopted into client-side rendering" warning is a regression. Do not ignore it. Fix the root cause (usually a Client Component leaking into a Server Shell).
2. **Shopify Pattern Invariants**:
   - `page.tsx` must ALWAYS be a Server Component.
   - Client logic (`useSearchParams`, `useEffect`, etc.) must ALWAYS be in `_components/`.
   - `Suspense` must ALWAYS wrap the client component at the page boundary.
   - `next/script` MUST be present in the Shopify Layout used for the iframe context (using `strategy="afterInteractive"`).
3. **Dependency Gating**:
   - `npm run verify:pinned-deps` acts as a gate.
## Embedded App Boot Requirements
To prevent runtime crashes in Shopify Admin:

1.  **Build-Time Environment Variables**:
    *   `NEXT_PUBLIC_SHOPIFY_API_KEY` MUST be present during the build (`npm run build`).
    *   Reason: Next.js inlines `NEXT_PUBLIC_` variables. If missing, the App Bridge script tag receives an undefined key, causing initialization failures.

2.  **Host Parameter**:
    *   The app must always be loaded with a `?host=...` query parameter (standard from Shopify).
    *   The `ShopifyAppBridgeProvider` will render a diagnostic error screens if this is missing.

3.  **App Bridge Initialization**:
    *   We use `@shopify/app-bridge-react` v4.
    *   Initialization is handled by `ShopifyAppBridgeProvider` which injects the required `<script>` tag.
    *   **Do not** manually add `<script src="app-bridge.js">` in `layout.tsx` or other pages.
    *   **Do not** rely on `window.shopify` global directly without checking `ShopifyAppBridgeProvider` state.
