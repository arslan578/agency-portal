# Kaivo v2.0 Domain Model

## Core Entities

### User
- Represents a system user.
- Can belong to multiple **Agencies** and **Clients**.
- **Key Fields**: `email`, `hashed_password`, `full_name`, `avatar_url`.

### Agency
- Represents a marketing agency or organization using Kaivo.
- Owns **Clients**.
- Has a **Plan Tier** (Free, Starter, Growth, Scale, Enterprise).
- **Key Fields**: `name`, `current_plan`, `stripe_customer_id`.

### Client
- Represents an end-client of an Agency.
- Owns **Campaigns**, **Audiences**, and **Platform Accounts**.
- Has specific markup settings controlled by the Agency.
- **Key Fields**: `name`, `markup_percent`, `industry`.

### Memberships
- **AgencyMembership**: Links User ↔ Agency with role (`admin`, `member`, `viewer`).
- **ClientMembership**: Links User ↔ Client with role (`operator`, `viewer`).

## Campaign Management

### Campaign
- Belongs to a **Client**.
- Defines goals, budgets, and platform allocations.
- **Key Fields**: `goal`, `total_budget`, `status`, `platform_allocations`.

### Audience
- Belongs to a **Client**.
- Represents uploaded customer lists or defined segments.
- **Key Fields**: `name`, `file_url`, `is_uploaded`.

### PlatformAccount
- Stores credentials for external ad platforms (Meta, TikTok, etc.) per Client.

## Billing & Usage

### UsageRecord
- Tracks daily performance and spend per Campaign per Platform.
- Stores spend at three levels:
    1.  `spend_base`: Raw cost from platform.
    2.  `spend_kaivo`: Base + Kaivo Global Markup (1.5x).
    3.  `spend_agency`: Kaivo + Agency Markup.

### Invoice
- Aggregates usage for a billing period per Client.
- **Key Fields**: `period_start`, `period_end`, `grand_total`, `status`.

## Authorization Rules
- **Agency Admin**: Full access to Agency settings, Clients, Markups, and Users.
- **Agency Member**: Can manage Campaigns for all Clients in the Agency.
- **Client Operator**: Can manage Campaigns only for their specific Client.
- **Client Viewer**: Read-only access to their specific Client's data.
