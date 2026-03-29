"""
Meta Business Manager Nightly Sync Job for Agency Portal.

Runs as a scheduled task to sync Meta data for all connected agencies.
Wraps the existing single-account sync pattern:
  for agency in agencies_with_meta_connected:
      for client in agency.clients_with_linked_meta:
          sync_meta_account(account_id, access_token)
          log_audit(...)
"""

import logging
from datetime import datetime
from sqlalchemy.orm import Session
from packages.db.database import SessionLocal
from services.account_service.meta_bm_service import (
    get_agencies_with_meta_connected,
    get_clients_with_linked_meta,
    check_token_validity,
    log_audit,
    _fetch_campaigns_live,
    _fetch_ad_sets,
    _cache_set,
)

logger = logging.getLogger(__name__)


def sync_meta_account(account_id: str, access_token: str) -> dict:
    """
    Sync a single Meta ad account — fetches campaigns and ad sets.
    Reuses existing fetch functions from meta_bm_service.
    """
    result = {
        "account_id": account_id,
        "campaigns_count": 0,
        "ad_sets_count": 0,
        "success": False,
        "error": None,
    }

    try:
        campaigns = _fetch_campaigns_live(account_id, access_token)
        result["campaigns_count"] = len(campaigns)

        ad_sets = _fetch_ad_sets(account_id, access_token)
        result["ad_sets_count"] = len(ad_sets)

        # Refresh caches
        _cache_set(f"ad_sets:{account_id}", ad_sets)

        result["success"] = True
        logger.info(
            f"Synced Meta account {account_id}: "
            f"{len(campaigns)} campaigns, {len(ad_sets)} ad sets"
        )
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Meta sync failed for {account_id}: {e}")

    return result


def run_meta_nightly_sync() -> dict:
    """
    Main nightly sync entry point.
    Iterates all connected agencies → all linked clients → syncs each.
    """
    db: Session = SessionLocal()
    stats = {
        "agencies_processed": 0,
        "clients_synced": 0,
        "clients_failed": 0,
        "started_at": datetime.utcnow().isoformat(),
    }

    try:
        agencies = get_agencies_with_meta_connected(db)
        logger.info(f"Meta nightly sync: found {len(agencies)} connected agencies")

        for agency in agencies:
            # Check token validity
            token_info = check_token_validity(agency)
            if not token_info.get("valid"):
                logger.warning(
                    f"Agency {agency.id} ({agency.name}): Meta token invalid/expired, skipping"
                )
                log_audit(
                    db,
                    "meta_token_expired",
                    agency_id=agency.id,
                    details={"reason": token_info.get("reason", "unknown"), "context": "nightly_sync"},
                )
                continue

            stats["agencies_processed"] += 1
            clients = get_clients_with_linked_meta(db, agency.id)
            logger.info(
                f"Agency {agency.id} ({agency.name}): syncing {len(clients)} linked clients"
            )

            for client in clients:
                try:
                    sync_result = sync_meta_account(
                        account_id=client.agency_meta_account_id,
                        access_token=agency.meta_agency_access_token,
                    )

                    log_audit(
                        db,
                        "meta_nightly_sync",
                        agency_id=agency.id,
                        client_id=client.id,
                        details={
                            "account_id": client.agency_meta_account_id,
                            "campaigns_count": sync_result["campaigns_count"],
                            "ad_sets_count": sync_result["ad_sets_count"],
                            "success": sync_result["success"],
                        },
                    )

                    if sync_result["success"]:
                        stats["clients_synced"] += 1
                    else:
                        stats["clients_failed"] += 1
                        logger.error(
                            f"Sync failed for client {client.id} "
                            f"(account {client.agency_meta_account_id}): "
                            f"{sync_result.get('error')}"
                        )

                except Exception as e:
                    stats["clients_failed"] += 1
                    logger.error(f"Unexpected error syncing client {client.id}: {e}")

        stats["completed_at"] = datetime.utcnow().isoformat()
        logger.info(f"Meta nightly sync complete: {stats}")
        return stats

    except Exception as e:
        logger.error(f"Meta nightly sync fatal error: {e}")
        stats["error"] = str(e)
        return stats
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = run_meta_nightly_sync()
    print(f"Sync result: {result}")
