from services.shared.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)

@celery_app.task(name="shared_tasks.heartbeat", bind=True)
def heartbeat(self):
    """
    Simple heartbeat task to verify worker status.
    """
    logger.info("Heartbeat task executed successfully.")
    return {"status": "ok"}
