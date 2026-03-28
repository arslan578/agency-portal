import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from services.agent_service.main import app

@pytest.fixture
def client():
    """Fixture to provide TestClient"""
    with TestClient(app) as c:
        yield c

class TestAgentBlockingBehavior:
    """Tests for agent blocking in staging/production vs development"""

    @patch('services.agent_service.main.verify_integrations')
    def test_agent_blocked_in_production_on_integration_failure(self, mock_verify, client):
        """Verify agent is BLOCKED (403) in production when integrations fail"""
        mock_verify.return_value = {
            'status': 'blocked',
            'environment': 'production',  # This will trigger blocking
            'errors': ['API Gateway connection failed']
        }

        response = client.post("/agent/kaivo/act", json={
            "session_id": "test-session-123",
            "user_message_summary": "Test action",
            "slots": {"user_id": "123"}
        })

        assert response.status_code == 403
        assert "AGENT_BLOCKED_BY_INTEGRATION_HEALTH" in response.json()['detail']['code']

    @patch('services.agent_service.main.verify_integrations')
    def test_agent_blocked_in_staging_on_integration_failure(self, mock_verify, client):
        """Verify agent is BLOCKED (403) in staging when integrations fail"""
        mock_verify.return_value = {
            'status': 'blocked',
            'environment': 'staging',  # This will trigger blocking
            'errors': ['Database connection failed']
        }

        response = client.post("/agent/kaivo/act", json={
            "session_id": "test-session-123",
            "user_message_summary": "Test action",
            "slots": {"user_id": "123"}
        })

        assert response.status_code == 403

    @patch('services.agent_service.main.verify_integrations')
    def test_agent_allowed_in_development_on_integration_failure(self, mock_verify, client):
        """Verify agent is ALLOWED (200) in development despite integration failures"""
        # Ensure the mock returns development environment
        mock_verify.return_value = {
            'status': 'warning',
            'environment': 'development',  # This should prevent blocking
            'warnings': ['Redis slow but available']
        }

        response = client.post("/agent/kaivo/act", json={
            "session_id": "test-session-123",
            "user_message_summary": "Test action",
            "slots": {"user_id": "123"}
        })

        assert response.status_code == 200
        assert response.json()['safety_status'] == 'warning'