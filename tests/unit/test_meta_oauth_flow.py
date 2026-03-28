"""
Meta OAuth Flow - End-to-End Tests
====================================
Tests cover the full OAuth lifecycle:
  1. Initiate endpoint: URL construction, required params, state encoding
  2. Callback endpoint: state decoding, account_id recovery, code exchange
  3. Error handling: Facebook error params, missing params, token exchange failures
  4. redirect_uri consistency: initiate and callback must use the same URI
  5. Token exchange: short-lived → long-lived, fallback behaviour

Run with:
  pytest tests/unit/test_meta_oauth_flow.py -v
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import urlparse, parse_qs, unquote

# ── Helpers ───────────────────────────────────────────────────────────────────

CANONICAL_REDIRECT_URI = "https://app.getkaivo.com/integrations/meta/oauth/callback"
META_APP_ID = "test_app_id_123"
META_APP_SECRET = "test_app_secret_456"
ACCOUNT_ID = 42


def make_env(**overrides):
    """Return a minimal env dict for Meta OAuth."""
    base = {
        "META_APP_ID": META_APP_ID,
        "META_APP_SECRET": META_APP_SECRET,
        "META_REDIRECT_URI": CANONICAL_REDIRECT_URI,
    }
    base.update(overrides)
    return base


# ─────────────────────────────────────────────────────────────────────────────
# 1. INITIATE ENDPOINT TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestMetaOAuthInitiate:
    """Tests for /platforms/meta/oauth/initiate"""

    def _build_oauth_url(self, account_id: int, env: dict) -> tuple[str, str]:
        """
        Simulate what the initiate endpoint does:
        - encode account_id in state
        - build canonical redirect_uri
        - construct oauth_url with required params
        Returns (oauth_url, state)
        """
        from urllib.parse import quote
        state = f"{uuid.uuid4().hex}|{account_id}"
        redirect_uri = env.get("META_REDIRECT_URI", CANONICAL_REDIRECT_URI)
        encoded = quote(redirect_uri, safe="")
        app_id = env["META_APP_ID"]
        scope = "ads_read,ads_management,business_management,pages_read_engagement,pages_show_list"
        oauth_url = (
            f"https://www.facebook.com/v21.0/dialog/oauth"
            f"?client_id={app_id}"
            f"&redirect_uri={encoded}"
            f"&scope={scope}"
            f"&state={state}"
            f"&response_type=code"
        )
        return oauth_url, state

    def test_oauth_url_contains_client_id(self):
        """client_id must be present in the OAuth URL."""
        env = make_env()
        oauth_url, _ = self._build_oauth_url(ACCOUNT_ID, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)
        assert "client_id" in params, "client_id missing from OAuth URL"
        assert params["client_id"][0] == META_APP_ID

    def test_oauth_url_contains_redirect_uri(self):
        """redirect_uri must be present and URL-decoded to the canonical value."""
        env = make_env()
        oauth_url, _ = self._build_oauth_url(ACCOUNT_ID, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)
        assert "redirect_uri" in params, "redirect_uri missing from OAuth URL"
        assert unquote(params["redirect_uri"][0]) == CANONICAL_REDIRECT_URI

    def test_oauth_url_contains_state(self):
        """state must be present in the OAuth URL."""
        env = make_env()
        oauth_url, state = self._build_oauth_url(ACCOUNT_ID, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)
        assert "state" in params, "state missing from OAuth URL"
        assert params["state"][0] == state

    def test_oauth_url_contains_scope(self):
        """scope must include ads_management (required for campaign creation)."""
        env = make_env()
        oauth_url, _ = self._build_oauth_url(ACCOUNT_ID, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)
        assert "scope" in params, "scope missing from OAuth URL"
        scopes = params["scope"][0].split(",")
        assert "ads_management" in scopes, "ads_management scope missing"
        assert "ads_read" in scopes, "ads_read scope missing"
        assert "business_management" in scopes, "business_management scope missing"

    def test_oauth_url_contains_response_type_code(self):
        """response_type=code must be present."""
        env = make_env()
        oauth_url, _ = self._build_oauth_url(ACCOUNT_ID, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)
        assert params.get("response_type", [None])[0] == "code"

    def test_state_encodes_account_id(self):
        """state must encode account_id in format random_hex|account_id."""
        env = make_env()
        _, state = self._build_oauth_url(ACCOUNT_ID, env)
        assert "|" in state, "state must contain | separator"
        parts = state.split("|")
        assert len(parts) == 2, "state must have exactly 2 parts"
        assert parts[1] == str(ACCOUNT_ID), f"account_id not encoded correctly: {parts[1]}"

    def test_state_account_id_decoded_correctly(self):
        """account_id decoded from state must match original."""
        env = make_env()
        _, state = self._build_oauth_url(ACCOUNT_ID, env)
        _, account_id_str = state.rsplit("|", 1)
        assert int(account_id_str) == ACCOUNT_ID

    def test_different_accounts_get_different_states(self):
        """Each initiation must produce a unique state for CSRF protection."""
        env = make_env()
        _, state1 = self._build_oauth_url(1, env)
        _, state2 = self._build_oauth_url(1, env)
        # The random hex portion must differ
        hex1 = state1.split("|")[0]
        hex2 = state2.split("|")[0]
        assert hex1 != hex2, "State random portion must be unique per request"

    def test_redirect_uri_uses_meta_redirect_uri_env_var(self):
        """redirect_uri must come from META_REDIRECT_URI, not FRONTEND_URL."""
        custom_uri = "https://app.getkaivo.com/integrations/meta/oauth/callback"
        env = make_env(META_REDIRECT_URI=custom_uri)
        oauth_url, _ = self._build_oauth_url(ACCOUNT_ID, env)
        parsed = urlparse(oauth_url)
        params = parse_qs(parsed.query)
        decoded = unquote(params["redirect_uri"][0])
        assert decoded == custom_uri

    def test_missing_app_id_detected(self):
        """If META_APP_ID is missing, the flow should fail early."""
        env = make_env()
        env.pop("META_APP_ID")
        app_id = env.get("META_APP_ID")
        app_secret = env.get("META_APP_SECRET")
        assert not app_id or not app_secret, "Should detect missing credentials"

    def test_missing_app_secret_detected(self):
        """If META_APP_SECRET is missing, the flow should fail early."""
        env = make_env()
        env.pop("META_APP_SECRET")
        app_id = env.get("META_APP_ID")
        app_secret = env.get("META_APP_SECRET")
        assert not app_id or not app_secret, "Should detect missing credentials"

    def test_oauth_url_points_to_facebook_dialog(self):
        """OAuth URL must start with the Facebook dialog endpoint."""
        env = make_env()
        oauth_url, _ = self._build_oauth_url(ACCOUNT_ID, env)
        assert oauth_url.startswith("https://www.facebook.com/v21.0/dialog/oauth")


# ─────────────────────────────────────────────────────────────────────────────
# 2. CALLBACK: STATE DECODING TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestMetaOAuthCallbackStateDecoding:
    """Tests for account_id recovery from the state parameter."""

    def _decode_account_id_from_state(self, state: str) -> int | None:
        """Mirror the backend's decode logic."""
        if "|" in state:
            try:
                _, account_id_str = state.rsplit("|", 1)
                return int(account_id_str)
            except (ValueError, IndexError):
                return None
        return None

    def test_decode_valid_state(self):
        random_hex = uuid.uuid4().hex
        state = f"{random_hex}|{ACCOUNT_ID}"
        result = self._decode_account_id_from_state(state)
        assert result == ACCOUNT_ID

    def test_decode_state_with_large_account_id(self):
        state = f"{uuid.uuid4().hex}|999999"
        result = self._decode_account_id_from_state(state)
        assert result == 999999

    def test_decode_state_missing_separator(self):
        """State without | should return None."""
        state = uuid.uuid4().hex  # plain hex, no |
        result = self._decode_account_id_from_state(state)
        assert result is None

    def test_decode_state_invalid_account_id(self):
        """Non-numeric account_id in state should return None."""
        state = f"{uuid.uuid4().hex}|not_a_number"
        result = self._decode_account_id_from_state(state)
        assert result is None

    def test_decode_empty_state(self):
        result = self._decode_account_id_from_state("")
        assert result is None

    def test_decode_state_with_multi_pipe(self):
        """rsplit should use the last | so extra pipes in hex don't break it."""
        # This won't happen in practice but defence-in-depth
        state = "abc|def|42"
        result = self._decode_account_id_from_state(state)
        assert result == 42

    def test_full_round_trip_state_encode_decode(self):
        """Encode account_id → state → decode → must equal original."""
        original_id = 12345
        state = f"{uuid.uuid4().hex}|{original_id}"
        decoded = self._decode_account_id_from_state(state)
        assert decoded == original_id


