# Stripe → Agency Onboarding: Setup & Testing Guide

## What This Does

When a user pays on **getkaivo.com** via Stripe Checkout:
1. Stripe sends a `checkout.session.completed` webhook to our backend
2. Our backend extracts the user's email from the webhook payload
3. A magic link is generated (valid for 48 hours, single-use)
4. An onboarding email is sent to the user via Resend
5. User clicks the link → lands on `agency.getkaivo.com/verify?token=...`
6. The verify-token endpoint auto-creates: **User → Agency → Membership → Default Client**
7. User is logged in as **Admin** of their new agency

---

## Step 1: Set Your .env Keys

Open `.env` in the project root and set these values:

```env
# ── REQUIRED ──────────────────────────────────────────────────

# Your Stripe secret key (already set — keep it)
STRIPE_SECRET_KEY=sk_test_...

# Your Stripe webhook signing secret
# Get it from: Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret
# Leave EMPTY for local dev testing (signature verification is skipped when empty)
STRIPE_WEBHOOK_SECRET=

# Resend API key for sending emails (already set — keep it)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Kaivo <no-reply@app.getkaivo.com>

# Where magic links point to (your frontend URL)
FRONTEND_URL=http://localhost:3000

# ── OPTIONAL ──────────────────────────────────────────────────

# Magic link path (default: /verify)
# MAGIC_LINK_PATH=/verify

# Enable dev-only endpoints like /billing/dev/simulate-payment
# DEV_MODE=true   (defaults to true)
```

---

## Step 2: Start the Backend

```powershell
cd "d:\A SOFTWARE STORIES\kaivo\agency-portal"
$env:PYTHONPATH = "$PWD"
foreach ($line in (Get-Content .env | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' })) {
  $parts = $line -split '=', 2
  [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
}
.venv\Scripts\python.exe -m uvicorn services.api_gateway.main:app --host 0.0.0.0 --port 8000
```

Verify it's running:
```powershell
curl http://localhost:8000/healthz
```

---

## Step 3: Test Locally (Easiest — No Stripe Needed)

### Option A: Dev Simulate Endpoint (Recommended for first test)

This endpoint does the same thing as a real Stripe webhook, but you call it directly:

```powershell
# Replace the email with your own
Invoke-RestMethod -Uri "http://localhost:8000/billing/dev/simulate-payment" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "yourname@gmail.com", "plan_name": "Enterprise"}'
```

**Expected response:**
```json
{
  "status": "ok",
  "magic_url": "http://localhost:3000/verify?token=abc123...",
  "email_sent": true,
  "email_debug": null
}
```

**What happens:**
- A `magic_tokens` row is created in the database
- An onboarding email is sent to the email address via Resend
- The `magic_url` in the response is the link the user would click
- Open that URL in your browser (with the frontend running) to complete the flow

### Option B: Simulate Raw Webhook (Tests the actual webhook handler)

Since `STRIPE_WEBHOOK_SECRET` is empty, signature verification is skipped in dev:

```powershell
$body = @{
  type = "checkout.session.completed"
  data = @{
    object = @{
      id = "cs_test_simulation"
      mode = "subscription"
      customer_email = "yourname@gmail.com"
      customer = "cus_test123"
      metadata = @{
        plan_name = "Enterprise"
      }
    }
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:8000/billing/webhooks/stripe" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Expected response:**
```json
{ "status": "success" }
```

Check your email — you should receive the onboarding email with the magic link.

---

## Step 4: Test the Magic Link

1. Copy the `magic_url` from the simulate response (or from the email)
2. Make sure the frontend is running (`npm run dev` in `apps/agency-portal`)
3. Open the URL in your browser: `http://localhost:3000/verify?token=...`
4. The frontend calls `GET /auth/verify-token?token=...`
5. This creates your User + Agency + Membership + Default Client
6. You're logged in as Admin of your new agency

---

## Step 5: Verify in Database

