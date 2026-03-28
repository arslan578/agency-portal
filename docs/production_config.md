# Production Configuration & Secrets

**Scope**: Runtime configuration for Staging and Production environments.
**Status**: Live

## 1. Secrets Management
Secrets are managed via Kubernetes Secrets, primarily `kaivo-secrets`.

### `kaivo-secrets` (Required)
Must exist in `staging` and `production` namespaces.

| Key | Description | Required | Source |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | **Yes** | DO Managed DB |
| `OPENAI_API_KEY` | API Key for AI Ops | **Yes** | OpenAI Dashboard |
| `STRIPE_SECRET_KEY` | Stripe Secret Key | **Yes** | Stripe Dashboard |
| `SHOPIFY_API_KEY` | Shopify App API Key | **No** (Optional) | Shopify Partners |
| `SHOPIFY_API_SECRET`| Shopify App API Secret | **No** (Optional) | Shopify Partners |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID | **No** (Optional) | Cloudflare |
| `R2_ACCESS_KEY_ID` | R2 Access Key | **No** (Optional) | Cloudflare |
| `R2_SECRET_ACCESS_KEY`| R2 Secret Key | **No** (Optional) | Cloudflare |
| `R2_BUCKET` | R2 Bucket Name | **No** (Optional) | Cloudflare |

### `kaivo-core-container-registry` (Required)
Docker registry pull secret for `registry.digitalocean.com`.
Must be present in namespaces or linked via ServiceAccount.

## 2. Environment Variables (ConfigMaps / Envs)

### Feature Flags (Defaults)
All feature flags default to `false` (OFF) if missing.

| Key | Default | Description |
| :--- | :--- | :--- |
| `FF_STRICT_ENV_VALIDATION` | `false` | If `true`, service crashes on start if env vars missing. |
| `FF_STANDARD_ERRORS` | `false` | Enable standardized error objects. |
| `FF_STABLE_JSON` | `false` | Enable determined JSON serialization. |
| `FF_POLICY_MIRROR_V1` | `false` | Enable Policy Mirror Engine V1. |
| `FF_SHOPIFY_ATTRIBUTION_SYNC`| `false` | Enable attribution sync logic. |

### Service-Specific Vars

#### Frontend
| Key | Required | Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://api.getkaivo.com` (Prod) / `https://staging-api.getkaivo.com` (Staging) |
| `NEXT_PUBLIC_SHOPIFY_API_KEY`| **Yes** | Matches `SHOPIFY_API_KEY` |

#### Orchestrator / Services
| Key | Required | Value |
| :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` |
| `HOST` | **Yes** | App URL (e.g. `https://app.getkaivo.com`) |
| `SCOPES` | **Yes** | Shopify Scopes (`read_products`) |

## 3. Registry Strategy
**Primary**: DigitalOcean Container Registry (DOCR)
**URL**: `registry.digitalocean.com/kaivo` (or appropriate namespace)
**Auth**: `kaivo-core-container-registry` secret (patched into `default` ServiceAccount).

## 4. Operational Best Practices
- **Strict Validation**: Enable `FF_STRICT_ENV_VALIDATION=true` in Staging first.
- **Secret Rotation**: Rotate `kaivo-secrets` keys manually via `kubectl` and restart deployments.
