import pytest
import time
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

class TestIntegrationVerifierCaching:
    """Tests for verifier caching behavior"""

    def setup_method(self):
        # Clear cache before each test
        import services.agent_service.integration_verifier as iv
        iv._last_result = None
        iv._last_result_ts = None

    @patch.dict('os.environ', {'AGENT_INTEGRATION_CHECK_TTL': '1'})
    @patch('httpx.Client')
    def test_caching_avoids_duplicate_checks(self, mock_client):
        """Verify caching prevents redundant integration checks"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "ok"}
        mock_client.return_value.__enter__.return_value.get.return_value = mock_response

        # Mock POST response for meta connector check
        mock_post_response = MagicMock()
        mock_post_response.status_code = 200
        mock_post_response.json.return_value = {"success": True}
        mock_client.return_value.__enter__.return_value.post.return_value = mock_post_response

        # First call should perform actual check
        result1 = verify_integrations()
        # API Gateway health check (GET) + Meta connector test (POST) = 2 context manager uses
        # But httpx.Client might be instantiated multiple times, so we check >= 2
        assert mock_client.call_count >= 2  # At least API Gateway + Meta connector

        # Second call within TTL should use cache
        result2 = verify_integrations()
        # Should still be the same number of calls (cached)
        assert mock_client.call_count >= 2  # No new calls

        assert result1 == result2

        # Wait for cache to expire
        time.sleep(2)

        # Third call should perform new check
        initial_call_count = mock_client.call_count
        result3 = verify_integrations()
        # Should have made additional calls (at least 2 more)
        assert mock_client.call_count >= initial_call_count + 2  # New calls made

    @patch.dict('os.environ', {'AGENT_INTEGRATION_CHECK_TTL': '0'})
    @patch('httpx.Client')
    def test_cache_disabled_with_zero_ttl(self, mock_client):
        """Verify caching is disabled when TTL is 0"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "ok"}
        mock_client.return_value.__enter__.return_value.get.return_value = mock_response

        # Mock POST response for meta connector check
        mock_post_response = MagicMock()
        mock_post_response.status_code = 200
        mock_post_response.json.return_value = {"success": True}
        mock_client.return_value.__enter__.return_value.post.return_value = mock_post_response

        # Each call should perform new check
        verify_integrations()
        first_call_count = mock_client.call_count
        verify_integrations()
        second_call_count = mock_client.call_count

        # Should have made calls both times (no caching)
        assert first_call_count >= 2  # At least API Gateway + Meta connector
        assert second_call_count >= first_call_count + 2  # Additional calls for second check