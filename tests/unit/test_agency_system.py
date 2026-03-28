import unittest
from unittest.mock import MagicMock
import sys

# --- Mock Setup ---
# Mock core libraries before importing application code to avoid dependency errors in unit test environment.
sys.modules["fastapi"] = MagicMock()
sys.modules["sqlalchemy"] = MagicMock()
sys.modules["sqlalchemy.orm"] = MagicMock()
sys.modules["sqlalchemy.sql"] = MagicMock()
sys.modules["packages.db.database"] = MagicMock()
sys.modules["pydantic"] = MagicMock()

# Mock Depends to be a passthrough
def mock_depends(dependency):
    return dependency

sys.modules["fastapi"].Depends = mock_depends

# Mock packages.db.models to prevent real SQLAlchemy mapper initialization errors
mock_models = MagicMock()
sys.modules["packages.db.models"] = mock_models

# Mock campaign_service.models for Campaign model
mock_campaign_models = MagicMock()
sys.modules["services.campaign_service.models"] = mock_campaign_models

# Mock account_service.models for Client model  
mock_account_models = MagicMock()
sys.modules["services.account_service.models"] = mock_account_models

# Configure Mock Models to behave like classes
class MockAgency:
    def __init__(self, **kwargs):
        self.id = 1
        for k, v in kwargs.items():
            setattr(self, k, v)
mock_models.Agency = MockAgency

class MockClient:
    # Class attributes for SQLAlchemy-style column access
    __name__ = 'Client'
    id = None
    
    def __init__(self, **kwargs):
        self.id = 1
        for k, v in kwargs.items():
            setattr(self, k, v)

# Set MockClient in both places it might be imported from
mock_models.Client = MockClient
mock_account_models.Client = MockClient

class MockCampaign:
    # Class attributes for SQLAlchemy-style column access
    __name__ = 'Campaign'
    id = None
    
    def __init__(self, **kwargs):
        self.id = 1
        for k, v in kwargs.items():
            setattr(self, k, v)
mock_campaign_models.Campaign = MockCampaign

mock_models.AgencyRole = MagicMock()
mock_models.ClientRole = MagicMock()

# Define a concrete Base class for models to inherit from
class MockModel:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
    def __eq__(self, other):
        return self.__dict__ == other.__dict__
MockModel.metadata = MagicMock()
sys.modules["packages.db.database"].Base = MockModel

# Mock Pydantic Base Model (Minimal)
class MockBaseModel:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
    class Config:
        orm_mode = True
sys.modules["pydantic"].BaseModel = MockBaseModel

# Mock FastAPI Router & App Decorators
class MockRouter:
    def get(self, *args, **kwargs):
        return lambda func: func
    def post(self, *args, **kwargs):
        return lambda func: func
    def put(self, *args, **kwargs):
        return lambda func: func
    def delete(self, *args, **kwargs):
        return lambda func: func
    def patch(self, *args, **kwargs):
        return lambda func: func
    
    def include_router(self, *args, **kwargs):
        pass

mock_router = MockRouter()
sys.modules["fastapi"].APIRouter.return_value = mock_router

class MockFastAPI(MockRouter):
    def __init__(self, *args, **kwargs):
        pass
    def __call__(self, *args, **kwargs):
        return self

sys.modules["fastapi"].FastAPI = MockFastAPI

# --- Imports (Must happen after mocks) ---
from services.account_service.routers.agency import create_agency, create_client
from services.account_service import schemas_agency, models
from services.reporting_service.main import get_campaign_report

class TestAgencySystem(unittest.TestCase):
    """
    Unit tests for Agency System core flows.
    Defines the contract for Agency/Client creation and basic Reporting logic.
    """
    
    def test_create_agency_contract(self):
        """
        Verifies `create_agency` respects the contract:
        - Creates Agency record.
        - Returns object with `name` and legacy `owner_user_id` attribute.
        """
        db = MagicMock()
        agency_in = schemas_agency.AgencyCreate(name="Test Agency", owner_user_id=1)
        
        # Mock DB operations
        db.add = MagicMock()
        db.commit = MagicMock()
        db.refresh = MagicMock()
        
        result = create_agency(agency_in, db)
        
        # Assertions (Strict Contract)
        self.assertEqual(result.name, "Test Agency")
        self.assertEqual(result.owner_user_id, 1) # Legacy field check
        db.add.assert_called()
        
    def test_create_client_legacy_compat(self):
        """
        Verifies `create_client` accepts legacy aliases and returns compat fields.
        - Input: `client_name` (alias for name), `markup_multiplier` (alias for markup_percent).
        - Output: Object has `client_name`, `markup_multiplier`, and `agency_id`.
        """
        db = MagicMock()
        # Use legacy alias fields in constructor
        client_in = schemas_agency.ClientCreate(client_name="Test Client", markup_multiplier=1.20)
        
        # Mock Agency existence check (if applicable, though simpler here)
        db.query.return_value.filter.return_value.first.return_value = models.Agency(id=1, name="Test Agency")
        
        result = create_client(1, client_in, db)
        
        # Assertions (Strict Contract)
        self.assertEqual(result.client_name, "Test Client")
        self.assertEqual(float(result.markup_multiplier), 1.20)
        self.assertEqual(result.agency_id, 1)
        
    def test_reporting_markup_application(self):
        """
        Verifies reporting service correctly returns usage records with agency markup.
        """
        db = MagicMock()
        
        # Mock UsageRecord with all required fields
        class MockUsageRecord:
            def __init__(self):
                from datetime import date
                self.date = date(2025, 1, 1)
                self.platform = 'meta'
                self.impressions = 1000
                self.clicks = 50
                self.spend_agency = 20.0  # This includes agency markup
        
        mock_usage_record = MockUsageRecord()
        
        # Mock query for UsageRecord
        usage_query = MagicMock()
        usage_filter = MagicMock()
        usage_filter.all.return_value = [mock_usage_record]
        usage_query.filter.return_value = usage_filter
        
        db.query.return_value = usage_query
        
        # Call function
        reports = get_campaign_report(999, db)
        
        # Verify the report data is correctly mapped
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0].spend, 20.0)
        self.assertEqual(reports[0].impressions, 1000)
        self.assertEqual(reports[0].clicks, 50)
        self.assertEqual(reports[0].platform, 'meta')
        self.assertEqual(reports[0].conversions, 0)

if __name__ == '__main__':
    unittest.main()
