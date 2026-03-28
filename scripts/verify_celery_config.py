import os
import sys
from pathlib import Path

# Add project root to sys.path to simulate Docker environment
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# Simulate Docker environment where services/shared is copied to /app/shared
# We can't easily simulate the /app/shared copy locally without messing with sys.path
# But we can verify services.shared.celery_app

print(f"Project Root: {project_root}")
print(f"sys.path: {sys.path}")

# Set mock REDIS_URL
os.environ["REDIS_URL"] = "redis://mock-redis:6379/0"

try:
    print("\n--- Attempting import from services.shared.celery_app ---")
    from services.shared.celery_app import celery_app
    print("✅ Import successful!")
    
    print(f"Broker URL: {celery_app.conf.broker_url}")
    print(f"Result Backend: {celery_app.conf.result_backend}")
    
    if celery_app.conf.broker_url == "redis://mock-redis:6379/0":
        print("✅ Broker URL matches REDIS_URL")
    else:
        print(f"❌ Broker URL mismatch: {celery_app.conf.broker_url}")

    if celery_app.conf.result_backend == "redis://mock-redis:6379/0":
        print("✅ Result Backend matches REDIS_URL")
    else:
        print(f"❌ Result Backend mismatch: {celery_app.conf.result_backend}")

except ImportError as e:
    print(f"❌ Import failed: {e}")
except Exception as e:
    print(f"❌ Unexpected error: {e}")

print("\n--- Verifying Registered Tasks ---")
try:
    # We need to mock the imports that the tasks rely on, or just check the 'include' list
    print(f"Include List: {celery_app.conf.include}")
    
    expected_modules = [
        "services.campaign_service.tasks",
        "services.reporting_service.ingestion",
        "services.shared.tasks.heartbeat"
    ]
    
    missing = [m for m in expected_modules if m not in celery_app.conf.include]
    
    if not missing:
        print("✅ All expected task modules are included.")
    else:
        print(f"❌ Missing modules in include list: {missing}")

except Exception as e:
    print(f"❌ Error verifying tasks: {e}")


