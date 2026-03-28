# TikTok Ads Integration Guide

## Overview

Kaivo supports TikTok Ads as a third advertising platform alongside Google Ads and Meta Ads. This integration enables AI-driven campaign creation and management through the TikTok Marketing API.

## Setup Instructions

### 1. Obtain TikTok API Credentials

To use TikTok Ads with Kaivo, you need to:

1. **Create a TikTok Business Account**: Sign up at [ads.tiktok.com](https://ads.tiktok.com)
2. **Create a TikTok App**: Go to [developers.tiktok.com](https://developers.tiktok.com) and create an app
3. **Get API Credentials**:
   - App ID
   - App Secret
   - Access Token (long-lived token recommended for production)
   - Advertiser ID

### 2. Configure Environment Variables

Add the following environment variables to your `.env` file or deployment configuration:

```bash
# TikTok Ads API Credentials
TIKTOK_APP_ID=your_app_id_here
TIKTOK_APP_SECRET=your_app_secret_here
TIKTOK_ACCESS_TOKEN=your_access_token_here
TIKTOK_ADVERTISER_ID=your_advertiser_id_here
```

### 3. Production Deployment

For production deployments using Render, add these variables in the Render dashboard:
- Navigate to your service settings
- Add each variable as an encrypted environment variable
- Ensure `sync: false` is set in `render.yaml` (already configured)

## Supported Features

### Campaign Types

- **In-Feed Video**: Standard video ads in TikTok feed
- **Spark Ads**: Native-style ads using existing TikTok content
- **Brand Takeover**: Full-screen ads on app open (Phase 2)
- **TopView**: Video ads that appear first in feed (Phase 2)

### Objectives

- Awareness
- Traffic
- Conversions
- Video Views
- App Installs

### Bidding Strategies

- **Lowest Cost**: Automated bidding without cap
- **Cost Cap**: Automated bidding with cost per action target
- **Bid Cap**: Manual bidding with maximum bid
- **Maximize Conversions**: Automated optimization for conversions

### Targeting Options

- Custom Audiences
- Location (Country, Region, City)
- Age (13-65)
- Gender
- Interests
- Behaviors
- Devices
- Language

### Creative Formats

#### Video Ads
- **Aspect Ratio**: 9:16 (vertical)
- **Resolution**: 720x1280 minimum, 1080x1920 recommended
- **Duration**: 5-60 seconds
- **Formats**: MP4, MOV
- **Max File Size**: 500 MB

#### Image Ads
- **Resolution**: 1080x1080 recommended
- **Min Size**: 720x720
- **Formats**: JPG, PNG
- **Max File Size**: 10 MB

#### Text Requirements
- **Ad Text**: Max 100 characters
- **Headline**: Max 40 characters

## API Endpoints

### Launch Campaign

```http
POST /platforms/tiktok/campaigns/{campaign_id}/launch
```

Launches a campaign to TikTok Ads platform.

**Request Body** (optional):
```json
{
  "campaign_config": {
    "status": "PAUSED"
  }
}
```

**Response**:
```json
{
  "success": true,
  "platform_campaign_id": "123456789",
  "status": "enabled",
  "created_at": "2025-01-15T10:00:00Z",
  "objective": "TRAFFIC",
  "message": "Campaign created successfully on TikTok with ID: 123456789",
  "correlation_id": "abc123"
}
```

### Test Connection

```http
POST /platforms/tiktok/test-connection
```

Tests the TikTok API connection and returns advertiser account information.

**Response**:
```json
{
  "success": true,
  "advertiser_info": {
    "advertiser_id": "123456789",
    "advertiser_name": "My Advertiser Account"
  },
  "correlation_id": "abc123"
}
```

## Usage Examples

### Creating a TikTok Campaign via Kaivo

1. **Select Platform**: In the campaign wizard, select "TikTok" as one of your platforms
2. **Configure Campaign**: Set your campaign goal, budget, and targeting
3. **Add Creatives**: Upload video or image assets following TikTok specifications
4. **Launch**: Click "Start Campaign" to launch to TikTok

### Programmatic Campaign Creation

```python
from services.platform_service.connector_factory import get_connector

# Get TikTok connector
connector = get_connector("tiktok")

# Launch campaign
campaign_config = {
    "name": "My TikTok Campaign",
    "goal": "traffic",
    "total_budget_cents": 100000,  # $1000
    "status": "PAUSED"
}

result = connector.launch_campaign(campaign_config)
print(f"Campaign ID: {result['platform_campaign_id']}")
```

## Rate Limits

TikTok Marketing API has strict rate limits:
- **200 requests per hour** per advertiser
- Implemented automatic retry with exponential backoff
- Request queuing for high-volume operations

## Error Handling

### Common Error Codes

- `TIKTOK_AUTH_FAILED`: Invalid or expired access token
- `TIKTOK_RATE_LIMITED`: Rate limit exceeded (429)
- `TIKTOK_POLICY_VIOLATION`: Campaign violates TikTok policies
- `TIKTOK_INVALID_REQUEST`: Invalid request parameters
- `TIKTOK_INTERNAL_ERROR`: TikTok API internal error

### Retry Logic

The connector automatically retries on:
- HTTP 429 (Rate Limit)
- HTTP 5xx (Server Errors)
- Network timeouts

Retries use exponential backoff with jitter to avoid thundering herd problems.

## Known Limitations

The following features are not yet supported:
- Offline conversion upload
- Dynamic creative optimization
- Automated creative generation
- Brand Takeover and TopView campaigns (Phase 2)

## Troubleshooting

### Campaign Creation Fails

1. **Check Credentials**: Verify all environment variables are set correctly
2. **Verify Advertiser ID**: Ensure the advertiser ID is valid and active
3. **Check Budget**: Minimum daily budget is $20 (2000 cents)
4. **Review Creative Specs**: Ensure video/image assets meet TikTok requirements

### Connection Test Fails

1. **Verify Access Token**: Check if token is expired or invalid
2. **Check App Permissions**: Ensure app has required advertising permissions
3. **Verify Advertiser ID**: Confirm advertiser account exists and is accessible

### Rate Limit Errors

1. **Reduce Request Frequency**: Implement request queuing
2. **Use Retry Logic**: Connector automatically retries with backoff
3. **Monitor Rate Limits**: Track API usage to stay within limits

## API Documentation

For detailed TikTok Marketing API documentation, visit:
- [TikTok Marketing API Docs](https://ads.tiktok.com/help/article?aid=10028)
- [TikTok Business API Reference](https://business-api.tiktok.com/open_api/v1.3/)

## Support

For issues or questions:
1. Check the logs for detailed error messages
2. Review the connector contract: `connectors/tiktok_ads/tiktok_ads_connector_contract_v1.json`
3. Contact Kaivo support with correlation IDs from failed requests
