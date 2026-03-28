import pytest
from typing import Generator
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import enum
from unittest.mock import MagicMock

# --- httpx Compatibility Patch for TestClient ---
# Fix for httpx/starlette version incompatibility where httpx.Client.__init__()
# doesn't accept 'app' parameter that starlette.testclient.TestClient tries to pass
# Starlette's TestClient creates _TestClientTransport internally and passes it as 'transport',
# but also tries to pass 'app' which newer httpx versions reject. 
# We need to remove 'app' but ensure transport is properly set up.
import httpx

_original_client_init = httpx.Client.__init__

def _patched_client_init(self, *args, **kwargs):
    """Patched __init__ that removes 'app' parameter if present and transport is provided"""
    # Starlette's TestClient creates _TestClientTransport and passes it as 'transport'
    # It also tries to pass 'app' which newer httpx doesn't accept when transport is provided
    # We remove 'app' only if 'transport' is already in kwargs (which starlette provides)
    if 'transport' in kwargs and 'app' in kwargs:
        # Transport is provided, so 'app' is redundant and causes errors in newer httpx
        kwargs.pop('app', None)
    return _original_client_init(self, *args, **kwargs)

# Apply the patch globally
httpx.Client.__init__ = _patched_client_init

# --- Global Patching ---
# Patch packages.db.models to prevent "NoForeignKeysError" from broken/legacy code during import.
# This ensures tests run in isolation without loading the monolithic legacy models.
#
# IMPORTANT: Skip patching when running contract tests (they need real api_gateway)
# Contract tests set SKIP_MODEL_PATCHING=true or we detect pytest test path
import os as _os
_skip_patching = _os.getenv("SKIP_MODEL_PATCHING", "false").lower() == "true"

if _skip_patching:
    # Don't patch - contract tests need real modules
    mock_models = None
else:
    mock_models = MagicMock()
    sys.modules["packages.db.models"] = mock_models

# Configure Mocks (only if patching is enabled)
if mock_models is not None:
    class MockAgency:
        def __init__(self, **kwargs):
            self.id = 1
            for k, v in kwargs.items():
                setattr(self, k, v)
    mock_models.Agency = MockAgency

    class MockClient:
        id = 1  # class-level for SQLAlchemy-style Client.id in queries
        def __init__(self, **kwargs):
            self.id = 1
            for k, v in kwargs.items():
                setattr(self, k, v)
    mock_models.Client = MockClient

    class MockMembership:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
    mock_models.AgencyMembership = MockMembership
    mock_models.ClientMembership = MockMembership

    class MockAgencyRole(str, enum.Enum):
        ADMIN = "agency_admin"
        MEMBER = "agency_member"
        VIEWER = "agency_viewer"
    mock_models.AgencyRole = MockAgencyRole

    class MockClientRole(str, enum.Enum):
        OPERATOR = "client_operator"
        VIEWER = "client_viewer"
    mock_models.ClientRole = MockClientRole

# --- Global Mocking for Isolated Container Testing ---
# ARCHITECTURAL DECISION RECORD:
# Why are we using mocked peers?
# 1. We are running these tests inside the 'campaign-service' Docker container involved in the migration.
# 2. This container relies on 'strict isolation' - it ONLY contains code for 'services.campaign_service' (and shared).
#    It does NOT contain code for 'agent_service', 'billing_service', etc.
# 3. However, 'test_hardening.py' attempts to verify the API Gateway's contract (including Auth).
# 4. The API Gateway ('services.api_gateway.main') strictly imports ALL service routers to mount them.
# 5. Without these mocks, the Gateway crashes with ModuleNotFoundError for every other service.
# 6. Therefore, we inject successful mocks for strictly the MISSING peers, allowing the Gateway to start
#    and route traffic to the ONE service that actually exists here (Campaign Service).

if not _skip_patching:
    REQUIRED_SERVICES = [
        "services.auth_service.main",
        "services.auth_service.main",
        "services.account_service.main",
        "services.agent_service.main",
        "services.audience_service.main",
        "services.billing_service.main",
        # "services.campaign_service.main", # Do not mock self!
        "services.creative_service.main",
        "services.intelligence_service.main",
        "services.policy_service.main",
        "services.reporting_service.main",
        "integrations.shopify.api.main"
    ]

    for service in REQUIRED_SERVICES:
        try:
            __import__(service)
        except ImportError:
            # Create a mock module with a router
            mock_module = MagicMock()
            mock_module.router = MagicMock() # Ensure .router exists for include_router
            mock_module.app = MagicMock()
            mock_module.app.router = MagicMock() 
            sys.modules[service] = mock_module

# End Global Mocking

from services.campaign_service import models as campaign_models
from packages.db.database import Base, get_db

# Use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db() -> Generator:
    # Create tables
    Base.metadata.create_all(bind=engine)
    try:
        campaign_models.Base.metadata.create_all(bind=engine)
    except Exception:
        pass # Campaign models might not be needed for all tests or might be missing context
    
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Drop tables after test
        Base.metadata.drop_all(bind=engine)
        try:
             campaign_models.Base.metadata.drop_all(bind=engine)
        except Exception:
             pass

@pytest.fixture(scope="module")
def client() -> Generator:
    try:
        from services.api_gateway.main import app
    except ImportError:
        pytest.skip("Skipping test requiring API Gateway (Microservice Isolation)", allow_module_level=True)
    
    with TestClient(app) as c:
        yield c

@pytest.fixture
def mock_adapter_config():
    return {"sandbox_mode": True}
