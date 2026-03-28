"""
Unit tests for TikTok Ads Connector
"""

import pytest
import os
import sys
from unittest.mock import Mock, patch, MagicMock

# Mock correlation_context and retry_policy before importing TikTokAdsConnector to avoid import errors
sys.modules['services.shared.correlation_context'] = MagicMock()
sys.modules['services.shared.observability'] = MagicMock()

def mock_retry_with_exponential_backoff(func, **kwargs):
    """Mock retry function that just calls the function directly (no retries in tests)"""
    return func()

def mock_is_retryable(**kwargs):
    """Mock is_retryable function"""
    return False

mock_retry_policy = MagicMock()
mock_retry_policy.retry_with_exponential_backoff = mock_retry_with_exponential_backoff
mock_retry_policy.is_retryable = mock_is_retryable
sys.modules['services.shared.retry_policy'] = mock_retry_policy

from services.platform_service.connectors.tiktok import TikTokAdsConnector
from services.platform_service.connector_base import PlatformStatus
import httpx


class TestTikTokAdsConnector:
    """Test suite for TikTokAdsConnector"""
    
    @pytest.fixture
    def mock_credentials(self):
        """Mock TikTok credentials"""
        return {
            "app_id": "test_app_id",
            "app_secret": "test_app_secret",
            "access_token": "test_access_token",
            "advertiser_id": "test_advertiser_id"
        }
    
    @pytest.fixture
    def connector(self, mock_credentials):
        """Create connector instance with mocked credentials"""
        with patch.dict(os.environ, {
            "TIKTOK_APP_ID": mock_credentials["app_id"],
            "TIKTOK_APP_SECRET": mock_credentials["app_secret"],
            "TIKTOK_ACCESS_TOKEN": mock_credentials["access_token"],
            "TIKTOK_ADVERTISER_ID": mock_credentials["advertiser_id"]
        }):
            return TikTokAdsConnector()
    
    def test_platform_name(self, connector):
        """Test platform name property"""
        assert connector.platform_name == "tiktok"
    
    def test_validate_credentials_success(self, mock_credentials):
        """Test credential validation with valid credentials"""
        with patch.dict(os.environ, {
            "TIKTOK_APP_ID": mock_credentials["app_id"],
            "TIKTOK_APP_SECRET": mock_credentials["app_secret"],
            "TIKTOK_ACCESS_TOKEN": mock_credentials["access_token"],
            "TIKTOK_ADVERTISER_ID": mock_credentials["advertiser_id"]
        }):
            connector = TikTokAdsConnector()
            assert connector.status == PlatformStatus.AVAILABLE
    
    def test_validate_credentials_missing(self):
        """Test credential validation with missing credentials"""
        with patch.dict(os.environ, {}, clear=True):
            connector = TikTokAdsConnector()
            assert connector.status == PlatformStatus.STUB
    
    def test_estimate_reach(self, connector):
        """Test reach estimation"""
        result = connector.estimate_reach(budget=1000.0, geography="New York")
        
        assert "estimated_impressions" in result
        assert "estimated_reach" in result
        assert "estimated_cpm" in result
        assert "confidence" in result
        assert result["confidence"] > 0
    
    def test_get_creative_specs(self, connector):
        """Test creative specifications"""
        specs = connector.get_creative_specs()
        
        assert "image" in specs
        assert "video" in specs
        assert "text" in specs
        assert specs["video"]["aspect_ratio"] == "9:16"
        assert specs["video"]["min_duration_seconds"] == 5
        assert specs["video"]["max_duration_seconds"] == 60
    
    @patch('services.platform_service.connectors.tiktok.httpx')
    def test_launch_campaign_success(self, mock_httpx, connector):
        """Test successful campaign launch"""
        # Mock successful API response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "code": 0,
            "data": {
                "campaign_id": "123456789"
            }
        }
        
        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post.return_value = mock_response
        mock_httpx.Client.return_value = mock_client
        
        campaign_config = {
            "name": "Test Campaign",
            "goal": "traffic",
            "total_budget_cents": 100000
        }
        
        result = connector.launch_campaign(campaign_config)
        
        assert result["success"] is True
        assert result["platform_campaign_id"] == "123456789"
        assert "correlation_id" in result
    
    @patch('services.platform_service.connectors.tiktok.httpx')
    def test_launch_campaign_api_error(self, mock_httpx, connector):
        """Test campaign launch with API error"""
        # Mock API error response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "code": 40001,
            "message": "Invalid advertiser ID"
        }
        
        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post.return_value = mock_response
        mock_httpx.Client.return_value = mock_client
        
        campaign_config = {
            "name": "Test Campaign",
            "goal": "traffic",
            "total_budget_cents": 100000
        }
        
        with pytest.raises(RuntimeError, match="TikTok API error"):
            connector.launch_campaign(campaign_config)
    
    @patch('services.platform_service.connectors.tiktok.httpx')
    def test_update_campaign_success(self, mock_httpx, connector):
        """Test successful campaign update"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "code": 0,
            "data": {}
        }
        
        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post.return_value = mock_response
        mock_httpx.Client.return_value = mock_client
        
        campaign_config = {
            "name": "Updated Campaign Name",
            "status": "PAUSED"
        }
        
        result = connector.update_campaign("123456789", campaign_config)
        
        assert result["success"] is True
        assert "updated_fields" in result
    
    @patch('services.platform_service.connectors.tiktok.httpx')
    def test_pause_campaign(self, mock_httpx, connector):
        """Test campaign pause"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "code": 0,
            "data": {}
        }
        
        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post.return_value = mock_response
        mock_httpx.Client.return_value = mock_client
        
        result = connector.pause_campaign("123456789")
        
        assert result is True
    
    @patch('services.platform_service.connectors.tiktok.httpx')
    def test_test_connection_success(self, mock_httpx, connector):
        """Test connection test with success"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "code": 0,
            "data": {
                "list": [{
                    "advertiser_id": "test_advertiser_id",
                    "advertiser_name": "Test Advertiser"
                }]
            }
        }
        
        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.get.return_value = mock_response
        mock_httpx.Client.return_value = mock_client
        
        result = connector.test_connection()
        
        assert result["success"] is True
        assert "advertiser_info" in result
    
    def test_fallback_reach_estimate(self, connector):
        """Test fallback reach estimation"""
        result = connector._fallback_reach_estimate(budget=1000.0, geography=None)
        
        assert "estimated_impressions" in result
        assert "estimated_reach" in result
        assert "estimated_cpm" in result
        assert result["confidence"] == 0.75
