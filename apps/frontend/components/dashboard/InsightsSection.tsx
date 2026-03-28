"use client";

import React from 'react';
import { BestPracticesCard } from './BestPracticesCard';
import { CampaignInsightsCard } from './CampaignInsightsCard';
import { PlatformMetricsCard } from './PlatformMetricsCard';
import { RecommendationsCard } from './RecommendationsCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { BarChart3, Brain, Lightbulb, Zap } from 'lucide-react';

interface InsightsSectionProps {
    campaignInsights: import('./CampaignInsightsCard').CampaignInsight[];
    platformMetrics: import('./PlatformMetricsCard').PlatformMetric[];
    recommendations: import('./RecommendationsCard').RecommendationItem[];
    isLoading?: boolean;
}

export function InsightsSection({ campaignInsights, platformMetrics, recommendations, isLoading = false }: InsightsSectionProps) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Section Header */}
            <div className="px-6 pt-6 pb-5 border-b border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-foreground tracking-tight">Insights & Intelligence</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Actionable recommendations, metrics by platform, campaign insights, and best practices
                        </p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="recommendations" className="w-full">
                {/* Tab Navigation */}
                <div className="px-6 pt-4 pb-0">
                    <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto min-h-10 bg-muted/30 border border-border p-0.5 rounded-lg gap-0.5">
                        <TabsTrigger
                            value="recommendations"
                            activeClassName="bg-primary/15 text-primary shadow-sm"
                            inactiveClassName="text-muted-foreground hover:text-foreground hover:bg-accent"
                            className="flex-1 rounded-md gap-2 text-sm transition-all"
                        >
                            <Zap className="h-3.5 w-3.5" />
                            Recommendations
                            {recommendations.length > 0 && (
                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                                    {recommendations.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="platforms"
                            activeClassName="bg-primary/15 text-primary shadow-sm"
                            inactiveClassName="text-muted-foreground hover:text-foreground hover:bg-accent"
                            className="flex-1 rounded-md gap-2 text-sm transition-all"
                        >
                            <BarChart3 className="h-3.5 w-3.5" />
                            Platform Metrics
                        </TabsTrigger>
                        <TabsTrigger
                            value="insights"
                            activeClassName="bg-primary/15 text-primary shadow-sm"
                            inactiveClassName="text-muted-foreground hover:text-foreground hover:bg-accent"
                            className="flex-1 rounded-md gap-2 text-sm transition-all"
                        >
                            <Brain className="h-3.5 w-3.5" />
                            Campaign Insights
                            {campaignInsights.length > 0 && (
                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                                    {campaignInsights.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="practices"
                            activeClassName="bg-primary/15 text-primary shadow-sm"
                            inactiveClassName="text-muted-foreground hover:text-foreground hover:bg-accent"
                            className="flex-1 rounded-md gap-2 text-sm transition-all"
                        >
                            <Lightbulb className="h-3.5 w-3.5" />
                            Best Practices
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Tab Content */}
                <TabsContent value="recommendations" className="mt-0 p-6">
                    <RecommendationsCard recommendations={recommendations} isLoading={isLoading} />
                </TabsContent>

                <TabsContent value="platforms" className="mt-0 p-6">
                    <PlatformMetricsCard metrics={platformMetrics} isLoading={isLoading} />
                </TabsContent>

                <TabsContent value="insights" className="mt-0 p-6">
                    <CampaignInsightsCard insights={campaignInsights} isLoading={isLoading} />
                </TabsContent>

                <TabsContent value="practices" className="mt-0 p-6">
                    <BestPracticesCard />
                </TabsContent>
            </Tabs>
        </div>
    );
}
