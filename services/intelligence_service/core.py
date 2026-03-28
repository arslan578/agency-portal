from typing import List, Dict, Optional
from .schemas import (
    IntelligenceInput, PlatformScore, ClusterScores, OptimizationSignal,
    SweetSpotSummary, GoalEnum, RecommendationItem, CampaignRecommendationInput,
)
from .scoring import calculate_clusters

# Industry CPM benchmarks (platform -> {min, max})
CPM_BENCHMARKS: Dict[str, Dict[str, float]] = {
    "meta": {"min": 8, "max": 15},
    "facebook": {"min": 8, "max": 15},
    "instagram": {"min": 8, "max": 15},
    "tiktok": {"min": 6, "max": 10},
    "google": {"min": 1, "max": 2},
    "google ads": {"min": 1, "max": 2},
    "microsoft": {"min": 1, "max": 2},
}

# Weight Configuration
GOAL_WEIGHTS = {
    GoalEnum.AWARENESS: {
        "visibility": 0.4, "engagement": 0.3, "conversion_power": 0.1, "efficiency": 0.1, "quality_stability": 0.1
    },
    GoalEnum.TRAFFIC: {
        "visibility": 0.2, "engagement": 0.4, "conversion_power": 0.1, "efficiency": 0.2, "quality_stability": 0.1
    },
    GoalEnum.CONVERSIONS: {
        "visibility": 0.1, "engagement": 0.1, "conversion_power": 0.5, "efficiency": 0.2, "quality_stability": 0.1
    },
    GoalEnum.MIXED: {
        "visibility": 0.2, "engagement": 0.2, "conversion_power": 0.2, "efficiency": 0.2, "quality_stability": 0.2
    }
}

def calculate_umi_score(clusters: ClusterScores, goal: GoalEnum) -> float:
    """Calculate UMI (Unified Marketing Intelligence) score from cluster scores and goal weights."""
    weights = GOAL_WEIGHTS.get(goal, GOAL_WEIGHTS[GoalEnum.MIXED])
    
    score = (
        clusters.visibility * weights["visibility"] +
        clusters.engagement * weights["engagement"] +
        clusters.conversion_power * weights["conversion_power"] +
        clusters.efficiency * weights["efficiency"] +
        clusters.quality_stability * weights["quality_stability"]
    )
    return round(score, 2)

# Backward compatibility alias
calculate_kaivo_score = calculate_umi_score

def generate_signal(clusters: ClusterScores, umi_score: float) -> OptimizationSignal:
    """Generate optimization signal based on UMI score and cluster performance."""
    if umi_score >= 80:
        return OptimizationSignal(
            direction="increase",
            priority="high",
            reason="High overall performance across key clusters."
        )
    elif umi_score >= 60:
        return OptimizationSignal(
            direction="hold",
            priority="medium",
            reason="Steady performance, maintain current spend."
        )
    else:
        reason = "Low efficiency" if clusters.efficiency < 40 else "Low engagement"
        return OptimizationSignal(
            direction="decrease",
            priority="high",
            reason=f"Underperforming. {reason}."
        )

def analyze_platforms(inputs: List[IntelligenceInput]) -> List[PlatformScore]:
    results = []
    for inp in inputs:
        clusters = calculate_clusters(inp)
        score = calculate_umi_score(clusters, inp.goal)
        signal = generate_signal(clusters, score)
        
        results.append(PlatformScore(
            platform=inp.platform,
            umi_score=score,
            cluster_scores=clusters,
            signal=signal
        ))
    
    # Sort by score descending
    results.sort(key=lambda x: x.umi_score, reverse=True)
    return results

def generate_sweet_spot(results: List[PlatformScore]) -> SweetSpotSummary:
    if not results:
        return SweetSpotSummary(
            top_platforms=[],
            losing_momentum=[],
            incremental_budget_recommendation="None",
            narrative_smb="No data available.",
            narrative_agency="No data available."
        )

    top = results[0]
    top_platforms = [r.platform for r in results if r.umi_score >= 70]
    losing = [r.platform for r in results if r.umi_score < 50] # Simple threshold for now
    
    smb_narrative = f"Your top performer is {top.platform}. "
    if len(top_platforms) > 1:
        smb_narrative += f"Also consider {', '.join(top_platforms[1:])}. "
    smb_narrative += "Focus your budget there."

    agency_narrative = f"Top performer: {top.platform} (Score: {top.umi_score}). "
    agency_narrative += f"Driven by {top.signal.reason}. "
    if losing:
        agency_narrative += f"Underperformers: {', '.join(losing)}."

    return SweetSpotSummary(
        top_platforms=top_platforms,
        losing_momentum=losing,
        incremental_budget_recommendation=top.platform,
        narrative_smb=smb_narrative,
        narrative_agency=agency_narrative
    )

