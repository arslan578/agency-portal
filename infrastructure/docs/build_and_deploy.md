# Build and Deploy Pipeline

This document describes the Kaivo CI/CD pipeline for building, tagging, and deploying services.

## Overview

The pipeline is defined in `.github/workflows/deployment.yml`. It consists of three main stages:
1.  **Build & Test**: Runs unit/integration tests. If successful, builds Docker images.
2.  **Deploy to Staging**: Deploys the built images to the Staging Kubernetes cluster.
3.  **Deploy to Production**: (Manual/Release) Deploys to Production.

## Image Building & Tagging

### Build Process
Images are built using `docker build` in the `build-and-test` job. We build images for all 11 services:
*   `account-service`
*   `agent-service`
*   `audience-service`
*   `auth-service`
*   `billing-service`
*   `campaign-service`
*   `creative-service`
*   `frontend`
*   `intelligence-service`
*   `policy-service`
*   `reporting-service`

### Tagging Strategy
We use **immutable tags** based on the git commit hash.
*   **Registry**: `ghcr.io`
*   **Namespace**: `universalmedialtd/kaivocore`
*   **Tag**: `${GITHUB_SHA}` (full commit hash)

Example: `ghcr.io/universalmedialtd/kaivocore-auth-service:a1b2c3d4...`

This ensures that the code tested in CI is *exactly* what runs in the cluster.

### Prerequisites

Before deploying, ensure the following secrets exist in your cluster namespaces (`staging` and `production`):

#### 1. Registry Access (ghcr-secret)
Used to pull images from GHCR. See [Private Registry Authentication](#private-registry-authentication).

#### 2. Application Secrets (kaivo-secrets)
Required for backend services.
```bash
kubectl --kubeconfig=kaivocore-staging-kubeconfig.yaml -n staging create secret generic kaivo-secrets \
  --from-literal=DATABASE_URL="postgresql://user:password@hostname:5432/dbname" \
  --from-literal=STRIPE_SECRET_KEY="sk_test_..."
```

## Deployment Flow
The deployment pipeline consists of the following steps: for configuration management and simple shell scripts for orchestration.

### Key Scripts
*   `infrastructure/scripts/deploy.sh`: The core deployment script.
    *   **Input**: Environment name (`staging` or `production`).
    *   **Environment Variable**: Requires `GIT_SHA` to be set.
    *   **Mechanism**:
        1.  Navigates to `infrastructure/k8s/overlays/<env>`.
        2.  Runs `kustomize edit set image` to update all 11 service placeholders to the specific `ghcr.io/...:${GIT_SHA}` image.
        3.  Runs `kubectl apply -k` to apply the updated manifest.

## Private Registry Authentication

The cluster requires a Kubernetes Secret to pull Docker images from `ghcr.io`.

### Usage
Each environment overlay (`staging` and `production`) patches the **default ServiceAccount** to use a secret named `ghcr-secret`.

### Creation Steps (One-time Setup)
You must manually create this secret in each namespace (`staging` and `production`) using a GitHub Personal Access Token (PAT) with `read:packages` scope.

**Staging:**
```bash
kubectl --kubeconfig=kaivocore-staging-kubeconfig.yaml -n staging \
  create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<YOUR_GITHUB_USERNAME> \
  --docker-password=<YOUR_GHCR_PAT>
```

**Production:**
```bash
kubectl --kubeconfig=kaivocore-production-kubeconfig.yaml -n production \
  create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<YOUR_GITHUB_USERNAME> \
  --docker-password=<YOUR_GHCR_PAT>
```

### Access Control
*   **Staging**: Deployed automatically on push to `main`.
*   **Production**: Protected by GitHub Environment rules (manual approval) and triggered via Release or manual dispatch.

## Manual Deployment / Debugging

To simulate a CI deployment from your local machine (assuming you have `kubectl` access and `kustomize` installed):

1.  Export the target git SHA (must exist in GHCR):
    ```bash
    export GIT_SHA=your_commit_sha_here
    ```
2.  Run the deploy script:
    ```bash
    ./infrastructure/scripts/deploy.sh staging
    ```

**Note**: This modifies the local `kustomization.yaml` file. Do not commit these changes!
