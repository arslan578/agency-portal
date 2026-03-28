#!/bin/bash
# Wrapper script for Production Deployment
# This script deploys the current code to the Production environment.

echo "🚀 Starting Deployment to PRODUCTION..."
echo "⚠️  Are you sure you want to deploy to PRODUCTION? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]]
then
    ./infrastructure/scripts/deploy.sh production
    echo "✅ Production Deployment Complete!"
else
    echo "❌ Deployment Cancelled."
fi
