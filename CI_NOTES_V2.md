# Kaivo v2.0 CI/CD Notes

## Backend (Render)
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn services.api_gateway.main:app --host 0.0.0.0 --port 10000`
- **Env Vars**: Ensure all required vars (DATABASE_URL, REDIS_URL, etc.) are set in Render Dashboard.

## Frontend (Cloudflare Pages)
- **Framework**: Next.js (Edge Runtime)
- **Build Command**: `npx @cloudflare/next-on-pages@1`
- **Output Directory**: `.vercel/output/static` (or `.next` depending on adapter)
- **Env Vars**:
    - `NEXT_PUBLIC_API_URL`: URL of the Render backend.
    - `NEXTAUTH_SECRET`: Generate a random string.
    - `AUTH_SECRET`: Same as NEXTAUTH_SECRET.

## Testing
- **Backend**: `pytest`
- **Frontend**: `npm run lint && npm run build`