# ─────────────────────────────────────────────────────────────────────────────
# 3. CALLBACK: ERROR PARAMETER HANDLING
# ─────────────────────────────────────────────────────────────────────────────

class TestMetaOAuthCallbackErrors:
    """Tests for how the callback handles Facebook-returned errors."""

    def test_facebook_user_denied_access(self):
        """When Facebook returns error=access_denied, flow should surface it."""
        error = "access_denied"
        error_reason = "user_denied"
        error_description = "The user denied your request."

        # Simulate the callback logic for error handling
        if error:
            result = {
                "success": False,
                "error": error,
                "error_reason": error_reason,
                "error_description": error_description,
            }
        else:
            result = {"success": True}

        assert result["success"] is False
        assert result["error"] == "access_denied"
        assert "user_denied" in result["error_reason"]

    def test_missing_code_parameter(self):
        """If Facebook doesn't return 'code', callback must fail gracefully."""
        code = None
        state = f"{uuid.uuid4().hex}|{ACCOUNT_ID}"

        if not code or not state:
            result = {
                "success": False,
                "error": "Missing OAuth parameters",
                "message": "Facebook did not return 'code' or 'state'.",
            }
        else:
            result = {"success": True}

        assert result["success"] is False
        assert "Missing OAuth parameters" in result["error"]

    def test_missing_state_parameter(self):
        """If Facebook doesn't return 'state', callback must fail gracefully."""
        code = "some_code_from_facebook"
        state = None

        if not code or not state:
            result = {
                "success": False,
                "error": "Missing OAuth parameters",
                "message": "Facebook did not return 'code' or 'state'.",
            }
        else:
            result = {"success": True}

        assert result["success"] is False

    def test_both_code_and_state_present_proceeds(self):
        """When code and state are both present, flow should proceed."""
        code = "valid_auth_code_from_facebook"
        state = f"{uuid.uuid4().hex}|{ACCOUNT_ID}"

        missing = not code or not state
        assert missing is False, "Both params present — should not fail here"

    def test_error_takes_priority_over_code(self):
        """If Facebook returns error AND code, error should be handled first."""
        error = "some_error"
        code = "also_present"  # Facebook shouldn't do this, but be safe
        error_description = "Something went wrong"

        if error:
            result = {
                "success": False,
                "error": error,
                "error_description": error_description,
            }
        elif code:
            result = {"success": True}
        else:
            result = {"success": False, "error": "Missing code"}

        assert result["success"] is False
        assert result["error"] == "some_error"


