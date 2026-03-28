# Re-export models from shared models to avoid duplication
from packages.db.models import (
    User,
    Agency,
    AgencyMembership,
    Client,
    ClientMembership,
    ClientUserPermission,
    PlanTier,
    AgencyRole,
    ClientRole,
    Subscription,
    Plan,
    Campaign,
    Audience,
)

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Enum, DECIMAL
from sqlalchemy.orm import relationship
from packages.db.database import Base
import enum

# --- DEPRECATED: Legacy models kept for backward compatibility ---
# These will be removed in a future cleanup phase

class TierEnum(enum.Enum):
    """DEPRECATED: Use PlanTier from packages.db.models instead"""
    FREE = 0
    STARTER = 1
    GROWTH = 2
    SCALE = 3
    ENTERPRISE = 4

class RoleEnum(enum.Enum):
    """DEPRECATED: Use AgencyRole from packages.db.models instead"""
    OWNER = "owner"
    MANAGER = "manager"
    ANALYST = "analyst"
    BILLING = "billing"

class Account(Base):
    """DEPRECATED: Use Agency from packages.db.models instead"""
    __tablename__ = "accounts"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    tier = Column(Enum(TierEnum), default=TierEnum.FREE)
    monthly_spend = Column(DECIMAL(10, 2), default=0.00)
    billing_status = Column(String, default="active")
    
    parent_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    address = Column(String, nullable=True)

    parent = relationship("Account", remote_side=[id], backref="sub_accounts")
    brands = relationship("Brand", back_populates="account")
    licenses = relationship("License", back_populates="account")

class Brand(Base):
    """DEPRECATED: Use Client from packages.db.models instead"""
    __tablename__ = "brands"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    name = Column(String)
    sector = Column(String)
    logo_url = Column(String, nullable=True)
    
    credits = Column(DECIMAL(10, 2), default=0.00, nullable=False)

    account = relationship("Account", back_populates="brands")

class License(Base):
    """DEPRECATED: Use AgencyMembership from packages.db.models instead"""
    __tablename__ = "licenses"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    user_id = Column(Integer)
    role = Column(Enum(RoleEnum), default=RoleEnum.OWNER)

    account = relationship("Account", back_populates="licenses")

__all__ = [
    # New models (preferred)
    'User', 'Agency', 'AgencyMembership', 'Client', 'ClientMembership', 
    'ClientUserPermission', 'PlanTier', 'AgencyRole', 'ClientRole',
    'Subscription', 'Plan', 'Campaign', 'Audience',
    # Legacy models (deprecated)
    'Account', 'Brand', 'License', 'TierEnum', 'RoleEnum'
]
