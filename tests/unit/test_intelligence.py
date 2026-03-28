import pytest
from services.intelligence_service.core import (
    calculate_umi_score, generate_sweet_spot, run_budget_optimizer
)
from services.intelligence_service.schemas import (
    ClusterScores, GoalEnum, PlatformScore, OptimizationSignal, IntelligenceInput
)

def test_calculate_kaivo_score():
    """Test UMI score calculation (backward compatibility alias)"""
    clusters = ClusterScores(
        visibility=80, engagement=70, conversion_power=60,
        efficiency=90, quality_stability=85
    )
    score = calculate_umi_score(clusters, GoalEnum.AWARENESS)
    assert 70 <= score <= 90 # Rough range check based on weights

def test_generate_sweet_spot():
    scores = [
        PlatformScore(
            platform="meta", umi_score=85, 
            cluster_scores=ClusterScores(visibility=90, engagement=80, conversion_power=70, efficiency=80, quality_stability=80),
            signal=OptimizationSignal(direction="increase", priority="high", reason="Good")
        ),
        PlatformScore(
            platform="x", umi_score=40,
            cluster_scores=ClusterScores(visibility=40, engagement=30, conversion_power=20, efficiency=30, quality_stability=40),
            signal=OptimizationSignal(direction="decrease", priority="high", reason="Bad")
        )
    ]
    sweet_spot = generate_sweet_spot(scores)
    assert "meta" in sweet_spot.top_platforms
    assert "x" in sweet_spot.losing_momentum
    assert sweet_spot.incremental_budget_recommendation == "meta"

def test_run_budget_optimizer():
    current_allocations = {"meta": 1000.0, "x": 1000.0}
    scores = [
        PlatformScore(
            platform="meta", umi_score=80,
            cluster_scores=ClusterScores(visibility=0, engagement=0, conversion_power=0, efficiency=0, quality_stability=0),
            signal=OptimizationSignal(direction="increase", priority="high", reason="")
        ),
        PlatformScore(
            platform="x", umi_score=40,
            cluster_scores=ClusterScores(visibility=0, engagement=0, conversion_power=0, efficiency=0, quality_stability=0),
            signal=OptimizationSignal(direction="decrease", priority="high", reason="")
        )
    ]
    
    new_allocations = run_budget_optimizer(current_allocations, scores, shift_percent=0.1)
    
    # X should decrease by 10% (100)
    assert new_allocations["x"] == 900.0
    # Meta should increase by that 100
    assert new_allocations["meta"] == 1100.0
