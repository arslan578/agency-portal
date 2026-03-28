"""
Integration tests for Google Ads integration.
Tests end-to-end flow with mocked Google Ads API.
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock

# Mock correlation_context before importing connector_factory to avoid import errors
sys.modules['services.shared.correlation_context'] = MagicMock()

from services.platform_service.connector_factory import get_connector
from services.platform_service.connector_base import PlatformStatus


class TestGoogleAdsIntegration:
    """Integration tests for Google Ads platform"""
    
    def test_get_google_ads_connector(self):
        """Test that Google Ads connector can be retrieved from factory"""
        connector = get_connector("google_ads")
        assert connector is not None
        assert connector.platform_name == "google_ads"
    
    def test_connector_credential_validation(self):
        """Test connector validates credentials from environment"""
        import os
        
        # Test without credentials
        with patch.dict(os.environ, {}, clear=True):
            connector = get_connector("google_ads")
            assert connector.status == PlatformStatus.STUB
        
        # Test with credentials
        env_vars = {
            "GOOGLE_ADS_DEVELOPER_TOKEN": "test-token",
            "GOOGLE_ADS_CLIENT_ID": "test-client-id",
            "GOOGLE_ADS_CLIENT_SECRET": "test-secret",
            "GOOGLE_ADS_REFRESH_TOKEN": "test-refresh-token",
            "GOOGLE_ADS_CUSTOMER_ID": "1234567890"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            with patch('services.platform_service.connectors.google.GOOGLE_ADS_SDK_AVAILABLE', True):
                connector = get_connector("google_ads")
                assert connector.status == PlatformStatus.AVAILABLE
    
    def test_campaign_launch_flow(self):
        """Test full campaign launch flow"""
        import services.platform_service.connectors.google as google_mod
        mock_client_class = MagicMock()
        mock_client = MagicMock()
        mock_client_class.load_from_dict.return_value = mock_client
        mock_campaign_service = MagicMock()
        mock_budget_service = MagicMock()
        mock_budget_result = MagicMock()
        mock_budget_result.results = [MagicMock()]
        mock_budget_result.results[0].resource_name = "customers/1234567890/campaignBudgets/1111111111"
        mock_budget_service.mutate_campaign_budgets.return_value = mock_budget_result
        mock_campaign_result = MagicMock()
        mock_campaign_result.results = [MagicMock()]
        mock_campaign_result.results[0].resource_name = "customers/1234567890/campaigns/9876543210"
        mock_campaign_service.mutate_campaigns.return_value = mock_campaign_result
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
                    connector = get_connector("google_ads")
                    campaign_config = {
                        "name": "Integration Test Campaign",
                        "goal": "traffic",
                        "total_budget_cents": 50000,
                        "account_id": 1,
                        "audience_id": 1
                    }
                    result = connector.launch_campaign(campaign_config)
                    assert result["success"] is True
                    assert result["platform_campaign_id"] == "9876543210"
                    assert result["status"] == "paused"
                    mock_budget_service.mutate_campaign_budgets.assert_called_once()
                    mock_campaign_service.mutate_campaigns.assert_called_once()
    
    def test_connector_error_handling(self):
        """Test that connector handles errors gracefully"""
        connector = get_connector("google_ads")
        connector.status = PlatformStatus.STUB
        
        # Should not raise exception, just return error
        result = connector.test_connection()
        assert result["success"] is False
        assert "error" in result
    
    def test_creative_specs_consistency(self):
        """Test that creative specs are consistent and valid"""
        connector = get_connector("google_ads")
        specs = connector.get_creative_specs()
        
        # Validate structure
        assert isinstance(specs, dict)
        assert "image" in specs
        assert "video" in specs
        assert "text" in specs
        
        # Validate image specs
        assert "recommended_resolution" in specs["image"]
        assert "min_width" in specs["image"]
        assert "min_height" in specs["image"]
        
        # Validate video specs
        assert "min_duration_seconds" in specs["video"]
        assert "max_duration_seconds" in specs["video"]
        
        # Validate text specs
        assert "max_headline_length" in specs["text"]
        assert "max_description_length" in specs["text"]
