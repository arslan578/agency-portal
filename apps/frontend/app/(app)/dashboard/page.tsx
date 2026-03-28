'use client'

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { CalendarDateRangePicker } from '@/components/ui/DateRangePicker';
import { Overview } from '@/components/dashboard/Overview';
import { RecentSales } from '@/components/dashboard/RecentSales';
import { InsightsSection } from '@/components/dashboard/InsightsSection';
import type { PlatformMetric } from '@/components/dashboard/PlatformMetricsCard';
import type { CampaignInsight } from '@/components/dashboard/CampaignInsightsCard';
import type { RecommendationItem } from '@/components/dashboard/RecommendationsCard';
import { CPM_BENCHMARKS } from '@/components/dashboard/BestPracticesCard';
import { InterchangeableCards, DashboardCard } from '@/components/dashboard/InterchangeableCards';
import { UMIScoreCard } from '@/components/dashboard/UMIScoreCard';
import { useTranslation } from '@/context/LanguageContext';
import { useAgency } from '@/context/AgencyContext';
import { askKaivo } from '@/lib/agent'
import { FiSend, FiTrendingUp, FiTarget, FiActivity } from 'react-icons/fi'
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorDisplay } from '@/components/ui/ErrorDisplay';
import { EmptyState } from '@/components/ui/EmptyState';
import { Megaphone } from 'lucide-react';
import { Tour } from '@/components/onboarding/Tour';
import { getDemoCampaigns, getDemoCampaignReports, isDemoMode } from '@/lib/demoData';

