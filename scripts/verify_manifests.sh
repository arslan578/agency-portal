#!/bin/bash
set -e

# Verify Production Manifests (Strict Domain Check)
echo "Checking Production Manifests..."
if grep -q "host: getkaivo.com" infrastructure/k8s/overlays/production/kustomization.yaml; then
    echo "❌ FAIL: Production Ingress Host is set to bare 'getkaivo.com'. Must be 'app.getkaivo.com'."
    exit 1
fi
if grep -q "value: getkaivo.com" infrastructure/k8s/overlays/production/kustomization.yaml; then
    echo "❌ FAIL: Production Ingress Host value is set to bare 'getkaivo.com'."
    exit 1
fi
if grep -q "app.getkaivo.com" infrastructure/k8s/overlays/production/kustomization.yaml; then
    echo "✅ PASS: Production using app.getkaivo.com"
else
     echo "❌ FAIL: Production does not seem to use app.getkaivo.com"
     exit 1
fi

# Verify Production Env Patch
echo "Checking Production Env Patch..."
if grep -q "value: \"https://app.getkaivo.com\"" infrastructure/k8s/overlays/production/env-patch.yaml; then
    echo "✅ PASS: Production Env Patch uses https://app.getkaivo.com"
else
     echo "❌ FAIL: Production Env Patch does not match https://app.getkaivo.com"
     exit 1
fi

# Verify Staging Manifests
echo "Checking Staging Manifests..."
if grep -q "staging.getkaivo.com" infrastructure/k8s/overlays/staging/kustomization.yaml; then
    echo "❌ FAIL: Staging Ingress Host is set to old 'staging.getkaivo.com'. Must be 'staging.app.getkaivo.com'."
    exit 1
fi
    if ! grep -q "staging-app.getkaivo.com" infrastructure/k8s/overlays/staging/kustomization.yaml; then
        echo "❌ Staging Kustomization HOST mismatch (Expected staging-app.getkaivo.com)"
else
     echo "❌ FAIL: Staging does not seem to use staging.app.getkaivo.com"
     exit 1
fi

# Verify Staging Env Patch
echo "Checking Staging Env Patch..."
if grep -q "value: \"https://staging.app.getkaivo.com\"" infrastructure/k8s/overlays/staging/env-patch.yaml; then
    echo "✅ PASS: Staging Env Patch uses https://staging.app.getkaivo.com"
else
     echo "❌ FAIL: Staging Env Patch does not match https://staging.app.getkaivo.com"
     exit 1
fi

echo "All Manifest Checks Passed"
