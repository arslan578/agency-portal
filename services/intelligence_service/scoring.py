from typing import List
from .schemas import IntelligenceInput, ClusterScores, GoalEnum, PlatformCategoryEnum

def normalize(value, min_val, max_val):
    """Normalize a value to 0-100 scale."""
    if max_val == min_val:
        return 50.0
    return max(0.0, min(100.0, ((value - min_val) / (max_val - min_val)) * 100))

def calculate_visibility(input_data: IntelligenceInput) -> float:
    # Heuristic: High reach and impressions = High Visibility
    # We need some baselines. For now, we'll use relative scoring or fixed thresholds.
    # In a real system, these baselines would be dynamic based on category averages.
    
    # Mock baselines for 0-100 scaling
    MAX_REACH = 1000000
    MAX_IMPRESSIONS = 2000000
    
    reach_score = normalize(input_data.metrics.reach, 0, MAX_REACH)
    imp_score = normalize(input_data.metrics.impressions, 0, MAX_IMPRESSIONS)
    
    return (reach_score * 0.6) + (imp_score * 0.4)

def calculate_engagement(input_data: IntelligenceInput) -> float:
    # CTR for Display/Social, VTR for Video
    ctr = 0
    if input_data.metrics.impressions > 0:
        ctr = (input_data.metrics.clicks / input_data.metrics.impressions) * 100
        
    vtr = 0
    if input_data.metrics.impressions > 0:
        vtr = (input_data.metrics.views / input_data.metrics.impressions) * 100
        
    # Simple heuristic
    if input_data.category in [PlatformCategoryEnum.STREAMING_TV, PlatformCategoryEnum.AUDIO_VIDEO]:
        return normalize(vtr, 0, 50) # 50% VTR is max score
    else:
        return normalize(ctr, 0, 5) # 5% CTR is max score

def calculate_conversion_power(input_data: IntelligenceInput) -> float:
    cvr = 0
    if input_data.metrics.clicks > 0:
        cvr = (input_data.metrics.conversions / input_data.metrics.clicks) * 100
    elif input_data.metrics.views > 0: # View-through
        cvr = (input_data.metrics.conversions / input_data.metrics.views) * 100
        
    return normalize(cvr, 0, 10) # 10% CVR is max score

def calculate_efficiency(input_data: IntelligenceInput) -> float:
    # Lower is better. Invert the score.
    # CPM Baseline: $5 - $50
    # Apply Kaivo Markup before scoring
    from .pricing import calculate_effective_cpm
    effective_cpm = calculate_effective_cpm(input_data.metrics.cpm)
    
    cpm_score = 100 - normalize(effective_cpm, 5, 50)
    
    # CPA Baseline: $10 - $100
    cpa_score = 100 - normalize(input_data.metrics.cpa, 10, 100)
    
    if input_data.goal == GoalEnum.CONVERSIONS:
        return cpa_score
    else:
        return cpm_score

def calculate_quality_stability(input_data: IntelligenceInput) -> float:
    # Check volatility in time series
    if not input_data.time_series or len(input_data.time_series) < 2:
        return 50.0 # Neutral if no history
        
    # Calculate variance of impressions
    impressions = [p.metrics.impressions for p in input_data.time_series]
    avg = sum(impressions) / len(impressions)
    if avg == 0: return 50.0
    
    variance = sum((x - avg) ** 2 for x in impressions) / len(impressions)
    std_dev = variance ** 0.5
    cv = std_dev / avg # Coefficient of variation
    
    # Lower CV is better (more stable)
    # CV > 1.0 is very unstable (score 0), CV < 0.1 is very stable (score 100)
    return 100 - normalize(cv, 0.1, 1.0)

def calculate_clusters(input_data: IntelligenceInput) -> ClusterScores:
    return ClusterScores(
        visibility=calculate_visibility(input_data),
        engagement=calculate_engagement(input_data),
        conversion_power=calculate_conversion_power(input_data),
        efficiency=calculate_efficiency(input_data),
        quality_stability=calculate_quality_stability(input_data)
    )
