
#!/bin/bash
set -e

echo "============================================="
echo "   KaivoCore Infrastructure Wizard (Staging)"
echo "============================================="
echo ""
echo "This script will help you provision the Kubernetes cluster on DigitalOcean."
echo ""

# 1. Get Token
echo "Step 1: Credentials"
echo "Please enter your DigitalOcean API Token (hidden input):"
read -s DO_TOKEN
echo ""

if [ -z "$DO_TOKEN" ]; then
    echo "❌ Error: Token cannot be empty."
    exit 1
fi

echo "✅ Token received."
echo ""

# 2. Initialize
echo "Step 2: Initializing Terraform..."
cd infrastructure/terraform
terraform init
echo "✅ Initialization complete."
echo ""

# 3. Apply
echo "Step 3: Provisioning Cluster..."
echo "Running 'terraform apply'. usage charges may apply."
echo "You will be asked to type 'yes' to confirm."
terraform apply -var="do_token=$DO_TOKEN"

# 4. Export
echo ""
echo "Step 4: Exporting Configuration..."
terraform output -raw kube_config > ../../staging-kubeconfig.yaml
echo "✅ Kubeconfig saved to 'staging-kubeconfig.yaml'"

echo ""
echo "============================================="
echo "   Infrastructure Provisioning Complete!"
echo "============================================="
echo "Next Steps:"
echo "1. Run: ./infrastructure/scripts/setup_gh_config.sh"
echo "   (or copy staging-kubeconfig.yaml content to GitHub Secret KUBE_CONFIG)"