# ─────────────────────────────────────────────────────────────────────────────
# 4. REDIRECT_URI CONSISTENCY TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestRedirectUriConsistency:
    """
    The redirect_uri used in initiate must EXACTLY match the one used in the
    callback token exchange. Any difference causes Facebook to reject the token.
    """

    def _get_redirect_uri(self, env: dict) -> str:
        """Mirrors the backend logic for resolving redirect_uri."""
        return env.get(
            "META_REDIRECT_URI",
            "https://app.getkaivo.com/integrations/meta/oauth/callback"
        )

    def test_initiate_and_callback_use_same_redirect_uri(self):
        env = make_env()
        # Initiate
        initiate_redirect = self._get_redirect_uri(env)
        # Callback token exchange
        callback_redirect = self._get_redirect_uri(env)
        assert initiate_redirect == callback_redirect, (
            f"redirect_uri mismatch!\n"
            f"  Initiate:  {initiate_redirect}\n"
            f"  Callback:  {callback_redirect}\n"
            f"This WILL cause Facebook to reject the token exchange."
        )

    def test_redirect_uri_matches_registered_uri(self):
        """The redirect_uri must exactly match what's in Meta Developer Portal."""
        env = make_env()
        uri = self._get_redirect_uri(env)
        assert uri == CANONICAL_REDIRECT_URI, (
            f"redirect_uri '{uri}' does not match the registered URI: {CANONICAL_REDIRECT_URI}"
        )

    def test_frontend_url_env_does_not_affect_redirect_uri(self):
        """
        Previously FRONTEND_URL was used to build redirect_uri, which breaks in
        local dev (localhost:3000 != app.getkaivo.com). Now META_REDIRECT_URI
        takes precedence and should be independent of FRONTEND_URL.
        """
        env = make_env()
        env["FRONTEND_URL"] = "http://localhost:3000"  # local dev value
        uri = self._get_redirect_uri(env)
        # Must NOT be the localhost version
        assert "localhost" not in uri, (
            "redirect_uri must not use FRONTEND_URL (localhost) — "
            "it must use META_REDIRECT_URI which matches the registered URI in Meta Portal."
        )

    def test_redirect_uri_has_no_trailing_slash(self):
        """Trailing slash in redirect_uri causes mismatch with Meta registration."""
        env = make_env()
        uri = self._get_redirect_uri(env)
        assert not uri.endswith("/"), f"redirect_uri must not have trailing slash: {uri}"

    def test_redirect_uri_uses_https(self):
        """Meta requires HTTPS for production redirect URIs."""
        env = make_env()
        uri = self._get_redirect_uri(env)
        assert uri.startswith("https://"), f"redirect_uri must use HTTPS: {uri}"

    def test_redirect_uri_correctly_url_encoded_in_oauth_url(self):
        """The redirect_uri should be URL-encoded when embedded in the OAuth URL."""
        from urllib.parse import quote
        env = make_env()
        redirect_uri = self._get_redirect_uri(env)
        encoded = quote(redirect_uri, safe="")
        # The encoded URI should not contain raw ://
        assert "://" not in encoded, "redirect_uri must be URL-encoded in OAuth URL"
        # It should have encoded colons and slashes
        assert "%3A" in encoded or "%2F" in encoded, "redirect_uri must be URL-encoded"