def generate_recommendations(campaigns: List[CampaignRecommendationInput]) -> List[RecommendationItem]:
    """
    Generate actionable, data-driven recommendations per client based on platform data.
    Uses cluster scores, UMI scores, CPM benchmarks, and budget optimizer.
    """
    recommendations: List[RecommendationItem] = []
    rec_id = 0

    def make_id() -> str:
        nonlocal rec_id
        rec_id += 1
        return f"rec-{rec_id}"

    for camp in campaigns:
        if not camp.platform_inputs:
            continue

        scores = analyze_platforms(camp.platform_inputs)
        total_budget = camp.total_budget_cents / 100.0 if camp.total_budget_cents else 0

        # Budget pacing
        total_spend = sum(
            inp.metrics.spend for inp in camp.platform_inputs
        )
        budget_pct = (total_spend / total_budget * 100) if total_budget > 0 else 0

        if budget_pct < 40 and total_budget > 0:
            recommendations.append(RecommendationItem(
                id=make_id(),
                campaign_id=camp.campaign_id,
                campaign_name=camp.campaign_name,
                category="pacing",
                priority="high",
                action="Increase",
                title="Budget Underutilization",
                description=f"Only {budget_pct:.0f}% of ${total_budget:.0f} budget spent. Daily spend is below target.",
                impact_estimate="Could increase reach by 30-50%",
                data_points={"budget_used_pct": budget_pct, "total_spend": total_spend, "total_budget": total_budget},
            ))
        elif budget_pct > 95 and total_budget > 0:
            recommendations.append(RecommendationItem(
                id=make_id(),
                campaign_id=camp.campaign_id,
                campaign_name=camp.campaign_name,
                category="pacing",
                priority="critical",
                action="Replenish or Pause",
                title="Budget Nearly Depleted",
                description=f"{budget_pct:.0f}% of budget used (${total_spend:.0f} of ${total_budget:.0f}).",
                impact_estimate="Campaign will stop serving soon",
                data_points={"budget_used_pct": budget_pct, "total_spend": total_spend},
            ))

        # Per-platform recommendations using cluster scores
        for i, score in enumerate(scores):
            inp = next((x for x in camp.platform_inputs if x.platform.lower() == score.platform.lower()), None)
            if not inp:
                continue

            c = score.cluster_scores
            cpm = inp.metrics.cpm
            platform_key = score.platform.lower().split()[0]
            bench = CPM_BENCHMARKS.get(score.platform.lower()) or CPM_BENCHMARKS.get(platform_key)

            # Low efficiency (high CPM/CPA)
            if c.efficiency < 35:
                action_text = "Review targeting or creative"
                if bench and cpm > bench["max"]:
                    pct_over = ((cpm - bench["max"]) / bench["max"]) * 100
                    recommendations.append(RecommendationItem(
                        id=make_id(),
                        campaign_id=camp.campaign_id,
                        campaign_name=camp.campaign_name,
                        platform=score.platform,
                        category="efficiency",
                        priority="high",
                        action=action_text,
                        title=f"{score.platform} CPM Above Benchmark",
                        description=f"CPM ${cpm:.2f} is {pct_over:.0f}% above industry range (${bench['min']}-${bench['max']}). Efficiency score: {c.efficiency:.0f}/100.",
                        impact_estimate="Could reduce CPM by 15-25% with tighter targeting",
                        data_points={"cpm": cpm, "benchmark_min": bench["min"], "benchmark_max": bench["max"], "efficiency_score": c.efficiency},
                    ))
                else:
                    recommendations.append(RecommendationItem(
                        id=make_id(),
                        campaign_id=camp.campaign_id,
                        campaign_name=camp.campaign_name,
                        platform=score.platform,
                        category="efficiency",
                        priority="medium",
                        action=action_text,
                        title=f"Low Efficiency on {score.platform}",
                        description=f"Efficiency score {c.efficiency:.0f}/100. {score.signal.reason}",
                        impact_estimate="Improving efficiency could lower cost per result",
                        data_points={"efficiency_score": c.efficiency, "cpm": cpm},
                    ))

            # Low engagement (CTR/VTR)
            elif c.engagement < 30:
                recommendations.append(RecommendationItem(
                    id=make_id(),
                    campaign_id=camp.campaign_id,
                    campaign_name=camp.campaign_name,
                    platform=score.platform,
                    category="creative",
                    priority="high",
                    action="Refresh creatives",
                    title=f"Low Engagement on {score.platform}",
                    description=f"Engagement score {c.engagement:.0f}/100. Ads may be fatigued or underperforming.",
                    impact_estimate="New creatives typically improve CTR by 10-20%",
                    data_points={"engagement_score": c.engagement},
                ))

            # Top performer - scale
            elif score.umi_score >= 80:
                recommendations.append(RecommendationItem(
                    id=make_id(),
                    campaign_id=camp.campaign_id,
                    campaign_name=camp.campaign_name,
                    platform=score.platform,
                    category="platform_mix",
                    priority="high",
                    action="Scale",
                    title=f"{score.platform} is Top Performer",
                    description=f"UMI score {score.umi_score:.0f}/100. {score.signal.reason}",
                    impact_estimate="Shifting 10-15% more budget could increase conversions proportionally",
                    data_points={"umi_score": score.umi_score},
                ))

            # CPM above benchmark (even if efficiency not lowest)
            elif bench and cpm > bench["max"] and c.efficiency >= 35:
                pct_over = ((cpm - bench["max"]) / bench["max"]) * 100
                recommendations.append(RecommendationItem(
                    id=make_id(),
                    campaign_id=camp.campaign_id,
                    campaign_name=camp.campaign_name,
                    platform=score.platform,
                    category="targeting",
                    priority="medium",
                    action="Narrow targeting",
                    title=f"{score.platform} CPM Above Industry Range",
                    description=f"Your CPM ${cpm:.2f} exceeds benchmark ${bench['min']}-${bench['max']} ({pct_over:.0f}% over).",
                    impact_estimate="Switch to lookalike audiences to potentially lower CPM",
                    data_points={"cpm": cpm, "benchmark_max": bench["max"]},
                ))

        # Budget reallocation (cross-platform)
        alloc = camp.platform_allocations or {}
        winners = [s for s in scores if s.umi_score >= 75]
        losers = [s for s in scores if s.umi_score < 50]
        if alloc and winners and losers:
            top = winners[0]
            recommendations.append(RecommendationItem(
                        id=make_id(),
                        campaign_id=camp.campaign_id,
                        campaign_name=camp.campaign_name,
                        platform=top.platform,
                        category="platform_mix",
                        priority="high",
                        action="Shift budget",
                        title="Reallocate Budget to Top Performer",
                        description=f"Move ~15% budget from underperformers to {top.platform} (UMI {top.umi_score:.0f}).",
                        impact_estimate="Could improve overall campaign efficiency by 10-20%",
                        data_points={"top_platform": top.platform, "top_score": top.umi_score},
                    ))

    # Sort by priority
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    recommendations.sort(key=lambda r: priority_order.get(r.priority, 4))
    return recommendations[:10]  # Cap at 10


def run_budget_optimizer(
    current_allocations: Dict[str, float], 
    scores: List[PlatformScore], 
    shift_percent: float = 0.15
) -> Dict[str, float]:
    """
    Recommends budget shifts based on UMI Scores.
    Moves budget from underperformers (Score < 50) to winners (Score > 75).
    """
    new_allocations = current_allocations.copy()
    winners = [s for s in scores if s.umi_score >= 75]
    losers = [s for s in scores if s.umi_score < 50]
    
    if not winners or not losers:
        return new_allocations
        
    total_shift_amount = 0.0
    
    # Harvest from losers
    for loser in losers:
        if loser.platform in new_allocations:
            amount = new_allocations[loser.platform] * shift_percent
            new_allocations[loser.platform] -= amount
            total_shift_amount += amount
            
    # Distribute to winners (proportional to score)
    total_winner_score = sum(w.umi_score for w in winners)
    for winner in winners:
        if winner.platform in new_allocations:
            share = winner.umi_score / total_winner_score
            new_allocations[winner.platform] += total_shift_amount * share
            
    return new_allocations