export default function DashboardPage() {
    const router = useRouter();
    const { currentClient } = useAgency();
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [agentResponse, setAgentResponse] = useState<string | null>(null)

    const { data: campaigns, isLoading: campaignsLoading, error: campaignsError } = useSWR('/campaigns', async () => {
        if (isDemoMode()) {
            return getDemoCampaigns();
        }
        return apiClient.get<any[]>(API_ENDPOINTS.CAMPAIGN.LIST);
    });

    const activeCampaigns = campaigns?.filter(c => c.status === 'ACTIVE') || [];
    
    const { data: reportingByCampaign } = useSWR(
        activeCampaigns.length > 0 ? ['/dashboard/reporting-by-campaign', activeCampaigns] : null,
        async () => {
            if (activeCampaigns.length === 0) return [];
            const results = await Promise.allSettled(
                activeCampaigns.map(async (c) => ({
                    campaignId: c.id,
                    campaignName: c.name || `Campaign #${c.id}`,
                    totalBudgetCents: c.total_budget_cents || 0,
                    reports: await apiClient.get<any[]>(API_ENDPOINTS.REPORTING.CAMPAIGN(c.id.toString())).catch(() => [])
                }))
            );
            return results
                .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
                .map(r => r.value);
        }
    );

    const reportingData = useMemo(
        () => reportingByCampaign?.flatMap(r => r.reports) ?? [],
        [reportingByCampaign]
    );

    const platformMetrics = useMemo((): PlatformMetric[] => {
        if (!reportingData?.length) return [];
        const byPlatform: Record<string, { spend: number; impressions: number; clicks: number; conversions: number }> = {};
        reportingData.forEach((r: any) => {
            const key = (r.platform || 'unknown').toLowerCase();
            if (!byPlatform[key]) byPlatform[key] = { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
            byPlatform[key].spend += r.spend || r.spend_agency || 0;
            byPlatform[key].impressions += r.impressions || 0;
            byPlatform[key].clicks += r.clicks || 0;
            byPlatform[key].conversions += r.conversions || 0;
        });
        return Object.entries(byPlatform).map(([platform, m]) => ({
            platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            spend: m.spend,
            impressions: m.impressions,
            clicks: m.clicks,
            conversions: m.conversions,
            cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0,
            cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
            cpa: m.conversions > 0 ? m.spend / m.conversions : 0,
            trend: 'stable' as const
        }));
    }, [reportingData]);

    const { data: campaignInsights } = useSWR<CampaignInsight[]>(
        reportingByCampaign && reportingByCampaign.length > 0 ? ['/dashboard/campaign-insights', reportingByCampaign, activeCampaigns] : null,
        async ([, data, campaigns]) => {
            const insights: CampaignInsight[] = [];
            const byCampaign = data as typeof reportingByCampaign | undefined;
            const campaignsList = (campaigns as typeof activeCampaigns) ?? [];
            if (!byCampaign?.length) return insights;
            for (const item of byCampaign) {
                const { campaignId, campaignName, totalBudgetCents, reports } = item;
                if (reports.length === 0) continue;

                const campaignSpend = reports.reduce((s: number, r: any) => s + (r.spend || r.spend_agency || 0), 0);
                const budgetPct = totalBudgetCents > 0 ? (campaignSpend / (totalBudgetCents / 100)) * 100 : 0;

                if (budgetPct < 50) {
                    insights.push({
                        campaignId,
                        campaignName,
                        type: 'opportunity',
                        title: 'Budget Underutilization',
                        description: `Only ${budgetPct.toFixed(0)}% of budget spent. Consider increasing daily budget to maximize reach.`,
                        metric: 'Budget Used',
                        value: `${budgetPct.toFixed(0)}%`,
                        recommendation: 'Increase daily budget by 20%'
                    });
                } else if (budgetPct > 95) {
                    insights.push({
                        campaignId,
                        campaignName,
                        type: 'info',
                        title: 'Budget Nearly Depleted',
                        description: `${budgetPct.toFixed(0)}% of budget used. Consider replenishing or pausing.`,
                        metric: 'Budget Used',
                        value: `${budgetPct.toFixed(0)}%`,
                        recommendation: 'Replenish budget or pause campaign'
                    });
                }

                const platformAllocations = campaignsList.find(c => c.id === campaignId)?.platform_allocations || {};
                const platforms = Object.keys(platformAllocations);
                if (platforms.length === 0) continue;

                const platformMetricsAgg: Record<string, { impressions: number; spend: number; clicks: number; conversions: number; reach: number }> = {};
                platforms.forEach(p => {
                    platformMetricsAgg[p.toLowerCase()] = { impressions: 0, spend: 0, clicks: 0, conversions: 0, reach: 0 };
                });
                reports.forEach((r: any) => {
                    const key = (r.platform || '').toLowerCase();
                    if (platformMetricsAgg[key]) {
                        platformMetricsAgg[key].impressions += r.impressions || 0;
                        platformMetricsAgg[key].spend += r.spend || r.spend_agency || 0;
                        platformMetricsAgg[key].clicks += r.clicks || 0;
                        platformMetricsAgg[key].conversions += r.conversions || 0;
                    }
                });

                const inputs = Object.entries(platformMetricsAgg)
                    .filter(([, m]) => m.impressions > 0 || m.spend > 0)
                    .map(([platform, m]) => ({
                        platform,
                        category: (platform.includes('meta') || platform.includes('facebook') || platform.includes('instagram') || platform.includes('tiktok'))
                            ? 'social' as const
                            : (platform.includes('google') || platform.includes('microsoft'))
                            ? 'display_search' as const
                            : 'social' as const,
                        goal: (campaignsList.find(c => c.id === campaignId)?.goal || 'conversion').toLowerCase().includes('awareness') ? 'awareness' as const
                            : (campaignsList.find(c => c.id === campaignId)?.goal || 'conversion').toLowerCase().includes('traffic') ? 'traffic' as const
                            : 'conversions' as const,
                        metrics: {
                            impressions: m.impressions,
                            clicks: m.clicks,
                            conversions: m.conversions,
                            spend: m.spend,
                            cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0,
                            cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
                            cpa: m.conversions > 0 ? m.spend / m.conversions : 0,
                            reach: m.reach,
                            views: 0,
                            frequency: m.reach > 0 ? m.impressions / m.reach : 0,
                            completions: 0
                        }
                    }));

                if (inputs.length === 0) continue;

                try {
                    const platformScores = await apiClient.post<any[]>(API_ENDPOINTS.INTELLIGENCE.ANALYZE, inputs);
                    let insightCount = 0;
                    for (const score of platformScores) {
                        if (insightCount >= 3) break;
                        const platformKey = (score.platform || '').toLowerCase();
                        const bench = CPM_BENCHMARKS[platformKey] || CPM_BENCHMARKS[platformKey.split(' ')[0]];
                        const cpm = inputs.find(i => i.platform === platformKey)?.metrics?.cpm ?? 0;

                        if (score.umi_score !== undefined) {
                            if (score.umi_score < 50) {
                                insights.push({
                                    campaignId,
                                    campaignName,
                                    type: 'warning',
                                    title: 'Underperforming Platform',
                                    description: score.signal?.reason || 'Low performance detected.',
                                    metric: 'UMI Score',
                                    value: score.umi_score.toFixed(1),
                                    recommendation: 'Consider reallocating budget or refreshing creatives'
                                });
                                insightCount++;
                            } else if (score.umi_score >= 80) {
                                insights.push({
                                    campaignId,
                                    campaignName,
                                    type: 'success',
                                    title: 'Top Performer',
                                    description: score.signal?.reason || 'High overall performance.',
                                    metric: 'UMI Score',
                                    value: score.umi_score.toFixed(1),
                                    recommendation: 'Consider scaling this campaign'
                                });
                                insightCount++;
                            }
                        }
                        if (bench && cpm > bench.max && insightCount < 3) {
                            insights.push({
                                campaignId,
                                campaignName,
                                type: 'warning',
                                title: 'CPM Above Benchmark',
                                description: `${platformKey} CPM $${cpm.toFixed(2)} exceeds industry range ($${bench.min}-$${bench.max}).`,
                                metric: 'CPM',
                                value: `$${cpm.toFixed(2)}`,
                                recommendation: 'Review targeting or creative to improve efficiency'
                            });
                            insightCount++;
                        }
                    }
                } catch {
                    // Skip campaign on API failure
                }
            }
            return insights;
        }
    );

    const { data: recommendations } = useSWR<RecommendationItem[]>(
        reportingByCampaign && reportingByCampaign.length > 0 && activeCampaigns.length > 0
            ? ['/dashboard/recommendations', reportingByCampaign, activeCampaigns]
            : null,
        async ([, data, campaigns]) => {
            const byCampaign = data as typeof reportingByCampaign | undefined;
            const campaignsList = (campaigns as typeof activeCampaigns) ?? [];
            if (!byCampaign?.length) return [];

            const payload = byCampaign.map((item) => {
                const { campaignId, campaignName, totalBudgetCents, reports } = item;
                const campaign = campaignsList.find((c) => c.id === campaignId);
                const platformAllocations = campaign?.platform_allocations || {};
                const platforms = Object.keys(platformAllocations);

                const platformMetricsAgg: Record<string, { impressions: number; spend: number; clicks: number; conversions: number; reach: number }> = {};
                platforms.forEach((p) => {
                    platformMetricsAgg[p.toLowerCase()] = { impressions: 0, spend: 0, clicks: 0, conversions: 0, reach: 0 };
                });
                reports.forEach((r: any) => {
                    const key = (r.platform || '').toLowerCase();
                    if (platformMetricsAgg[key]) {
                        platformMetricsAgg[key].impressions += r.impressions || 0;
                        platformMetricsAgg[key].spend += r.spend || r.spend_agency || 0;
                        platformMetricsAgg[key].clicks += r.clicks || 0;
                        platformMetricsAgg[key].conversions += r.conversions || 0;
                        platformMetricsAgg[key].reach += r.reach || 0;
                    }
                });

                const goal = (campaign?.goal || 'conversion').toLowerCase();
                const goalEnum = goal.includes('awareness') ? 'awareness' : goal.includes('traffic') ? 'traffic' : 'conversions';

                const platform_inputs = Object.entries(platformMetricsAgg)
                    .filter(([, m]) => m.impressions > 0 || m.spend > 0)
                    .map(([platform, m]) => ({
                        platform,
                        category: (platform.includes('meta') || platform.includes('facebook') || platform.includes('instagram') || platform.includes('tiktok'))
                            ? ('social' as const)
                            : (platform.includes('google') || platform.includes('microsoft'))
                            ? ('display_search' as const)
                            : ('social' as const),
                        goal: goalEnum,
                        metrics: {
                            impressions: m.impressions,
                            clicks: m.clicks,
                            conversions: m.conversions,
                            spend: m.spend,
                            cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0,
                            cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
                            cpa: m.conversions > 0 ? m.spend / m.conversions : 0,
                            reach: m.reach,
                            views: 0,
                            frequency: m.reach > 0 ? m.impressions / m.reach : 0,
                            completions: 0,
                        },
                    }));

                return {
                    campaign_id: campaignId,
                    campaign_name: campaignName || `Campaign #${campaignId}`,
                    goal: goalEnum,
                    total_budget_cents: totalBudgetCents || 0,
                    platform_allocations: platformAllocations as Record<string, number>,
                    platform_inputs,
                };
            }).filter((c) => c.platform_inputs.length > 0);

            if (payload.length === 0) return [];
            const result = await apiClient.post<RecommendationItem[]>(API_ENDPOINTS.INTELLIGENCE.RECOMMENDATIONS, { campaigns: payload });
            return result ?? [];
        }
    );

    const totalSpend = reportingData?.reduce((sum: number, record: any) => sum + (record.spend || record.spend_agency || 0), 0) || 0;
    const totalBudget = activeCampaigns.reduce((sum, c) => sum + ((c.total_budget_cents || 0) / 100), 0);
    const budgetPacing = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

    const activeReach = reportingData?.reduce((sum: number, record: any) => sum + (record.impressions || 0), 0) || 0;

    const { data: sweetSpotData } = useSWR(
        activeCampaigns.length > 0 ? ['/dashboard/sweet-spot', activeCampaigns] : null,
        async () => {
            if (activeCampaigns.length === 0) return null;
            try {
                const inputs = activeCampaigns.flatMap(c => {
                    const platforms = Object.keys(c.platform_allocations || {});
                    if (platforms.length === 0) return [];
                    return platforms.map(platform => {
                        const platformLower = platform.toLowerCase();
                        const category = (platformLower.includes('meta') || platformLower.includes('facebook') || platformLower.includes('instagram') || platformLower.includes('tiktok'))
                            ? 'social' as const
                            : (platformLower.includes('google') || platformLower.includes('microsoft'))
                            ? 'display_search' as const
                            : 'social' as const;
                        
                        const goal = (c.goal || 'conversion').toLowerCase();
                        const goalEnum = goal.includes('awareness') ? 'awareness' as const
                            : goal.includes('traffic') ? 'traffic' as const
                            : 'conversions' as const;
                        
                        return {
                            platform: platformLower,
                            category,
                            goal: goalEnum,
                            metrics: {
                                impressions: 0,
                                clicks: 0,
                                conversions: 0,
                                spend: 0,
                                cpm: 0,
                                cpc: 0,
                                cpa: 0,
                                reach: 0,
                                views: 0,
                                frequency: 0,
                                completions: 0
                            }
                        };
                    });
                });
                if (inputs.length === 0) return null;
                const result = await apiClient.post(API_ENDPOINTS.INTELLIGENCE.SWEET_SPOT, inputs);
                return result;
            } catch {
                return null;
            }
        }
    );

    const sweetSpotPlatform = (sweetSpotData && typeof sweetSpotData === 'object')
        ? ((sweetSpotData as any).top_platform || (sweetSpotData as any).recommended_platform || "Meta")
        : "Meta";

    const { data: umiScores } = useSWR(
        activeCampaigns.length > 0 ? ['/dashboard/umi-scores', activeCampaigns] : null,
        async () => {
            if (activeCampaigns.length === 0) return { platformScore: null, campaignScore: null };
            
            try {
                const allPlatformScores: number[] = [];
                const allCampaignScores: number[] = [];

                for (const campaign of activeCampaigns) {
                    try {
                        const reportData = await apiClient.get<any[]>(
                            API_ENDPOINTS.REPORTING.CAMPAIGN(campaign.id.toString())
                        ).catch(() => []);

                        const platformAllocations = campaign.platform_allocations || {};
                        const platforms = Object.keys(platformAllocations);
                        
                        if (platforms.length === 0) continue;

                        const platformMetrics: Record<string, any> = {};
                        platforms.forEach(platform => {
                            platformMetrics[platform.toLowerCase()] = {
                                impressions: 0,
                                spend: 0,
                                conversions: 0,
                                clicks: 0,
                                reach: 0
                            };
                        });

                        reportData.forEach((record: any) => {
                            const platformKey = (record.platform || '').toLowerCase();
                            if (platformMetrics[platformKey]) {
                                platformMetrics[platformKey].impressions += record.impressions || 0;
                                platformMetrics[platformKey].spend += record.spend || 0;
                                platformMetrics[platformKey].conversions += record.conversions || 0;
                                platformMetrics[platformKey].clicks += record.clicks || 0;
                                platformMetrics[platformKey].reach += record.reach || 0;
                            }
                        });

                        const inputs = Object.entries(platformMetrics).map(([platform, metrics]) => ({
                            platform,
                            category: (platform.includes('meta') || platform.includes('facebook') || platform.includes('instagram') || platform.includes('tiktok'))
                                ? 'social' as const
                                : (platform.includes('google') || platform.includes('microsoft'))
                                ? 'display_search' as const
                                : 'social' as const,
                            goal: (campaign.goal || 'conversion').toLowerCase().includes('awareness') ? 'awareness' as const
                                : (campaign.goal || 'conversion').toLowerCase().includes('traffic') ? 'traffic' as const
                                : 'conversions' as const,
                            metrics: {
                                impressions: metrics.impressions,
                                clicks: metrics.clicks,
                                conversions: metrics.conversions,
                                spend: metrics.spend,
                                cpm: metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0,
                                cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
                                cpa: metrics.conversions > 0 ? metrics.spend / metrics.conversions : 0,
                                reach: metrics.reach,
                                views: 0,
                                frequency: metrics.reach > 0 ? metrics.impressions / metrics.reach : 0,
                                completions: 0
                            }
                        }));

                        if (inputs.length === 0) continue;

                        const platformScores = await apiClient.post<any[]>(
                            API_ENDPOINTS.INTELLIGENCE.ANALYZE,
                            inputs
                        );

                        platformScores.forEach((score: any) => {
                            if (score.umi_score) {
                                allPlatformScores.push(score.umi_score);
                            }
                        });

                        const allocations = campaign.platform_allocations || {};
                        let campaignTotalScore = 0;
                        let campaignTotalWeight = 0;

                        platformScores.forEach((score: any) => {
                            const platformKey = score.platform.toLowerCase();
                            const allocation = allocations[platformKey] || allocations[score.platform] || 0;
                            const weight = typeof allocation === 'object' ? (allocation as any).budget || allocation : allocation;
                            
                            if (score.umi_score && weight > 0) {
                                campaignTotalScore += score.umi_score * weight;
                                campaignTotalWeight += weight;
                            }
                        });

                        if (campaignTotalWeight > 0) {
                            allCampaignScores.push(campaignTotalScore / campaignTotalWeight);
                        }
                    } catch (error) {
                        console.error(`Failed to calculate UMI for campaign ${campaign.id}:`, error);
                    }
                }

                return {
                    platformScore: allPlatformScores.length > 0 
                        ? allPlatformScores.reduce((a, b) => a + b, 0) / allPlatformScores.length 
                        : null,
                    campaignScore: allCampaignScores.length > 0
                        ? allCampaignScores.reduce((a, b) => a + b, 0) / allCampaignScores.length
                        : null
                };
            } catch (error) {
                console.error('Failed to calculate UMI scores:', error);
                return { platformScore: null, campaignScore: null };
            }
        }
    );

    const handleAskKaivo = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return

        setLoading(true)
        try {
            const response = await askKaivo(query)
            setAgentResponse(response.explanation)
            setQuery('')
        } catch (error) {
            console.error(error)
            setAgentResponse("I'm having trouble connecting to my intelligence core. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    if (campaignsError) {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <ErrorDisplay
                    error={campaignsError}
                    title="Failed to load dashboard data"
                    onRetry={() => window.location.reload()}
                />
            </div>
        );
    }

    // Tour disabled - user doesn't want onboarding
    const [showTour, setShowTour] = useState(false);

    // useEffect(() => {
    //     if (typeof window !== 'undefined' && !localStorage.getItem('kaivo_dashboard_tour_completed')) {
    //         const timer = setTimeout(() => setShowTour(true), 1000);
    //         return () => clearTimeout(timer);
    //     }
    // }, []);

    return (
        <div className="p-8 max-w-7xl mx-auto">
            {showTour && (
                <Tour
                    steps={[
                        {
                            target: '[data-tour="ask-kaivo"]',
                            title: 'Ask Kaivo',
                            content: 'Use this to get AI-powered campaign planning and optimization suggestions.',
                            position: 'bottom'
                        },
                        {
                            target: '[data-tour="sweet-spot"]',
                            title: 'Sweet Spot',
                            content: 'This shows your top-performing advertising platform based on your campaign data.',
                            position: 'bottom'
                        },
                        {
                            target: '[data-tour="campaigns-table"]',
                            title: 'Active Campaigns',
                            content: 'View and manage all your active campaigns here. Click on any campaign to see details.',
                            position: 'top'
                        }
                    ]}
                    onComplete={() => {
                        if (typeof window !== 'undefined') {
                            localStorage.setItem('kaivo_dashboard_tour_completed', 'true');
                        }
                        setShowTour(false);
                    }}
                    storageKey="kaivo_dashboard_tour_completed"
                />
            )}
            <header className="mb-12 flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
                    <p className="text-muted-foreground text-lg">Welcome back, Team</p>
                </div>
                <Card className="p-6">
                    <div className="text-sm text-muted-foreground mb-1">Intelligence Active</div>
                    <div className="text-5xl font-bold text-kaivo-teal-deep">94.2</div>
                </Card>
            </header>

            {/* Billing mode banner for current client */}
            {currentClient && (
                <div className={cn(
                    "mb-8 rounded-lg border px-5 py-3 flex items-center gap-3 text-sm",
                    currentClient.account_mode === 'reporting_only'
                        ? "border-purple-500/20 bg-purple-500/5 text-purple-300"
                        : "border-primary/20 bg-primary/5 text-foreground"
                )}>
                    {currentClient.account_mode === 'reporting_only' ? (
                        <>
                            <span className="font-semibold text-purple-400">{currentClient.name}</span>
                            is in <strong className="text-foreground">Reporting Only</strong> mode &mdash; analytics and insights are active. No ad credits are used.
                        </>
                    ) : (
                        <>
                            <span className="font-semibold text-primary">{currentClient.name}</span>
                            is <strong className="text-foreground">Kaivo-Managed</strong> &mdash; campaigns consume ad credits from your balance.
                        </>
                    )}
                </div>
            )}

            {/* Performance Overview - Interchangeable Cards */}
            {campaignsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <CardSkeleton lines={2} />
                    <CardSkeleton lines={2} />
                    <CardSkeleton lines={2} />
                </div>
            ) : (
                <InterchangeableCards
                    cards={[
                        {
                            id: 'sweet-spot',
                            title: 'Sweet Spot',
                            visible: true,
                            order: 1,
                            component: (
                                <Card className="p-6 hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer border-primary/20"
                                    onClick={() => router.push('/intelligence')}
                                    data-tour="sweet-spot"
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                                            <FiTarget className="w-6 h-6 text-primary" />
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">Sweet Spot</h3>
                                    </div>
                                    <div className="text-3xl font-bold text-kaivo-teal-deep mb-2 capitalize">{sweetSpotPlatform}</div>
                                    <p className="text-primary flex items-center gap-2 text-sm">
                                        <FiTrendingUp className="w-4 h-4" /> Top Performing Channel
                                    </p>
                                </Card>
                            )
                        },
                        {
                            id: 'active-reach',
                            title: 'Active Reach',
                            visible: true,
                            order: 2,
                            component: (
                                <Card className="p-6 hover:shadow-md transition-all cursor-pointer border-primary/20"
                                    onClick={() => router.push('/reporting')}
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                                            <FiActivity className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">Active Reach</h3>
                                    </div>
                                    <div className="text-3xl font-bold text-kaivo-teal-deep mb-2">{activeReach.toLocaleString()}</div>
                                    <p className="text-muted-foreground text-sm">Impressions this period</p>
                                </Card>
                            )
                        },
                        {
                            id: 'budget-pacing',
                            title: 'Budget Pacing',
                            visible: true,
                            order: 3,
                            component: (
                                <Card className="p-6 hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer border-primary/20"
                                    onClick={() => router.push('/campaigns')}
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                                            <FiTrendingUp className="w-6 h-6 text-primary" />
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">Budget Pacing</h3>
                                    </div>
                                    <div className="text-3xl font-bold text-kaivo-teal-deep mb-2">{budgetPacing.toFixed(1)}%</div>
                                    <p className="text-primary text-sm">Of total budget used</p>
                                </Card>
                            )
                        },
                        {
                            id: 'umi-score',
                            title: 'UMI Score',
                            visible: true,
                            order: 4,
                            component: (
                                <UMIScoreCard
                                    platformScore={umiScores?.platformScore ?? undefined}
                                    campaignScore={umiScores?.campaignScore ?? undefined}
                                    isLoading={!umiScores}
                                />
                            )
                        }
                    ]}
                />
            )}

            {/* Insights Section */}
            <div className="mt-10 mb-8">
                <InsightsSection
                    campaignInsights={campaignInsights ?? []}
                    platformMetrics={platformMetrics}
                    recommendations={recommendations ?? []}
                    isLoading={campaignsLoading}
                />
            </div>

            {/* Active Campaigns */}
            <h2 className="text-xl font-bold text-foreground mb-4">Active Campaigns</h2>
            {campaignsLoading ? (
                <TableSkeleton rows={5} columns={5} />
            ) : (
            <Card className="overflow-hidden" data-tour="campaigns-table">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted/30 border-b border-border">
                            <tr>
                                <th className="px-6 py-4 font-medium text-muted-foreground uppercase">Campaign</th>
                                <th className="px-6 py-4 font-medium text-muted-foreground uppercase">Status</th>
                                <th className="px-6 py-4 font-medium text-muted-foreground uppercase text-right">Spend</th>
                                <th className="px-6 py-4 font-medium text-muted-foreground uppercase">Performance</th>
                                <th className="px-6 py-4 font-medium text-muted-foreground uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {campaigns?.map((campaign) => (
                                <tr key={campaign.id} className="hover:bg-accent transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-foreground">
                                            {campaign.name || `Campaign #${campaign.id}`}
                                        </div>
                                        {campaign.goal && (
                                            <div className="text-xs text-muted-foreground mt-1 capitalize">{campaign.goal}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge
                                            variant={
                                                campaign.status === 'ACTIVE' ? 'success' :
                                                campaign.status === 'PAUSED' ? 'warning' :
                                                campaign.status === 'DRAFT' ? 'info' :
                                                'neutral'
                                            }
                                        >
                                            {campaign.status}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-foreground font-medium">
                                            ${((campaign.total_budget_cents || 0) / 100).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">Budget</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="w-full max-w-[120px]">
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                                <span>$0</span>
                                                <span>${((campaign.total_budget_cents || 0) / 100).toFixed(0)}</span>
                                            </div>
                                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{ width: `0%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <a 
                                            href={`/campaigns/${campaign.id}`} 
                                            className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "text-foreground hover:text-primary")}
                                        >
                                            View
                                        </a>
                                    </td>
                                </tr>
                            ))}
                            {(!campaigns || campaigns.length === 0) && !campaignsLoading && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8">
                                        <EmptyState
                                            icon={Megaphone}
                                            title="No campaigns yet"
                                            description="Get started by creating your first campaign. Ask Kaivo to help you plan and launch it!"
                                            action={{
                                                label: "Create Campaign",
                                                onClick: () => window.location.href = '/plans/new'
                                            }}
                                        />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            )}
        </div>
    );
}