#!/bin/bash
set -euo pipefail

# Scan directories for Kubernetes manifests
SEARCH_PATH="infrastructure/k8s"

echo "=============================================="
echo " MANIFEST SECRETS INVENTORY"
echo "=============================================="

# Generate manifest dump from Kustomize (Staging)
echo "Building manifests for staging..."
if command -v kustomize >/dev/null 2>&1; then
    MANIFESTS=$(kustomize build infrastructure/k8s/overlays/staging)
else
    MANIFESTS=$(kubectl kustomize infrastructure/k8s/overlays/staging)
fi

echo ""
echo "Secrets Referenced (envFrom / secretKeyRef):"
# We look for "secretName: X" or "name: X" under secretKeyRef contexts.
# This simple grep is an approximation. Ideally use 'yq'.
echo "$MANIFESTS" | grep -A 5 "secretKeyRef" | grep "name:" | awk '{print $2}' | sort | uniq | sed 's/^/- /'

echo ""
echo "Secret Keys Referenced:"
echo "$MANIFESTS" | grep -A 5 "secretKeyRef" | grep "key:" | awk '{print $2}' | sort | uniq | sed 's/^/- /'


echo "=============================================="
