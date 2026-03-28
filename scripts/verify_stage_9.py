import sys
import os

# Add agent-service directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../services/agent-service")))

from schemas import OrchestratorInput
from orchestrator import process_request

def verify_orchestrator():
    print("Verifying Orchestrator Logic...")
    
    # Test Case 1: Plan a campaign
    inp = OrchestratorInput(
        session_id="test_session_1",
        user_message_summary="Plan a campaign for awareness",
        slots={
            "goal_type": "awareness",
            "description": "Summer Sale",
            "budget": 5000.0,
            "platforms": ["roku", "meta"]
        }
    )
    
    try:
        output = process_request(inp)
        print("\n[SUCCESS] Orchestrator processed request.")
        print(f"Explanation: {output.agent_explanation}")
        print(f"Tool Calls: {len(output.tool_calls)}")
        for call in output.tool_calls:
            print(f" - {call.tool_name}: {call.arguments}")
            
        assert len(output.tool_calls) == 3
        assert output.tool_calls[0].tool_name == "create_goal"
        assert output.tool_calls[1].tool_name == "create_audience"
        assert output.tool_calls[2].tool_name == "create_budget"
        
    except Exception as e:
        print(f"\n[FAILURE] Orchestrator failed: {str(e)}")
        raise e

if __name__ == "__main__":
    verify_orchestrator()
