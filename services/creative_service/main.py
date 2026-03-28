from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime
from . import models
from services.shared.cloudinary_client import cloudinary_client
from packages.db.database import engine, get_db
import io

# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kaivo Creative Service")

class AssetOut(BaseModel):
    id: int
    brand_id: int
    campaign_id: Optional[int] = None
    type: str
    url: str
    status: str
    metadata_json: Dict[str, Any]

    class Config:
        from_attributes = True

class ProductDocumentOut(BaseModel):
    id: int
    brand_id: int
    title: str
    description: Optional[str] = None
    storage_key: str
    file_type: str
    uploaded_at: datetime
    word_count: Optional[int] = None
    tags: Optional[List[str]] = None
    is_active: bool

    class Config:
        from_attributes = True

class AssetUploadRequest(BaseModel):
    """Request model for asset upload - accepts Cloudinary URL"""
    cloudinary_url: str
    brand_id: int
    campaign_id: Optional[int] = None

@app.post("/assets/upload", response_model=AssetOut)
async def upload_asset(
    request: AssetUploadRequest,
    db: Session = Depends(get_db)
):
    """
    Upload creative asset (image/video/audio) to Cloudinary.
    Accepts Cloudinary URL from frontend widget.
    """
    brand_id = request.brand_id
    cloudinary_url = request.cloudinary_url
    
    # Extract public_id for storage
    public_id = cloudinary_client.extract_public_id(cloudinary_url)
    
    # Determine asset type from URL
    asset_type = "image"
    if "/video/" in cloudinary_url:
        asset_type = "video"
    elif "/raw/" in cloudinary_url:
        asset_type = "raw"
    
    asset = models.CreativeAsset(
        brand_id=brand_id,
        campaign_id=request.campaign_id,
        type=asset_type,
        url=cloudinary_url,
        metadata_json={
            "cloudinary_url": cloudinary_url,
            "public_id": public_id,
            "source": "cloudinary_widget"
        },
        status="ready"
    )
    
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset

