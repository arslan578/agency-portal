#!/bin/bash

set -euo pipefail

# Get environment argument (staging/production)
ENV="${1:-}"

if [ -z "$ENV" ]; then
  echo "Usage: $0 <staging|production>"
  exit 1
fi

# Check for GIT_SHA
if [ -z "${GIT_SHA:-}" ]; then
  echo "Error: GIT_SHA environment variable is not set."
  echo "This script expects a specific image tag to deploy."
  exit 1
fi

echo "Deploying to $ENV with tag: $GIT_SHA..."

# Navigate to overlay directory to run kustomize edit
OVERLAY_DIR="infrastructure/k8s/overlays/$ENV"
if [ ! -d "$OVERLAY_DIR" ]; then
  echo "Error: Overlay directory $OVERLAY_DIR does not exist."
  exit 1
fi

pushd "$OVERLAY_DIR" > /dev/null

echo "Updating image tags in $ENV overlay..."

# List of services to update
SERVICES=(
  "account-service"
  "agent-service"
  "api-gateway"
  "audience-service"
  "auth-service"
  "billing-service"
  "campaign-service"
  "creative-service"
  "frontend"
  "i18n-service"
  "intelligence-service"
  "os-runtime-service"
  "policy-service"
  "reporting-service"
)

# Update each image
for SERVICE in "${SERVICES[@]}"; do
  # Base image name in k8s manifests (e.g. kaivo-account-service)
  BASE_IMAGE="kaivo-${SERVICE}"
  # Target image in GHCR
  TARGET_IMAGE="ghcr.io/universalmedialtd/kaivocore-${SERVICE}:${GIT_SHA}"
  
  if ! kustomize edit set image "${BASE_IMAGE}=${TARGET_IMAGE}"; then
      echo "Error updating image for $SERVICE"
      exit 1
  fi
done

echo "Validating kustomize build contains expected images..."
BUILT="$(kustomize build .)"
for SERVICE in "${SERVICES[@]}"; do
  EXPECT="ghcr.io/universalmedialtd/kaivocore-${SERVICE}:${GIT_SHA}"
  echo "$BUILT" | grep -F "$EXPECT" > /dev/null || { echo "Missing image in build output: $EXPECT"; exit 1; }
done
echo "Kustomize build validation passed."

popd > /dev/null

# Function to forcefully sync a secret from a source namespace
force_sync_secret() {
    local SECRET_NAME=$1
    local TARGET_NS=$2
    local ENV_VAR_SOURCE=$3 # "true" if we should try env vars fallback

    echo "--- Syncing $SECRET_NAME to $TARGET_NS ---"
    
    # Check if secret already exists in target namespace
    # Check if secret already exists in target namespace
    # We ONLY skip for 'kaivo-secrets' (Manual App Config).
    # We ALWAYS refresh 'ghcr-secret' (Auth Token) to ensure it's valid.
    if [ "$SECRET_NAME" != "ghcr-secret" ] && kubectl -n "$TARGET_NS" get secret "$SECRET_NAME" > /dev/null 2>&1; then
        echo "Secret $SECRET_NAME already exists in target namespace $TARGET_NS. Skipping sync."
        return 0
    fi

    # Identify source
    local SOURCE_NS=""
    if kubectl -n staging get secret "$SECRET_NAME" > /dev/null 2>&1; then
        SOURCE_NS="staging"
    elif kubectl -n default get secret "$SECRET_NAME" > /dev/null 2>&1; then
        SOURCE_NS="default"
    fi

    if [ -n "$SOURCE_NS" ]; then
        if [ "$SOURCE_NS" == "$TARGET_NS" ]; then
            if [ "$SECRET_NAME" == "ghcr-secret" ] && [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_ACTOR:-}" ]; then
                echo "Refreshing $SECRET_NAME in $TARGET_NS with current GITHUB_TOKEN..."
                kubectl -n "$TARGET_NS" delete secret "$SECRET_NAME" --ignore-not-found
                kubectl -n "$TARGET_NS" create secret docker-registry "$SECRET_NAME" \
                    --docker-server=ghcr.io \
                    --docker-username="$GITHUB_ACTOR" \
                    --docker-password="$GITHUB_TOKEN" \
                    --docker-email="deploy@kaivo.com"
            else
                echo "Secret $SECRET_NAME already exists in target namespace $TARGET_NS. Source is same as target. Skipping copy."
            fi
        else
            echo "Found $SECRET_NAME in '$SOURCE_NS'. Overwriting target..."
            # Force overwrite: delete first to ensure clean state (remove stale keys)
            kubectl -n "$TARGET_NS" delete secret "$SECRET_NAME" --ignore-not-found
            
            kubectl -n "$SOURCE_NS" get secret "$SECRET_NAME" -o yaml | \
            grep -v '^\s*namespace:\s' | \
            grep -v '^\s*uid:\s' | \
            grep -v '^\s*resourceVersion:\s' | \
            grep -v '^\s*creationTimestamp:\s' | \
            kubectl -n "$TARGET_NS" apply -f -
            
            echo "Secret $SECRET_NAME synced from $SOURCE_NS."
        fi
    else
        # Fallback to env vars/manual creation if allowed
        if [ "$ENV_VAR_SOURCE" == "true" ] && [ "$SECRET_NAME" == "ghcr-secret" ]; then
            if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_ACTOR:-}" ]; then
                echo "Creating $SECRET_NAME from GITHUB_TOKEN..."
                kubectl -n "$TARGET_NS" delete secret "$SECRET_NAME" --ignore-not-found
                kubectl -n "$TARGET_NS" create secret docker-registry "$SECRET_NAME" \
                    --docker-server=ghcr.io \
                    --docker-username="$GITHUB_ACTOR" \
                    --docker-password="$GITHUB_TOKEN" \
                    --docker-email="deploy@kaivo.com"
            else
                echo "Error: $SECRET_NAME not found in staging/default and GITHUB_TOKEN missing."
                exit 1
            fi
        else
            echo "Error: $SECRET_NAME not found in staging/default. Cannot proceed."
            exit 1
        fi
    fi
    
    # Validation
    echo "Validating $SECRET_NAME in $TARGET_NS..."
    if kubectl -n "$TARGET_NS" get secret "$SECRET_NAME" > /dev/null 2>&1; then
        echo "Keys present in $SECRET_NAME:"
        if command -v jq >/dev/null 2>&1; then
            kubectl -n "$TARGET_NS" get secret "$SECRET_NAME" -o json | jq -r '.data | keys[]'
        else
            kubectl -n "$TARGET_NS" get secret "$SECRET_NAME" \
             -o go-template='{{range $k,$v := .data}}{{printf "%s\n" $k}}{{end}}'
        fi
    else
        echo "CRITICAL: Secret $SECRET_NAME failed to create in $TARGET_NS!"
        exit 1
    fi
}

