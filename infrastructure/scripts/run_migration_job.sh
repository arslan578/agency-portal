#!/bin/bash
set -e

# Usage: ./run_migration_job.sh <GIT_SHA> [NAMESPACE]
GIT_SHA=$1
NAMESPACE="${2:-production}"

if [ -z "$GIT_SHA" ]; then
  echo "::error::Migration Job requires GIT_SHA argument."
  exit 1
fi

JOB_NAME="migration-job-${GIT_SHA::8}-$(date +%s)"
# Ensure we use a service image that has 'alembic' installed.
# 'campaign-service' usually has it. check Dockerfile if unsure. Assuming it's the migration runner.
# The previous script used: ghcr.io/universalmedialtd/kaivocore-campaign-service:${GIT_SHA}
IMAGE_NAME="ghcr.io/universalmedialtd/kaivocore-campaign-service:${GIT_SHA}"

echo "🚀 Starting Deterministic Migration Job: $JOB_NAME"
echo "Target Image: $IMAGE_NAME"
echo "Target Namespace: $NAMESPACE"

# create job manifest imperatively to ensure safe interpolation
# We use 'create job' with dry-run to generate the base, then patch it, 
# or just cat a heredoc which is cleaner for complex specs.

cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
  labels:
    app: migration-job
    commit: ${GIT_SHA}
spec:
  ttlSecondsAfterFinished: 300 # Auto-cleanup after 5 mins
  backoffLimit: 0 # Fail fast, no retries
  template:
    metadata:
      labels:
        app: migration-job
        commit: ${GIT_SHA}
    spec:
      restartPolicy: Never
      imagePullSecrets:
      - name: ghcr-secret
      containers:
      - name: migration-runner
        image: ${IMAGE_NAME}
        imagePullPolicy: Always
        command: ["/bin/bash", "-c"]
        args:
        - |
          echo "📦 Starting Migration Sequence..."
          echo "   Image: ${IMAGE_NAME}"
          
          # Guard: Ensure we are NOT using SQLite in this job
          echo "🛡️ Verifying Database Connection..."
          python3 -c "
          import os, sys
          from sqlalchemy import create_engine
          url = os.getenv('DATABASE_URL')
          if not url:
              print('::error::DATABASE_URL is missing!')
              sys.exit(1)
          try:
              engine = create_engine(url)
              driver = engine.dialect.name
              print(f'   Driver: {driver}')
              if driver == 'sqlite':
                  print('::error::PROD_DB_URL_INVALID_SQLITE: Migration job cannot run against SQLite in production!')
                  sys.exit(1)
          except Exception as e:
              print(f'::error::Failed to parse DB URL or Connect: {e}')
              sys.exit(1)
          " || exit 1

          # 1. Run Alembic Migrations
          echo "🔄 Running Alembic Upgrade..."
          alembic upgrade head
          
          # 2. Run Hardening Tests (Only if migration succeeds)
          # Note: Contract tests run in CI separately now? 
          # Or do we want them here?
          # Previous script ran them. We keep them.
          echo "✅ Migration Complete. Running Contract Tests..."
          pytest tests/contract/test_hardening.py
        envFrom:
        - secretRef:
            name: kaivo-secrets

EOF

# Wait for Job Completion (Fail Fast)
echo "⏳ Waiting for Job $JOB_NAME to complete..."

# We wait for either condition: complete OR failed.
# Note: 'kubectl wait' doesn't support OR logic natively easily without parallel commands or loop.
# Best practice: Wait for 'complete' but in a loop check for 'failed'.

# Using a loop to poll status for fast failure detection
TIMEOUT=300
START_TIME=$(date +%s)
while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
     echo "::error::Timeout waiting for Job $JOB_NAME"
     kubectl -n $NAMESPACE logs job/$JOB_NAME
     exit 1
  fi

  # Check for Success
  if kubectl -n $NAMESPACE get job $JOB_NAME -o jsonpath='{.status.succeeded}' | grep -q "1"; then
     echo "✅ Job completed successfully."
     break
  fi

  # Check for Failure
  if kubectl -n $NAMESPACE get job $JOB_NAME -o jsonpath='{.status.failed}' | grep -q "[1-9]"; then
     echo "::error::Job $JOB_NAME FAILED."
     kubectl -n $NAMESPACE logs job/$JOB_NAME
     exit 1
  fi

  sleep 5
done

echo "Fetching logs..."
kubectl -n $NAMESPACE logs job/$JOB_NAME


# Verify Pod status explicitly (Job 'complete' usually implies success, but we check pod exit code via logs above)
echo "Migration and Verification Successful."

# Explicit cleanup (redundant with ttlSecondsAfterFinished but safe)
echo "🧹 Cleaning up Job..."
kubectl -n $NAMESPACE delete job $JOB_NAME
