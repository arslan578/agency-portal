#!/usr/bin/env python3
"""
Debug Google Ads campaign fetch for a linked client (same path as GET /clients/{id}/google-ads-insights).

Run from repo root (loads DATABASE_URL + GOOGLE_ADS_* from project .env via packages.db.database):

  .\\venv\\Scripts\\python.exe scripts\\debug_google_insights.py
  .\\venv\\Scripts\\python.exe scripts\\debug_google_insights.py --client-id 2
  .\\venv\\Scripts\\python.exe scripts\\debug_google_insights.py --name "Nova Skincare"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Repo root on sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from packages.db.database import SessionLocal  # noqa: E402
from packages.db.models import Agency, Client  # noqa: E402
from services.account_service.google_agency_service import (  # noqa: E402
    _agency_google_connector_creds,
    fetch_client_google_ads_insights,
)
from services.platform_service.connectors.google import GoogleAdsConnector  # noqa: E402
from services.platform_service.connector_base import PlatformStatus  # noqa: E402


def _env_flags() -> dict[str, bool]:
    return {
        "GOOGLE_ADS_DEVELOPER_TOKEN": bool(os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip()),
        "GOOGLE_ADS_CLIENT_ID": bool(os.getenv("GOOGLE_ADS_CLIENT_ID", "").strip()),
        "GOOGLE_ADS_CLIENT_SECRET": bool(os.getenv("GOOGLE_ADS_CLIENT_SECRET", "").strip()),
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID": bool(os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "").strip()),
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Print Google Ads insights + raw campaign fetch for a client")
    p.add_argument("--client-id", type=int, default=None, help="Client primary key")
    p.add_argument(
        "--name",
        type=str,
        default="Nova Skincare",
        help="Substring match on client.name (ilike) if --client-id not set",
    )
    args = p.parse_args()

    print("Env (set = True, missing = False):", json.dumps(_env_flags(), indent=2))

    session = SessionLocal()
    try:
        if args.client_id is not None:
            client = session.query(Client).filter(Client.id == args.client_id).first()
        else:
            client = session.query(Client).filter(Client.name.ilike(f"%{args.name}%")).first()

        if not client:
            print("ERROR: No client found.")
            sys.exit(1)

        agency = session.query(Agency).filter(Agency.id == client.agency_id).first()
        print(
            "Client:",
            client.id,
            client.name,
            "| agency_id:",
            client.agency_id,
            "| agency_google_ads_customer_id:",
            getattr(client, "agency_google_ads_customer_id", None),
            "| google_ads_account_status:",
            getattr(client, "google_ads_account_status", None),
        )
        print(
            "Agency google_ads_refresh_token:",
            "yes" if agency and getattr(agency, "google_ads_refresh_token", None) else "no",
        )

        payload = fetch_client_google_ads_insights(
            session, client_id=client.id, agency_id=client.agency_id, user_id=None
        )
        print("\n=== fetch_client_google_ads_insights (API-shaped) ===")
        print(json.dumps(payload, indent=2, default=str))

        cid = (getattr(client, "agency_google_ads_customer_id", None) or "").replace("-", "").strip()
        if agency and cid and agency.google_ads_refresh_token:
            creds = _agency_google_connector_creds(agency)
            conn = GoogleAdsConnector(credentials=creds)
            print("\n=== GoogleAdsConnector raw fetch_campaigns_for_customer ===")
            print("connector.status:", conn.status)
            if conn.status != PlatformStatus.AVAILABLE:
                print("Connector not AVAILABLE — check GOOGLE_ADS_* env + SDK.")
            else:
                raw = conn.fetch_campaigns_for_customer(cid)
                print(json.dumps(raw, indent=2, default=str))
    finally:
        session.close()


if __name__ == "__main__":
    main()
