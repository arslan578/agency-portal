'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ClusterBreakdown } from '@/components/intelligence/ClusterBreakdown';
import { getUMILabel, getUMIColor, getUMIBgColor } from '@/types/intelligence';
import { PlatformScore, IntelligenceInput } from '@/types/intelligence';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { ReportRecord } from '@/types/campaign';
import { Brain, TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDemoCampaignReports, isDemoMode } from '@/lib/demoData';

interface UMIScoreCardProps {
    campaignId: number;
    platformAllocations: Record<string, number>;
    goal: string;
}

// Map platform names to categories
function getPlatformCategory(platform: string): IntelligenceInput['category'] {
    const lower = platform.toLowerCase();
    if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) {
        return 'social';
    }
    if (lower.includes('google') || lower.includes('display')) {
        return 'display_search';
    }
    if (lower.includes('roku') || lower.includes('youtube') || lower.includes('streaming')) {
        return 'streaming_tv';
    }
    if (lower.includes('audio') || lower.includes('podcast') || lower.includes('spotify')) {
        return 'audio_video';
    }
    return 'social'; // Default
}

// Map goal string to IntelligenceInput goal
function normalizeGoal(goal: string): IntelligenceInput['goal'] {
    const lower = goal?.toLowerCase() || '';
    if (lower.includes('awareness') || lower.includes('reach')) return 'awareness';
    if (lower.includes('traffic') || lower.includes('click')) return 'traffic';
    if (lower.includes('conversion') || lower.includes('sale') || lower.includes('lead')) return 'conversions';
    return 'mixed';
}

