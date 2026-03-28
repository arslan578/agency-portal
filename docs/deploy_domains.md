# Deployment Domain Checklist

**CRITICAL**: Ensure these prerequisites are met before deploying the `frontend-clean-rebuild-vertical-slice` branch.

## 1. DNS Configuration
Ensure the following A/CNAME records exist and point to your Ingress Load Balancer IP:

- [ ] **Production**: `app.getkaivo.com`
- [ ] **Staging**: `staging-app.getkaivo.com`

## 2. TLS/SSL Certificates
Ensure your cert-manager ClusterIssuer or manual Secret contains valid certificates for:

- [ ] **Subject**: `app.getkaivo.com`
- [ ] **SANs**: `staging.app.getkaivo.com`

*Failure to have these certificates will result in browser security errors.*

## 3. Ingress Verification
Verify `kubectl get ingress -n production` and `-n staging` match:

- **Production**: Host rule matches `app.getkaivo.com`.
- **Staging**: Host rule matches `staging.app.getkaivo.com`.

## 4. Environment Variables (Auto-Configured)
The deployment manifests now automatically set:
- `NEXT_PUBLIC_API_URL` -> (Matches above domains)
- `KAIVO_ENV` -> `production` or `staging`
