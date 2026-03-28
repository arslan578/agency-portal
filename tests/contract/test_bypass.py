import pytest
import os
from fastapi.testclient import TestClient
from unittest.mock import patch

# Set TEST_MODE before importing api_gateway to prevent router mounting conflicts
os.environ["TEST_MODE"] = "true"

from services.api_gateway.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_os_run_requires_authentication(client):
    """
    OS runtime endpoint requires JWT authentication.
    Auth bypass has been removed - standard JWT auth is required.
    """
    with patch("services.api_gateway.main.FF_OS_RUNTIME_ENABLED", True):
        # No auth header - should be rejected
        response = client.post("/os/run", json={"intent": "test"})
        assert response.status_code == 401
        assert response.json()["detail"] == "Unauthorized"

def test_os_run_with_valid_auth(client):
    """
    OS runtime endpoint accepts requests with valid JWT token.
    """
    from unittest.mock import AsyncMock, Mock
    
    with patch("services.api_gateway.main.FF_OS_RUNTIME_ENABLED", True):
        with patch("services.api_gateway.main._verify_auth_header") as mock_verify:
            # Mock successful auth verification
            mock_verify.return_value = None
            
            with patch("services.api_gateway.main.httpx.AsyncClient") as mock_client:
                # Configure mocks
                mock_context = mock_client.return_value
                mock_inst = AsyncMock()
                mock_context.__aenter__.return_value = mock_inst
                
                mock_resp = Mock()
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"status": "ok"}
                mock_inst.post.return_value = mock_resp
                
                # Request with valid auth header
                response = client.post(
                    "/os/run",
                    json={"intent": "test"},
                    headers={"Authorization": "Bearer valid_token"}
                )
                
                assert response.status_code == 200
                assert response.json() == {"status": "ok"}
                mock_inst.post.assert_called_once()
