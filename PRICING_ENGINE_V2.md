# Kaivo v2.0 Pricing Engine

## Core Principles
The pricing engine combines a global platform markup with agency-specific client markups and a tiered subscription model.

## 1. CPM Markup Logic
Every ad impression served through Kaivo is subject to markups.

### Formula
`Effective CPM = Base CPM * Kaivo Markup * Agency Markup`

- **Base CPM**: The raw cost charged by the ad platform (Meta, TikTok, etc.).
- **Kaivo Markup**: Fixed at **1.50x** (50% margin).
- **Agency Markup**: Configurable per client (e.g., 1.20x for 20% margin).

### Example
- Base CPM: $10.00
- Kaivo Cost: $10.00 * 1.50 = $15.00
- Client Price (with 20% agency markup): $15.00 * 1.20 = **$18.00**

## 2. Subscription Tiers (Kaivo Pricing 2.0)

| Tier | Spend Range | Fee | Key Features |
| :--- | :--- | :--- | :--- |
| **Free Forever** | up to $1k | $0 | Basic routing, basic reporting, creative checks, 1 brand only, English only, limited variants. Revenue: CPM spread only. Kaivo-managed accounts only. |
| **Starter** | $1k - $5k | $99/mo | Creative scoring, multilingual, reporting dashboard, saved audiences, weekly summaries. Revenue: Platform fee + CPM spread. Kaivo-managed or user-owned accounts. |
| **Growth** | $5k - $15k | $199/mo | Budget optimizer, cross-platform rules, real-time routing, variant scoring, advanced reporting. |
| **Scale** | $15k - $50k | $399/mo | Unlimited brands, unlimited variants, workspaces, white-label reporting, API access (restricted). |
| **Enterprise** | $50k+ | 5% of Spend | Full Kaivo Intelligence, advanced permissions, enterprise routing, team access, priority support, audit logs, onboarding concierge. User-owned accounts only. |

## 3. API Endpoints

### `GET /pricing/plans`
Returns the structured list of all available plans and their features.

### `GET /pricing/plan-for-agency`
**Query Param**: `agency_id`
Returns the agency's current plan and a capability map (booleans) for feature gating on the frontend.
