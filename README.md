# KaivoCore

KaivoCore is the backend engine for the Kaivo platform, orchestrating AI agents, campaign management, and reporting.

## 🚀 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## ⚙️ Configuration

**Celery & Redis**: Kaivo uses `REDIS_URL` as the single source of truth for Celery configuration. Do not use `BROKER_URL` or `RESULT_BACKEND`.

## 📱 Supported Advertising Platforms

Kaivo supports multiple advertising platforms:

- **Meta Ads** (Facebook/Instagram) - See [Meta Ads Integration](docs/connectors/meta_connector_bringup.md)
- **Google Ads** - See [Google Ads Integration](docs/connectors/google_connector_bringup.md)
- **TikTok Ads** - See [TikTok Ads Integration](docs/tiktok_ads_integration.md)

Each platform requires specific API credentials configured via environment variables. See the respective integration guides for setup instructions.

## 🛠️ Diagnostics

### Manually Triggering a Heartbeat Task

To verify that the Celery worker is active and processing tasks, you can run the diagnostic heartbeat script:

1.  Ensure your environment is configured (specifically `REDIS_URL`).
2.  Run the script:
    ```bash
    python run_heartbeat.py
    ```
3.  Check the Celery worker logs for the success message.
