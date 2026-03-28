import pytest
from unittest.mock import patch, MagicMock
from services.agent_service.tools import (
    check_accounts, select_execution_mode, create_goal, create_audience,
    create_budget, create_creative, generate_variants, simulate_reach,
    validate_policy, launch_campaign, fetch_results, rebalance_budget
)
from services.agent_service.schemas import (
    CheckAccountsInput, SelectExecutionModeInput, CreateGoalInput,
    CreateAudienceInput, CreateBudgetInput, CreateCreativeInput,
    GenerateVariantsInput, SimulateReachInput, ValidatePolicyInput,
    LaunchCampaignInput
)

def test_check_accounts():
    inp = CheckAccountsInput(user_id=1)
    result = check_accounts(inp)
    assert len(result.configured_platforms) > 0

def test_select_execution_mode():
    inp = SelectExecutionModeInput(
        user_id=1,
        requested_mode="auto",
        platforms=["meta"],
        budget=1000.0
    )
    result = select_execution_mode(inp)
    assert result.chosen_mode == "kaivo_managed" # Stub returns this

def test_create_goal():
    inp = CreateGoalInput(goal_type="awareness", description="Increase brand visibility")
    result = create_goal(inp)
    assert result.goal["type"] == "awareness"

@patch('services.audience_service.crud.create_audience')
def test_create_audience(mock_create_audience):
    mock_create_audience.return_value = MagicMock(id=1, client_id=1)
    inp = CreateAudienceInput(
        brand_id=1,
        geo=["US"],
        languages=["en"],
        interests=["tech", "marketing"]
    )
    result = create_audience(inp)
    assert result.audience["geo"] == ["US"]
    assert "tech" in result.audience["interests"]

def test_create_budget():
    inp = CreateBudgetInput(
        total_amount=5000.0,
        start_date="2025-01-01",
        end_date="2025-01-31",
        platforms=["meta"]
    )
    result = create_budget(inp)
    assert result.budget["total"] == 5000.0

def test_create_creative():
    inp = CreateCreativeInput(
        brand_id=1,
        creative_type="image",
        asset_reference="https://example.com/image.jpg"
    )
    result = create_creative(inp)
    assert result.creative["type"] == "image"

def test_generate_variants():
    inp = GenerateVariantsInput(
        headline="Original Headline",
        body="Original Body",
        languages=["es", "fr"]
    )
    result = generate_variants(inp)
    assert len(result.variants) == 2
    assert result.variants[0]["language"] in ["es", "fr"]

def test_simulate_reach():
    inp = SimulateReachInput(
        goal_id="g1",
        audience_id="a1",
        creative_ids=["c1"],
        budget_id="b1"
    )
    result = simulate_reach(inp)
    assert result.final_cpm > 0
    assert result.kaivo_intelligence_scores["overall"] > 0

def test_validate_policy():
    inp = ValidatePolicyInput(
        creative_ids=["c1"],
        audience_id="a1",
        budget_id="b1",
        platforms=["meta"]
    )
    result = validate_policy(inp)
    assert result.passed is True

def test_launch_campaign():
    inp = LaunchCampaignInput(plan_id="plan_123", user_id=1)
    result = launch_campaign(inp)
    assert result.status == "launching"
    assert result.campaign_id is not None

def test_fetch_results():
    result = fetch_results("camp_123")
    assert "impressions" in result
    assert "spend" in result

def test_rebalance_budget():
    result = rebalance_budget("camp_123")
    assert "recommendation" in result # Fixed assertion key