export function UMIScoreCard({ campaignId, platformAllocations, goal }: UMIScoreCardProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scores, setScores] = useState<PlatformScore[] | null>(null);
    const [aggregatedScore, setAggregatedScore] = useState<number | null>(null);
    const [aggregatedClusters, setAggregatedClusters] = useState<PlatformScore['cluster_scores'] | null>(null);
    const [recommendation, setRecommendation] = useState<PlatformScore['signal'] | null>(null);

    useEffect(() => {
        async function fetchUMIData() {
            setLoading(true);
            setError(null);

            try {
                // Fetch reporting data for the campaign
                const reportData = isDemoMode()
                    ? getDemoCampaignReports(campaignId)
                    : await apiClient.get<ReportRecord[]>(
                        API_ENDPOINTS.REPORTING.CAMPAIGN(campaignId.toString())
                    );

                if (!reportData || reportData.length === 0) {
                    setError('No reporting data available yet');
                    setLoading(false);
                    return;
                }

                // Aggregate metrics by platform
                const platformMetrics: Record<string, {
                    impressions: number;
                    clicks: number;
                    conversions: number;
                    spend: number;
                    reach: number;
                    views: number;
                }> = {};

                reportData.forEach((record) => {
                    const platform = record.platform || 'unknown';
                    if (!platformMetrics[platform]) {
                        platformMetrics[platform] = {
                            impressions: 0,
                            clicks: 0,
                            conversions: 0,
                            spend: 0,
                            reach: 0,
                            views: 0,
                        };
                    }
                    platformMetrics[platform].impressions += record.impressions || 0;
                    platformMetrics[platform].clicks += record.clicks || 0;
                    platformMetrics[platform].conversions += record.conversions || 0;
                    platformMetrics[platform].spend += record.spend || 0;
                    // Estimate reach and views if not available
                    platformMetrics[platform].reach += record.impressions || 0; // Rough estimate
                    platformMetrics[platform].views += record.impressions || 0; // Rough estimate
                });

                // Create IntelligenceInput for each platform
                const inputs: IntelligenceInput[] = Object.entries(platformMetrics).map(([platform, metrics]) => {
                    const impressions = metrics.impressions || 0;
                    const clicks = metrics.clicks || 0;
                    const spend = metrics.spend || 0;

                    // Calculate derived metrics
                    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
                    const cpc = clicks > 0 ? spend / clicks : 0;
                    const cpa = metrics.conversions > 0 ? spend / metrics.conversions : 0;
                    const frequency = metrics.reach > 0 ? impressions / metrics.reach : 0;

                    return {
                        platform,
                        category: getPlatformCategory(platform),
                        goal: normalizeGoal(goal),
                        metrics: {
                            impressions,
                            clicks,
                            conversions: metrics.conversions,
                            spend,
                            cpm,
                            cpa,
                            reach: metrics.reach,
                            views: metrics.views,
                            frequency,
                            cpc,
                            completions: 0,
                        },
                    };
                });

                if (inputs.length === 0) {
                    setError('No platform data available');
                    setLoading(false);
                    return;
                }

                // Call intelligence API
                const platformScores = await apiClient.post<PlatformScore[]>(
                    API_ENDPOINTS.INTELLIGENCE.ANALYZE,
                    inputs
                );

                setScores(platformScores);

                // Aggregate scores (weighted average by platform allocation if available)
                if (platformScores.length > 0) {
                    let totalScore = 0;
                    let totalWeight = 0;
                    const clusterTotals: PlatformScore['cluster_scores'] = {
                        visibility: 0,
                        engagement: 0,
                        conversion_power: 0,
                        efficiency: 0,
                        quality_stability: 0,
                    };

                    platformScores.forEach((score) => {
                        const weight = platformAllocations[score.platform] || 1;
                        totalScore += score.umi_score * weight;
                        totalWeight += weight;

                        clusterTotals.visibility += score.cluster_scores.visibility * weight;
                        clusterTotals.engagement += score.cluster_scores.engagement * weight;
                        clusterTotals.conversion_power += score.cluster_scores.conversion_power * weight;
                        clusterTotals.efficiency += score.cluster_scores.efficiency * weight;
                        clusterTotals.quality_stability += score.cluster_scores.quality_stability * weight;
                    });

                    setAggregatedScore(totalWeight > 0 ? totalScore / totalWeight : platformScores[0].umi_score);
                    setAggregatedClusters({
                        visibility: totalWeight > 0 ? clusterTotals.visibility / totalWeight : clusterTotals.visibility,
                        engagement: totalWeight > 0 ? clusterTotals.engagement / totalWeight : clusterTotals.engagement,
                        conversion_power: totalWeight > 0 ? clusterTotals.conversion_power / totalWeight : clusterTotals.conversion_power,
                        efficiency: totalWeight > 0 ? clusterTotals.efficiency / totalWeight : clusterTotals.efficiency,
                        quality_stability: totalWeight > 0 ? clusterTotals.quality_stability / totalWeight : clusterTotals.quality_stability,
                    });

                    // Use the top platform's recommendation
                    setRecommendation(platformScores[0].signal);
                }
            } catch (err: any) {
                console.error('Failed to fetch UMI data:', err);
                setError(err.message || 'Failed to load intelligence data');
            } finally {
                setLoading(false);
            }
        }

        fetchUMIData();
    }, [campaignId, platformAllocations, goal]);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        UMI Score
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        UMI Score
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        <span>{error}</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!aggregatedScore || !aggregatedClusters || !recommendation) {
        return null;
    }

    const scoreLabel = getUMILabel(aggregatedScore);
    const scoreColor = getUMIColor(aggregatedScore);
    const scoreBg = getUMIBgColor(aggregatedScore);

    const getRecommendationIcon = () => {
        switch (recommendation.direction) {
            case 'increase':
                return <TrendingUp className="h-4 w-4" />;
            case 'decrease':
                return <TrendingDown className="h-4 w-4" />;
            default:
                return <Minus className="h-4 w-4" />;
        }
    };

    return (
        <Card className={cn('border-primary/20', scoreBg)}>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        <span>UMI Score</span>
                    </div>
                    <Badge variant="info" className="text-xs">
                        {scoreLabel}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Large UMI Score Display */}
                <div className="text-center">
                    <div className={cn('text-5xl font-bold mb-2', scoreColor)}>
                        {Math.round(aggregatedScore)}
                    </div>
                    <div className="text-sm text-muted-foreground">out of 100</div>
                </div>

                {/* Cluster Breakdown */}
                <div>
                    <h4 className="text-sm font-semibold mb-3">Cluster Breakdown</h4>
                    <ClusterBreakdown clusters={aggregatedClusters} variant="full" />
                </div>

                {/* Recommendation */}
                {recommendation && (
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/20">
                                <Lightbulb className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">Recommendation</span>
                                    <Badge
                                        variant={
                                            recommendation.direction === 'increase' ? 'success' :
                                            recommendation.direction === 'decrease' ? 'error' : 'neutral'
                                        }
                                        className="text-xs"
                                    >
                                        {recommendation.direction.toUpperCase()}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
