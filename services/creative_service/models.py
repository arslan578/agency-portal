from sqlalchemy import Column, Integer, String, JSON, ForeignKey, Text, DateTime, Boolean, Float
from datetime import datetime
from packages.db.database import Base

class CreativeAsset(Base):
    __tablename__ = "creative_assets"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), index=True, nullable=True)
    type = Column(String) # 'image', 'video', 'audio'
    url = Column(String)
    metadata_json = Column(JSON) # Resolution, duration, etc.
    status = Column(String, default="processing") # 'processing', 'ready', 'error'

class ProductDocument(Base):
    __tablename__ = "product_documents"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, index=True)
    title = Column(String(255))
    description = Column(Text)  # Short human label
    storage_key = Column(String(512))  # R2 key or URL
    file_type = Column(String(50))  # pdf, docx, txt, markdown, html
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    word_count = Column(Integer, nullable=True)
    tags = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)


class SavedVariant(Base):
    __tablename__ = "saved_variants"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    brand_id = Column(Integer, nullable=True)
    brief = Column(Text, nullable=False)
    objective = Column(String(50), nullable=True)
    target_lang = Column(String(10), default="en")
    variants_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
