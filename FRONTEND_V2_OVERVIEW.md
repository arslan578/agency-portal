# Kaivo v2.0 Frontend Overview

## Architecture
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Deployment**: Cloudflare Pages (Edge Runtime)
- **Authentication**: Auth.js v5 (NextAuth)

## Key Principles
1.  **Edge Compatibility**: All API routes and middleware must run on the Edge. No Node.js specific modules (fs, net) in the runtime path.
2.  **Server-Side Rendering (SSR)**: Use React Server Components (RSC) by default. Use `"use client"` only for interactive components.
3.  **Premium UI**:
    - **Theme**: Dark Mode default (Deep Space Blue + Neon Teal).
    - **Styling**: Tailwind CSS + Glassmorphism utilities.
    - **Components**: Radix UI primitives for accessibility.

## Environment Variables
- `NEXT_PUBLIC_API_URL`: URL of the Render Backend (e.g., `https://kaivo-backend.onrender.com`).
- `NEXTAUTH_URL`: URL of the frontend (e.g., `https://app.getkaivo.com`).
- `AUTH_SECRET`: Secret for Auth.js encryption.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: For Google Sign-In.

## Directory Structure
- `app/`: App Router pages and layouts.
- `components/`: Reusable UI components.
    - `ui/`: Base primitives (Button, Card, Input).
    - `layout/`: Sidebar, Header.
    - `features/`: Feature-specific components (CampaignWizard, PricingCard).
- `lib/`: Utilities and configurations (auth.ts, utils.ts).
- `hooks/`: Custom React hooks.
- `context/`: React Context providers (Theme, Language).

## Internationalization (i18n)
- Uses `react-i18next` (or simple context-based solution) for client-side translations.
- Fetches supported languages from Backend `GET /i18n/languages`.
