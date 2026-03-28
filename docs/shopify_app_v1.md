# Shopify Embedded App v1 Documentation

## Overview

Kaivo Shopify Embedded App v1 enables merchants to promote products directly from Shopify Admin without leaving the Shopify experience. This document provides technical details, setup instructions, and reviewer walkthrough.

## Architecture

- **Frontend**: Next.js with Shopify Polaris and App Bridge
- **Backend**: FastAPI endpoints in `/integrations/shopify/api/`
- **Database**: PostgreSQL via SQLAlchemy models
- **Webhooks**: FastAPI webhook handlers with HMAC verification

## Scopes Requested

### Required for v1
- `read_products` - Access product catalog for promotion

### Optional (Feature-Flagged)
- `read_orders` - Only if `FF_SHOPIFY_ATTRIBUTION_SYNC=true` (default: false)

**Note**: v1 does NOT request `read_orders` by default. Attribution sync is disabled unless explicitly enabled via feature flag.

## Webhooks Registered

### Required
- `app/uninstalled` - Cleanup handler at `/integrations/shopify/webhooks/app/uninstalled`

### Optional (Feature-Flagged)
- `products/update` - Only if `FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK=true` (default: false)

## Environment Variables

### Required
```bash
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-app-domain.com
SHOPIFY_SCOPES=read_products,write_products
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### Feature Flags (Default: false)
```bash
FF_SHOPIFY_APP_ENABLED=false  # Must be true to enable app
FF_SHOPIFY_ATTRIBUTION_SYNC=false  # Enable orders access
FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK=false  # Enable products/update webhook
```

## Installation Steps

1. **Configure Shopify Partners Dashboard**:
   - App URL: `https://your-domain.com/integrations/shopify`
   - Redirect URLs: `https://your-domain.com/api/proxy/integrations/shopify/auth/callback`
   - Scopes: `read_products` (and optionally `write_products`)
   - Embedded: `true`

2. **Set Environment Variables**:
   ```bash
   export FF_SHOPIFY_APP_ENABLED=true
   export SHOPIFY_API_KEY=your_key
   export SHOPIFY_API_SECRET=your_secret
   export SHOPIFY_APP_URL=https://your-domain.com
   ```

3. **Start Services**:
   ```bash
   # Backend
   uvicorn services.api_gateway.main:app --host 0.0.0.0 --port 8000
   
   # Frontend
   cd apps/frontend
   npm run dev
   ```

4. **Install in Test Store**:
   - Visit Shopify Partners Dashboard
   - Click "Install app" on test store
   - Complete OAuth flow
   - App loads in Shopify Admin

## API Endpoints

### POST /integrations/shopify/connect
Creates or retrieves workspace binding for a Shopify store.

**Request**:
```json
{
  "contract_version": "input_contract_v1",
  "shop_domain": "example.myshopify.com",
  "shopify_app_installation_id": "install_123",
  "requested_at": "2023-10-27T10:00:00Z"
}
```

**Response**:
```json
{
  "contract_version": "output_contract_v1",
  "workspace_id": "ws_abc123",
  "shop_domain": "example.myshopify.com",
  "status": "CONNECTED",
  "correlation_id": "corr_xyz"
}
```

### POST /integrations/shopify/promote
Creates a Kaivo campaign draft for a Shopify product.

**Request**:
```json
{
  "contract_version": "input_contract_v1",
  "shop_domain": "example.myshopify.com",
  "product": {
    "shopify_product_id": "gid://shopify/Product/123",
    "title": "Product Name",
    "description_html": "<p>Description</p>",
    "primary_image_url": "https://example.com/image.jpg",
    "image_urls": ["https://example.com/image.jpg"],
    "product_url": "https://example.com/products/product",
    "variants": [{
      "variant_id": "gid://shopify/ProductVariant/456",
      "price": 29.99,
      "sku": "SKU123",
      "inventory_quantity": 100
    }]
  },
  "presets": {
    "goal": "SALES",
    "daily_budget_usd": 50.0,
    "channels": "DEFAULT_MIX"
  },
  "requested_at": "2023-10-27T10:00:00Z"
}
```

**Response**:
```json
{
  "contract_version": "output_contract_v1",
  "kaivo_campaign_id": "cmp_abc123",
  "status": "SUBMITTED",
  "correlation_id": "corr_xyz",
  "created_at": "2023-10-27T10:00:00Z"
}
```

### GET /integrations/shopify/campaigns
Lists campaigns created via Shopify app.

**Query Parameters**:
- `shop_domain` (required): Store domain
- `correlation_id` (optional): Correlation ID for tracing

**Response**:
```json
{
  "contract_version": "output_contract_v1",
  "shop_domain": "example.myshopify.com",
  "campaigns": [{
    "kaivo_campaign_id": "cmp_abc123",
    "shopify_product_id": "gid://shopify/Product/123",
    "status": "SUBMITTED",
    "created_at": "2023-10-27T10:00:00Z"
  }],
  "correlation_id": "corr_xyz"
}
```

### POST /integrations/shopify/disconnect
Disconnects a Shopify store from Kaivo.

