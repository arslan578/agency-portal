from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Enum, DECIMAL, JSON, DateTime, Text
from sqlalchemy.orm import relationship, remote
from sqlalchemy.sql import func
from packages.db.database import Base
import enum

# --- Enums ---

class AgencyRole(enum.Enum):
    ADMIN = "agency_admin"
    MEMBER = "agency_member"
    VIEWER = "agency_viewer"

class ClientRole(enum.Enum):
    OPERATOR = "client_operator"
    VIEWER = "client_viewer"

class CampaignStatus(enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DISABLED = "DISABLED"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"

class InvoiceStatus(enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"

class PlanTier(enum.Enum):
    FREE = "free"
    STARTER = "starter"
    GROWTH = "growth"
    SCALE = "scale"
    ENTERPRISE = "enterprise"

class PlanStatus(enum.Enum):
    DRAFT = "DRAFT"
    CONVERTED = "CONVERTED"


def _enum_db_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Persist Enum .value to PostgreSQL when labels match values (not Python member names)."""
    return [e.value for e in enum_cls]


class InviteStatus(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"

# --- Core Models ---

class User(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # Nullable for OAuth users
    full_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    agency_memberships = relationship("packages.db.models.AgencyMembership", back_populates="user")
    client_memberships = relationship("packages.db.models.ClientMembership", back_populates="user")

class Agency(Base):
    __tablename__ = "agencies"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    stripe_customer_id = Column(String, nullable=True)
    # Optional contact/profile fields used in the agency portal
    email = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    website = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    currency = Column(String(8), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    current_plan = Column(
        Enum(
            PlanTier,
            name="plantier",
            values_callable=_enum_db_values,
            create_type=False,
        ),
        default=PlanTier.FREE,
    )
    credits = Column(DECIMAL(10, 2), default=0.00, nullable=False)
    billing_status = Column(String, default="active")

    # --- Meta Business Manager ---
    meta_business_manager_id = Column(String(100), nullable=True)
    meta_business_manager_name = Column(String(255), nullable=True)
    meta_agency_access_token = Column(Text, nullable=True)
    meta_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    meta_connected_at = Column(DateTime(timezone=True), nullable=True)
    # --- Reddit Agency OAuth ---
    reddit_agency_access_token = Column(Text, nullable=True)
    reddit_refresh_token = Column(Text, nullable=True)
    reddit_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    reddit_connected_at = Column(DateTime(timezone=True), nullable=True)
    # --- Spotify Agency OAuth ---
    spotify_agency_access_token = Column(Text, nullable=True)
    spotify_refresh_token = Column(Text, nullable=True)
    spotify_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    spotify_connected_at = Column(DateTime(timezone=True), nullable=True)
    # --- TikTok Agency OAuth ---
    tiktok_agency_access_token = Column(Text, nullable=True)
    tiktok_refresh_token = Column(Text, nullable=True)
    tiktok_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    tiktok_connected_at = Column(DateTime(timezone=True), nullable=True)
    
    memberships = relationship("packages.db.models.AgencyMembership", back_populates="agency")
    clients = relationship("packages.db.models.Client", back_populates="agency")
    invoices = relationship("packages.db.models.Invoice", back_populates="agency")
    subscriptions = relationship("packages.db.models.Subscription", back_populates="agency")

class AgencyMembership(Base):
    __tablename__ = "agency_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False)
    role = Column(
        Enum(
            AgencyRole,
            name="agencyrole",
            values_callable=_enum_db_values,
            create_type=False,
        ),
        default=AgencyRole.VIEWER,
    )

    user = relationship("packages.db.models.User", back_populates="agency_memberships")
    agency = relationship("packages.db.models.Agency", back_populates="memberships")

class AgencyInvite(Base):
    """Pending invitations to join an agency"""
    __tablename__ = "agency_invites"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False)
    email = Column(String, nullable=False, index=True)
    role = Column(
        Enum(
            AgencyRole,
            name="agencyrole",
            values_callable=_enum_db_values,
            create_type=False,
        ),
        default=AgencyRole.VIEWER,
    )
    token = Column(String, unique=True, nullable=False, index=True)
    status = Column(
        Enum(
            InviteStatus,
            name="invitestatus",
            values_callable=_enum_db_values,
            create_type=False,
        ),
        default=InviteStatus.PENDING,
    )
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    agency = relationship("packages.db.models.Agency")
    invited_by = relationship("packages.db.models.User")

class Client(Base):
    __tablename__ = "clients"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    industry = Column(String, nullable=True)
    website = Column(String, nullable=True)
    
    # Settings
    markup_percent = Column(DECIMAL(10, 4), default=1.0000) # e.g. 1.20 for 20% markup
    is_active = Column(Boolean, default=True)
    account_mode = Column(String(20), default="kaivo_managed") # 'kaivo_managed' | 'reporting_only'

    # --- Meta Business Manager linking ---
    agency_meta_account_id = Column(String(100), nullable=True)
    meta_account_status = Column(String(30), default="agency_not_connected")
    meta_account_name = Column(String(255), nullable=True)
    meta_linked_at = Column(DateTime(timezone=True), nullable=True)
    # --- Reddit account linking ---
    agency_reddit_account_id = Column(String(100), nullable=True)
    reddit_account_status = Column(String(30), default="agency_not_connected")
    reddit_account_name = Column(String(255), nullable=True)
    reddit_linked_at = Column(DateTime(timezone=True), nullable=True)
    # --- Spotify account linking ---
    agency_spotify_account_id = Column(String(100), nullable=True)
    spotify_account_status = Column(String(30), default="agency_not_connected")
    spotify_account_name = Column(String(255), nullable=True)
    spotify_linked_at = Column(DateTime(timezone=True), nullable=True)
    # --- TikTok account linking ---
    agency_tiktok_account_id = Column(String(100), nullable=True)
    tiktok_account_status = Column(String(30), default="agency_not_connected")
    tiktok_account_name = Column(String(255), nullable=True)
    tiktok_linked_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agency = relationship("packages.db.models.Agency", back_populates="clients")
    memberships = relationship("packages.db.models.ClientMembership", back_populates="client")
    campaigns = relationship("Campaign", back_populates="client")
    audiences = relationship("packages.db.models.Audience", back_populates="client")
    platform_accounts = relationship("packages.db.models.PlatformAccount", back_populates="client")
    invoices = relationship("packages.db.models.Invoice", back_populates="client")
    permissions = relationship("packages.db.models.ClientUserPermission", back_populates="client")

class ClientMembership(Base):
    __tablename__ = "client_memberships"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    role = Column(Enum(ClientRole), default=ClientRole.VIEWER)

    user = relationship("packages.db.models.User", back_populates="client_memberships")
    client = relationship("packages.db.models.Client", back_populates="memberships")

class ClientUserPermission(Base):
    __tablename__ = "client_user_permissions"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    user_id = Column(Integer, index=True) # Reference to Auth Service User ID
    role = Column(String, default="client_viewer")

    client = relationship("packages.db.models.Client", back_populates="permissions")

# --- Campaign & Assets ---

class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    name = Column(String)
    goal = Column(String) # 'awareness', 'traffic', 'conversion'
    total_budget_cents = Column(Integer)
    audience_id = Column(Integer)
    platform_allocations_json = Column(JSON) # {"tiktok": 500, "meta": 500}
    status = Column(Enum(PlanStatus), default=PlanStatus.DRAFT)
    # Optional Shopify fields
    shopify_shop_domain = Column(String, nullable=True)
    shopify_product_id = Column(String, nullable=True)
    # Media fields
    media_url = Column(Text, nullable=True)
    media_type = Column(String, nullable=True)
    
    client = relationship("Client", foreign_keys=[client_id])

class PlatformAccount(Base):
    __tablename__ = "platform_accounts"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    platform = Column(String, nullable=False) # 'meta', 'tiktok', 'linkedin', 'google'
    account_id = Column(String, nullable=False) # External ID
    access_token = Column(String, nullable=True) # Encrypted ideally
    refresh_token = Column(String, nullable=True)
    
    client = relationship("packages.db.models.Client", back_populates="platform_accounts")

class Audience(Base):
    __tablename__ = "audiences"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    account_id = Column(Integer, index=True) # Added for service compatibility
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    file_url = Column(String, nullable=True) # S3/R2 URL
    is_uploaded = Column(Boolean, default=False)
    
    definition_json = Column(JSON) # Geo, Age, Interests
    platform_audience_ids_json = Column(JSON) # {"tiktok": "aud_123"}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    client = relationship("packages.db.models.Client", back_populates="audiences")
    campaigns = relationship("packages.db.models.Campaign", back_populates="audience")

class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    audience_id = Column(Integer, ForeignKey("audiences.id"), nullable=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True)
    account_id = Column(Integer, index=True)
    
    name = Column(String, nullable=False)
    goal = Column(String, nullable=False) # 'awareness', 'traffic', 'conversion'
    total_budget_cents = Column(Integer, nullable=False)
    # total_budget = Column(DECIMAL(12, 2), nullable=False) # DEPRECATED
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT)
    
    # JSON blobs for flexibility
    platform_allocations = Column(JSON, default={}) # {"meta": 500, "tiktok": 500}
    platform_campaign_ids = Column(JSON, default={}) # {"meta": "act_123", "tiktok": "cmp_456"}
    
    # Media
    media_url = Column(Text, nullable=True) # Cloudinary URL
    media_type = Column(String, nullable=True) # 'image', 'video', 'audio'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client = relationship(
        "Client",
        foreign_keys=[client_id],
        back_populates="campaigns"
    )
    audience = relationship("packages.db.models.Audience", back_populates="campaigns")
    usage_records = relationship("packages.db.models.UsageRecord", back_populates="campaign")

# --- Billing ---

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    
    # Financials
    plan_id = Column(String, nullable=True) # e.g. "growth"
    platform_fees_total = Column(DECIMAL(12, 2), default=0.00)
    kaivo_fees_total = Column(DECIMAL(12, 2), default=0.00)
    agency_markup_total = Column(DECIMAL(12, 2), default=0.00)
    grand_total = Column(DECIMAL(12, 2), default=0.00)
    
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.DRAFT)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agency = relationship("packages.db.models.Agency", back_populates="invoices")
    client = relationship("packages.db.models.Client", back_populates="invoices")

class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False, index=True)
    stripe_subscription_id = Column(String(255), unique=True, nullable=False, index=True)
    stripe_customer_id = Column(String(255))
    plan_id = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    cancel_at_period_end = Column(Boolean, default=False)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    agency = relationship("packages.db.models.Agency", foreign_keys=[agency_id], back_populates="subscriptions")

class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    platform = Column(String, nullable=False)
    
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    
    # Spend Breakdown
    spend_base = Column(DECIMAL(12, 4), default=0.0000) # Raw platform spend
    spend_kaivo = Column(DECIMAL(12, 4), default=0.0000) # Base + Kaivo Markup
    spend_agency = Column(DECIMAL(12, 4), default=0.0000) # Kaivo + Agency Markup
    
    campaign = relationship("packages.db.models.Campaign", back_populates="usage_records")

# --- Platform Credentials ---

class PlatformCredential(Base):
    """
    Secure storage for platform API credentials (tokens, keys, etc.)
    Tokens are encrypted before storage.
    """
    __tablename__ = "platform_credentials"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, nullable=False, index=True)  # Reference to account (no FK constraint for flexibility)
    platform = Column(String(50), nullable=False)  # 'meta', 'google_ads', etc.
    
    # Encrypted fields (store encrypted values)
    access_token_encrypted = Column(Text, nullable=True)  # Encrypted access token
    refresh_token_encrypted = Column(Text, nullable=True)  # Encrypted refresh token
    app_id = Column(String(255), nullable=True)  # Can be stored in plain text
    app_secret_encrypted = Column(Text, nullable=True)  # Encrypted app secret
    
    # Selected Ad Account fields
    ad_account_id = Column(String(255), nullable=True)
    ad_account_name = Column(String(255), nullable=True)
    currency = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)

    
    # Metadata
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# --- Magic Link Tokens ---

class MagicToken(Base):
    """Single-use magic link tokens for passwordless invite authentication"""
    __tablename__ = "magic_tokens"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    role = Column(
        Enum(
            AgencyRole,
            name="agencyrole",
            values_callable=_enum_db_values,
            create_type=False,
        ),
        default=AgencyRole.VIEWER,
    )
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    agency = relationship("packages.db.models.Agency")
    invited_by = relationship("packages.db.models.User")

# --- Shopify Integration ---

class ShopifyConnection(Base):
    __tablename__ = "shopify_connections"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    shop_domain = Column(String, unique=True, index=True, nullable=False)
    access_token = Column(String, nullable=False)
    scope = Column(String, nullable=True)  # Comma-separated scopes
    workspace_id = Column(String, nullable=True)  # Optional: link to workspace
    installed_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# --- Audit Logs ---

class AuditLog(Base):
    """Audit log for tracking Meta operations and other sensitive actions."""
    __tablename__ = "audit_logs"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    details = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agency = relationship("packages.db.models.Agency")
    client = relationship("packages.db.models.Client")
    user = relationship("packages.db.models.User")

