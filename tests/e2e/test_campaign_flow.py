import pytest
from services.agent_service.tools import (
    create_goal, create_audience, create_budget, create_creative,
    simulate_reach, launch_campaign
)
from services.agent_service.schemas import (
    CreateGoalInput, CreateAudienceInput, CreateBudgetInput,
    CreateCreativeInput, SimulateReachInput, LaunchCampaignInput
)

@pytest.mark.asyncio
async def test_full_campaign_flow_e2e():
    """
    Simulates a full user journey:
    1. Define Goal
    2. Define Audience
    3. Define Budget
    4. Upload Creative
    5. Simulate Reach
    6. Launch Campaign
    """
    # 1. Define Goal
    goal_inp = CreateGoalInput(
        goal_type="awareness",
        description="E2E Test Campaign"
    )
    goal_out = create_goal(goal_inp)
    assert goal_out.goal_id is not None

    # 2. Define Audience
    aud_inp = CreateAudienceInput(
        brand_id=1,
        geo=["US"],
        languages=["en"],
        interests=["tech"]
    )
    aud_out = create_audience(aud_inp)
    assert aud_out.audience_id is not None

    # 3. Define Budget
    bud_inp = CreateBudgetInput(
        total_amount=10000.0,
        start_date="2025-06-01",
        end_date="2025-06-30",
        platforms=["meta", "roku"]
    )
    bud_out = create_budget(bud_inp)
    assert bud_out.budget_id is not None

    # 4. Upload Creative
    creat_inp = CreateCreativeInput(
        brand_id=1,
        creative_type="image",
        asset_reference="https://example.com/e2e.jpg"
    )
    creat_out = create_creative(creat_inp)
    assert creat_out.creative_id is not None

    # 5. Simulate Reach
    sim_inp = SimulateReachInput(
        goal_id=goal_out.goal_id,
        audience_id=aud_out.audience_id,
        creative_ids=[creat_out.creative_id],
        budget_id=bud_out.budget_id
    )
    sim_out = simulate_reach(sim_inp)
    assert sim_out.final_cpm > 0
    assert "overall" in sim_out.kaivo_intelligence_scores

    # 6. Launch Campaign
    # In a real E2E, we might use a "plan_id" that aggregates these, 
    # but for now we assume the orchestrator or UI handles that aggregation.
    # We will simulate launching by passing a dummy plan_id, as the tool currently expects one.
    launch_inp = LaunchCampaignInput(
        plan_id=f"plan_{goal_out.goal_id}_{aud_out.audience_id}",
        user_id=1
    )
    launch_out = launch_campaign(launch_inp)
    assert launch_out.status == "launching"
    assert launch_out.campaign_id is not None