**Request**:
```json
{
  "contract_version": "input_contract_v1",
  "shop_domain": "example.myshopify.com",
  "requested_at": "2023-10-27T10:00:00Z"
}
```

**Response**:
```json
{
  "contract_version": "output_contract_v1",
  "shop_domain": "example.myshopify.com",
  "status": "DISCONNECTED",
  "correlation_id": "corr_xyz"
}
```

## Webhook Endpoints

### POST /integrations/shopify/webhooks/app/uninstalled
Handles app uninstall cleanup.

**Headers**:
- `X-Shopify-Shop-Domain`: Store domain
- `X-Shopify-Hmac-Sha256`: HMAC signature

**Cleanup Actions**:
1. Deletes access token from database
2. Marks workspace binding inactive
3. Stops background jobs for store
4. No further calls to Shopify API

## Error Handling

All endpoints return stable error shapes:

```json
{
  "contract_version": "output_contract_v1",
  "error_code": "ERROR_CODE",
  "error_message": "Human-readable error message",
  "retryable": true,
  "correlation_id": "corr_xyz"
}
```

**Error Codes**:
- `FEATURE_DISABLED` - App disabled via feature flag
- `CONNECT_ERROR` - Connection failed
- `PROMOTE_ERROR` - Promotion failed
- `LIST_CAMPAIGNS_ERROR` - Campaign list failed
- `DISCONNECT_ERROR` - Disconnect failed

## Reviewer Walkthrough Script

1. **Install App**:
   - Go to Shopify Partners Dashboard
   - Click "Install app" on test store
   - Verify OAuth redirect works
   - App loads in Shopify Admin

2. **Connect Store**:
   - App shows "Not Connected" banner
   - Click "Connect Store" button
   - Complete OAuth flow
   - Verify "Connected" status appears

3. **Promote Product**:
   - Click "Promote Product" card
   - Select a product using ResourcePicker
   - Choose goal (Sales/Traffic/Awareness)
   - Set daily budget (e.g., $50)
   - Click "Promote Product"
   - Verify success message with campaign ID

4. **View Campaigns**:
   - Navigate to "Campaigns" page
   - Verify created campaign appears in list
   - Check status is "SUBMITTED"

5. **Settings**:
   - Navigate to "Settings" page
   - Verify data use summary is displayed
   - Verify privacy policy link works
   - Verify Tier 0 disclosure is shown
   - Click "Disconnect Store"
   - Verify disconnect success

6. **Uninstall Cleanup**:
   - Uninstall app from Shopify Admin
   - Verify webhook is received
   - Check database: access token deleted
   - Verify no further API calls are made

## Uninstall Cleanup Behavior

When app is uninstalled:

1. **Webhook Received**: `app/uninstalled` webhook triggers cleanup handler
2. **Token Deletion**: Access token is deleted from `shopify_connections` table
3. **Binding Inactive**: Workspace binding is effectively inactive (connection deleted)
4. **Webhooks Cleared**: Shopify automatically clears webhook subscriptions
5. **Jobs Stopped**: Background jobs for store are cancelled
6. **No Further Calls**: No additional Shopify API calls are made

## Data Use Summary

**Data Accessed**:
- Store metadata (domain, installation ID) for connection management
- Product catalog (title, description, images, variants, prices) for campaign creation
- Product updates (if enabled) to keep campaign data current

**Why Accessed**:
- To enable product promotion campaigns
- To manage store connection and workspace binding

**Data Retention**:
- Data retained while store is connected
- On uninstall: tokens deleted, bindings marked inactive

**Uninstall Cleanup**:
- Access tokens deleted
- Webhooks unregistered
- Workspace bindings marked inactive
- Background jobs stopped
- No further Shopify API calls

## Pricing & Tiers

- **Tier 0 (Free)**: Available to all users
- No cost for basic product promotion
- Clear disclosure in Settings page

## Privacy Policy

Privacy Policy is available at `/privacy` and linked from Settings page.

## Testing

Run test suite:
```bash
pytest integrations/shopify/tests/
```

**Test Coverage**:
- 6 happy path tests
- 6 negative path tests
- 4 edge case tests
- 1 regression guard
- 1 determinism guard
- Webhook tests
- Feature flag tests

## Observability

All actions log structured events with:
- `shop_domain`
- `workspace_id`
- `correlation_id`
- `execution_id` (if present)

Metrics tracked:
- `shopify_install_total`
- `shopify_connect_total`
- `shopify_promote_total`
- `shopify_error_total`
- `shopify_uninstall_total`
- `shopify_action_duration_seconds`

Traces created for each action with OpenTelemetry.

## Feature Flags

All flags default to `false` for safe rollout:

- `FF_SHOPIFY_APP_ENABLED`: Master switch (must be true)
- `FF_SHOPIFY_ATTRIBUTION_SYNC`: Enable orders access
- `FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK`: Enable products/update webhook

## Rollback

To disable app immediately:
```bash
export FF_SHOPIFY_APP_ENABLED=false
# Restart service
```

All endpoints will return 503 with `FEATURE_DISABLED` error.
