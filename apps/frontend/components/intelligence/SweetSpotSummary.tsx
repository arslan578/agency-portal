'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Target, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SweetSpotSummary {
    top_platforms: string[];
    losing_momentum: string[];
    incremental_budget_recommendation: string;
    narrative_smb: string;
    narrative_agency: string;
}

interface SweetSpotSummaryProps {
    summary: SweetSpotSummary;
    isAgency: boolean;
}

export function SweetSpotSummary({ summary, isAgency }: SweetSpotSummaryProps) {
    const narrative = isAgency ? summary.narrative_agency : summary.narrative_smb;
    const hasTopPlatforms = summary.top_platforms && summary.top_platforms.length > 0;
    const hasUnderperformers = summary.losing_momentum && summary.losing_momentum.length > 0;
    const hasRecommendation = summary.incremental_budget_recommendation && summary.incremental_budget_recommendation !== 'None';

    // Check if this is an empty state
    const isEmpty = !hasTopPlatforms && !hasUnderperformers && (!hasRecommendation || summary.incremental_budget_recommendation === 'None');

    if (isEmpty || narrative === 'No data available.') {
        return (
            <Card className="border-2 border-dashed border-border/50 bg-muted/20">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Data Available</h3>
                    <p className="text-sm text-muted-foreground">
                        Run analysis with active campaigns to see Sweet Spot recommendations.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-primary/20 shadow-lg shadow-primary/5 bg-gradient-to-br from-card to-card/95" role="region" aria-label="Sweet Spot Summary">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent border-b border-primary/10 pb-4">
                <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-primary/20 border border-primary/30 shrink-0" aria-hidden="true">
                        <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <span>Sweet Spot Summary</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 pt-4 sm:pt-6">
                {/* Top Platforms Section */}
                {hasTopPlatforms && (
                    <div className="space-y-3" role="region" aria-label="Top performing platforms">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                            Top Performers
                        </h3>
                        <div className="flex flex-wrap gap-2" role="list">
                            {summary.top_platforms.map((platform, idx) => (
                                <Badge
                                    key={idx}
                                    role="listitem"
                                    variant="success"
                                    className="px-3 py-1.5 text-sm font-medium"
                                    aria-label={`Top performer: ${platform}`}
                                >
                                    {platform}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Budget Recommendation Section */}
                {hasRecommendation && (
                    <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 rounded-lg bg-primary/10 border border-primary/20" role="region" aria-label="Budget recommendation">
                        <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" aria-hidden="true" />
                            <h3 className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wide">
                                Recommendation
                            </h3>
                        </div>
                        <p className="text-sm sm:text-base font-medium text-foreground">
                            Focus budget on: <strong className="text-primary font-bold">{summary.incremental_budget_recommendation}</strong>
                        </p>
                    </div>
                )}

                {/* Underperformers Section */}
                {hasUnderperformers && (
                    <div className="space-y-3" role="region" aria-label="Platforms losing momentum">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-amber-500" aria-hidden="true" />
                            Losing Momentum
                        </h3>
                        <div className="flex flex-wrap gap-2" role="list">
                            {summary.losing_momentum.map((platform, idx) => (
                                <Badge
                                    key={idx}
                                    role="listitem"
                                    variant="warning"
                                    className="px-3 py-1.5 text-sm font-medium"
                                    aria-label={`Underperforming platform: ${platform}`}
                                >
                                    {platform}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Narrative Section */}
                <div className="pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-border/50">
                    <div className="space-y-2">
                        <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            {isAgency ? 'Agency Intelligence' : 'Your Intelligence'}
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed text-foreground/90">
                            {narrative}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
