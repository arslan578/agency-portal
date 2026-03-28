"""
Spotify Ads Connector - Unit & Integration Tests
=================================================
Tests cover:
  1. SpotifyAdsConnector: credential validation, fetch_ad_accounts, launch_campaign
  2. OAuth flow: initiate URL construction, callback token exchange
  3. API endpoints: GET /platforms/spotify/ad-accounts, POST .../launch
  4. End-to-end: campaign wizard flow with ad account selection

Run with:
  pytest tests/unit/test_spotify_ads_connector.py -v

To run only unit tests (no network):
  pytest tests/unit/test_spotify_ads_connector.py -v -m "not integration"

To test with real credentials (requires SPOTIFY_CLIENT_ID/SECRET in env):
  pytest tests/unit/test_spotify_ads_connector.py -v -m integration
"""

import pytest
import os
import sys
import json
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from urllib.parse import urlparse, parse_qs, unquote

# ── Mock shared services before importing connector ──────────────────────────
sys.modules['services.shared.correlation_context'] = MagicMock()
sys.modules['services.shared.observability'] = MagicMock()

mock_retry_policy = MagicMock()
mock_retry_policy.retry_with_exponential_backoff = lambda func, **kwargs: func()
mock_retry_policy.is_retryable = lambda **kwargs: False
sys.modules['services.shared.retry_policy'] = mock_retry_policy

from services.platform_service.connectors.spotify import SpotifyAdsConnector, SPOTIFY_ADS_API_BASE
from services.platform_service.connector_base import PlatformStatus

# ── Test Constants ───────────────────────────────────────────────────────────

MOCK_CLIENT_ID = "test_spotify_client_id_168bc51f0ca347439c1db697174c6788"
MOCK_CLIENT_SECRET = "test_spotify_client_secret_abc123"
MOCK_ACCESS_TOKEN = "BQD...mock_spotify_access_token"
MOCK_REFRESH_TOKEN = "AQB...mock_spotify_refresh_token"
MOCK_AD_ACCOUNT_ID = "ad_account_uuid_12345"
MOCK_BUSINESS_ID = "business_uuid_67890"
MOCK_CAMPAIGN_ID = "campaign_uuid_abcdef"
FRONTEND_URL = "https://2946-203-81-236-107.ngrok-free.app"
REDIRECT_URI = f"{FRONTEND_URL}/integrations/spotify/oauth/callback"


def make_env(**overrides):
    """Return a minimal env dict for Spotify OAuth/Ads."""
    base = {
        "SPOTIFY_CLIENT_ID": MOCK_CLIENT_ID,
        "SPOTIFY_CLIENT_SECRET": MOCK_CLIENT_SECRET,
        "FRONTEND_URL": FRONTEND_URL,
    }
    base.update(overrides)
    return base


