"use client";

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Lightbulb, TrendingUp, Target, Zap, Users } from 'lucide-react';

interface BestPractice {
    id: string;
    title: string;
    description: string;
    category: 'performance' | 'optimization' | 'budget' | 'targeting';
    impact: 'high' | 'medium' | 'low';
}

export const CPM_BENCHMARKS: Record<string, { min: number; max: number }> = {
    meta: { min: 8, max: 15 },
    facebook: { min: 8, max: 15 },
    instagram: { min: 8, max: 15 },
    tiktok: { min: 6, max: 10 },
    google: { min: 1, max: 2 },
    'google ads': { min: 1, max: 2 },
    microsoft: { min: 1, max: 2 }
};

const INDUSTRY_BEST_PRACTICES: BestPractice[] = [
    {
        id: '1',
        title: 'Optimal Ad Frequency',
        description: 'Industry benchmark: 3-5 impressions per user per week for optimal performance. Higher frequency can lead to ad fatigue.',
        category: 'performance',
        impact: 'high'
    },
    {
        id: '2',
        title: 'Platform Budget Allocation',
        description: 'Best practice: Allocate 60-70% budget to top-performing platform, 20-30% to secondary, 10% to testing new channels.',
        category: 'budget',
        impact: 'high'
    },
    {
        id: '3',
        title: 'Creative Refresh Cycle',
        description: 'Refresh ad creatives every 14-21 days to maintain engagement rates and prevent creative fatigue.',
        category: 'optimization',
        impact: 'medium'
    },
    {
        id: '4',
        title: 'CPM Benchmarks',
        description: 'Industry average CPM: Meta ($8-15), Google Ads ($1-2), TikTok ($6-10). Monitor deviations from benchmarks.',
        category: 'performance',
        impact: 'medium'
    },
    {
        id: '5',
        title: 'Audience Overlap Management',
        description: 'Keep audience overlap below 30% across campaigns to maximize reach and minimize competition.',
        category: 'targeting',
        impact: 'medium'
    }
];

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    performance: TrendingUp,
    optimization: Zap,
    budget: Target,
    targeting: Users
};

const categoryAccent: Record<string, { bg: string; text: string; badge: string }> = {
    performance: { bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    optimization: { bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    budget: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    targeting: { bg: 'bg-orange-500/10', text: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
};

const impactConfig: Record<string, { label: string; class: string }> = {
    high: { label: 'High Impact', class: 'bg-red-500/15 text-red-400 border-red-500/30' },
    medium: { label: 'Medium', class: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    low: { label: 'Low', class: 'bg-muted/50 text-muted-foreground border-border' }
};

export function BestPracticesCard() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INDUSTRY_BEST_PRACTICES.map((practice) => {
                const Icon = categoryIcons[practice.category];
                const accent = categoryAccent[practice.category];
                const impact = impactConfig[practice.impact];

                return (
                    <div
                        key={practice.id}
                        className="group rounded-xl bg-muted/30 border border-border hover:border-primary/20 hover:bg-accent transition-all duration-200 overflow-hidden"
                    >
                        <div className="p-4">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg ${accent.bg} flex items-center justify-center shrink-0`}>
                                        <Icon className={`h-4 w-4 ${accent.text}`} />
                                    </div>
                                    <h4 className="font-semibold text-foreground text-sm leading-tight">{practice.title}</h4>
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{practice.description}</p>

                            {/* Tags */}
                            <div className="flex items-center gap-2">
                                <Badge className={`text-[10px] capitalize ${accent.badge}`} variant="outline">
                                    {practice.category}
                                </Badge>
                                <Badge className={`text-[10px] ${impact.class}`} variant="outline">
                                    {impact.label}
                                </Badge>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
