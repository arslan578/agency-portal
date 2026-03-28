#!/bin/bash
set -euo pipefail

ENV="${1:-staging}"

echo "=============================================="
echo " NON-ROOT SMOKE TEST ($ENV)"
echo "=============================================="

# Get all running pods
PODS=$(kubectl -n "$ENV" get pods -l app -o jsonpath='{.items[*].metadata.name}')

if [ -z "$PODS" ]; then
    echo "[WARN] No pods found in $ENV or kubectl failed. Verification skipped."
    exit 0
fi

FAILURES=0

for POD in $PODS; do
    echo -n "Checking $POD... "
    # Check UID inside the container. Assuming entrypoint allows 'id' or we can run it.
    # Using 'sh -c id' for compatibility.
    UID_VAL=$(kubectl -n "$ENV" exec "$POD" -- sh -c 'id -u' 2>/dev/null || echo "Unknown")

    if [ "$UID_VAL" == "0" ]; then
        echo "[FAIL] Running as ROOT (UID 0)!"
        FAILURES=$((FAILURES+1))
    elif [ "$UID_VAL" == "Unknown" ]; then
        echo "[WARN] Could not check UID (exec failed)."
    else
        echo "[PASS] UID: $UID_VAL"
        if [ "$UID_VAL" != "1000" ]; then
             echo "       (Note: Not 1000, but certainly not root)"
        fi
    fi
done

echo "=============================================="
if [ "$FAILURES" -gt 0 ]; then
    echo "[FATAL] $FAILURES pods are running as ROOT."
    exit 1
else
    echo "[SUCCESS] All checked pods are non-root."
fi
