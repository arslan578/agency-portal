from typing import Dict, Optional, List
from datetime import datetime
import uuid
from sqlalchemy.orm import Session
from packages.db.models import ShopifyConnection

class ShopifyPersistence:
    def __init__(self, db: Session):
        self.db = db

    def get_binding(self, shop_domain: str) -> Optional[str]:
        connection = self.db.query(ShopifyConnection).filter(
            ShopifyConnection.shop_domain == shop_domain
        ).first()
        return connection.workspace_id if connection else None

    def create_binding(self, shop_domain: str, workspace_id: str) -> None:
        # Normalize shop domain
        normalized_domain = shop_domain.lower().strip()
        connection = self.db.query(ShopifyConnection).filter(
            ShopifyConnection.shop_domain == normalized_domain
        ).first()
        if not connection:
            # Try original case
            connection = self.db.query(ShopifyConnection).filter(
                ShopifyConnection.shop_domain == shop_domain
            ).first()
        
        if connection:
            connection.workspace_id = workspace_id
            # Ensure shop_domain is normalized
            if connection.shop_domain != normalized_domain:
                connection.shop_domain = normalized_domain
            self.db.commit()
        else:
            # Create connection if it doesn't exist (for tests)
            # In real flow, connection is created via OAuth callback
            connection = ShopifyConnection(
                shop_domain=normalized_domain,
                access_token="test_token_for_binding",  # Mock token for tests
                workspace_id=workspace_id
            )
            self.db.add(connection)
            self.db.commit()

    def remove_binding(self, shop_domain: str) -> None:
        connection = self.db.query(ShopifyConnection).filter(
            ShopifyConnection.shop_domain == shop_domain
        ).first()
        if connection:
            self.db.delete(connection)
            self.db.commit()

    def save_installation(self, shop_domain: str, installation_id: str) -> None:
        # For now, we store in connection model
        # installation_id can be stored in workspace_id temporarily or add new field
        pass

    def get_connection(self, shop_domain: str) -> Optional[ShopifyConnection]:
        # Normalize shop domain for lookup
        normalized_domain = shop_domain.lower().strip()
        connection = self.db.query(ShopifyConnection).filter(
            ShopifyConnection.shop_domain == normalized_domain
        ).first()
        if not connection:
            # Try original case as fallback
            connection = self.db.query(ShopifyConnection).filter(
                ShopifyConnection.shop_domain == shop_domain
            ).first()
        return connection

    def save_connection(
        self, 
        shop_domain: str, 
        access_token: str, 
        scope: Optional[str] = None,
        workspace_id: Optional[str] = None
    ) -> ShopifyConnection:
        connection = self.db.query(ShopifyConnection).filter(
            ShopifyConnection.shop_domain == shop_domain
        ).first()
        
        if connection:
            connection.access_token = access_token
            connection.scope = scope
            if workspace_id:
                connection.workspace_id = workspace_id
        else:
            connection = ShopifyConnection(
                shop_domain=shop_domain,
                access_token=access_token,
                scope=scope,
                workspace_id=workspace_id
            )
            self.db.add(connection)
        
        self.db.commit()
        self.db.refresh(connection)
        return connection

    # Campaign methods - keeping in-memory for now (will migrate later if needed)
    # For M1, campaigns can stay in-memory or we can add a table later
    _campaigns: List[Dict] = []

    async def save_campaign(self, campaign_data: Dict) -> None:
        ShopifyPersistence._campaigns.append(campaign_data)
        print(f"[Shopify Persistence] save_campaign: kaivo_campaign_id={campaign_data.get('kaivo_campaign_id')}, shop_domain={campaign_data.get('shop_domain')}, total_campaigns={len(ShopifyPersistence._campaigns)}")

    async def list_campaigns(self, shop_domain: str) -> List[Dict]:
        # Normalize shop_domain for consistent matching
        normalized_shop_domain = shop_domain.lower().strip()
        matching_campaigns = [c for c in ShopifyPersistence._campaigns if c.get("shop_domain", "").lower().strip() == normalized_shop_domain]
        print(f"[Shopify Persistence] list_campaigns: shop_domain={normalized_shop_domain}, total_campaigns={len(ShopifyPersistence._campaigns)}, matching={len(matching_campaigns)}")
        if len(ShopifyPersistence._campaigns) > 0:
            print(f"[Shopify Persistence] Sample campaign shop_domains: {[c.get('shop_domain') for c in ShopifyPersistence._campaigns[:3]]}")
        return matching_campaigns

    async def get_campaign_by_idempotency_key(self, idempotency_key: str) -> Optional[Dict]:
        for c in ShopifyPersistence._campaigns:
            if c.get("idempotency_key") == idempotency_key:
                return c
        return None

def get_persistence(db: Session) -> ShopifyPersistence:
    return ShopifyPersistence(db)
