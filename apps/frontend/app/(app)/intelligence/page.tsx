'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Loader2, TrendingUp, AlertCircle, CheckCircle2, BarChart2, Brain } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { useAuth } from '@/context/AuthContext';
import { ErrorDisplay } from '@/components/ui/ErrorDisplay';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import { SweetSpotSummary as SweetSpotSummaryComponent } from '@/components/intelligence/SweetSpotSummary';
import { ClusterBreakdown } from '@/components/intelligence/ClusterBreakdown';
import { IntelligenceInput, PlatformScore, SweetSpotSummary } from '@/types/intelligence';
import { getDemoCampaigns, getDemoCampaignReports, getDemoPlatformScores, getDemoSweetSpotSummary, isDemoMode } from '@/lib/demoData';

// Alias for backward compatibility
type SweetSpotSummaryData = SweetSpotSummary;

export default function IntelligencePage() {
    const { user } = useAuth();
    const { data: campaigns, error: campaignsError, isLoading: campaignsLoading } = useSWR('/campaigns', () => {
        if (isDemoMode()) {
            return Promise.resolve(getDemoCampaigns());
        }
        return apiClient.get<any[]>(API_ENDPOINTS.CAMPAIGN.LIST);
    });

    const [analyzing, setAnalyzing] = useState(false);
    const [scores, setScores] = useState<PlatformScore[] | null>(null);
    const [sweetSpot, setSweetSpot] = useState<SweetSpotSummaryData | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const isAgency = !!user?.agency_id;

    const runAnalysis = async () => {
        if (!campaigns || campaigns.length === 0) return;

        setAnalyzing(true);
        setError(null);
        setSweetSpot(null); // Clear previous sweet spot when starting new analysis

        try {
            const inputs: IntelligenceInput[] = [];
            let reportingDataResults: PromiseSettledResult<any[]>[] = [];

            if (isDemoMode()) {
                reportingDataResults = campaigns.map(c => ({
                    status: 'fulfilled',
                    value: getDemoCampaignReports(c.id),
                } as PromiseFulfilledResult<any[]>));
            } else {
                // Fetch reporting data for all campaigns in parallel
                const reportingDataPromises = campaigns.map(campaign => 
                    apiClient.get<any[]>(API_ENDPOINTS.REPORTING.CAMPAIGN(campaign.id.toString()))
                        .catch(err => {
                            console.warn(`Failed to fetch reporting data for campaign ${campaign.id}:`, err);
                            return []; // Return empty array on error
                        })
                );
                reportingDataResults = await Promise.allSettled(reportingDataPromises);
            }
            
            // Process each campaign and create IntelligenceInput entries
            for (let i = 0; i < campaigns.length; i++) {
                const campaign = campaigns[i];
                
                // Extract platforms from platform_allocations
                const platformAllocations = campaign.platform_allocations || {};
                const platforms = Object.keys(platformAllocations);
                
                // Skip campaigns with no platform allocations
                if (platforms.length === 0) continue;
                
                // Get reporting data for this campaign
                const reportData = reportingDataResults[i].status === 'fulfilled' 
                    ? (reportingDataResults[i] as PromiseFulfilledResult<any[]>).value 
                    : [];
                
                // Aggregate metrics per platform from reporting data
                const platformMetrics: Record<string, {
                    impressions: number;
                    spend: number;
                    conversions: number;
                    clicks: number;
                }> = {};
                
                // Initialize metrics for all platforms in allocations
                platforms.forEach(platform => {
                    const platformKey = platform.toLowerCase();
                    platformMetrics[platformKey] = {
                        impressions: 0,
                        spend: 0,
                        conversions: 0,
                        clicks: 0
                    };
                });
                
                // Aggregate metrics from report data
                reportData.forEach((record: any) => {
                    const platformKey = (record.platform || '').toLowerCase();
                    if (platformMetrics[platformKey]) {
                        platformMetrics[platformKey].impressions += record.impressions || 0;
                        platformMetrics[platformKey].spend += record.spend || 0;
                        platformMetrics[platformKey].conversions += record.conversions || 0;
                        platformMetrics[platformKey].clicks += record.clicks || 0;
                    }
                });
                
                // Create IntelligenceInput for each platform
                platforms.forEach(platform => {
                    const platformKey = platform.toLowerCase();
                    const metrics = platformMetrics[platformKey] || {
                        impressions: 0,
                        spend: 0,
                        conversions: 0,
                        clicks: 0
                    };
                    
                    // Calculate derived metrics from database data
                    // CPM = (spend / impressions) * 1000 (standard calculation)
                    const cpm = metrics.impressions > 0 
                        ? (metrics.spend / metrics.impressions) * 1000 
                        : 0;
                    
                    // CPA = spend / conversions (conversions is 0 in UsageRecord, so CPA will be 0)
                    const cpa = metrics.conversions > 0 
                        ? metrics.spend / metrics.conversions 
                        : 0;
                    
                    // Reach: not stored in UsageRecord, estimate from impressions or use 0
                    // Using 0 as default (backend scoring handles this)
                    const reach = 0;
                    
                    // Determine category based on platform
                    let category: 'social' | 'display_search' | 'streaming_tv' | 'audio_video' = 'display_search';
                    if (platformKey === 'facebook' || platformKey === 'instagram' || platformKey === 'meta') {
                        category = 'social';
                    }
                    
                    // Map goal
                    let goal: 'awareness' | 'traffic' | 'conversions' | 'mixed' = 'conversions';
                    if (campaign.goal) {
                        const goalLower = campaign.goal.toLowerCase();
                        if (goalLower === 'awareness') goal = 'awareness';
                        else if (goalLower === 'traffic') goal = 'traffic';
                        else if (goalLower === 'conversions' || goalLower === 'conversion') goal = 'conversions';
                        else goal = 'mixed';
                    }
                    
                    inputs.push({
                        platform: platformKey,
                        category: category,
                        goal: goal,
                        metrics: {
                            impressions: metrics.impressions,
                            clicks: metrics.clicks,
                            conversions: metrics.conversions,
                            spend: metrics.spend,
                            cpm: cpm,          // Calculated from database data
                            cpa: cpa,          // Calculated from database data (0 if no conversions)
                            reach: reach,      // Default to 0 (not stored in UsageRecord)
                            views: 0,          // Not available in UsageRecord
                            frequency: 0.0,    // Not available in UsageRecord
                            cpc: 0.0,          // Can calculate: spend/clicks if needed, but backend doesn't use it
                            completions: 0     // Not available in UsageRecord
                        }
                    });
                });
            }

            if (inputs.length === 0) {
                setError("No active campaigns with platform allocations found to analyze.");
                setAnalyzing(false);
                return;
            }

            if (isDemoMode()) {
                // Use demo intelligence data
                setScores(getDemoPlatformScores());
                setSweetSpot(getDemoSweetSpotSummary());
            } else {
                // Call both endpoints - analyze for individual scores and sweet-spot for summary
                const [results, sweetSpotResult] = await Promise.allSettled([
                    apiClient.post<PlatformScore[]>(API_ENDPOINTS.INTELLIGENCE.ANALYZE, inputs),
                    apiClient.post<SweetSpotSummaryData>(API_ENDPOINTS.INTELLIGENCE.SWEET_SPOT, inputs)
                ]);

                // Handle analyze results
                if (results.status === 'fulfilled') {
                    setScores(results.value);
                } else {
                    throw new Error(results.reason?.message || "Failed to analyze platforms");
                }

                // Handle sweet-spot results (non-blocking - don't fail if this fails)
                if (sweetSpotResult.status === 'fulfilled') {
                    setSweetSpot(sweetSpotResult.value);
                } else {
                    console.warn("Sweet Spot analysis failed:", sweetSpotResult.reason);
                    // Don't set error state - graceful degradation
                }
            }
        } catch (err: any) {
            console.error("Analysis failed", err);
            setError(err.message || "Failed to generate insights.");
            setSweetSpot(null); // Clear sweet spot on error
        } finally {
            setAnalyzing(false);
        }
    };

    if (campaignsLoading) {
        return (
            <div className="p-8 max-w-7xl mx-auto space-y-6">
                <CardSkeleton lines={4} />
                <CardSkeleton lines={3} />
            </div>
        );
    }

    if (campaignsError) {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <ErrorDisplay
                    error={campaignsError}
                    title="Failed to load campaigns"
                    onRetry={() => window.location.reload()}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kaivo Intelligence</h1>
                    <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
                        AI-powered optimization for your active campaigns.
                    </p>
                </div>
                <Button
                    onClick={runAnalysis}
                    disabled={analyzing || !campaigns?.length}
                    size="lg"
                    className="gap-2 w-full sm:w-auto"
                >
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                    {analyzing ? 'Analyzing...' : 'Run Analysis'}
                </Button>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Analysis Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!scores && !analyzing && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                            <BarChart2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{campaigns?.length || 0}</div>
                            <p className="text-xs text-muted-foreground">
                                Ready for analysis
                            </p>
                        </CardContent>
                    </Card>
                    {/* Placeholder cards for other potential metrics could go here, relying on real data when available */}
                </div>
            )}

            {/* Loading State - Show skeleton for Sweet Spot */}
            {analyzing && scores === null && (
                <Card className="border-kaivo-teal-neon/20 shadow-lg animate-pulse">
                    <CardHeader className="bg-gradient-to-r from-kaivo-teal-neon/10 to-transparent border-b border-kaivo-teal-neon/10 pb-3 sm:pb-4">
                        <div className="h-5 sm:h-6 bg-muted rounded w-40 sm:w-48"></div>
                    </CardHeader>
                    <CardContent className="space-y-4 sm:space-y-6 pt-4 sm:pt-6">
                        <div className="space-y-2 sm:space-y-3">
                            <div className="h-3 sm:h-4 bg-muted rounded w-24 sm:w-32"></div>
                            <div className="flex flex-wrap gap-2">
                                <div className="h-7 sm:h-8 bg-muted rounded w-16 sm:w-20"></div>
                                <div className="h-7 sm:h-8 bg-muted rounded w-20 sm:w-24"></div>
                            </div>
                        </div>
                        <div className="h-20 sm:h-24 bg-muted rounded"></div>
                    </CardContent>
                </Card>
            )}

            {scores && (
                <div className="grid gap-6">
                    {/* Sweet Spot Summary - Display above platform cards */}
                    {sweetSpot && (
                        <div className="mb-4">
                            <SweetSpotSummaryComponent summary={sweetSpot} isAgency={isAgency} />
                        </div>
                    )}

                    {/* Visual Separator - Only show if both sweet spot and scores exist */}
                    {sweetSpot && scores.length > 0 && (
                        <div className="h-px bg-border/50 my-2" />
                    )}

                    {/* UMI Explainer */}
                    <Card className="border-kaivo-teal-neon/20 bg-gradient-to-br from-kaivo-teal-neon/5 to-transparent">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Brain className="h-5 w-5 text-kaivo-teal-neon" />
                                UMI Score - Unified Marketing Intelligence
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                UMI unifies performance across all platforms using five behavioral clusters.
                                Scores are goal-adaptive and factor in your campaign objectives.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Individual Platform Scores */}
                    <div>
                        <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            Platform Performance Details
                        </h2>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {scores.map((score, idx) => (
                                <Card key={idx} className="overflow-hidden border-l-4 border-l-primary/50 hover:shadow-md transition-all">
                                    <CardHeader>
                                        <CardTitle className="flex justify-between items-center">
                                            <span>{score.platform}</span>
                                            <Badge 
                                                variant={
                                                    score.signal.direction === 'increase' ? 'success' :
                                                    score.signal.direction === 'decrease' ? 'error' : 
                                                    'neutral'
                                                }
                                                className="text-xs"
                                            >
                                                {score.signal.direction.toUpperCase()}
                                            </Badge>
                                        </CardTitle>
                                        <CardDescription>UMI Score: {score.umi_score.toFixed(1)}/100</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="text-sm font-medium text-muted-foreground">Signal</div>
                                            <p className="text-sm">{score.signal.reason}</p>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="text-sm font-medium text-muted-foreground">Cluster Breakdown</div>
                                            <ClusterBreakdown clusters={score.cluster_scores} variant="compact" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
