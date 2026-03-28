"use client";

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { BarChart3, TrendingUp, TrendingDown, Minus, Eye, MousePointerClick, Target, Wallet } from 'lucide-react';

export interface PlatformMetric {
    platform: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    cpm: number;
    cpc: number;
    cpa: number;
    trend: 'up' | 'down' | 'stable';
}

interface PlatformMetricsCardProps {
    metrics: PlatformMetric[];
    isLoading?: boolean;
}

const trendIcons = {
    up: TrendingUp,
    down: TrendingDown,
    stable: Minus
};

const trendBadgeColors: Record<string, string> = {
    up: 'text-green-400 bg-green-500/15 border-green-500/30',
    down: 'text-red-400 bg-red-500/15 border-red-500/30',
    stable: 'text-muted-foreground bg-muted/50 border-border'
};

const platformAccent: Record<string, string> = {
    meta: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
    facebook: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
    google: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20',
    'google ads': 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20',
    tiktok: 'from-pink-500/20 to-pink-600/5 border-pink-500/20',
    microsoft: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20',
};

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function shortNum(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export function PlatformMetricsCard({ metrics, isLoading = false }: PlatformMetricsCardProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-52 bg-muted/30 rounded-xl animate-pulse border border-border" />
                ))}
            </div>
        );
    }

    if (metrics.length === 0) {
        return (
            <div className="text-center py-14 rounded-xl bg-muted/30 border border-dashed border-border">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No platform data available</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Run campaigns to see metrics by platform</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.map((metric) => {
                const TrendIcon = trendIcons[metric.trend];
                const accent = platformAccent[metric.platform.toLowerCase()] ?? 'from-primary/20 to-primary/5 border-primary/20';
                const ctr = metric.impressions > 0 ? ((metric.clicks / metric.impressions) * 100).toFixed(2) : '0.00';

                return (
                    <div
                        key={metric.platform}
                        className={`group rounded-xl bg-gradient-to-br ${accent} border overflow-hidden hover:scale-[1.01] transition-all duration-200`}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <BarChart3 className="h-4 w-4 text-primary" />
                                </div>
                                <h4 className="text-base font-semibold text-foreground capitalize">{metric.platform}</h4>
                            </div>
                            <Badge variant="outline" className={`text-[11px] font-medium capitalize ${trendBadgeColors[metric.trend]}`}>
                                <TrendIcon className="h-3 w-3 mr-1" />
                                {metric.trend}
                            </Badge>
                        </div>

                        {/* Primary Stat */}
                        <div className="px-5 pb-3">
                            <p className="text-2xl font-bold text-kaivo-teal-deep tabular-nums tracking-tight">{fmt(metric.spend)}</p>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">Total Spend</p>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-3 gap-px bg-muted/30">
                            <MetricCell icon={Eye} label="Impressions" value={shortNum(metric.impressions)} />
                            <MetricCell icon={MousePointerClick} label="Clicks" value={shortNum(metric.clicks)} />
                            <MetricCell icon={Target} label="Conversions" value={metric.conversions.toLocaleString()} />
                        </div>
                        <div className="grid grid-cols-3 gap-px bg-muted/30">
                            <MetricCell icon={Wallet} label="CPM" value={fmt(metric.cpm)} />
                            <MetricCell label="CPC" value={fmt(metric.cpc)} />
                            <MetricCell label="CTR" value={`${ctr}%`} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function MetricCell({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
    return (
        <div className="bg-muted/20 px-4 py-3 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
                {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
            </div>
            <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
        </div>
    );
}
