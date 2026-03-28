"use client";

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Brain, TrendingUp, AlertTriangle, CheckCircle2, Info, ArrowRight, Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface CampaignInsight {
    campaignId: number;
    campaignName: string;
    type: 'opportunity' | 'warning' | 'success' | 'info';
    title: string;
    description: string;
    metric?: string;
    value?: string;
    recommendation?: string;
}

interface CampaignInsightsCardProps {
    insights: CampaignInsight[];
    isLoading?: boolean;
}

const insightIcons = {
    opportunity: TrendingUp,
    warning: AlertTriangle,
    success: CheckCircle2,
    info: Info
};

const insightAccent: Record<string, { bg: string; text: string; border: string; badge: string; dot: string }> = {
    opportunity: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
    success: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', badge: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-400' },
    info: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' }
};

export function CampaignInsightsCard({ insights, isLoading = false }: CampaignInsightsCardProps) {
    const router = useRouter();

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse border border-border" />
                ))}
            </div>
        );
    }

    if (insights.length === 0) {
        return (
            <div className="text-center py-14 rounded-xl bg-muted/30 border border-dashed border-border">
                <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No insights available yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Start running campaigns to get personalized insights</p>
            </div>
        );
    }

    return (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
            {insights.map((insight, i) => {
                const Icon = insightIcons[insight.type];
                const accent = insightAccent[insight.type];
                return (
                    <div
                        key={`${insight.campaignId}-${insight.title}-${i}`}
                        className={`group rounded-xl ${accent.bg} border ${accent.border} hover:bg-accent/50 transition-all duration-200 overflow-hidden`}
                    >
                        <div className="p-4">
                            {/* Top Row: Icon + Title + Badge */}
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`w-7 h-7 rounded-lg ${accent.bg} flex items-center justify-center shrink-0`}>
                                        <Icon className={`h-3.5 w-3.5 ${accent.text}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-foreground text-sm truncate">{insight.title}</h4>
                                        <p className="text-[11px] text-muted-foreground truncate">{insight.campaignName}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {insight.metric && insight.value && (
                                        <span className="text-xs font-semibold text-foreground tabular-nums bg-accent px-2 py-0.5 rounded-md">
                                            {insight.value}
                                        </span>
                                    )}
                                    <Badge className={`text-[10px] capitalize ${accent.badge}`} variant="outline">
                                        {insight.type}
                                    </Badge>
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-sm text-muted-foreground leading-relaxed pl-[38px]">{insight.description}</p>

                            {/* Recommendation + Action */}
                            {insight.recommendation && (
                                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 pl-[38px]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0" />
                                        <p className="text-xs text-primary font-medium truncate">{insight.recommendation}</p>
                                    </div>
                                    <button
                                        className="shrink-0 text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                        onClick={() => router.push(`/campaigns/${insight.campaignId}`)}
                                    >
                                        View
                                        <ArrowRight className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
