import pytest
from unittest.mock import patch, MagicMock
from services.agent_service.integration_verifier import verify_integrations

# Mock database engine and Redis for all tests
@pytest.fixture(autouse=True)
def mock_db_and_redis():
    with patch('packages.db.database.engine') as mock_engine, \
         patch('services.agent_service.integration_verifier.Redis') as mock_redis:

        # Mock database connection
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        mock_conn.execute.return_value.fetchone.return_value = (1,)  # Health check result

        # Mock Redis connection
        mock_redis_instance = MagicMock()
        mock_redis.from_url.return_value = mock_redis_instance
        mock_redis_instance.ping.return_value = True

        yield

class TestEnvironmentFailureHandling:
    """Tests for failure vs warning downgrade by environment"""

    def setup_method(self):
        # Clear cache before each test
        import services.agent_service.integration_verifier as iv
        iv._last_result = None
        iv._last_result_ts = None

    @patch('httpx.Client')
    def test_failures_remain_failures_in_production(self, mock_client):
        """In production: individual check failures -> overall 'blocked' status"""
        with patch.dict('os.environ', {'ENVIRONMENT': 'production'}):
            mock_client.return_value.__enter__.return_value.get.side_effect = Exception("Connection failed")
            mock_client.return_value.__enter__.return_value.post.side_effect = Exception("Connection failed")

            result = verify_integrations()

            assert result['status'] == 'blocked'
            assert result['environment'] == 'production'
            assert len(result['errors']) > 0
            assert 'api_gateway' in result['checks']
            assert result['checks']['api_gateway']['ok'] == False

    @patch('httpx.Client')
    def test_failures_become_warnings_in_development(self, mock_client):
        """In development: individual check failures -> overall 'warning' status"""
        with patch.dict('os.environ', {'ENVIRONMENT': 'development'}):
            mock_client.return_value.__enter__.return_value.get.side_effect = Exception("Connection failed")
            mock_client.return_value.__enter__.return_value.post.side_effect = Exception("Connection failed")

            result = verify_integrations()

            assert result['status'] == 'warning'
            assert result['environment'] == 'development'
            assert len(result['warnings']) > 0
            assert len(result['errors']) == 0  # No errors in dev

    @patch('httpx.Client')
    def test_failures_remain_failures_in_staging(self, mock_client):
        """In staging: failures remain as failures (same as production)"""
        with patch.dict('os.environ', {'ENVIRONMENT': 'staging'}):
            mock_client.return_value.__enter__.return_value.get.side_effect = Exception("Connection failed")
            mock_client.return_value.__enter__.return_value.post.side_effect = Exception("Connection failed")

            result = verify_integrations()

            assert result['status'] == 'blocked'
            assert result['environment'] == 'staging'
            assert len(result['errors']) > 0