@app.get("/assets/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    return db.query(models.CreativeAsset).filter(models.CreativeAsset.id == asset_id).first()

@app.get("/campaigns/{campaign_id}/assets", response_model=List[AssetOut])
def get_campaign_assets(campaign_id: int, db: Session = Depends(get_db)):
    """Get all creative assets for a specific campaign"""
    assets = db.query(models.CreativeAsset).filter(
        models.CreativeAsset.campaign_id == campaign_id
    ).all()
    return assets

@app.delete("/assets/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    """Delete a creative asset"""
    asset = db.query(models.CreativeAsset).filter(models.CreativeAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Optionally delete from Cloudinary
    try:
        if asset.metadata_json and 'public_id' in asset.metadata_json:
            cloudinary_client.delete(asset.metadata_json['public_id'], asset.type)
    except Exception as e:
        print(f"Failed to delete from Cloudinary: {e}")
    
    db.delete(asset)
    db.commit()
    return {"message": "Asset deleted successfully"}

# ===== Product Knowledge Endpoints =====

class ProductDocumentUploadRequest(BaseModel):
    """Request model for product document upload - accepts Cloudinary URL"""
    cloudinary_url: str
    title: Optional[str] = None
    description: Optional[str] = None

@app.post("/brands/{brand_id}/product-docs", response_model=ProductDocumentOut)
async def upload_product_document(
    brand_id: int,
    request: ProductDocumentUploadRequest,
    db: Session = Depends(get_db)
):
    """
    Upload a new product document for a brand.
    Accepts Cloudinary URL from frontend widget.
    
    Args:
        brand_id: Brand ID
        request: Upload request with cloudinary_url
    
    Returns:
        Created ProductDocument
    """
    cloudinary_url = request.cloudinary_url
    
    # Extract public_id from Cloudinary URL
    public_id = cloudinary_client.extract_public_id(cloudinary_url)
    if not public_id:
        raise HTTPException(status_code=400, detail="Invalid Cloudinary URL")
    
    # Determine file type from URL
    file_type = "unknown"
    if '.' in cloudinary_url:
        file_type = cloudinary_url.split('.')[-1].split('?')[0].lower()
    
    # Fetch content for word count calculation (for text files)
    word_count = None
    if file_type in ['txt', 'md', 'markdown']:
        try:
            content = cloudinary_client.fetch_content(cloudinary_url)
            text = content.decode('utf-8')
            word_count = len(text.split())
        except Exception as e:
            print(f"Warning: Could not compute word count: {e}")
    
    # Use public_id as storage_key
    storage_key = public_id
    
    # Determine title from request or extract from URL
    title = request.title
    if not title:
        # Extract filename from public_id
        if '/' in public_id:
            title = public_id.split('/')[-1]
        else:
            title = public_id
    
    # Create database record
    doc = models.ProductDocument(
        brand_id=brand_id,
        title=title,
        description=request.description,
        storage_key=storage_key,
        file_type=file_type,
        word_count=word_count,
        is_active=True
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

@app.get("/brands/{brand_id}/product-docs", response_model=List[ProductDocumentOut])
def list_product_documents(
    brand_id: int,
    db: Session = Depends(get_db)
):
    """
    List all active product documents for a brand.
    
    Args:
        brand_id: Brand ID
    
    Returns:
        List of ProductDocuments
    """
    docs = db.query(models.ProductDocument).filter(
        models.ProductDocument.brand_id == brand_id,
        models.ProductDocument.is_active == True
    ).all()
    return docs

@app.delete("/brands/{brand_id}/product-docs/{doc_id}")
def delete_product_document(
    brand_id: int,
    doc_id: int,
    db: Session = Depends(get_db)
):
    """
    Soft delete a product document (set is_active = false).
    
    Args:
        brand_id: Brand ID
        doc_id: Document ID
    
    Returns:
        Success message
    """
    doc = db.query(models.ProductDocument).filter(
        models.ProductDocument.id == doc_id,
        models.ProductDocument.brand_id == brand_id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Soft delete
    doc.is_active = False
    db.commit()
    
    # Optionally delete from Cloudinary (uncomment if desired)
    # try:
    #     cloudinary_client.delete(doc.storage_key, resource_type="raw")
    # except Exception as e:
    #     print(f"Warning: Could not delete from Cloudinary: {e}")
    
    return {"status": "deleted", "doc_id": doc_id}

@app.get("/brands/{brand_id}/product-docs/{doc_id}/preview")
def preview_product_document(
    brand_id: int,
    doc_id: int,
    max_chars: int = 500,
    db: Session = Depends(get_db)
):
    """
    Get a text preview of a product document.
    
    Args:
        brand_id: Brand ID
        doc_id: Document ID
        max_chars: Maximum characters to return
    
    Returns:
        Preview text or error message
    """
    doc = db.query(models.ProductDocument).filter(
        models.ProductDocument.id == doc_id,
        models.ProductDocument.brand_id == brand_id,
        models.ProductDocument.is_active == True
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Only support text previews for now
    if doc.file_type not in ['txt', 'md', 'markdown', 'html']:
        return {"preview": "Preview not available for this file type"}
    
    try:
        # Build Cloudinary URL from public_id
        cloudinary_url = cloudinary_client.get_url(doc.storage_key, resource_type="raw")
        content = cloudinary_client.fetch_content(cloudinary_url)
        text = content.decode('utf-8')
        preview = text[:max_chars]
        
        return {
            "preview": preview,
            "truncated": len(text) > max_chars,
            "total_length": len(text)
        }
    except Exception as e:
        return {"preview": f"Error loading preview: {str(e)}"}

# ===== Creative Generation Endpoint =====

from .generation import (
    GenerationRequest,
    GenerationResponse,
    generate_creative_variants
)

@app.post("/creative/generate-variants", response_model=GenerationResponse)
async def generate_variants(
    req: GenerationRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Generate creative variants using GPT-4o and product knowledge.
    Auto-saves to DB so users never need to regenerate.
    """
    product_docs_context = ""
    if req.product_document_ids:
        docs = db.query(models.ProductDocument).filter(
            models.ProductDocument.id.in_(req.product_document_ids),
            models.ProductDocument.is_active == True
        ).all()
        
        doc_texts = []
        for doc in docs:
            doc_texts.append(f"=== {doc.title} ===")
            if doc.description:
                doc_texts.append(doc.description)
            if doc.file_type in ['txt', 'md', 'markdown']:
                try:
                    cloudinary_url = cloudinary_client.get_url(doc.storage_key, resource_type="raw")
                    content = cloudinary_client.fetch_content(cloudinary_url)
                    text = content.decode('utf-8')
                    doc_texts.append(text[:2000])
                except Exception as e:
                    print(f"Warning: Could not fetch document content: {e}")
        
        product_docs_context = "\n\n".join(doc_texts)
    
    brand_profile = {}
    
    result = await generate_creative_variants(
        req=req,
        product_docs_context=product_docs_context,
        brand_profile=brand_profile
    )

    # Auto-save to DB
    user_id = _extract_user_id(authorization)
    if user_id and result.variants:
        try:
            variants_serializable = {
                k: [v.dict() if hasattr(v, 'dict') else v for v in vs]
                for k, vs in result.variants.items()
            }
            saved = models.SavedVariant(
                user_id=user_id,
                brand_id=req.brand_id,
                brief=req.brief,
                objective=req.objective,
                target_lang=req.audience.get("language", "en") if req.audience else "en",
                variants_json=variants_serializable,
            )
            db.add(saved)
            db.commit()
            db.refresh(saved)
            result.saved_variant_id = saved.id
        except Exception as e:
            print(f"Warning: Auto-save failed: {e}")
            db.rollback()

    return result


def _extract_user_id(authorization: Optional[str]) -> Optional[int]:
    """Extract user_id from JWT without raising on failure."""
    if not authorization:
        return None
    try:
        from services.auth_service.dependencies import decode_jwt_token
        return decode_jwt_token(authorization)
    except Exception:
        return None


# ===== Saved Variants Endpoints =====

class SaveVariantsRequest(BaseModel):
    brief: str
    objective: Optional[str] = "conversion"
    target_lang: Optional[str] = "en"
    brand_id: Optional[int] = None
    variants: Dict[str, Any]

class SavedVariantOut(BaseModel):
    id: int
    brief: str
    objective: Optional[str]
    target_lang: str
    variants_json: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


@app.post("/creative/variants/save")
async def save_variants(
    req: SaveVariantsRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Save generated variants to DB for future reuse."""
    user_id = _extract_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authorization required")

    saved = models.SavedVariant(
        user_id=user_id,
        brand_id=req.brand_id,
        brief=req.brief,
        objective=req.objective,
        target_lang=req.target_lang or "en",
        variants_json=req.variants,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return {"id": saved.id}


@app.get("/creative/variants/{variant_id}", response_model=SavedVariantOut)
async def get_saved_variant(
    variant_id: int,
    db: Session = Depends(get_db)
):
    """Fetch a saved variant set by ID."""
    saved = db.query(models.SavedVariant).filter(models.SavedVariant.id == variant_id).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved variants not found")
    return saved


@app.get("/creative/variants", response_model=List[SavedVariantOut])
async def list_saved_variants(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """List all saved variant sets for the current user."""
    user_id = _extract_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authorization required")

    results = db.query(models.SavedVariant).filter(
        models.SavedVariant.user_id == user_id
    ).order_by(models.SavedVariant.created_at.desc()).limit(50).all()
    return results

# ===== Translation Endpoints =====

from .translation import translation_service

class TranslationRequest(BaseModel):
    items: Dict[str, List[str]] # e.g. {"headline": ["Buy Now"], "body": ["..."]}
    target_languages: List[str]
    source_language: Optional[str] = "auto"

class GeoRecommendationRequest(BaseModel):
    countries: List[str]

@app.post("/creative/translate")
async def translate_creative(req: TranslationRequest):
    """
    Translate and naturalize creative assets.
    """
    return translation_service.process_translations(
        items=req.items, 
        target_languages=req.target_languages,
        source_lang=req.source_language
    )

@app.post("/creative/recommend-languages")
async def recommend_languages(req: GeoRecommendationRequest):
    """
    Get language recommendations based on geography.
    """
    return {"recommendations": translation_service.recommend_languages_for_geo(req.countries)}