# Ensure target namespace exists before syncing secrets
echo "Ensuring namespace $ENV exists..."
kubectl create namespace "$ENV" --dry-run=client -o yaml | kubectl apply --validate=false -f -

force_sync_secret "ghcr-secret" "$ENV" "true"
force_sync_secret "kaivo-secrets" "$ENV" "false"

# Apply K8s manifests
echo "Applying manifests..."
if ! kubectl apply --validate=false -k "$OVERLAY_DIR"; then
    echo "Error applying manifests"
    exit 1
fi

# Preflight check: Verify deployments reference the synced secret
echo "Verifying deployments reference kaivo-secrets..."
if ! kubectl -n "$ENV" get deploy -o yaml | grep -q "name: kaivo-secrets"; then
    echo "Warning: No referencing of 'kaivo-secrets' found in deployments. Secrets might not be used."
    # We warn instead of exit 1 because some apps might not need it, or configMaps might use it.
    # But for this specific issue, it helps verify.
fi

# Force restart to ensure new config/secrets are picked up immediately
echo "Triggering rollout restart for all services..."
for SERVICE in "${SERVICES[@]}"; do
  kubectl -n "$ENV" rollout restart "deployment/$SERVICE" || echo "Warning: Failed to restart $SERVICE"
done

echo "Waiting for rollouts..."
for SERVICE in "${SERVICES[@]}"; do
  # Adjust deployment name if it differs from kaivo-<service>
  # Based on base manifests, deployment name matches service name directly
  DEPLOYMENT_NAME="${SERVICE}"
  echo "Waiting for rollout of deployment/$DEPLOYMENT_NAME..."
  if ! kubectl -n "$ENV" rollout status "deployment/$DEPLOYMENT_NAME" --timeout=300s; then
      echo "Rollout failed for $DEPLOYMENT_NAME"
      echo "================================================================================"
      echo "ROLLOUT FAILURE DIAGNOSTICS"
      echo "================================================================================"
      echo ">>> Deployment Description:"
      kubectl -n "$ENV" describe deploy "$DEPLOYMENT_NAME"
      echo ">>> ReplicaSets:"
      kubectl -n "$ENV" get rs
      echo ">>> Pods (wide):"
      kubectl -n "$ENV" get pods -o wide
      echo ">>> Pod Events:"
      kubectl -n "$ENV" get events --sort-by=.metadata.creationTimestamp | tail -50
      echo ">>> Pod Description (Failing Deployment):"
      # Attempt to find pods for this deployment and describe them
      PODS=$(kubectl -n "$ENV" get pods -l app=$DEPLOYMENT_NAME -o jsonpath='{.items[*].metadata.name}')
      for POD in $PODS; do
        echo "--- Pod: $POD ---"
        kubectl -n "$ENV" describe pod "$POD"
      done
      echo "================================================================================"
      exit 1
  fi
done

echo "Deployed images:"
kubectl -n "$ENV" get deploy -o=jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'

echo "Deployment to $ENV complete."
