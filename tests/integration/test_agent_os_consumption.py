import pytest
import os
from services.agent_service import tools
from services.agent_service.schemas import LaunchCampaignInput
from unittest import mock

@pytest.mark.integration
def test_launch_campaign_blocks_on_safety_violation():
    """
    Verifies that launch_campaign is blocked when the OS Safety Layer returns passed=False.
    """
    # Mock input
    inp = LaunchCampaignInput(
        plan_id="plan_123",
        user_id=1
    )

    # 1. Mock run_os_intent to return FAILURE
    with mock.patch('services.agent_service.tools.run_os_intent') as mock_os:
        mock_os.return_value = {
            "passed": False,
            "violations": ["Test Violation"],
            "warnings": [],
            "notes": []
        }
        
        # Call tool
        result = tools.launch_campaign(inp)
        
        # Verify Blocked
        assert result.status == "blocked_by_safety_layer"
        assert "Test Violation" in result.deployment_details["violations"]
        mock_os.assert_called_once()
        args, _ = mock_os.call_args
        assert args[0] == "SAFETY_LAYER_EVALUATION_V1"

@pytest.mark.integration
def test_launch_campaign_proceeds_if_os_disabled():
    """
    Verifies that launch_campaign proceeds if OS runtime is disabled.
    """
    inp = LaunchCampaignInput(
        plan_id="plan_123",
        user_id=1
    )

    # 1. Mock run_os_intent to return DISABLED
    with mock.patch('services.agent_service.tools.run_os_intent') as mock_os:
        mock_os.return_value = {"code": "OS_RUNTIME_DISABLED"}
        
        # Call tool
        result = tools.launch_campaign(inp)
        
        # Verify Success
        assert result.status == "launching"
        mock_os.assert_called_once()

@pytest.mark.integration
def test_run_os_intent_flag_gated():
    """
    Verifies that run_os_intent checks the FF_AGENT_CAN_CALL_OS_RUNTIME flag.
    """
    # 1. Flag OFF
    with mock.patch.dict(os.environ, {"FF_AGENT_CAN_CALL_OS_RUNTIME": "false"}):
        res = tools.run_os_intent("TEST", {})
        assert res["code"] == "OS_RUNTIME_DISABLED"

    # 2. Flag ON (Mocking network)
    with mock.patch.dict(os.environ, {"FF_AGENT_CAN_CALL_OS_RUNTIME": "true"}):
        with mock.patch('httpx.Client') as MockClient:
            mock_client_instance = MockClient.return_value
            mock_client_instance.__enter__.return_value.post.return_value.status_code = 200
            mock_client_instance.__enter__.return_value.post.return_value.json.return_value = {"result": {"passed": True}}
            
            res = tools.run_os_intent("TEST", {})
            assert res["passed"] is True
