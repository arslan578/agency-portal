#!/bin/bash
set -e

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "Error: 'gh' CLI not found."
    echo "Please install GitHub CLI (https://cli.github.com/) or add the secrets manually in the GitHub UI:"
    echo "Settings -> Secrets and variables -> Actions -> New repository secret"
    echo ""
    echo "Required Secrets:"
    echo "- KUBE_CONFIG: The contents of your ~/.kube/config or the output from Terraform."
    echo "- GHCR_TOKEN: A Personal Access Token (PAT) with 'write:packages' scope."
    echo "- STRIPE_SECRET_KEY: Your Stripe Secret Key."
    echo "- OPENAI_API_KEY: Your OpenAI API Key."
    exit 1
fi

echo "Setting up GitHub Secrets..."

# KUBE_CONFIG
if [ -f "kubeconfig.yaml" ]; then
    gh secret set KUBE_CONFIG < kubeconfig.yaml
    echo "Set KUBE_CONFIG"
else
    echo "Warning: kubeconfig.yaml not found. Skipping KUBE_CONFIG."
fi

# GHCR_TOKEN
echo "Enter your GHCR Token (hidden):"
read -s GHCR_TOKEN
echo "$GHCR_TOKEN" | gh secret set GHCR_TOKEN
echo "Set GHCR_TOKEN"

# Other Secrets
# You can extend this to read from .env or prompt
echo "Secrets setup complete."
