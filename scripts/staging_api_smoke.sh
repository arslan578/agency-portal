#!/bin/bash
set -euo pipefail

# HARD GATE: Integration Smoke Test
# Verifies that Staging APIs are reachable and accepting requests relative to the Vertical Slice.

# 1. Inputs & Defaults
EMAIL="${1:-}"
PASSWORD="${2:-}"
# Default values
API_HOST="${3:-https://staging-app.getkaivo.com}"
ACCOUNT_ID="${4:-}"
 Account ID (Default 1)
ACCOUNT_ID="${4:-1}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
    echo "Usage: ./staging_api_smoke.sh <email> <password> [api_host] [account_id]"
    exit 1
fi

# 2. Preflight Check
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq to run this script."
    exit 1
fi

echo "--- Starting Smoke Test ---"
echo "Target: $API_HOST"

# 3. Authenticate
echo "Step 1: Authenticating..."
TOKEN_RES=$(curl -s -X POST "$API_HOST/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

# Extract Token (Cleanly)
TOKEN=$(echo "$TOKEN_RES" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Authentication Failed"
    echo "Response: $TOKEN_RES"
    exit 1
fi

echo "✅ Auth Success"

# 4. Create Audience (Required for Plan)
echo "Step 2: Creating Audience..."
AUDIENCE_RES=$(curl -s -X POST "$API_HOST/api/audience/audiences/" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"account_id\": $ACCOUNT_ID,
        \"name\": \"Smoke Test Audience $(date +%s)\",
        \"definition\": {\"location\": \"US\"}
    }")

AUDIENCE_ID=$(echo "$AUDIENCE_RES" | jq -r '.id')
if [ "$AUDIENCE_ID" == "null" ]; then
    echo "❌ Audience Creation Failed"
    echo "$AUDIENCE_RES"
    exit 1
fi
echo "✅ Audience Created: $AUDIENCE_ID"

# 5. Create Plan (Uses Audience ID)
echo "Step 3: Creating Plan..."
PLAN_RES=$(curl -s -X POST "$API_HOST/api/campaign/plans/" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"account_id\": $ACCOUNT_ID,
        \"name\": \"Smoke Test Plan $(date +%s)\",
        \"goal\": \"awareness\",
        \"total_budget\": 1000,
        \"audience_id\": $AUDIENCE_ID,
        \"platform_allocations_json\": {\"meta\": 100}
    }")

PLAN_ID=$(echo "$PLAN_RES" | jq -r '.id')

if [ "$PLAN_ID" == "null" ]; then
    echo "❌ Plan Creation Failed"
    echo "$PLAN_RES"
    exit 1
fi

echo "✅ Plan Created: $PLAN_ID"

# 6. Launch Plan
echo "Step 4: Launching Plan..."
LAUNCH_RES=$(curl -s -X POST "$API_HOST/api/campaign/plans/$PLAN_ID/launch" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "null")

CAMPAIGN_ID=$(echo "$LAUNCH_RES" | jq -r '.id')
if [ "$CAMPAIGN_ID" == "null" ]; then
    echo "❌ Launch Failed"
    echo "$LAUNCH_RES"
    exit 1
fi
echo "✅ Plan Launched as Campaign: $CAMPAIGN_ID"

# 7. Verify Reporting
echo "Step 5: Verifying Reporting Endpoint..."
REPORT_RES=$(curl -s -w "%{http_code}" -o /dev/null \
    -H "Authorization: Bearer $TOKEN" \
    "$API_HOST/api/reporting/reports/campaign/$CAMPAIGN_ID")

if [ "$REPORT_RES" -eq 200 ]; then
     echo "✅ Reporting Endpoint reachable (Status 200)"
elif [ "$REPORT_RES" -eq 404 ]; then
     echo "⚠️ Reporting returned 404 (Acceptable Transient State: Report not ready yet)"
else
    echo "❌ Reporting Failed (Status $REPORT_RES)"
    exit 1
fi

echo "---------------------------------"
echo "🎉 SMOKE TEST PASSED"
exit 0
