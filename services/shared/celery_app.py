import os
from celery import Celery

# Get Redis URL from environment variables, default to localhost for dev
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "kaivo_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "services.campaign_service.tasks",
        "services.reporting_service.ingestion",
        "services.shared.tasks.heartbeat"
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "services.campaign_service.tasks.*": {"queue": "campaigns"},
        "services.reporting_service.ingestion.*": {"queue": "reporting"},
        "shared_tasks.heartbeat": {"queue": "default"},
    },
)

# Log loaded tasks on startup (best effort, as this runs on import)
import logging
logger = logging.getLogger(__name__)
logger.info(f"Celery App Initialized. Loaded modules: {celery_app.conf.include}")

