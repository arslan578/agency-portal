"""
Unit tests for Google Ads connector.
Tests credential validation, campaign operations, and error handling.
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock, Mock

# Mock correlation_context before importing GoogleAdsConnector to avoid import errors
sys.modules['services.shared.correlation_context'] = MagicMock()

from services.platform_service.connectors.google import GoogleAdsConnector
from services.platform_service.connector_base import PlatformStatus


class TestGoogleAdsConnector:
    """Test suite for GoogleAdsConnector"""
    
    def test_connector_initialization_stub_mode(self):
        """Test connector initializes in stub mode when credentials are missing"""
        with patch.dict(os.environ, {}, clear=True):
            connector = GoogleAdsConnector()
            assert connector.status == PlatformStatus.STUB
            assert connector.platform_name == "google_ads"
    
    def test_connector_initialization_with_credentials(self):
        """Test connector initializes in available mode when credentials are present"""
        env_vars = {
            "GOOGLE_ADS_DEVELOPER_TOKEN": "test-token",
            "GOOGLE_ADS_CLIENT_ID": "test-client-id",
            "GOOGLE_ADS_CLIENT_SECRET": "test-secret",
            "GOOGLE_ADS_REFRESH_TOKEN": "test-refresh-token",
            "GOOGLE_ADS_CUSTOMER_ID": "1234567890"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            with patch('services.platform_service.connectors.google.GOOGLE_ADS_SDK_AVAILABLE', True):
                connector = GoogleAdsConnector()
                assert connector.status == PlatformStatus.AVAILABLE
                assert connector.credentials is not None
                assert connector.credentials["developer_token"] == "test-token"
                assert connector.credentials["customer_id"] == "1234567890"
    
    def test_estimate_reach_stub_mode(self):
        """Test reach estimation in stub mode"""
        connector = GoogleAdsConnector()
        connector.status = PlatformStatus.STUB
        
        result = connector.estimate_reach(budget=1000.0, geography="US")
        
        assert "estimated_impressions" in result
        assert "estimated_reach" in result
        assert "estimated_cpm" in result
        assert "confidence" in result
        assert result["confidence"] == 0.75  # Lower confidence for fallback
    
    def test_estimate_reach_available_mode(self):
        """Test reach estimation in available mode"""
        env_vars = {
            "GOOGLE_ADS_DEVELOPER_TOKEN": "test-token",
            "GOOGLE_ADS_CLIENT_ID": "test-client-id",
            "GOOGLE_ADS_CLIENT_SECRET": "test-secret",
            "GOOGLE_ADS_REFRESH_TOKEN": "test-refresh-token",
            "GOOGLE_ADS_CUSTOMER_ID": "1234567890"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            with patch('services.platform_service.connectors.google.GOOGLE_ADS_SDK_AVAILABLE', True):
                connector = GoogleAdsConnector()
                result = connector.estimate_reach(budget=1000.0, geography="New York")
                
                assert result["confidence"] == 0.85  # Higher confidence
                assert result["estimated_cpm"] > 0
                assert result["estimated_impressions"] > 0
    
    def test_get_creative_specs(self):
        """Test creative specifications"""
        connector = GoogleAdsConnector()
        specs = connector.get_creative_specs()
        
        assert "image" in specs
        assert "video" in specs
        assert "text" in specs
        assert "ad_types" in specs
        assert "responsive_search_ads" in specs
        assert specs["image"]["recommended_resolution"] == "1200x628"
    
    def test_launch_campaign_stub_mode(self):
        """Test campaign launch fails in stub mode"""
        connector = GoogleAdsConnector()
        connector.status = PlatformStatus.STUB
        
        with pytest.raises(RuntimeError, match="not available"):
            connector.launch_campaign({
                "name": "Test Campaign",
                "goal": "traffic",
                "total_budget_cents": 10000
            })
    
    def test_launch_campaign_success(self):
        """Test successful campaign launch"""
        import services.platform_service.connectors.google as google_mod
        mock_client_class = MagicMock()
        mock_client = MagicMock()
        mock_client_class.load_from_dict.return_value = mock_client
        mock_campaign_service = MagicMock()
        mock_client.get_service.return_value = mock_campaign_service
        mock_result = MagicMock()
        mock_result.results = [MagicMock()]
        mock_result.results[0].resource_name = "customers/1234567890/campaigns/9876543210"
        mock_campaign_service.mutate_campaigns.return_value = mock_result
        mock_budget_service = MagicMock()
        mock_budget_result = MagicMock()
        mock_budget_result.results = [MagicMock()]
        mock_budget_result.results[0].resource_name = "customers/1234567890/campaignBudgets/1111111111"
        mock_budget_service.mutate_campaign_budgets.return_value = mock_budget_result
        def get_service_side_effect(service_name):
            if service_name == "CampaignBudgetService":
                return mock_budget_service
            return mock_campaign_service
        mock_client.get_service.side_effect = get_service_side_effect
        env_vars = {
            "GOOGLE_ADS_DEVELOPER_TOKEN": "test-token",
            "GOOGLE_ADS_CLIENT_ID": "test-client-id",
            "GOOGLE_ADS_CLIENT_SECRET": "test-secret",
            "GOOGLE_ADS_REFRESH_TOKEN": "test-refresh-token",
            "GOOGLE_ADS_CUSTOMER_ID": "1234567890"
        }
        with patch.dict(google_mod.__dict__, {'GoogleAdsClient': mock_client_class}, clear=False):
            with patch.dict(os.environ, env_vars, clear=False):
                with patch('services.platform_service.connectors.google.GOOGLE_ADS_SDK_AVAILABLE', True):
                    connector = GoogleAdsConnector()
                    result = connector.launch_campaign({
                        "name": "Test Campaign",
                        "goal": "traffic",
                        "total_budget_cents": 10000
                    })
                    assert result["success"] is True
                    assert "platform_campaign_id" in result
                    assert result["status"] == "paused"
                    assert "correlation_id" in result
    
    def test_update_campaign_stub_mode(self):
        """Test campaign update fails in stub mode"""
        connector = GoogleAdsConnector()
        connector.status = PlatformStatus.STUB
        
        with pytest.raises(RuntimeError, match="not available"):
            connector.update_campaign(
                platform_campaign_id="1234567890",
                campaign_config={"name": "Updated Campaign"}
            )
    
    def test_pause_campaign_stub_mode(self):
        """Test pause campaign returns False in stub mode"""
        connector = GoogleAdsConnector()
        connector.status = PlatformStatus.STUB
        
        result = connector.pause_campaign("1234567890")
        assert result is False
    
    def test_fetch_reports_stub_mode(self):
        """Test fetch reports fails in stub mode"""
        connector = GoogleAdsConnector()
        connector.status = PlatformStatus.STUB
        
        with pytest.raises(RuntimeError, match="not available"):
            connector.fetch_reports("1234567890")
    
    def test_test_connection_stub_mode(self):
        """Test connection test returns error in stub mode"""
        connector = GoogleAdsConnector()
        connector.status = PlatformStatus.STUB
        
        result = connector.test_connection()
        assert result["success"] is False
        assert "error" in result
    
    def test_test_connection_success(self):
        """Test successful connection test"""
        import services.platform_service.connectors.google as google_mod
        mock_client_class = MagicMock()
        mock_client = MagicMock()
        mock_client_class.load_from_dict.return_value = mock_client
        mock_ga_service = MagicMock()
        mock_client.get_service.return_value = mock_ga_service
        mock_row = MagicMock()
        mock_row.customer.id = 1234567890
        mock_row.customer.descriptive_name = "Test Account"
        mock_row.customer.currency_code = "USD"
        mock_row.customer.time_zone = "America/New_York"
        mock_ga_service.search.return_value = [mock_row]
        env_vars = {
            "GOOGLE_ADS_DEVELOPER_TOKEN": "test-token",
            "GOOGLE_ADS_CLIENT_ID": "test-client-id",
            "GOOGLE_ADS_CLIENT_SECRET": "test-secret",
            "GOOGLE_ADS_REFRESH_TOKEN": "test-refresh-token",
            "GOOGLE_ADS_CUSTOMER_ID": "1234567890"
        }
        with patch.dict(google_mod.__dict__, {'GoogleAdsClient': mock_client_class}, clear=False):
            with patch.dict(os.environ, env_vars, clear=False):
                with patch('services.platform_service.connectors.google.GOOGLE_ADS_SDK_AVAILABLE', True):
                    connector = GoogleAdsConnector()
                    result = connector.test_connection()
                    assert result["success"] is True
                    assert "customer_info" in result
                    assert result["customer_info"]["id"] == 1234567890
                    assert result["customer_info"]["name"] == "Test Account"
