import pytest
import os
from fastapi.testclient import TestClient

# Set TEST_MODE before importing api_gateway to prevent router mounting conflicts
os.environ["TEST_MODE"] = "true"

from services.api_gateway.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_get_capabilities(client):
    """
    Verifies that GET /capabilities returns 200 and the correct JSON structure.
    """
    response = client.get("/capabilities")
    assert response.status_code == 200
    data = response.json()
    
    # Verify required keys
    assert "environment" in data
    assert "platforms" in data
    assert "features" in data
    
    # Verify types and values
    assert isinstance(data["features"], dict)
    assert isinstance(data["platforms"], list)
    assert data["platforms"] == [] # Expect empty list default
    
    # Check for specific known flag
    assert "FF_SHOPIFY_APP_ENABLED" in data["features"]
