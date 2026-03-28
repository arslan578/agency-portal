#!/bin/bash
set -e

ENV=$1

if [ -z "$ENV" ]; then
  echo "Usage: $0 <staging|production>"
  exit 1
fi

echo "Getting Ingress IP for $ENV..."

kubectl get ingress kaivo-ingress -n $ENV -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
echo ""
echo "If the IP is empty, the LoadBalancer might still be provisioning. Wait a few minutes and try again."
