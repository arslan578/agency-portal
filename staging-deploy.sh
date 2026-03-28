#!/bin/bash
# Wrapper script for Staging Deployment
set -euo pipefail
# This script deploys the current code to the Staging environment.

echo "🚀 Starting Deployment to STAGING..."

# Verify connectivity
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Error: Cannot connect to Kubernetes cluster. Check KUBE_CONFIG."
    exit 1
fi
./infrastructure/scripts/deploy.sh staging
echo "✅ Staging Deployment Complete!"