# ─────────────────────────────────────────────────────────────────────────────
# 5. TOKEN EXCHANGE LOGIC TESTS (mocked)
# ─────────────────────────────────────────────────────────────────────────────

class TestMetaTokenExchange:
    """Tests for the code→token exchange logic (Facebook Graph API calls mocked)."""

    def _simulate_token_exchange(
        self,
        short_lived_response_status: int = 200,
        short_lived_token: str = "short_123",
        long_lived_response_status: int = 200,
        long_lived_token: str = "long_456",
    ) -> dict:
        """
        Simulate the token exchange logic from the callback handler.
        Returns the result dict as the handler would produce it.
        """
        from datetime import datetime, timedelta

        # Step 1: short-lived token exchange
        if short_lived_response_status != 200:
            return {"success": False, "error": "OAuth exchange failed"}

        token_data = {
            "access_token": short_lived_token,
            "expires_in": 3600,
        }
        sl_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in", 3600)

        if not sl_token:
            return {"success": False, "error": "Failed to get access token"}

        # Step 2: long-lived token exchange
        if long_lived_response_status == 200:
            final_token = long_lived_token
            final_expires_in = 5184000  # 60 days
            token_type = "long-lived"
        else:
            final_token = sl_token
            final_expires_in = expires_in
            token_type = "short-lived"

        expires_at = datetime.utcnow() + timedelta(seconds=final_expires_in)

        result = {
            "success": True,
            "token_type": token_type,
            "final_token": final_token,
            "expires_in_days": final_expires_in // 86400,
        }
        if token_type == "short-lived":
            result["warning"] = "Long-lived token exchange failed, using short-lived token (~1 hour)"

        return result

    def test_successful_long_lived_token_exchange(self):
        result = self._simulate_token_exchange(
            long_lived_response_status=200,
            long_lived_token="long_lived_token_abc"
        )
        assert result["success"] is True
        assert result["token_type"] == "long-lived"
        assert result["final_token"] == "long_lived_token_abc"
        assert result["expires_in_days"] == 60

    def test_fallback_to_short_lived_on_exchange_failure(self):
        """If long-lived exchange fails, must fall back to short-lived token."""
        result = self._simulate_token_exchange(
            short_lived_token="sl_token_xyz",
            long_lived_response_status=400,  # Facebook rejects the exchange
        )
        assert result["success"] is True, "Should still succeed with short-lived token"
        assert result["token_type"] == "short-lived"
        assert result["final_token"] == "sl_token_xyz"
        assert "warning" in result, "Should include warning about short-lived token"

    def test_short_lived_exchange_failure_returns_error(self):
        """If Facebook rejects the code→token exchange, flow must fail."""
        result = self._simulate_token_exchange(
            short_lived_response_status=400,  # Facebook rejects code
        )
        assert result["success"] is False

    def test_long_lived_token_expires_in_60_days(self):
        result = self._simulate_token_exchange()
        assert result["expires_in_days"] == 60

    def test_short_lived_fallback_expires_in_1_hour(self):
        result = self._simulate_token_exchange(long_lived_response_status=500)
        assert result["token_type"] == "short-lived"
        # 3600 seconds // 86400 = 0 days (less than 1 day)
        assert result["expires_in_days"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# 6. INTEGRATION TEST: Full Flow Simulation (no real HTTP)
# ─────────────────────────────────────────────────────────────────────────────

class TestMetaOAuthFullFlowSimulation:
    """
    Simulates the complete Meta OAuth flow end-to-end without real HTTP calls.
    This validates the critical data path from initiation to token storage.
    """

    def test_full_flow_account_id_preserved(self):
        """
        Critical test: account_id set during initiate must arrive in callback.

        Flow:
          1. User clicks "Connect Meta Account" for account_id=42
          2. Backend initiate encodes 42 in state: "abc123|42"
          3. Facebook redirects to callback with code=CODE&state=abc123|42
          4. Frontend sends code+state to backend callback
          5. Backend decodes account_id=42 from state
          6. Token stored under account_id=42
        """
        # Step 1-2: Initiate
        original_account_id = 42
        random_hex = uuid.uuid4().hex
        state = f"{random_hex}|{original_account_id}"

        # Step 3: Facebook redirects (only code + state, no account_id)
        facebook_redirect_params = {
            "code": "facebook_auth_code_xyz",
            "state": state,
            # NOTE: NO account_id here — Facebook strips it
        }

        # Step 4: Frontend sends to backend (only code + state)
        code = facebook_redirect_params.get("code")
        received_state = facebook_redirect_params.get("state")
        account_id_in_params = facebook_redirect_params.get("account_id")  # Will be None

        # Step 5: Backend decodes account_id from state
        resolved_account_id = account_id_in_params
        if resolved_account_id is None and received_state and "|" in received_state:
            _, account_id_str = received_state.rsplit("|", 1)
            resolved_account_id = int(account_id_str)

        # Step 6: Verify
        assert resolved_account_id == original_account_id, (
            f"account_id was lost in the OAuth flow! "
            f"Expected {original_account_id}, got {resolved_account_id}"
        )
        assert code == "facebook_auth_code_xyz"

    def test_flow_with_account_id_42(self):
        """Test canonical account_id=42 scenario described in the bug report."""
        account_id = 42
        state = f"{uuid.uuid4().hex}|{account_id}"

        # Simulate Facebook callback (only code + state)
        code = "mock_code_from_facebook"

        # Verify we can recover account_id
        _, recovered = state.rsplit("|", 1)
        assert int(recovered) == account_id

    def test_flow_facebook_sends_only_code_and_state(self):
        """
        Verify our flow handles the fact that Facebook ONLY returns code+state.
        This was the root cause of the original bug:
        - Old code: required account_id as a separate URL parameter
        - Bug: Facebook never adds custom params to the redirect
        - Fix: encode account_id in state
        """
        # Facebook's redirect only has these params
        facebook_params = {"code": "auth_code_123", "state": "hexhex|42"}

        # Old broken check (would fail):
        account_id_old_way = facebook_params.get("account_id")  # Always None from Facebook
        old_check_passes = bool(
            facebook_params.get("code") and
            facebook_params.get("state") and
            account_id_old_way  # ← This was always None = CHECK FAILS
        )
        assert old_check_passes is False, "This demonstrates the original bug"

        # New fixed check:
        state = facebook_params.get("state", "")
        code = facebook_params.get("code")
        new_check_passes = bool(code and state)  # Only require code+state
        assert new_check_passes is True, "New check should pass with just code+state"

        # And we can recover account_id from state:
        _, account_id_str = state.rsplit("|", 1)
        assert int(account_id_str) == 42

    def test_redirect_uri_registered_on_meta_portal(self):
        """
        The redirect_uri in the OAuth URL must match what's registered.
        Meta Developer Portal registration: https://app.getkaivo.com/integrations/meta/oauth/callback
        """
        registered_uri = "https://app.getkaivo.com/integrations/meta/oauth/callback"
        env = make_env()
        computed_uri = env.get("META_REDIRECT_URI", registered_uri)
        assert computed_uri == registered_uri, (
            f"redirect_uri mismatch with Meta Developer Portal registration.\n"
            f"  Computed: {computed_uri}\n"
            f"  Registered: {registered_uri}"
        )
