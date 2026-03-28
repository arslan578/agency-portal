import uuid
from datetime import datetime, timezone
from typing import List, Optional
import httpx

from integrations.shopify.api.schemas import (
    ConnectInputV1, ConnectOutputV1, ConnectStatus,
    PromoteInputV1, PromoteOutputV1, PromoteStatus,
    CampaignsOutputV1, CampaignItem, CampaignStatus,
    DisconnectInputV1, DisconnectOutputV1, DisconnectStatus,
    NormalizedProduct, ProductVariant
)
from integrations.shopify.persistence.repo import get_persistence
from integrations.shopify.services.observability import (
    log_shopify_action,
    record_metric
)
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException
from packages.db.database import get_db as get_db_session

class ShopifyIntegrationService:
    def __init__(self, persistence, db: Session):
        self.persistence = persistence
        self.db = db

    async def connect(self, input_data: ConnectInputV1) -> ConnectOutputV1:
        correlation_id = f"corr_{uuid.uuid4().hex[:8]}"
        
        # Check if binding exists
        workspace_id = self.persistence.get_binding(input_data.shop_domain)
        
        if not workspace_id:
            # Create new workspace binding (In reality, might fetch from Account Service)
            # For V1, we generate a stable ID or just a new UUID
            workspace_id = f"ws_{uuid.uuid4().hex[:8]}"
            self.persistence.create_binding(input_data.shop_domain, workspace_id)
            self.persistence.save_installation(input_data.shop_domain, input_data.shopify_app_installation_id)
            
            log_shopify_action(
                action="connect_workspace_created",
                shop_domain=input_data.shop_domain,
                workspace_id=workspace_id,
                correlation_id=correlation_id
            )
        else:
            log_shopify_action(
                action="connect_workspace_retrieved",
                shop_domain=input_data.shop_domain,
                workspace_id=workspace_id,
                correlation_id=correlation_id
            )

        return ConnectOutputV1(
            workspace_id=workspace_id,
            shop_domain=input_data.shop_domain,
            status=ConnectStatus.CONNECTED,
            correlation_id=correlation_id
        )

    async def _fetch_product_from_shopify(
        self, 
        shop_domain: str, 
        product_id: str
    ) -> NormalizedProduct:
        """
        Fetch product from Shopify Admin API and normalize it.
        Real API call for Milestone 1.
        """
        # Get connection and access token
        connection = self.persistence.get_connection(shop_domain)
        if not connection:
            raise HTTPException(
                status_code=404,
                detail=f"Shop {shop_domain} is not connected. Please connect first via /auth"
            )
        
        access_token = connection.access_token
        
        try:
            # Call Shopify Admin API - GET /admin/api/2024-10/products/{product_id}.json
            api_url = f"https://{shop_domain}/admin/api/2024-10/products/{product_id}.json"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    api_url,
                    headers={
                        "X-Shopify-Access-Token": access_token,
                        "Content-Type": "application/json"
                    }
                )
                response.raise_for_status()
                data = response.json()
            
            # Extract product from response
            shopify_product = data.get("product", {})
            if not shopify_product:
                raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
            
            # Normalize to NormalizedProduct schema
            variants = []
            for variant in shopify_product.get("variants", []):
                variants.append(ProductVariant(
                    variant_id=str(variant.get("id", "")),
                    price=float(variant.get("price", 0)),
                    sku=variant.get("sku"),
                    inventory_quantity=variant.get("inventory_quantity")
                ))
            
            images = shopify_product.get("images", [])
            image_urls = [img.get("src", "") for img in images if img.get("src")]
            primary_image = image_urls[0] if image_urls else ""
            
            # Build product URL
            handle = shopify_product.get("handle", "")
            product_url = f"https://{shop_domain}/products/{handle}" if handle else ""
            
            return NormalizedProduct(
                shopify_product_id=str(shopify_product.get("id", "")),
                title=shopify_product.get("title", ""),
                description_html=shopify_product.get("body_html"),
                primary_image_url=primary_image,
                image_urls=image_urls,
                product_url=product_url,
                variants=variants
            )
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise HTTPException(status_code=401, detail="Invalid or expired access token")
            elif e.response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Product {product_id} not found in Shopify store")
            else:
                raise HTTPException(
                    status_code=e.response.status_code,
                    detail=f"Shopify API error: {e.response.text}"
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error fetching product: {str(e)}")

    async def promote(self, input_data: PromoteInputV1) -> PromoteOutputV1:
        # Normalize shop domain for consistent storage and lookup
        normalized_shop_domain = input_data.shop_domain.lower().strip()
        
        # Verify connection exists
        workspace_id = self.persistence.get_binding(normalized_shop_domain)
        if not workspace_id:
            raise HTTPException(
                status_code=404,
                detail=f"Shop {normalized_shop_domain} is not connected. Please connect first via /auth"
            )
        # Ensure correlation_id exists (if not provided by client)
        correlation_id = input_data.correlation_id or f"corr_{uuid.uuid4().hex[:12]}"

        # Deterministic Idempotency Key Logic
        if input_data.idempotency_key:
            idempotency_key = input_data.idempotency_key
        else:
            # Derive deterministic key: shop_domain + shopify_product_id + goal + daily_budget_usd + channels
            # Normalize budget to 2 decimal places for canonicalization
            normalized_budget = f"{float(input_data.presets.daily_budget_usd):.2f}"
            
            import hashlib
            raw_key = f"{normalized_shop_domain}|{input_data.product.shopify_product_id}|{input_data.presets.goal.value}|{normalized_budget}|{input_data.presets.channels.value}"
            idempotency_key = hashlib.md5(raw_key.encode()).hexdigest()

        # Check for existing record
        existing_campaign = await self.persistence.get_campaign_by_idempotency_key(idempotency_key)
        if existing_campaign:
            return PromoteOutputV1(
                kaivo_campaign_id=existing_campaign["kaivo_campaign_id"],
                status=existing_campaign["status"],
                correlation_id=correlation_id,
                created_at=existing_campaign["created_at"]
            )

        # Create New Campaign ID (server-side generation as per spec)
        kaivo_campaign_id = f"cmp_{uuid.uuid4().hex[:12]}"
        
        created_at = datetime.now(timezone.utc).isoformat()
        
        # Save campaign structure with normalized shop_domain
        campaign_record = {
            "kaivo_campaign_id": kaivo_campaign_id,
            "idempotency_key": idempotency_key,
            "shop_domain": normalized_shop_domain,  # Use normalized domain
            "shopify_product_id": input_data.product.shopify_product_id,
            "status": CampaignStatus.SUBMITTED, # Simulating immediate submission
            "created_at": created_at,
            "payload": input_data.dict() # Store full payload
        }
        
        await self.persistence.save_campaign(campaign_record)

        return PromoteOutputV1(
            kaivo_campaign_id=kaivo_campaign_id,
            status=PromoteStatus.SUBMITTED,
            correlation_id=correlation_id,
            created_at=created_at
        )

    async def list_campaigns(self, shop_domain: str, correlation_id: str) -> CampaignsOutputV1:
        # Normalize shop domain for consistent lookup
        normalized_shop_domain = shop_domain.lower().strip()
        records = await self.persistence.list_campaigns(normalized_shop_domain)
        
        items = []
        for r in records:
            items.append(CampaignItem(
                kaivo_campaign_id=r["kaivo_campaign_id"],
                shopify_product_id=r["shopify_product_id"],
                status=r["status"],
                created_at=r["created_at"]
            ))

        return CampaignsOutputV1(
            shop_domain=normalized_shop_domain,
            campaigns=items,
            correlation_id=correlation_id
        )

    async def disconnect(self, input_data: DisconnectInputV1) -> DisconnectOutputV1:
        self.persistence.remove_binding(input_data.shop_domain)
        
        return DisconnectOutputV1(
            shop_domain=input_data.shop_domain,
            status=DisconnectStatus.DISCONNECTED,
            correlation_id=f"corr_{uuid.uuid4().hex[:8]}"
        )

# Factory
async def get_service(db: Session = Depends(get_db_session)):
    p = get_persistence(db)
    return ShopifyIntegrationService(p, db)
