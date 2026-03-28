#!/usr/bin/env bash
set -euo pipefail

OUT="pr_evidence.txt"
: > "$OUT"

echo "## Git SHA" >> "$OUT"
git rev-parse HEAD >> "$OUT"
echo "" >> "$OUT"

echo "## Compile Check" >> "$OUT"
.venv/bin/python -m py_compile services/api_gateway/main.py >> "$OUT" 2>&1
echo "Success" >> "$OUT"
echo "" >> "$OUT"

echo "## Hermetic E2E Tests (No DB)" >> "$OUT"
PORT=8020
NEXT_PUBLIC_API_URL="http://localhost:${PORT}/api" TEST_MODE=true FF_OS_RUNTIME_ENABLED=false \
  .venv/bin/uvicorn services.api_gateway.main:app --port "${PORT}" --host 127.0.0.1 > /tmp/gw_e2e.log 2>&1 &
PID=$!

cleanup() { kill "$PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

sleep 3

NEXT_PUBLIC_API_URL="http://localhost:${PORT}/api" TEST_MODE=true \
  .venv/bin/python -m pytest -q tests/e2e/test_os_activation.py >> "$OUT" 2>&1

cleanup
trap - EXIT
echo "" >> "$OUT"

echo "## Integration Tests (Agent Consumption)" >> "$OUT"
TEST_MODE=true .venv/bin/python -m pytest -q tests/integration/test_agent_os_consumption.py >> "$OUT" 2>&1
echo "" >> "$OUT"

echo "## Curl Trio Evidence" >> "$OUT"

# Flag OFF
PORT=8021
NEXT_PUBLIC_API_URL="http://localhost:${PORT}/api" TEST_MODE=true FF_OS_RUNTIME_ENABLED=false \
  .venv/bin/uvicorn services.api_gateway.main:app --port "${PORT}" --host 127.0.0.1 > /tmp/gw_off.log 2>&1 &
PID=$!
trap 'kill "$PID" >/dev/null 2>&1 || true' EXIT
sleep 3

echo "### Flag OFF: GET /capabilities" >> "$OUT"
curl --max-time 5 -s "http://localhost:${PORT}/capabilities" >> "$OUT"
echo "" >> "$OUT"

echo "### Flag OFF: POST /os/run (expect 403 FEATURE_DISABLED)" >> "$OUT"
curl --max-time 5 -s -i -X POST "http://localhost:${PORT}/os/run" -d '{}' >> "$OUT"
echo "" >> "$OUT"

kill "$PID" >/dev/null 2>&1 || true
trap - EXIT

# Flag ON
PORT=8022
NEXT_PUBLIC_API_URL="http://localhost:${PORT}/api" TEST_MODE=true FF_OS_RUNTIME_ENABLED=true \
  .venv/bin/uvicorn services.api_gateway.main:app --port "${PORT}" --host 127.0.0.1 > /tmp/gw_on.log 2>&1 &
PID=$!
trap 'kill "$PID" >/dev/null 2>&1 || true' EXIT
sleep 3

echo "### Flag ON: POST /os/run no token (expect 401 UNAUTHORIZED)" >> "$OUT"
curl --max-time 5 -s -i -X POST "http://localhost:${PORT}/os/run" -d '{}' >> "$OUT"
echo "" >> "$OUT"

echo "### Flag ON: POST /os/run token + invalid body (expect 400 INVALID_REQUEST)" >> "$OUT"
curl --max-time 5 -s -i -X POST "http://localhost:${PORT}/os/run" \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{}' >> "$OUT"
echo "" >> "$OUT"

kill "$PID" >/dev/null 2>&1 || true
trap - EXIT

echo "DONE: wrote ${OUT}"

# Explicit SHA Chain Verification
CODE_SHA=$(grep -m1 -A1 '## Git SHA' "$OUT" | tail -n1 | tr -d '\r')
EVIDENCE_SHA=$(git rev-parse HEAD)
IMAGE_TAG="$CODE_SHA"

echo ""
echo "=== EVIDENCE SUMMARY ==="
echo "CODE_SHA (from file): $CODE_SHA"
echo "EVIDENCE_SHA (HEAD):  $EVIDENCE_SHA"
echo "OS_RUNTIME_IMAGE_TAG: $IMAGE_TAG"
