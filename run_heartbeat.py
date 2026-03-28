import sys
import os

# Ensure project root is in sys.path
sys.path.append(os.getcwd())

try:
    from services.shared.tasks.heartbeat import heartbeat
    print("✅ Successfully imported heartbeat task.")
    
    print("🚀 Sending heartbeat task to Celery...")
    result = heartbeat.delay()
    print(f"✅ Task dispatched! Task ID: {result.id}")
    print("Check your Celery worker logs to confirm execution.")

except ImportError as e:
    print(f"❌ Failed to import heartbeat task: {e}")
    print("Ensure you are running this script from the project root.")
except Exception as e:
    print(f"❌ An error occurred: {e}")