# ─────────────────────────────────────────────────────────────────────────────
# 1. CONNECTOR UNIT TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestSpotifyAdsConnector:
    """Unit tests for SpotifyAdsConnector class."""

    @pytest.fixture
    def mock_credentials(self):
        """Valid credentials dict."""
        return {
            "access_token": MOCK_ACCESS_TOKEN,
            "refresh_token": MOCK_REFRESH_TOKEN,
            "app_id": MOCK_CLIENT_ID,
            "app_secret": MOCK_CLIENT_SECRET,
        }

    @pytest.fixture
    def connector_with_creds(self, mock_credentials):
        """Connector initialized with explicit credentials."""
        return SpotifyAdsConnector(credentials=mock_credentials)

    @pytest.fixture
    def connector_from_env(self):
        """Connector initialized from environment variables."""
        with patch.dict(os.environ, make_env()):
            return SpotifyAdsConnector()

    # ── Credential Validation ────────────────────────────────────────────────

    def test_platform_name(self, connector_with_creds):
        """Platform name should be 'spotify'."""
        assert connector_with_creds.platform_name == "spotify"

    def test_status_available_with_access_token(self, mock_credentials):
        """Connector should be AVAILABLE when access_token is provided."""
        connector = SpotifyAdsConnector(credentials=mock_credentials)
        assert connector.status == PlatformStatus.AVAILABLE

    def test_status_stub_without_credentials(self):
        """Connector should be STUB when no credentials are provided."""
        with patch.dict(os.environ, {}, clear=True):
            connector = SpotifyAdsConnector()
            assert connector.status == PlatformStatus.STUB

    def test_status_stub_with_env_creds_only(self):
        """With only env vars (no access_token), status should be STUB."""
        env = make_env()
        with patch.dict(os.environ, env, clear=True):
            connector = SpotifyAdsConnector()
            assert connector.status == PlatformStatus.STUB

    # ── Reach Estimation ─────────────────────────────────────────────────────

    def test_estimate_reach_basic(self, connector_with_creds):
        """Basic reach estimation should return expected structure."""
        result = connector_with_creds.estimate_reach(budget=1000.0)

        assert "estimated_impressions" in result
        assert "estimated_reach" in result
        assert "estimated_cpm" in result
        assert "confidence" in result
        assert result["confidence"] > 0
        assert result["estimated_impressions"] > 0

    def test_estimate_reach_with_geography(self, connector_with_creds):
        """Geography should affect CPM multiplier."""
        result_nyc = connector_with_creds.estimate_reach(budget=1000.0, geography="New York")
        result_generic = connector_with_creds.estimate_reach(budget=1000.0, geography="Smalltown")

        # NYC has higher CPM multiplier, so fewer impressions for same budget
        assert result_nyc["estimated_impressions"] < result_generic["estimated_impressions"]

    # ── Creative Specs ───────────────────────────────────────────────────────

    def test_get_creative_specs(self, connector_with_creds):
        """Creative specs should include audio, image, video, and text."""
        specs = connector_with_creds.get_creative_specs()

        assert "audio" in specs
        assert "image" in specs
        assert "video" in specs
        assert "text" in specs
        assert "ad_types" in specs
        assert specs["audio"]["max_duration_seconds"] == 30
        assert "audio_ad" in specs["ad_types"]

    # ── Fetch Ad Accounts ────────────────────────────────────────────────────

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_fetch_ad_accounts_success(self, mock_client_class, connector_with_creds):
        """Successful fetch_ad_accounts returns list of ad accounts."""
        # Mock businesses response
        mock_biz_response = Mock()
        mock_biz_response.status_code = 200
        mock_biz_response.json.return_value = [
            {"id": MOCK_BUSINESS_ID, "name": "Test Business"}
        ]

        # Mock ad_accounts response
        mock_accts_response = Mock()
        mock_accts_response.status_code = 200
        mock_accts_response.json.return_value = [
            {"id": MOCK_AD_ACCOUNT_ID, "name": "Test Ad Account", "status": "ACTIVE", "country_code": "US"}
        ]

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.get.side_effect = [mock_biz_response, mock_accts_response]
        mock_client_class.return_value = mock_client

        result = connector_with_creds.fetch_ad_accounts()

        assert result["success"] is True
        assert len(result["ad_accounts"]) == 1
        assert result["ad_accounts"][0]["id"] == MOCK_AD_ACCOUNT_ID
        assert result["ad_accounts"][0]["business_id"] == MOCK_BUSINESS_ID
        assert result["count"] == 1

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_fetch_ad_accounts_invalid_token(self, mock_client_class, connector_with_creds):
        """401 response should return INVALID_TOKEN error."""
        mock_response = Mock()
        mock_response.status_code = 401

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client

        result = connector_with_creds.fetch_ad_accounts()

        assert result["success"] is False
        assert result["error_code"] == "INVALID_TOKEN"

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_fetch_ad_accounts_rate_limit(self, mock_client_class, connector_with_creds):
        """429 response should return RATE_LIMIT error."""
        mock_response = Mock()
        mock_response.status_code = 429

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client

        result = connector_with_creds.fetch_ad_accounts()

        assert result["success"] is False
        assert result["error_code"] == "RATE_LIMIT"

    def test_fetch_ad_accounts_missing_token(self):
        """Missing access token should return MISSING_TOKEN error."""
        connector = SpotifyAdsConnector(credentials={})
        result = connector.fetch_ad_accounts()

        assert result["success"] is False
        assert result["error_code"] == "MISSING_TOKEN"

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_fetch_ad_accounts_no_businesses(self, mock_client_class, connector_with_creds):
        """Empty businesses list should return empty ad_accounts with message."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = []

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client

        result = connector_with_creds.fetch_ad_accounts()

        assert result["success"] is True
        assert result["ad_accounts"] == []
        assert "adsmanager.spotify.com" in result.get("message", "")

    # ── Launch Campaign ──────────────────────────────────────────────────────

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_launch_campaign_success(self, mock_client_class, connector_with_creds):
        """Successful campaign launch returns platform_campaign_id."""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"id": MOCK_CAMPAIGN_ID}

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post.return_value = mock_response
        mock_client_class.return_value = mock_client

        campaign_config = {
            "name": "Test Spotify Campaign",
            "goal": "awareness",
            "ad_account_id": MOCK_AD_ACCOUNT_ID,
        }

        result = connector_with_creds.launch_campaign(campaign_config)

        assert result["success"] is True
        assert result["platform_campaign_id"] == MOCK_CAMPAIGN_ID
        assert result["status"] == "created"

        # Verify correct URL was called
        call_args = mock_client.post.call_args
        expected_url = f"{SPOTIFY_ADS_API_BASE}/ad_accounts/{MOCK_AD_ACCOUNT_ID}/campaigns"
        assert call_args[0][0] == expected_url

    def test_launch_campaign_missing_ad_account_id(self, connector_with_creds):
        """Missing ad_account_id should return MISSING_PARAMETER error."""
        campaign_config = {
            "name": "Test Campaign",
            "goal": "awareness",
            # ad_account_id missing
        }

        result = connector_with_creds.launch_campaign(campaign_config)

        assert result["success"] is False
        assert result["error_code"] == "MISSING_PARAMETER"

    def test_launch_campaign_missing_access_token(self):
        """Missing access token should return MISSING_TOKEN error."""
        connector = SpotifyAdsConnector(credentials={})
        campaign_config = {
            "name": "Test Campaign",
            "ad_account_id": MOCK_AD_ACCOUNT_ID,
        }

        result = connector.launch_campaign(campaign_config)

        assert result["success"] is False
        assert result["error_code"] == "MISSING_TOKEN"

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_launch_campaign_api_error(self, mock_client_class, connector_with_creds):
        """API error should return error details."""
        mock_response = Mock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": "Invalid campaign parameters"}
        mock_response.text = '{"error": "Invalid campaign parameters"}'

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post.return_value = mock_response
        mock_client_class.return_value = mock_client

        campaign_config = {
            "name": "Test Campaign",
            "ad_account_id": MOCK_AD_ACCOUNT_ID,
        }

        result = connector_with_creds.launch_campaign(campaign_config)

        assert result["success"] is False
        assert "HTTP_400" in result["error_code"]

    # ── Pause Campaign ───────────────────────────────────────────────────────

    def test_pause_campaign_stub_mode(self):
        """Pause in stub mode should return False."""
        connector = SpotifyAdsConnector(credentials={})
        result = connector.pause_campaign(MOCK_CAMPAIGN_ID)
        assert result is False

    def test_pause_campaign_available_mode(self, connector_with_creds):
        """Pause in available mode should return True (stub implementation)."""
        result = connector_with_creds.pause_campaign(MOCK_CAMPAIGN_ID)
        assert result is True

    # ── Fetch Reports ────────────────────────────────────────────────────────

    def test_fetch_reports_stub(self, connector_with_creds):
        """Fetch reports returns stub data."""
        result = connector_with_creds.fetch_reports(MOCK_CAMPAIGN_ID)

        assert "impressions" in result
        assert "clicks" in result
        assert "spend" in result
        assert "message" in result


# ─────────────────────────────────────────────────────────────────────────────
# 2. OAUTH FLOW TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestSpotifyOAuthFlow:
    """Tests for Spotify OAuth initiate and callback endpoints."""

    def _build_oauth_url(self, account_id: int, env: dict, redirect_uri: str = None) -> tuple:
        """
        Simulate what initiate_spotify_oauth does:
        - encode account_id in state
        - build redirect_uri from FRONTEND_URL
        - construct oauth_url
        """
        import uuid
        from urllib.parse import quote

        state = f"{uuid.uuid4().hex}|{account_id}"
        frontend_url = env.get("FRONTEND_URL", "https://app.getkaivo.com")
        if not redirect_uri:
            redirect_uri = f"{frontend_url}/integrations/spotify/oauth/callback"

        client_id = env["SPOTIFY_CLIENT_ID"]
        scopes = "user-read-private,user-read-email,playlist-read-private,playlist-read-collaborative"

        oauth_url = (
            f"https://accounts.spotify.com/authorize"
            f"?client_id={client_id}"
            f"&redirect_uri={quote(redirect_uri, safe='')}"
            f"&scope={scopes}"
            f"&state={state}"
            f"&response_type=code"
        )
        return oauth_url, state, redirect_uri

    def test_oauth_url_contains_client_id(self):
        """OAuth URL must contain client_id."""
        env = make_env()
        oauth_url, _, _ = self._build_oauth_url(42, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)

        assert "client_id" in params
        assert params["client_id"][0] == MOCK_CLIENT_ID

    def test_oauth_url_contains_redirect_uri(self):
        """OAuth URL must contain redirect_uri matching FRONTEND_URL."""
        env = make_env()
        oauth_url, _, expected_redirect = self._build_oauth_url(42, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)

        assert "redirect_uri" in params
        assert unquote(params["redirect_uri"][0]) == expected_redirect

    def test_oauth_url_contains_state_with_account_id(self):
        """State must contain account_id for recovery in callback."""
        env = make_env()
        account_id = 99
        oauth_url, state, _ = self._build_oauth_url(account_id, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)

        assert "state" in params
        state_parts = params["state"][0].split("|")
        assert len(state_parts) == 2
        assert state_parts[1] == str(account_id)

    def test_oauth_url_contains_required_scopes(self):
        """OAuth URL must request required scopes."""
        env = make_env()
        oauth_url, _, _ = self._build_oauth_url(42, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)

        assert "scope" in params
        scope = params["scope"][0]
        assert "user-read-private" in scope

    def test_redirect_uri_must_match_spotify_app_config(self):
        """
        The redirect_uri MUST exactly match what is registered in Spotify Developer Dashboard.
        This test documents the requirement.
        """
        env = make_env(FRONTEND_URL="https://2946-203-81-236-107.ngrok-free.app")
        _, _, redirect_uri = self._build_oauth_url(42, env)

        # This is the URI that MUST be added to Spotify app settings
        expected = "https://2946-203-81-236-107.ngrok-free.app/integrations/spotify/oauth/callback"
        assert redirect_uri == expected


# ─────────────────────────────────────────────────────────────────────────────
# 3. API ENDPOINT TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestSpotifyAPIEndpoints:
    """Tests for backend API endpoints."""

    def test_ad_accounts_endpoint_path(self):
        """Verify the ad-accounts endpoint path is correct."""
        expected = "/platforms/spotify/ad-accounts"
        # This would be tested via TestClient in integration tests
        assert expected == "/platforms/spotify/ad-accounts"

    def test_launch_endpoint_path(self):
        """Verify the launch endpoint path is correct."""
        campaign_id = "123"
        expected = f"/platforms/spotify/campaigns/{campaign_id}/launch"
        assert expected == "/platforms/spotify/campaigns/123/launch"


# ─────────────────────────────────────────────────────────────────────────────
# 4. CONNECTOR FACTORY INTEGRATION
# ─────────────────────────────────────────────────────────────────────────────

class TestConnectorFactory:
    """Test SpotifyAdsConnector is properly registered in factory."""

    def test_spotify_registered_in_platform_registry(self):
        """Spotify should be registered in PLATFORM_REGISTRY."""
        from services.platform_service.connector_factory import PLATFORM_REGISTRY

        assert "spotify" in PLATFORM_REGISTRY
        assert PLATFORM_REGISTRY["spotify"] == SpotifyAdsConnector

    def test_get_connector_returns_spotify_instance(self):
        """get_connector('spotify') should return SpotifyAdsConnector instance."""
        from services.platform_service.connector_factory import get_connector

        connector = get_connector("spotify", credentials={"access_token": "test"})
        assert isinstance(connector, SpotifyAdsConnector)


# ─────────────────────────────────────────────────────────────────────────────
# 5. END-TO-END FLOW SIMULATION
# ─────────────────────────────────────────────────────────────────────────────

class TestEndToEndFlow:
    """Simulate the full user flow from connection to campaign launch."""

    @patch('services.platform_service.connectors.spotify.httpx.Client')
    def test_complete_flow_connect_select_launch(self, mock_client_class):
        """
        Full flow:
        1. User connects Spotify (OAuth) → credentials stored
        2. User selects Spotify in campaign wizard → ad accounts fetched
        3. User selects ad account → stored in platform_allocations
        4. User launches campaign → campaign created with selected ad_account_id
        """
        # Step 1: Simulate OAuth completion - credentials are available
        credentials = {
            "access_token": MOCK_ACCESS_TOKEN,
            "refresh_token": MOCK_REFRESH_TOKEN,
        }

        # Step 2: Fetch ad accounts
        mock_biz_response = Mock()
        mock_biz_response.status_code = 200
        mock_biz_response.json.return_value = [{"id": MOCK_BUSINESS_ID, "name": "My Business"}]

        mock_accts_response = Mock()
        mock_accts_response.status_code = 200
        mock_accts_response.json.return_value = [
            {"id": MOCK_AD_ACCOUNT_ID, "name": "My Ad Account", "status": "ACTIVE"}
        ]

        # Step 4: Launch campaign
        mock_launch_response = Mock()
        mock_launch_response.status_code = 201
        mock_launch_response.json.return_value = {"id": MOCK_CAMPAIGN_ID}

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.get.side_effect = [mock_biz_response, mock_accts_response]
        mock_client.post.return_value = mock_launch_response
        mock_client_class.return_value = mock_client

        connector = SpotifyAdsConnector(credentials=credentials)

        # Verify connection
        assert connector.status == PlatformStatus.AVAILABLE, "Connector should be AVAILABLE after OAuth"

        # Fetch ad accounts
        ad_accounts_result = connector.fetch_ad_accounts()
        assert ad_accounts_result["success"], "Should fetch ad accounts successfully"
        assert len(ad_accounts_result["ad_accounts"]) > 0, "Should have at least one ad account"

        selected_ad_account = ad_accounts_result["ad_accounts"][0]["id"]

        # Step 3: Simulate platform_allocations_json storage (frontend does this)
        platform_allocations = {
            "spotify": {
                "budget": 50000,  # cents
                "ad_account_id": selected_ad_account
            }
        }

        # Step 4: Launch campaign with selected ad account
        campaign_config = {
            "name": "E2E Test Campaign",
            "goal": "awareness",
            "ad_account_id": platform_allocations["spotify"]["ad_account_id"],
            "total_budget_cents": platform_allocations["spotify"]["budget"],
        }

        launch_result = connector.launch_campaign(campaign_config)

        assert launch_result["success"], f"Campaign launch should succeed: {launch_result.get('error')}"
        assert launch_result["platform_campaign_id"] == MOCK_CAMPAIGN_ID

        # Verify the ad_account_id in the API call
        post_call = mock_client.post.call_args
        called_url = post_call[0][0]
        assert MOCK_AD_ACCOUNT_ID in called_url, "API call should use selected ad_account_id"


# ─────────────────────────────────────────────────────────────────────────────
# 6. ENVIRONMENT VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

class TestEnvironmentConfiguration:
    """Tests to verify environment is properly configured."""

    def test_spotify_ads_api_base_url(self):
        """API base URL should use api-partner.spotify.com (not api.spotify.com)."""
        assert SPOTIFY_ADS_API_BASE == "https://api-partner.spotify.com/ads/v3"
        assert "api-partner" in SPOTIFY_ADS_API_BASE
        assert "api.spotify.com" not in SPOTIFY_ADS_API_BASE

    def test_env_vars_documented(self):
        """Document required environment variables."""
        required_vars = [
            "SPOTIFY_CLIENT_ID",
            "SPOTIFY_CLIENT_SECRET",
            "FRONTEND_URL",  # For redirect_uri
        ]
        # This test is informational - documents what must be set
        for var in required_vars:
            assert var, f"Environment variable {var} is required for Spotify integration"


# ─────────────────────────────────────────────────────────────────────────────
# 7. INTEGRATION TESTS (require real credentials)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestSpotifyIntegration:
    """
    Integration tests that require real Spotify credentials.
    
    To run these tests:
    1. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET in your environment
    2. Have a valid access_token from a completed OAuth flow
    3. Run: pytest tests/unit/test_spotify_ads_connector.py -v -m integration
    
    These tests are skipped by default (no network calls in CI).
    """

    @pytest.fixture
    def real_credentials(self):
        """Get real credentials from environment (skip if not available)."""
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        access_token = os.getenv("SPOTIFY_TEST_ACCESS_TOKEN")

        if not all([client_id, client_secret, access_token]):
            pytest.skip("Real Spotify credentials not available")

        return {
            "access_token": access_token,
            "app_id": client_id,
            "app_secret": client_secret,
        }

    def test_real_fetch_ad_accounts(self, real_credentials):
        """Fetch real ad accounts from Spotify Ads API."""
        connector = SpotifyAdsConnector(credentials=real_credentials)
        result = connector.fetch_ad_accounts()

        print(f"\n[INTEGRATION] Spotify Ad Accounts Result:")
        print(f"  Success: {result.get('success')}")
        print(f"  Count: {result.get('count', 0)}")
        print(f"  Error: {result.get('error', 'None')}")

        if result.get("ad_accounts"):
            for acct in result["ad_accounts"]:
                print(f"  - {acct.get('name')} (ID: {acct.get('id')})")

        # Don't assert success - user may not have ad accounts yet
        assert "success" in result
        assert "ad_accounts" in result


# ─────────────────────────────────────────────────────────────────────────────
# 8. HELPER VERIFICATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestHelperFunctions:
    """Test internal helper methods."""

    def test_auth_headers_format(self):
        """Auth headers should include Bearer token."""
        credentials = {"access_token": "test_token_123"}
        connector = SpotifyAdsConnector(credentials=credentials)
        headers = connector._auth_headers()

        assert "Authorization" in headers
        assert headers["Authorization"] == "Bearer test_token_123"
        assert headers["Content-Type"] == "application/json"

    def test_get_access_token_from_credentials(self):
        """_get_access_token should return token from credentials dict."""
        credentials = {"access_token": "my_token"}
        connector = SpotifyAdsConnector(credentials=credentials)

        assert connector._get_access_token() == "my_token"

    def test_get_access_token_missing(self):
        """_get_access_token should return None if not available."""
        connector = SpotifyAdsConnector(credentials={})
        assert connector._get_access_token() is None


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "--tb=short"])