```powershell
# Check the magic token was created
psql -U agency_user -d agency_db -c "SELECT id, email, role, agency_id, used_at FROM magic_tokens ORDER BY id DESC LIMIT 5;"

# Check the user was created (after clicking the link)
psql -U agency_user -d agency_db -c "SELECT id, email, is_active FROM users ORDER BY id DESC LIMIT 5;"

# Check the agency was created
psql -U agency_user -d agency_db -c "SELECT id, name, current_plan FROM agencies ORDER BY id DESC LIMIT 5;"

# Check the membership
psql -U agency_user -d agency_db -c "SELECT id, user_id, agency_id, role FROM agency_memberships ORDER BY id DESC LIMIT 5;"
```

---

## Production Setup (When Ready to Go Live)

### 1. Create Stripe Webhook Endpoint

Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
- **Endpoint URL:** `https://your-backend-domain.com/billing/webhooks/stripe`
- **Events to listen for:**
  - `checkout.session.completed` ← this is the key one
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

### 2. Copy the Signing Secret

After creating the endpoint, Stripe shows a **Signing secret** (`whsec_...`).
Set it in your `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_your_actual_signing_secret_here
```

### 3. Configure getkaivo.com Checkout

On your getkaivo.com Stripe Checkout, make sure the **metadata** includes:
- `plan_name` — e.g. "Enterprise", "Growth" (used in the welcome email)
- Optionally `email` — as a fallback (though Stripe's `customer_email` is preferred)

**Do NOT include `agency_id` in metadata** — that field is used for existing agency credit purchases. If it's absent, the system treats the checkout as a new user onboarding.

### 4. Set DEV_MODE=false in Production

```env
DEV_MODE=false
```

This disables the `/billing/dev/simulate-payment` endpoint.

---

## Architecture Summary

```
getkaivo.com (Stripe Checkout)
        │
        ▼ checkout.session.completed webhook
        │
agency-portal backend
├── POST /billing/webhooks/stripe     ← receives webhook
│   └── handle_checkout_session_completed()
│       ├── Has metadata.agency_id? → credit purchase (existing flow)
│       └── No agency_id? → NEW USER ONBOARDING:
│           ├── Extract email from webhook payload
│           ├── create_onboarding_magic_link() → MagicToken (role=ADMIN)
│           └── send_onboarding_magic_link_email() → Resend API
│
├── GET /auth/verify-token?token=...  ← user clicks magic link
│   ├── Validate token (48h expiry, single-use)
│   ├── Create User (if not exists)
│   ├── Create Agency (FREE tier)
│   ├── Create AgencyMembership (ADMIN role)
│   ├── Create Default Client
│   └── Return JWT access token
│
└── POST /billing/dev/simulate-payment ← dev testing only
    └── Same as webhook but called directly
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `services/billing_service/webhooks.py` | Receives Stripe webhook, routes to handler |
| `services/billing_service/onboarding.py` | Creates MagicToken for new paying user |
| `services/billing_service/email.py` | Sends onboarding email via Resend |
| `services/billing_service/main.py` | Dev simulate endpoint |
| `services/auth_service/main.py` | verify-token: creates User + Agency |
| `packages/db/models.py` | MagicToken, User, Agency, AgencyMembership models |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Email not received | Check `RESEND_API_KEY` is set. Check backend logs for "email not sent" warnings |
| `Webhook secret not configured` error | Set `STRIPE_WEBHOOK_SECRET` in `.env`, or leave it empty for dev (skips signature check) |
| Magic link returns "Invalid link" | Token may have expired (48h) or already been used. Generate a new one |
| `/billing/dev/simulate-payment` returns 404 | `DEV_MODE` is not set or is `false`. Set `DEV_MODE=true` in `.env` |
| Agency not created after clicking link | Check that the magic token has `role=ADMIN` and `agency_id=NULL` in the database |
| Dashboard doesn't show saved agency fields | Restart backend — the dashboard endpoint was updated to return email/website/phone/timezone/currency |
