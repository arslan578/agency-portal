export interface ClusterScores {
    visibility: number;
    engagement: number;
    conversion_power: number;
    efficiency: number;
    quality_stability: number;
}

export interface OptimizationSignal {
    direction: 'increase' | 'hold' | 'decrease';
    priority: 'high' | 'medium' | 'low';
    reason: string;
}

export interface PlatformScore {
    platform: string;
    umi_score: number;
    cluster_scores: ClusterScores;
    signal: OptimizationSignal;
}

export interface IntelligenceInput {
    platform: string;
    category: 'social' | 'display_search' | 'streaming_tv' | 'audio_video';
    goal: 'awareness' | 'traffic' | 'conversions' | 'mixed';
    metrics: {
        impressions: number;
        clicks: number;
        conversions: number;
        spend: number;
        cpm: number;
        cpa: number;
        reach: number;
        views: number;
        frequency: number;
        cpc: number;
        completions: number;
    };
    time_series?: TimeSeriesPoint[];
    context?: Record<string, any>;
}

export interface TimeSeriesPoint {
    date: string;
    metrics: IntelligenceInput['metrics'];
}

export interface SweetSpotSummary {
    top_platforms: string[];
    losing_momentum: string[];
    incremental_budget_recommendation: string;
    narrative_smb: string;
    narrative_agency: string;
}

/**
 * Get human-readable label for UMI score
 */
export function getUMILabel(score: number): string {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
}

/**
 * Get color class for UMI score
 */
export function getUMIColor(score: number): string {
    if (score >= 70) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
}

/**
 * Get background color class for UMI score
 */
export function getUMIBgColor(score: number): string {
    if (score >= 70) return 'bg-green-500/25 border-green-400';
    if (score >= 50) return 'bg-yellow-500/25 border-yellow-400';
    return 'bg-red-500/25 border-red-400';
}

/**
 * Get text color class for UMI score (for badge text)
 */
export function getUMITextColor(score: number): string {
    if (score >= 70) return 'text-green-300';
    if (score >= 50) return 'text-yellow-300';
    return 'text-red-300';
}
