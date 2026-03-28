"use client";

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Zap, ArrowRight, TrendingUp, Target, DollarSign, Palette } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface RecommendationItem {
    id: string;
    campaign_id?: number;
    campaign_name?: string;
    platform?: string;
    category: string;
    priority: string;
    action: string;
    title: string;
    description: string;
    impact_estimate?: string;
    data_points?: Record<string, unknown>;
}

interface RecommendationsCardProps {
    recommendations: RecommendationItem[];
    isLoading?: boolean;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    budget: DollarSign,
    targeting: Target,
    creative: Palette,
    platform_mix: TrendingUp,
    pacing: Zap,
    efficiency: TrendingUp,
};

const priorityColors: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    low: 'bg-muted/50 text-muted-foreground border-border',
};

export function RecommendationsCard({ recommendations, isLoading = false }: RecommendationsCardProps) {
    const router = useRouter();

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-28 bg-muted/30 rounded-xl animate-pulse border border-border" />
                ))}
            </div>
        );
    }

    if (recommendations.length === 0) {
        return (
            <div className="text-center py-14 rounded-xl bg-muted/30 border border-dashed border-border">
                <Zap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No recommendations yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Run active campaigns to get personalized, actionable recommendations</p>
            </div>
        );
    }

    return (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
            {recommendations.map((rec) => {
                const Icon = categoryIcons[rec.category] || Zap;
                const priorityClass = priorityColors[rec.priority] || priorityColors.medium;
                return (
                    <div
                        key={rec.id}
                        className="group rounded-xl bg-muted/30 border border-border hover:border-primary/20 hover:bg-accent transition-all duration-200 overflow-hidden"
                    >
                        <div className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                        <Icon className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-semibold text-foreground text-sm">{rec.title}</h4>
                                        {(rec.campaign_name || rec.platform) && (
                                            <p className="text-[11px] text-muted-foreground truncate">
                                                {[rec.campaign_name, rec.platform].filter(Boolean).join(' • ')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge className={`text-[10px] capitalize ${priorityClass}`} variant="outline">
                                        {rec.priority}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                                        {rec.action}
                                    </Badge>
                                </div>
                            </div>

                            <p className="text-sm text-muted-foreground leading-relaxed mb-2">{rec.description}</p>

                            {rec.impact_estimate && (
                                <p className="text-xs text-primary font-medium mb-3">
                                    Impact: {rec.impact_estimate}
                                </p>
                            )}

                            {rec.campaign_id && (
                                <button
                                    className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                    onClick={() => router.push(`/campaigns/${rec.campaign_id}`)}
                                >
                                    View campaign
                                    <ArrowRight className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
