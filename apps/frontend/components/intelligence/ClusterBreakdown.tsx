'use client';

import React from 'react';
import { ClusterScores } from '@/types/intelligence';
import { cn } from '@/lib/utils';

interface ClusterBreakdownProps {
    clusters: ClusterScores;
    variant?: 'full' | 'compact';
}

const CLUSTER_INFO = {
    visibility: {
        label: 'Visibility',
        description: 'How effectively the campaign gets exposure',
    },
    engagement: {
        label: 'Engagement',
        description: 'How strongly people interact with the ad',
    },
    conversion_power: {
        label: 'Conversion Power',
        description: 'How effectively attention turns into desired actions',
    },
    efficiency: {
        label: 'Efficiency',
        description: 'Cost effectiveness for the chosen outcome',
    },
    quality_stability: {
        label: 'Quality & Stability',
        description: 'How reliable performance is and how safe it is to scale',
    },
} as const;

function getClusterColor(score: number): string {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
}

function getClusterBgColor(score: number): string {
    if (score >= 70) return 'bg-green-500/10';
    if (score >= 40) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
}

export function ClusterBreakdown({ clusters, variant = 'full' }: ClusterBreakdownProps) {
    const clusterEntries = Object.entries(clusters) as Array<[keyof ClusterScores, number]>;

    if (variant === 'compact') {
        return (
            <div className="space-y-2">
                {clusterEntries.map(([key, score]) => {
                    const info = CLUSTER_INFO[key];
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-24 truncate" title={info.description}>
                                {info.label}:
                            </span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={cn('h-full transition-all', getClusterColor(score))}
                                    style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                                />
                            </div>
                            <span className="text-xs font-medium w-10 text-right">{Math.round(score)}%</span>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {clusterEntries.map(([key, score]) => {
                const info = CLUSTER_INFO[key];
                return (
                    <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{info.label}</span>
                                <span className="text-xs text-muted-foreground" title={info.description}>
                                    (i)
                                </span>
                            </div>
                            <span className={cn('text-sm font-semibold', getClusterColor(score).replace('bg-', 'text-'))}>
                                {Math.round(score)}%
                            </span>
                        </div>
                        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn('h-full transition-all', getClusterColor(score))}
                                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                );
            })}
        </div>
    );
}
